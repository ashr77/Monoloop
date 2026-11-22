-- ============================================================================
-- MONOLOOP DATABASE SCHEMA (PostgreSQL / Supabase)
-- TSUNAGU Hackathon 2026
-- Migration: 00001_initial_schema.sql
-- ============================================================================

-- Enable pgcrypto for UUID generation if not already enabled
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. ORGANIZATIONS TABLE
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    organization_type TEXT NOT NULL CHECK (organization_type IN ('SUPPLIER', 'BUYER', 'HYBRID')),
    city TEXT NOT NULL,
    address TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. LISTINGS TABLE (Supply Inventory)
CREATE TABLE IF NOT EXISTS listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    material_family TEXT NOT NULL CHECK (material_family IN ('STAINLESS_STEEL_SHEET', 'PLYWOOD_PANEL')),
    material_specification TEXT NOT NULL,
    length_mm NUMERIC NOT NULL CHECK (length_mm > 0),
    width_mm NUMERIC NOT NULL CHECK (width_mm > 0),
    thickness_mm NUMERIC NOT NULL CHECK (thickness_mm > 0),
    total_quantity INTEGER NOT NULL CHECK (total_quantity >= 0),
    reserved_quantity INTEGER NOT NULL DEFAULT 0 CHECK (reserved_quantity >= 0),
    quantity_unit TEXT NOT NULL DEFAULT 'PIECE' CHECK (quantity_unit = 'PIECE'),
    condition TEXT NOT NULL CHECK (condition IN ('UNUSED', 'LEFTOVER', 'OFFCUT')),
    unit_price_bdt NUMERIC NOT NULL CHECK (unit_price_bdt >= 0),
    description TEXT,
    image_url TEXT,
    city TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'RESERVED', 'COMPLETED', 'ARCHIVED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    available_quantity INTEGER GENERATED ALWAYS AS (total_quantity - reserved_quantity) STORED,
    CONSTRAINT chk_reserved_lte_total CHECK (reserved_quantity <= total_quantity)
);

-- 3. REQUIREMENTS TABLE (Buyer Demand)
CREATE TABLE IF NOT EXISTS requirements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    material_family TEXT NOT NULL CHECK (material_family IN ('STAINLESS_STEEL_SHEET', 'PLYWOOD_PANEL')),
    material_specification TEXT NOT NULL,
    length_mm NUMERIC NOT NULL CHECK (length_mm > 0),
    width_mm NUMERIC NOT NULL CHECK (width_mm > 0),
    thickness_mm NUMERIC NOT NULL CHECK (thickness_mm > 0),
    required_quantity INTEGER NOT NULL CHECK (required_quantity > 0),
    quantity_unit TEXT NOT NULL DEFAULT 'PIECE' CHECK (quantity_unit = 'PIECE'),
    maximum_budget_bdt NUMERIC CHECK (maximum_budget_bdt IS NULL OR maximum_budget_bdt >= 0),
    allow_split_suppliers BOOLEAN NOT NULL DEFAULT TRUE,
    condition_requirement TEXT NOT NULL DEFAULT 'ANY' CHECK (condition_requirement IN ('ANY', 'UNUSED', 'LEFTOVER', 'OFFCUT')),
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN', 'FULFILLED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. EXCHANGES TABLE (Transactions)
CREATE TABLE IF NOT EXISTS exchanges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requirement_id UUID REFERENCES requirements(id) ON DELETE SET NULL,
    buyer_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    status TEXT NOT NULL DEFAULT 'PROPOSED' CHECK (status IN ('PROPOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. EXCHANGE_ITEMS TABLE (Allocated items per exchange)
CREATE TABLE IF NOT EXISTS exchange_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_id UUID NOT NULL REFERENCES exchanges(id) ON DELETE CASCADE,
    listing_id UUID NOT NULL REFERENCES listings(id) ON DELETE RESTRICT,
    supplier_organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE RESTRICT,
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. ACTIVITY_LOGS TABLE
CREATE TABLE IF NOT EXISTS activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    exchange_id UUID REFERENCES exchanges(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_listings_org ON listings(organization_id);
CREATE INDEX IF NOT EXISTS idx_listings_family_status ON listings(material_family, status);
CREATE INDEX IF NOT EXISTS idx_listings_spec ON listings(material_specification);
CREATE INDEX IF NOT EXISTS idx_requirements_org ON requirements(organization_id);
CREATE INDEX IF NOT EXISTS idx_requirements_family_status ON requirements(material_family, status);
CREATE INDEX IF NOT EXISTS idx_exchanges_buyer ON exchanges(buyer_organization_id);
CREATE INDEX IF NOT EXISTS idx_exchange_items_exchange ON exchange_items(exchange_id);
CREATE INDEX IF NOT EXISTS idx_exchange_items_listing ON exchange_items(listing_id);

-- TRIGGER FOR UPDATED_AT
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_listings_updated_at ON listings;
CREATE TRIGGER trg_listings_updated_at
    BEFORE UPDATE ON listings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_exchanges_updated_at ON exchanges;
CREATE TRIGGER trg_exchanges_updated_at
    BEFORE UPDATE ON exchanges
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ATOMIC INVENTORY HELPER FUNCTIONS (For Member 4 & Transaction Integrity)
CREATE OR REPLACE FUNCTION reserve_listing_quantity(p_listing_id UUID, p_quantity INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
    v_total INTEGER;
    v_reserved INTEGER;
BEGIN
    SELECT total_quantity, reserved_quantity INTO v_total, v_reserved
    FROM listings
    WHERE id = p_listing_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing % not found', p_listing_id;
    END IF;

    IF (v_total - v_reserved) < p_quantity THEN
        RETURN FALSE; -- Insufficient stock
    END IF;

    UPDATE listings
    SET reserved_quantity = reserved_quantity + p_quantity
    WHERE id = p_listing_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION release_listing_quantity(p_listing_id UUID, p_quantity INTEGER)
RETURNS BOOLEAN AS $$
BEGIN
    UPDATE listings
    SET reserved_quantity = GREATEST(0, reserved_quantity - p_quantity)
    WHERE id = p_listing_id;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
