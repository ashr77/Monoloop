-- ============================================================================
-- MONOLOOP - Payments for exchanges (Member 4)
-- TSUNAGU Hackathon 2026
-- Migration: 00007_payments.sql   (safe to run more than once)
--
-- One row per payment attempt. The buyer pays the full material value of a
-- RESERVED exchange through SSLCommerz (sandbox in this prototype).
--
--   INITIATED ──(gateway success + server-side validation)──▶ PAID
--       │──(gateway fail)──▶ FAILED
--       └──(buyer cancelled on gateway)──▶ CANCELLED
--
-- A payment becomes PAID only after the backend re-validates the transaction
-- with the gateway's validation API (status, tran_id, amount, currency).
-- At most one PAID payment per exchange is allowed.
-- ============================================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_id UUID NOT NULL REFERENCES exchanges(id) ON DELETE RESTRICT,
    payer_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    provider TEXT NOT NULL DEFAULT 'SSLCOMMERZ',
    tran_id TEXT NOT NULL UNIQUE,
    amount_bdt NUMERIC(14, 2) NOT NULL CHECK (amount_bdt > 0),
    currency TEXT NOT NULL DEFAULT 'BDT' CHECK (currency = 'BDT'),
    status TEXT NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'PAID', 'FAILED', 'CANCELLED')),
    session_key TEXT,
    val_id TEXT,
    bank_tran_id TEXT,
    card_type TEXT,
    gateway_status TEXT,
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_exchange ON payments(exchange_id);

-- At most one successful payment per exchange (guards duplicate callbacks).
CREATE UNIQUE INDEX IF NOT EXISTS uq_payments_paid_exchange
    ON payments(exchange_id)
    WHERE status = 'PAID';

DROP TRIGGER IF EXISTS trg_payments_updated_at ON payments;
CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
