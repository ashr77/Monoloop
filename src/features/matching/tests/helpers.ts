// Test factories for matching tests.
import type { MaterialListing, MaterialRequirement, Organization } from '@/lib/types';

export const BUYER: Organization = {
  id: 'b0000000-0000-4000-b000-000000000001',
  name: 'Test Buyer Works',
  organization_type: 'BUYER',
  city: 'Dhaka',
  created_at: '2026-01-01T00:00:00.000Z',
};

export const org = (n: number, city: string, type: Organization['organization_type'] = 'SUPPLIER'): Organization => ({
  id: `a0000000-0000-4000-a000-00000000000${n}`,
  name: `Supplier ${String.fromCharCode(64 + n)}`,
  organization_type: type,
  city,
  created_at: '2026-01-01T00:00:00.000Z',
});

export const SUP_A = org(1, 'Gazipur');
export const SUP_B = org(2, 'Dhaka');
export const SUP_C = org(3, 'Chattogram');

let seq = 0;
export function listing(overrides: Partial<MaterialListing> & { supplier?: Organization } = {}): MaterialListing {
  const { supplier = SUP_A, ...rest } = overrides;
  seq += 1;
  const total = rest.total_quantity ?? 50;
  const reserved = rest.reserved_quantity ?? 0;
  return {
    id: `c0000000-0000-4000-c000-${String(seq).padStart(12, '0')}`,
    organization_id: supplier.id,
    organization: supplier,
    material_family: 'STAINLESS_STEEL_SHEET',
    material_specification: 'SS304',
    length_mm: 2400,
    width_mm: 1200,
    thickness_mm: 2,
    total_quantity: total,
    reserved_quantity: reserved,
    available_quantity: total - reserved,
    quantity_unit: 'PIECE',
    condition: 'UNUSED',
    unit_price_bdt: 4000,
    city: supplier.city,
    status: 'ACTIVE',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    ...rest,
  };
}

export function requirement(overrides: Partial<MaterialRequirement> = {}): MaterialRequirement {
  return {
    id: 'd0000000-0000-4000-d000-000000000001',
    organization_id: BUYER.id,
    organization: BUYER,
    material_family: 'STAINLESS_STEEL_SHEET',
    material_specification: 'SS304',
    length_mm: 2400,
    width_mm: 1200,
    thickness_mm: 2,
    required_quantity: 60,
    quantity_unit: 'PIECE',
    maximum_budget_bdt: null,
    allow_split_suppliers: true,
    condition_requirement: 'ANY',
    status: 'OPEN',
    created_at: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

export const NOW = new Date('2026-11-24T08:00:00.000Z');
