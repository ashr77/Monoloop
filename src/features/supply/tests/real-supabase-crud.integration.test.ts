// ============================================================================
// Real Supabase PostgreSQL CRUD Verification Suite
// TSUNAGU Hackathon 2026 - Member 1
// Performs end-to-end CRUD against the live hosted PostgreSQL database.
// ============================================================================

import { describe, it, expect, afterAll } from 'vitest';
import { listingRepository } from '@/lib/supabase/repository';
import { getSupabaseServerClient, isSupabaseConfigured } from '@/lib/supabase/server';

describe('Real Supabase PostgreSQL CRUD Verification', () => {
  let createdTestListingId: string | null = null;

  it('verifies Supabase configuration is active and not mock', () => {
    expect(isSupabaseConfigured()).toBe(true);
    expect(listingRepository.isMockMode()).toBe(false);
  });

  // Step 1: Read existing supplier organizations
  it('reads existing supplier organizations from real database', async () => {
    const orgs = await listingRepository.getOrganizations();
    expect(orgs).toBeDefined();
    expect(orgs.length).toBeGreaterThanOrEqual(6);

    const suppliers = orgs.filter((o) => o.organization_type === 'SUPPLIER');
    expect(suppliers.length).toBeGreaterThanOrEqual(4);

    const gazipur = suppliers.find((s) => s.city === 'Gazipur');
    expect(gazipur).toBeDefined();
    expect(gazipur!.name).toContain('Gazipur Metal Works');
  });

  // Step 2: Read existing surplus listings
  it('reads existing surplus listings from real database', async () => {
    const listings = await listingRepository.getListings();
    expect(listings).toBeDefined();
    expect(listings.length).toBeGreaterThanOrEqual(7);

    // Verify relations and calculated columns are working in real PostgreSQL
    const sample = listings[0];
    expect(sample.id).toBeDefined();
    expect(sample.available_quantity).toBe(sample.total_quantity - sample.reserved_quantity);
  });

  // Step 3: Create one temporary test listing
  it('creates one clearly identified disposable test listing in real PostgreSQL', async () => {
    const payload = {
      organization_id: 'a1111111-1111-4111-a111-111111111111',
      material_family: 'STAINLESS_STEEL_SHEET' as const,
      material_specification: 'SS304' as const,
      length_mm: 2000,
      width_mm: 1000,
      thickness_mm: 2.0,
      total_quantity: 15,
      quantity_unit: 'PIECE' as const,
      condition: 'UNUSED' as const,
      unit_price_bdt: 5000,
      city: 'Gazipur',
      description: '[DISPOSABLE_TEST_VERIFICATION] Real Supabase CRUD Test Record',
      image_url: null,
      status: 'ACTIVE' as const,
    };

    const created = await listingRepository.createListing(payload);
    expect(created).toBeDefined();
    expect(created.id).toBeDefined();
    createdTestListingId = created.id;

    expect(created.total_quantity).toBe(15);
    expect(created.reserved_quantity).toBe(0);
    expect(created.available_quantity).toBe(15);
    expect(created.status).toBe('ACTIVE');
  });

  // Step 4: Retrieve the created listing from PostgreSQL
  it('retrieves the created listing directly from PostgreSQL by ID', async () => {
    expect(createdTestListingId).toBeTruthy();

    const fetched = await listingRepository.getListingById(createdTestListingId!);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(createdTestListingId);
    expect(fetched!.material_specification).toBe('SS304');
    expect(fetched!.description).toContain('[DISPOSABLE_TEST_VERIFICATION]');
  });

  // Step 5 & 6: Update quantity or price and confirm persistence
  it('updates listing quantity and price and confirms persistence in PostgreSQL', async () => {
    expect(createdTestListingId).toBeTruthy();

    const updated = await listingRepository.updateListing(createdTestListingId!, {
      unit_price_bdt: 5250,
      total_quantity: 18,
    });

    expect(updated).toBeDefined();
    expect(updated!.unit_price_bdt).toBe(5250);
    expect(updated!.total_quantity).toBe(18);
    expect(updated!.available_quantity).toBe(18); // 18 - 0

    // Fetch again from DB to verify it truly persisted in PostgreSQL
    const refetched = await listingRepository.getListingById(createdTestListingId!);
    expect(refetched!.unit_price_bdt).toBe(5250);
    expect(refetched!.total_quantity).toBe(18);
  });

  // Step 7 & 8: Archive the temporary listing and confirm persistence
  it('archives the temporary listing and confirms archived status persisted', async () => {
    expect(createdTestListingId).toBeTruthy();

    const archived = await listingRepository.archiveListing(createdTestListingId!);
    expect(archived).toBeDefined();
    expect(archived!.status).toBe('ARCHIVED');

    const refetched = await listingRepository.getListingById(createdTestListingId!);
    expect(refetched!.status).toBe('ARCHIVED');
  });

  // Clean up disposable record
  afterAll(async () => {
    if (createdTestListingId) {
      const supabase = getSupabaseServerClient();
      if (supabase) {
        await supabase.from('listings').delete().eq('id', createdTestListingId);
        console.log(`[Test Cleanup] Removed disposable test record ${createdTestListingId}`);
      }
    }
  });
});
