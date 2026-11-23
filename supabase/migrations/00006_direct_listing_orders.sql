-- Member 4-compatible direct listing orders.
-- A direct order is a PENDING exchange item; stock is reserved only when the supplier accepts.

CREATE OR REPLACE FUNCTION create_direct_listing_order(
    p_listing_id UUID,
    p_buyer_id UUID,
    p_quantity INTEGER
)
RETURNS UUID AS $$
DECLARE
    v_listing listings%ROWTYPE;
    v_exchange_id UUID;
BEGIN
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'MONOLOOP:VALIDATION_ERROR:Requested quantity must be a positive whole number.';
    END IF;

    SELECT * INTO v_listing FROM listings WHERE id = p_listing_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MONOLOOP:NOT_FOUND:Listing % was not found.', p_listing_id;
    END IF;
    IF v_listing.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'MONOLOOP:LISTING_UNAVAILABLE:Listing % is %, not ACTIVE.', p_listing_id, v_listing.status;
    END IF;
    IF v_listing.organization_id = p_buyer_id THEN
        RAISE EXCEPTION 'MONOLOOP:VALIDATION_ERROR:A buyer cannot order its own listing.';
    END IF;
    IF v_listing.total_quantity - v_listing.reserved_quantity < p_quantity THEN
        RAISE EXCEPTION 'MONOLOOP:INSUFFICIENT_STOCK:Only % piece(s) are still available.', v_listing.total_quantity - v_listing.reserved_quantity;
    END IF;
    IF (
        SELECT COALESCE(SUM(i.quantity), 0)
        FROM exchange_items i
        JOIN exchanges e ON e.id = i.exchange_id
        WHERE i.listing_id = p_listing_id
          AND i.status IN ('PENDING', 'ACCEPTED')
          AND e.status IN ('PROPOSED', 'IN_PROGRESS')
    ) + p_quantity > v_listing.total_quantity - v_listing.reserved_quantity THEN
        RAISE EXCEPTION 'MONOLOOP:INSUFFICIENT_STOCK:Only % piece(s) remain uncommitted.', v_listing.total_quantity - v_listing.reserved_quantity - (
            SELECT COALESCE(SUM(i.quantity), 0)
            FROM exchange_items i
            JOIN exchanges e ON e.id = i.exchange_id
            WHERE i.listing_id = p_listing_id
              AND i.status IN ('PENDING', 'ACCEPTED')
              AND e.status IN ('PROPOSED', 'IN_PROGRESS')
        );
    END IF;
    IF EXISTS (
        SELECT 1
        FROM exchanges e
        JOIN exchange_items i ON i.exchange_id = e.id
        WHERE e.status = 'PROPOSED'
          AND e.buyer_organization_id = p_buyer_id
          AND i.listing_id = p_listing_id
          AND i.status = 'PENDING'
    ) THEN
        RAISE EXCEPTION 'MONOLOOP:DUPLICATE_EXCHANGE:An active order already exists for this listing.';
    END IF;

    INSERT INTO exchanges (requirement_id, buyer_organization_id, status)
    VALUES (NULL, p_buyer_id, 'PROPOSED')
    RETURNING id INTO v_exchange_id;

    INSERT INTO exchange_items (
        exchange_id, listing_id, supplier_organization_id,
        quantity, unit_price_bdt, status
    )
    VALUES (
        v_exchange_id, p_listing_id, v_listing.organization_id,
        p_quantity, v_listing.unit_price_bdt, 'PENDING'
    );

    INSERT INTO activity_logs (exchange_id, action, details)
    VALUES (
        v_exchange_id,
        'DIRECT_LISTING_ORDER',
        jsonb_build_object(
            'actor_organization_id', p_buyer_id,
            'listing_id', p_listing_id,
            'quantity', p_quantity,
            'unit_price_bdt', v_listing.unit_price_bdt
        )
    );

    RETURN v_exchange_id;
END;
$$ LANGUAGE plpgsql;
