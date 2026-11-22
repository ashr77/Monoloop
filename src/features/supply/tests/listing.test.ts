// ============================================================================
// Supply Management - Core Business Logic & Invariants Tests
// TSUNAGU Hackathon 2026 - Member 1
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { listingRepository } from '@/lib/supabase/repository';
import { createListingSchema } from '@/features/supply/schemas/listing.schema';

describe('Supply Management & Inventory Invariants', () => {
  beforeEach(() => {
    listingRepository.setMockMode(true);
    listingRepository._resetStore();
  });

  // Test 1: Valid listing creation
  it('creates a valid listing successfully with reserved_quantity initialized to 0', async () => {
    const validData = {
      organization_id: 'a1111111-1111-4111-a111-111111111111',
      material_family: 'STAINLESS_STEEL_SHEET' as const,
      material_specification: 'SS304' as const,
      length_mm: 2000,
      width_mm: 1000,
      thickness_mm: 2.0,
      total_quantity: 25,
      quantity_unit: 'PIECE' as const,
      condition: 'UNUSED' as const,
      unit_price_bdt: 4100,
      city: 'Gazipur',
      description: 'Factory surplus clean sheets',
      image_url: null,
      status: 'ACTIVE' as const,
    };

    const parsed = createListingSchema.safeParse(validData);
    expect(parsed.success).toBe(true);

    const created = await listingRepository.createListing(validData);
    expect(created.id).toBeDefined();
    expect(created.reserved_quantity).toBe(0);
    expect(created.total_quantity).toBe(25);
    expect(created.available_quantity).toBe(25);
    expect(created.status).toBe('ACTIVE');
  });

  // Test 2: Negative quantity rejection
  it('rejects negative or zero total_quantity', () => {
    const invalidQtyData = {
      organization_id: 'a1111111-1111-4111-a111-111111111111',
      material_family: 'STAINLESS_STEEL_SHEET' as const,
      material_specification: 'SS304' as const,
      length_mm: 2000,
      width_mm: 1000,
      thickness_mm: 2.0,
      total_quantity: -5,
      condition: 'UNUSED' as const,
      unit_price_bdt: 4100,
      city: 'Gazipur',
    };

    const res = createListingSchema.safeParse(invalidQtyData);
    expect(res.success).toBe(false);
  });

  // Test 3: Zero/negative dimension rejection
  it('rejects zero or negative dimensions (length, width, thickness)', () => {
    const base = {
      organization_id: 'a1111111-1111-4111-a111-111111111111',
      material_family: 'STAINLESS_STEEL_SHEET' as const,
      material_specification: 'SS304' as const,
      total_quantity: 10,
      condition: 'UNUSED' as const,
      unit_price_bdt: 4100,
      city: 'Gazipur',
    };

    expect(createListingSchema.safeParse({ ...base, length_mm: 0, width_mm: 100, thickness_mm: 1 }).success).toBe(false);
    expect(createListingSchema.safeParse({ ...base, length_mm: 100, width_mm: -10, thickness_mm: 1 }).success).toBe(false);
    expect(createListingSchema.safeParse({ ...base, length_mm: 100, width_mm: 100, thickness_mm: -0.5 }).success).toBe(false);
  });

  // Test 4: Invalid material specification
  it('rejects specification that does not belong to the material family', () => {
    const mismatch = {
      organization_id: 'a1111111-1111-4111-a111-111111111111',
      material_family: 'PLYWOOD_PANEL' as const,
      material_specification: 'SS304' as const, // Invalid for plywood!
      length_mm: 2440,
      width_mm: 1220,
      thickness_mm: 18,
      total_quantity: 15,
      condition: 'UNUSED' as const,
      unit_price_bdt: 2000,
      city: 'Dhaka',
    };

    const res = createListingSchema.safeParse(mismatch);
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues[0].message).toContain('Invalid specification');
    }
  });

  // Test 5: Missing required attributes
  it('rejects listings with missing required fields (city, organization_id, condition)', () => {
    const missing = {
      material_family: 'STAINLESS_STEEL_SHEET' as const,
      material_specification: 'SS304' as const,
      length_mm: 2000,
      width_mm: 1000,
      thickness_mm: 2.0,
      total_quantity: 10,
      unit_price_bdt: 4000,
    };

    const res = createListingSchema.safeParse(missing);
    expect(res.success).toBe(false);
  });

  // Test 6: Correct available quantity calculation
  it('correctly calculates available_quantity = total_quantity - reserved_quantity', async () => {
    const listingWithReservations = await listingRepository.getListingById(
      'c4444444-4444-4444-c444-444444444444' // Gazipur SS304 1.5mm, total 60, reserved 10
    );

    expect(listingWithReservations).toBeDefined();
    expect(listingWithReservations!.total_quantity).toBe(60);
    expect(listingWithReservations!.reserved_quantity).toBe(10);
    expect(listingWithReservations!.available_quantity).toBe(50);
  });

  // Test 7: Editing listing specifications
  it('allows editing listing dimensions, price, and description', async () => {
    const updated = await listingRepository.updateListing('c1111111-1111-4111-c111-111111111111', {
      unit_price_bdt: 4400,
      description: 'Updated price after renegotiation',
    });

    expect(updated).toBeDefined();
    expect(updated!.unit_price_bdt).toBe(4400);
    expect(updated!.description).toBe('Updated price after renegotiation');
  });

  // Test 8: Editing quantity without violating reserved stock
  it('allows increasing or safely decreasing total_quantity as long as total >= reserved', async () => {
    // Current total 60, reserved 10
    const updated = await listingRepository.updateListing('c4444444-4444-4444-c444-444444444444', {
      total_quantity: 20, // 20 >= 10 is valid
    });

    expect(updated!.total_quantity).toBe(20);
    expect(updated!.reserved_quantity).toBe(10);
    expect(updated!.available_quantity).toBe(10);
  });

  // Test 9: Preventing reduction of total_quantity below reserved_quantity
  it('throws error if attempting to reduce total_quantity below currently reserved stock', async () => {
    // Current total 60, reserved 10. Attempting to set total to 5 should fail!
    await expect(
      listingRepository.updateListing('c4444444-4444-4444-c444-444444444444', {
        total_quantity: 5,
      })
    ).rejects.toThrow(/Cannot reduce total quantity \(5\) below currently reserved quantity \(10\)/);
  });

  // Test 10: Archiving a listing
  it('archives a listing by transitioning status to ARCHIVED without deletion', async () => {
    const archived = await listingRepository.archiveListing('c1111111-1111-4111-c111-111111111111');
    expect(archived).toBeDefined();
    expect(archived!.status).toBe('ARCHIVED');

    const fetched = await listingRepository.getListingById('c1111111-1111-4111-c111-111111111111');
    expect(fetched!.status).toBe('ARCHIVED');
  });
});
