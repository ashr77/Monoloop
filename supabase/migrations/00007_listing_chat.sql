-- ============================================================================
-- MONOLOOP - Buyer ↔ supplier chat about a listing (Member 1)
-- TSUNAGU Hackathon 2026
-- Migration: 00007_listing_chat.sql   (run after 00001 → 00006; safe to re-run)
--
-- One conversation per (listing, buyer). Messages only: the chat never creates
-- orders, prices or reservations. Ordering stays the direct listing order flow
-- from 00006 (create_direct_listing_order), which the chat page links to.
--
-- Every write goes through a function = one transaction with the same rules
-- as the backend's in-memory store. Errors use 'MONOLOOP:<CODE>:<message>'.
-- ============================================================================

CREATE TABLE IF NOT EXISTS listing_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
    buyer_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    supplier_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_preview TEXT NOT NULL DEFAULT '',
    buyer_unread INTEGER NOT NULL DEFAULT 0 CHECK (buyer_unread >= 0),
    supplier_unread INTEGER NOT NULL DEFAULT 0 CHECK (supplier_unread >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_listing_conversation UNIQUE (listing_id, buyer_organization_id),
    CONSTRAINT chk_listing_conversation_parties CHECK (buyer_organization_id <> supplier_organization_id)
);

-- seq is a monotonic cursor for polling (?after_seq=N).
CREATE TABLE IF NOT EXISTS listing_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
    conversation_id UUID NOT NULL REFERENCES listing_conversations(id) ON DELETE CASCADE,
    sender_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    body TEXT NOT NULL CHECK (char_length(body) BETWEEN 1 AND 2000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_listing_conversations_buyer
    ON listing_conversations(buyer_organization_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_conversations_supplier
    ON listing_conversations(supplier_organization_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_listing_messages_conversation ON listing_messages(conversation_id, seq);

-- Private: with RLS on and no policies, the public anon/authenticated API keys
-- cannot read or write these tables. The backend (service role or a direct
-- connection) bypasses RLS.
ALTER TABLE listing_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE listing_messages ENABLE ROW LEVEL SECURITY;

-- --------------------------------------------------------------------------
-- Loads a conversation and checks the actor takes part in it.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION listing_chat_participant(p_conversation_id UUID, p_actor_id UUID)
RETURNS listing_conversations AS $$
DECLARE
    v_conv listing_conversations%ROWTYPE;
BEGIN
    SELECT * INTO v_conv FROM listing_conversations WHERE id = p_conversation_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MONOLOOP:NOT_FOUND:Conversation % was not found.', p_conversation_id;
    END IF;
    IF p_actor_id IS DISTINCT FROM v_conv.buyer_organization_id
       AND p_actor_id IS DISTINCT FROM v_conv.supplier_organization_id THEN
        RAISE EXCEPTION 'MONOLOOP:FORBIDDEN_ORGANIZATION:Only the buyer and the supplier can access this conversation.';
    END IF;
    RETURN v_conv;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- open_listing_conversation: get or create the chat for (listing, buyer)
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION open_listing_conversation(p_listing_id UUID, p_buyer_id UUID)
RETURNS UUID AS $$
DECLARE
    v_listing listings%ROWTYPE;
    v_buyer organizations%ROWTYPE;
    v_id UUID;
BEGIN
    SELECT id INTO v_id FROM listing_conversations
    WHERE listing_id = p_listing_id AND buyer_organization_id = p_buyer_id;
    IF FOUND THEN
        RETURN v_id;  -- reopening an existing chat is always allowed
    END IF;

    SELECT * INTO v_listing FROM listings WHERE id = p_listing_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MONOLOOP:NOT_FOUND:Listing % was not found.', p_listing_id;
    END IF;
    SELECT * INTO v_buyer FROM organizations WHERE id = p_buyer_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'MONOLOOP:NOT_FOUND:Organization % was not found.', p_buyer_id;
    END IF;
    IF v_buyer.organization_type NOT IN ('BUYER', 'HYBRID') THEN
        RAISE EXCEPTION 'MONOLOOP:FORBIDDEN_ROLE:Only buyer organizations can start a chat with a supplier.';
    END IF;
    IF v_listing.organization_id = p_buyer_id THEN
        RAISE EXCEPTION 'MONOLOOP:VALIDATION_ERROR:You cannot start a chat about your own listing.';
    END IF;
    IF v_listing.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'MONOLOOP:LISTING_UNAVAILABLE:Listing is %, not ACTIVE.', v_listing.status;
    END IF;

    INSERT INTO listing_conversations (listing_id, buyer_organization_id, supplier_organization_id)
    VALUES (p_listing_id, p_buyer_id, v_listing.organization_id)
    ON CONFLICT (listing_id, buyer_organization_id) DO NOTHING
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN  -- created concurrently by another request
        SELECT id INTO v_id FROM listing_conversations
        WHERE listing_id = p_listing_id AND buyer_organization_id = p_buyer_id;
    END IF;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- post_listing_message: a participant sends text. The other side's unread
-- counter goes up and the conversation preview moves to this message.
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION post_listing_message(p_conversation_id UUID, p_actor_id UUID, p_body TEXT)
RETURNS UUID AS $$
DECLARE
    v_conv listing_conversations%ROWTYPE;
    v_body TEXT := btrim(coalesce(p_body, ''));
    v_id UUID;
    v_at TIMESTAMPTZ;
BEGIN
    v_conv := listing_chat_participant(p_conversation_id, p_actor_id);
    IF char_length(v_body) = 0 THEN
        RAISE EXCEPTION 'MONOLOOP:VALIDATION_ERROR:Message cannot be empty.';
    END IF;

    INSERT INTO listing_messages (conversation_id, sender_organization_id, body)
    VALUES (p_conversation_id, p_actor_id, v_body)
    RETURNING id, created_at INTO v_id, v_at;

    UPDATE listing_conversations
    SET last_message_at = v_at,
        last_message_preview = left(v_body, 140),
        buyer_unread = buyer_unread + CASE WHEN p_actor_id = v_conv.buyer_organization_id THEN 0 ELSE 1 END,
        supplier_unread = supplier_unread + CASE WHEN p_actor_id = v_conv.supplier_organization_id THEN 0 ELSE 1 END
    WHERE id = p_conversation_id;
    RETURN v_id;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- mark_listing_conversation_read: clears the actor's unread counter
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION mark_listing_conversation_read(p_conversation_id UUID, p_actor_id UUID)
RETURNS VOID AS $$
DECLARE
    v_conv listing_conversations%ROWTYPE;
BEGIN
    v_conv := listing_chat_participant(p_conversation_id, p_actor_id);
    IF p_actor_id = v_conv.buyer_organization_id THEN
        UPDATE listing_conversations SET buyer_unread = 0 WHERE id = p_conversation_id AND buyer_unread <> 0;
    ELSE
        UPDATE listing_conversations SET supplier_unread = 0 WHERE id = p_conversation_id AND supplier_unread <> 0;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- --------------------------------------------------------------------------
-- Only the backend may call these, never the public PostgREST roles.
-- --------------------------------------------------------------------------
DO $$
DECLARE
    v_fn TEXT;
BEGIN
    FOREACH v_fn IN ARRAY ARRAY[
        'listing_chat_participant(uuid, uuid)',
        'open_listing_conversation(uuid, uuid)',
        'post_listing_message(uuid, uuid, text)',
        'mark_listing_conversation_read(uuid, uuid)'
    ] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', v_fn);
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon, authenticated', v_fn);
        END IF;
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_fn);
        END IF;
    END LOOP;
END;
$$;
