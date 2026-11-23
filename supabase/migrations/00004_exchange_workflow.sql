-- ============================================================================
-- MONOLOOP - Exchange workflow & atomic inventory reservation (Member 4)
-- TSUNAGU Hackathon 2026
-- Migration: 00004_exchange_workflow.sql
--
-- Exchange lifecycle
--   exchange: PROPOSED ──(every item ACCEPTED)──▶ IN_PROGRESS ──▶ COMPLETED
--                │                                     │
--                └────────────── cancel ───────────────┴──▶ CANCELLED
--   item:     PENDING ──accept──▶ ACCEPTED ──complete──▶ COMPLETED
--                │                    └──cancel──▶ CANCELLED (stock released)
--                └──reject──▶ REJECTED (exchange can then only be cancelled)
--
-- Inventory rules (listings)
--   accept   : reserved_quantity += q            (only if total - reserved >= q)
--   complete : total_quantity -= q, reserved_quantity -= q
--   cancel   : reserved_quantity -= q            (ACCEPTED items only)
--
-- Every state change runs inside one PL/pgSQL function = one transaction, with
-- row locks taken in a fixed order (exchange → item → listings by id) so that
-- concurrent requests can never over-allocate stock or deadlock.
--
-- Errors are raised as 'MONOLOOP:<CODE>:<message>' and mapped to HTTP status
-- codes by src/features/exchanges/services/exchangeRepository.ts.
-- ============================================================================

-- --------------------------------------------------------------------------
-- Schema additions
-- --------------------------------------------------------------------------

-- Price snapshot at request time, so recovered value does not drift if the
-- supplier later edits the listing price.
ALTER TABLE exchange_items
    ADD COLUMN IF NOT EXISTS unit_price_bdt NUMERIC NOT NULL DEFAULT 0 CHECK (unit_price_bdt >= 0);

ALTER TABLE exchange_items
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DROP TRIGGER IF EXISTS trg_exchange_items_updated_at ON exchange_items;
CREATE TRIGGER trg_exchange_items_updated_at
    BEFORE UPDATE ON exchange_items
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- At most one active exchange per requirement (also guards concurrent requests).
CREATE UNIQUE INDEX IF NOT EXISTS uq_exchanges_active_requirement
    ON exchanges(requirement_id)
    WHERE status IN ('PROPOSED', 'IN_PROGRESS');

-- A listing appears at most once per exchange.
CREATE UNIQUE INDEX IF NOT EXISTS uq_exchange_items_exchange_listing
    ON exchange_items(exchange_id, listing_id);

CREATE INDEX IF NOT EXISTS idx_exchange_items_supplier ON exchange_items(supplier_organization_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_exchange ON activity_logs(exchange_id);

-- --------------------------------------------------------------------------
-- create_exchange_request
--   p_items: [{"listing_id": "<uuid>", "quantity": <int>}, ...]
--   Creates a PROPOSED exchange with PENDING items. Does NOT reserve stock:
--   a match is a proposal; stock is reserved when each supplier accepts.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION create_exchange_request(
    p_requirement_id UUID,
    p_buyer_id UUID,
    p_items JSONB
)
RETURNS UUID AS $$
DECLARE
    v_req requirements%ROWTYPE;
    v_listing listings%ROWTYPE;
    v_exchange_id UUID;
    v_item JSONB;
    v_listing_id UUID;
    v_qty INTEGER;
    v_total_qty INTEGER := 0;
BEGIN
    SELECT * INTO v_req FROM requirements WHERE id = p_requirement_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MONOLOOP:NOT_FOUND:Requirement % was not found.', p_requirement_id;
    END IF;
    IF v_req.organization_id <> p_buyer_id THEN
        RAISE EXCEPTION 'MONOLOOP:FORBIDDEN_ORGANIZATION:Only the organization that published this requirement can request an exchange for it.';
    END IF;
    IF v_req.status <> 'OPEN' THEN
        RAISE EXCEPTION 'MONOLOOP:REQUIREMENT_NOT_OPEN:Requirement is %; only OPEN requirements can start an exchange.', v_req.status;
    END IF;
    IF EXISTS (
        SELECT 1 FROM exchanges
        WHERE requirement_id = p_requirement_id AND status IN ('PROPOSED', 'IN_PROGRESS')
    ) THEN
        RAISE EXCEPTION 'MONOLOOP:DUPLICATE_EXCHANGE:An active exchange already exists for this requirement.';
    END IF;
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'MONOLOOP:NO_ALLOCATION:An exchange needs at least one allocated listing.';
    END IF;

    INSERT INTO exchanges (requirement_id, buyer_organization_id, status)
    VALUES (p_requirement_id, p_buyer_id, 'PROPOSED')
    RETURNING id INTO v_exchange_id;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_listing_id := (v_item->>'listing_id')::UUID;
        v_qty := (v_item->>'quantity')::INTEGER;

        IF v_qty IS NULL OR v_qty <= 0 THEN
            RAISE EXCEPTION 'MONOLOOP:VALIDATION_ERROR:Allocated quantity must be a positive integer.';
        END IF;

        SELECT * INTO v_listing FROM listings WHERE id = v_listing_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'MONOLOOP:NOT_FOUND:Listing % was not found.', v_listing_id;
        END IF;
        IF v_listing.status <> 'ACTIVE' THEN
            RAISE EXCEPTION 'MONOLOOP:LISTING_UNAVAILABLE:Listing % is %, not ACTIVE.', v_listing_id, v_listing.status;
        END IF;
        IF v_listing.organization_id = p_buyer_id THEN
            RAISE EXCEPTION 'MONOLOOP:VALIDATION_ERROR:A buyer cannot request its own listing.';
        END IF;
        IF v_listing.material_family <> v_req.material_family
           OR v_listing.material_specification <> v_req.material_specification THEN
            RAISE EXCEPTION 'MONOLOOP:VALIDATION_ERROR:Listing % does not match the requirement material.', v_listing_id;
        END IF;

        INSERT INTO exchange_items (exchange_id, listing_id, supplier_organization_id, quantity, unit_price_bdt, status)
        VALUES (v_exchange_id, v_listing_id, v_listing.organization_id, v_qty, v_listing.unit_price_bdt, 'PENDING');

        v_total_qty := v_total_qty + v_qty;
    END LOOP;

    INSERT INTO activity_logs (exchange_id, action, details)
    VALUES (v_exchange_id, 'EXCHANGE_REQUESTED', jsonb_build_object(
        'actor_organization_id', p_buyer_id,
        'requirement_id', p_requirement_id,
        'item_count', jsonb_array_length(p_items),
        'total_quantity', v_total_qty
    ));

    RETURN v_exchange_id;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- accept_exchange_item
--   Supplier accepts its item: re-checks live availability and reserves stock
--   atomically. When every item is ACCEPTED the exchange becomes IN_PROGRESS.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION accept_exchange_item(p_item_id UUID, p_actor_id UUID)
RETURNS UUID AS $$
DECLARE
    v_exchange_id UUID;
    v_exchange exchanges%ROWTYPE;
    v_item exchange_items%ROWTYPE;
    v_listing listings%ROWTYPE;
    v_available INTEGER;
BEGIN
    SELECT exchange_id INTO v_exchange_id FROM exchange_items WHERE id = p_item_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MONOLOOP:NOT_FOUND:Exchange item % was not found.', p_item_id;
    END IF;

    -- Lock order: exchange → item → listing
    SELECT * INTO v_exchange FROM exchanges WHERE id = v_exchange_id FOR UPDATE;
    SELECT * INTO v_item FROM exchange_items WHERE id = p_item_id FOR UPDATE;

    IF v_item.supplier_organization_id <> p_actor_id THEN
        RAISE EXCEPTION 'MONOLOOP:FORBIDDEN_ORGANIZATION:Only the supplier of this item can accept it.';
    END IF;
    IF v_exchange.status <> 'PROPOSED' THEN
        RAISE EXCEPTION 'MONOLOOP:INVALID_STATE:Exchange is %; items can only be accepted while it is PROPOSED.', v_exchange.status;
    END IF;
    IF v_item.status <> 'PENDING' THEN
        RAISE EXCEPTION 'MONOLOOP:INVALID_STATE:Item is already %.', v_item.status;
    END IF;

    SELECT * INTO v_listing FROM listings WHERE id = v_item.listing_id FOR UPDATE;
    IF v_listing.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'MONOLOOP:LISTING_UNAVAILABLE:Listing is % and cannot be reserved.', v_listing.status;
    END IF;

    v_available := v_listing.total_quantity - v_listing.reserved_quantity;
    IF v_available < v_item.quantity THEN
        RAISE EXCEPTION 'MONOLOOP:INSUFFICIENT_STOCK:Only % piece(s) are still available; % requested. Stock changed since matching.', v_available, v_item.quantity;
    END IF;

    UPDATE listings SET reserved_quantity = reserved_quantity + v_item.quantity WHERE id = v_listing.id;
    UPDATE exchange_items SET status = 'ACCEPTED' WHERE id = p_item_id;

    INSERT INTO activity_logs (exchange_id, action, details)
    VALUES (v_exchange_id, 'ITEM_ACCEPTED', jsonb_build_object(
        'actor_organization_id', p_actor_id,
        'exchange_item_id', p_item_id,
        'listing_id', v_listing.id,
        'quantity', v_item.quantity
    ));

    IF NOT EXISTS (
        SELECT 1 FROM exchange_items WHERE exchange_id = v_exchange_id AND status <> 'ACCEPTED'
    ) THEN
        UPDATE exchanges SET status = 'IN_PROGRESS' WHERE id = v_exchange_id;
        INSERT INTO activity_logs (exchange_id, action, details)
        VALUES (v_exchange_id, 'EXCHANGE_RESERVED', jsonb_build_object('actor_organization_id', p_actor_id));
    END IF;

    RETURN v_exchange_id;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- reject_exchange_item
--   Supplier declines a PENDING item. Nothing was reserved for it, so no stock
--   moves. The exchange can no longer complete; the buyer cancels it, which
--   releases any stock other suppliers already reserved.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION reject_exchange_item(p_item_id UUID, p_actor_id UUID)
RETURNS UUID AS $$
DECLARE
    v_exchange_id UUID;
    v_exchange exchanges%ROWTYPE;
    v_item exchange_items%ROWTYPE;
BEGIN
    SELECT exchange_id INTO v_exchange_id FROM exchange_items WHERE id = p_item_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MONOLOOP:NOT_FOUND:Exchange item % was not found.', p_item_id;
    END IF;

    SELECT * INTO v_exchange FROM exchanges WHERE id = v_exchange_id FOR UPDATE;
    SELECT * INTO v_item FROM exchange_items WHERE id = p_item_id FOR UPDATE;

    IF v_item.supplier_organization_id <> p_actor_id THEN
        RAISE EXCEPTION 'MONOLOOP:FORBIDDEN_ORGANIZATION:Only the supplier of this item can decline it.';
    END IF;
    IF v_exchange.status <> 'PROPOSED' THEN
        RAISE EXCEPTION 'MONOLOOP:INVALID_STATE:Exchange is %; items can only be declined while it is PROPOSED.', v_exchange.status;
    END IF;
    IF v_item.status <> 'PENDING' THEN
        RAISE EXCEPTION 'MONOLOOP:INVALID_STATE:Item is already %.', v_item.status;
    END IF;

    UPDATE exchange_items SET status = 'REJECTED' WHERE id = p_item_id;

    INSERT INTO activity_logs (exchange_id, action, details)
    VALUES (v_exchange_id, 'ITEM_REJECTED', jsonb_build_object(
        'actor_organization_id', p_actor_id,
        'exchange_item_id', p_item_id,
        'listing_id', v_item.listing_id,
        'quantity', v_item.quantity
    ));

    RETURN v_exchange_id;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- complete_exchange
--   Buyer confirms transfer of a fully reserved (IN_PROGRESS) exchange.
--   Deducts stock exactly once and marks the requirement FULFILLED when the
--   completed quantity covers it.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION complete_exchange(p_exchange_id UUID, p_actor_id UUID)
RETURNS UUID AS $$
DECLARE
    v_exchange exchanges%ROWTYPE;
    v_item RECORD;
    v_listing listings%ROWTYPE;
    v_total_qty INTEGER := 0;
    v_total_value NUMERIC := 0;
    v_required INTEGER;
    v_completed_for_req INTEGER;
BEGIN
    SELECT * INTO v_exchange FROM exchanges WHERE id = p_exchange_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MONOLOOP:NOT_FOUND:Exchange % was not found.', p_exchange_id;
    END IF;
    IF v_exchange.buyer_organization_id <> p_actor_id THEN
        RAISE EXCEPTION 'MONOLOOP:FORBIDDEN_ORGANIZATION:Only the buyer can confirm completion of this exchange.';
    END IF;
    IF v_exchange.status <> 'IN_PROGRESS' THEN
        RAISE EXCEPTION 'MONOLOOP:INVALID_STATE:Exchange is %; only a fully reserved (IN_PROGRESS) exchange can be completed.', v_exchange.status;
    END IF;

    FOR v_item IN
        SELECT * FROM exchange_items
        WHERE exchange_id = p_exchange_id
        ORDER BY listing_id
        FOR UPDATE
    LOOP
        IF v_item.status <> 'ACCEPTED' THEN
            RAISE EXCEPTION 'MONOLOOP:INVALID_STATE:Item % is %, expected ACCEPTED.', v_item.id, v_item.status;
        END IF;

        SELECT * INTO v_listing FROM listings WHERE id = v_item.listing_id FOR UPDATE;
        IF v_listing.reserved_quantity < v_item.quantity OR v_listing.total_quantity < v_item.quantity THEN
            RAISE EXCEPTION 'MONOLOOP:INVALID_STATE:Reservation for listing % is inconsistent.', v_listing.id;
        END IF;

        UPDATE listings
        SET total_quantity = total_quantity - v_item.quantity,
            reserved_quantity = reserved_quantity - v_item.quantity,
            status = CASE WHEN total_quantity - v_item.quantity = 0 THEN 'COMPLETED' ELSE status END
        WHERE id = v_listing.id;

        UPDATE exchange_items SET status = 'COMPLETED' WHERE id = v_item.id;

        v_total_qty := v_total_qty + v_item.quantity;
        v_total_value := v_total_value + v_item.quantity * v_item.unit_price_bdt;
    END LOOP;

    UPDATE exchanges SET status = 'COMPLETED' WHERE id = p_exchange_id;

    IF v_exchange.requirement_id IS NOT NULL THEN
        SELECT required_quantity INTO v_required FROM requirements WHERE id = v_exchange.requirement_id FOR UPDATE;
        SELECT COALESCE(SUM(ei.quantity), 0) INTO v_completed_for_req
        FROM exchange_items ei
        JOIN exchanges e ON e.id = ei.exchange_id
        WHERE e.requirement_id = v_exchange.requirement_id AND ei.status = 'COMPLETED';

        IF v_completed_for_req >= v_required THEN
            UPDATE requirements SET status = 'FULFILLED' WHERE id = v_exchange.requirement_id;
        END IF;
    END IF;

    INSERT INTO activity_logs (exchange_id, action, details)
    VALUES (p_exchange_id, 'EXCHANGE_COMPLETED', jsonb_build_object(
        'actor_organization_id', p_actor_id,
        'total_quantity', v_total_qty,
        'total_value_bdt', v_total_value
    ));

    RETURN p_exchange_id;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- cancel_exchange
--   Buyer cancels an active exchange. Releases stock held by ACCEPTED items.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cancel_exchange(p_exchange_id UUID, p_actor_id UUID)
RETURNS UUID AS $$
DECLARE
    v_exchange exchanges%ROWTYPE;
    v_item RECORD;
    v_released INTEGER := 0;
BEGIN
    SELECT * INTO v_exchange FROM exchanges WHERE id = p_exchange_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MONOLOOP:NOT_FOUND:Exchange % was not found.', p_exchange_id;
    END IF;
    IF v_exchange.buyer_organization_id <> p_actor_id THEN
        RAISE EXCEPTION 'MONOLOOP:FORBIDDEN_ORGANIZATION:Only the buyer can cancel this exchange.';
    END IF;
    IF v_exchange.status NOT IN ('PROPOSED', 'IN_PROGRESS') THEN
        RAISE EXCEPTION 'MONOLOOP:INVALID_STATE:Exchange is already %.', v_exchange.status;
    END IF;

    FOR v_item IN
        SELECT * FROM exchange_items
        WHERE exchange_id = p_exchange_id
        ORDER BY listing_id
        FOR UPDATE
    LOOP
        IF v_item.status = 'ACCEPTED' THEN
            PERFORM 1 FROM listings WHERE id = v_item.listing_id FOR UPDATE;
            UPDATE listings
            SET reserved_quantity = reserved_quantity - v_item.quantity
            WHERE id = v_item.listing_id;
            v_released := v_released + v_item.quantity;
        END IF;
        IF v_item.status IN ('PENDING', 'ACCEPTED') THEN
            UPDATE exchange_items SET status = 'CANCELLED' WHERE id = v_item.id;
        END IF;
    END LOOP;

    UPDATE exchanges SET status = 'CANCELLED' WHERE id = p_exchange_id;

    INSERT INTO activity_logs (exchange_id, action, details)
    VALUES (p_exchange_id, 'EXCHANGE_CANCELLED', jsonb_build_object(
        'actor_organization_id', p_actor_id,
        'released_quantity', v_released
    ));

    RETURN p_exchange_id;
END;
$$ LANGUAGE plpgsql;
