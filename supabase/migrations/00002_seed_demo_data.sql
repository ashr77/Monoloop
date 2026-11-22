-- ============================================================================
-- MONOLOOP SEED DATA (Synthetic Demo Organizations & Listings)
-- TSUNAGU Hackathon 2026
-- Migration: 00002_seed_demo_data.sql
-- All data is SYNTHETIC and for demonstration/testing purposes only.
-- ============================================================================

-- 1. SEED ORGANIZATIONS
INSERT INTO organizations (id, name, organization_type, city, address)
VALUES
    ('a1111111-1111-4111-a111-111111111111', 'Gazipur Metal Works Ltd.', 'SUPPLIER', 'Gazipur', 'Plot 42, Tongi Industrial Area, Gazipur'),
    ('a2222222-2222-4222-a222-222222222222', 'Dhaka Precision Steel Fabrications', 'SUPPLIER', 'Dhaka', 'Tejgaon Industrial Area, Dhaka'),
    ('a3333333-3333-4333-a333-333333333333', 'Narayanganj Industrial Supplies & Scrap', 'SUPPLIER', 'Narayanganj', 'BSCIC Estate, Fatullah, Narayanganj'),
    ('a4444444-4444-4444-a444-444444444444', 'GreenWood Furniture Workshop & Crafts', 'SUPPLIER', 'Dhaka', 'Badda, Dhaka'),
    ('b1111111-1111-4111-b111-111111111111', 'Apex Modular Enclosures (Buyer Demo)', 'BUYER', 'Dhaka', 'Uttara Sector 3, Dhaka'),
    ('b2222222-2222-4222-b222-222222222222', 'Delta Interior Fixtures (Buyer Demo)', 'BUYER', 'Gazipur', 'Konabari, Gazipur')
ON CONFLICT (id) DO NOTHING;

-- 2. SEED MATERIAL LISTINGS
-- Includes:
-- - Exact match candidates
-- - Multi-supplier combination candidates (e.g., small batches that together meet 80 pcs)
-- - Grade mismatch test cases (SS201 vs SS304)
-- - Dimension/thickness mismatch test cases
INSERT INTO listings (
    id, organization_id, material_family, material_specification,
    length_mm, width_mm, thickness_mm, total_quantity, reserved_quantity,
    quantity_unit, condition, unit_price_bdt, description, city, status
)
VALUES
    -- Gazipur: SS304 Sheet 2400x1200x2mm (50 pcs) - Ideal candidate
    (
        'c1111111-1111-4111-c111-111111111111',
        'a1111111-1111-4111-a111-111111111111',
        'STAINLESS_STEEL_SHEET', 'SS304',
        2400, 1200, 2.0, 50, 0,
        'PIECE', 'UNUSED', 4200.00,
        'Surplus cold-rolled 2B finish stainless steel sheets from cancelled enclosure project. Factory wrapped.',
        'Gazipur', 'ACTIVE'
    ),
    -- Dhaka Precision: SS304 Sheet 2400x1200x2mm (40 pcs) - Multi-supplier candidate with Gazipur
    (
        'c2222222-2222-4222-c222-222222222222',
        'a2222222-2222-4222-a222-222222222222',
        'STAINLESS_STEEL_SHEET', 'SS304',
        2400, 1200, 2.0, 40, 0,
        'PIECE', 'UNUSED', 4350.00,
        'Prime excess stock SS304 2mm sheet. Stored in dry indoor rack.',
        'Dhaka', 'ACTIVE'
    ),
    -- Narayanganj: SS201 Sheet 2400x1200x2mm (30 pcs) - Grade Mismatch test case for SS304 queries
    (
        'c3333333-3333-4333-c333-333333333333',
        'a3333333-3333-4333-a333-333333333333',
        'STAINLESS_STEEL_SHEET', 'SS201',
        2400, 1200, 2.0, 30, 0,
        'PIECE', 'LEFTOVER', 2900.00,
        'Commercial grade SS201 decorative sheets. Slight handling scuffs.',
        'Narayanganj', 'ACTIVE'
    ),
    -- Gazipur: SS304 Sheet 2000x1000x1.5mm (60 pcs) - Thickness Mismatch test case (1.5mm vs 2.0mm)
    (
        'c4444444-4444-4444-c444-444444444444',
        'a1111111-1111-4111-a111-111111111111',
        'STAINLESS_STEEL_SHEET', 'SS304',
        2000, 1000, 1.5, 60, 10,
        'PIECE', 'UNUSED', 3100.00,
        'Uncut SS304 sheets, 1.5mm gauge. 10 units currently reserved for local inquiry.',
        'Gazipur', 'ACTIVE'
    ),
    -- GreenWood: PLYWOOD_STANDARD 2440x1220x18mm (100 pcs)
    (
        'c5555555-5555-4555-c555-555555555555',
        'a4444444-4444-4444-a444-444444444444',
        'PLYWOOD_PANEL', 'PLYWOOD_STANDARD',
        2440, 1220, 18.0, 100, 0,
        'PIECE', 'UNUSED', 1850.00,
        'Commercial hardwood core plywood sheets, calibrated thickness, MR grade.',
        'Dhaka', 'ACTIVE'
    ),
    -- GreenWood: PLYWOOD_MARINE 2440x1220x18mm (25 pcs) - Premium marine grade
    (
        'c6666666-6666-4666-c666-666666666666',
        'a4444444-4444-4444-a444-444444444444',
        'PLYWOOD_PANEL', 'PLYWOOD_MARINE',
        2440, 1220, 18.0, 25, 0,
        'PIECE', 'UNUSED', 2600.00,
        'BWP grade marine plywood panels for moisture-resistant construction.',
        'Dhaka', 'ACTIVE'
    ),
    -- Narayanganj: PLYWOOD_STANDARD 1200x600x12mm (80 pcs) - Offcuts
    (
        'c7777777-7777-4777-c777-777777777777',
        'a3333333-3333-4333-a333-333333333333',
        'PLYWOOD_PANEL', 'PLYWOOD_STANDARD',
        1200, 600, 12.0, 80, 0,
        'PIECE', 'OFFCUT', 450.00,
        'Clean modular cabinet cutting offcuts, consistent rectangular cuts.',
        'Narayanganj', 'ACTIVE'
    )
ON CONFLICT (id) DO NOTHING;

-- 3. SEED INITIAL SAMPLE REQUIREMENT (For Member 2 / 3 verification)
INSERT INTO requirements (
    id, organization_id, material_family, material_specification,
    length_mm, width_mm, thickness_mm, required_quantity,
    quantity_unit, maximum_budget_bdt, allow_split_suppliers,
    condition_requirement, status
)
VALUES
    (
        'd1111111-1111-4111-d111-111111111111',
        'b1111111-1111-4111-b111-111111111111',
        'STAINLESS_STEEL_SHEET', 'SS304',
        2400, 1200, 2.0, 80,
        'PIECE', 360000.00, TRUE,
        'UNUSED', 'OPEN'
    )
ON CONFLICT (id) DO NOTHING;
