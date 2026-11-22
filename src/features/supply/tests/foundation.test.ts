// ============================================================================
// Foundation & Schema Validation Unit Tests
// TSUNAGU Hackathon 2026 - Member 1
// ============================================================================

import { describe, it, expect } from 'vitest';
import {
  createListingSchema,
  isSpecificationValidForFamily,
} from '@/features/supply/schemas/listing.schema';
import { listingRepository } from '@/lib/supabase/repository';

describe('Project Foundation & Schema Contracts', () => {
  it('validates correct specification for material family', () => {
    expect(isSpecificationValidForFamily('STAINLESS_STEEL_SHEET', 'SS304')).toBe(true);
    expect(isSpecificationValidForFamily('STAINLESS_STEEL_SHEET', 'SS201')).toBe(true);
    expect(isSpecificationValidForFamily('STAINLESS_STEEL_SHEET', 'PLYWOOD_STANDARD')).toBe(false);

    expect(isSpecificationValidForFamily('PLYWOOD_PANEL', 'PLYWOOD_STANDARD')).toBe(true);
    expect(isSpecificationValidForFamily('PLYWOOD_PANEL', 'SS304')).toBe(false);
  });

  it('rejects invalid material specification in createListingSchema', () => {
    const invalidData = {
      organization_id: 'org-test-1',
      material_family: 'STAINLESS_STEEL_SHEET' as const,
      material_specification: 'PLYWOOD_STANDARD', // mismatch!
      length_mm: 2000,
      width_mm: 1000,
      thickness_mm: 2,
      total_quantity: 10,
      condition: 'UNUSED' as const,
      unit_price_bdt: 500,
      city: 'Gazipur',
    };

    const result = createListingSchema.safeParse(invalidData);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues[0].message).toContain('Invalid specification');
    }
  });

  it('rejects zero or negative dimensions and quantities', () => {
    const invalidDimensions = {
      organization_id: 'org-test-1',
      material_family: 'STAINLESS_STEEL_SHEET' as const,
      material_specification: 'SS304',
      length_mm: -100, // negative!
      width_mm: 0, // zero!
      thickness_mm: -1,
      total_quantity: 0, // must be > 0
      condition: 'UNUSED' as const,
      unit_price_bdt: -50, // negative price!
      city: 'Gazipur',
    };

    const result = createListingSchema.safeParse(invalidDimensions);
    expect(result.success).toBe(false);
  });

  it('correctly calculates available_quantity = total_quantity - reserved_quantity', async () => {
    const listings = await listingRepository.getListings();
    expect(listings.length).toBeGreaterThan(0);

    for (const listing of listings) {
      expect(listing.available_quantity).toBe(listing.total_quantity - listing.reserved_quantity);
      expect(listing.reserved_quantity).toBeGreaterThanOrEqual(0);
      expect(listing.total_quantity).toBeGreaterThanOrEqual(listing.reserved_quantity);
    }
  });
});
