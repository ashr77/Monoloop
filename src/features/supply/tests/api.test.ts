// ============================================================================
// Next.js Route Handlers Integration Tests
// TSUNAGU Hackathon 2026 - Member 1
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getListings, POST as postListing } from '@/app/api/listings/route';
import { GET as getListingDetail, PATCH as patchListing } from '@/app/api/listings/[id]/route';
import { POST as postAiExtract } from '@/app/api/ai/extract-material/route';
import { listingRepository } from '@/lib/supabase/repository';

describe('Supply APIs & Route Handlers', () => {
  beforeEach(() => {
    listingRepository._resetStore();
  });

  it('GET /api/listings returns all active listings with 200 OK', async () => {
    const req = new NextRequest('http://localhost:3000/api/listings');
    const res = await getListings(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(Array.isArray(json.data)).toBe(true);
    expect(json.data.length).toBeGreaterThan(0);
  });

  it('GET /api/listings?material_family=STAINLESS_STEEL_SHEET filters correctly', async () => {
    const req = new NextRequest('http://localhost:3000/api/listings?material_family=STAINLESS_STEEL_SHEET');
    const res = await getListings(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    for (const item of json.data) {
      expect(item.material_family).toBe('STAINLESS_STEEL_SHEET');
    }
  });

  it('POST /api/listings creates a new listing and returns 201 Created', async () => {
    const payload = {
      organization_id: 'a1111111-1111-4111-a111-111111111111',
      material_family: 'PLYWOOD_PANEL',
      material_specification: 'PLYWOOD_STANDARD',
      length_mm: 2440,
      width_mm: 1220,
      thickness_mm: 12,
      total_quantity: 30,
      condition: 'UNUSED',
      unit_price_bdt: 1200,
      city: 'Dhaka',
      description: 'New excess plywood batch',
    };

    const req = new NextRequest('http://localhost:3000/api/listings', {
      method: 'POST',
      body: JSON.stringify(payload),
    });

    const res = await postListing(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data.id).toBeDefined();
    expect(json.data.reserved_quantity).toBe(0);
    expect(json.data.available_quantity).toBe(30);
  });

  it('POST /api/listings returns 400 Bad Request on validation failure', async () => {
    const invalidPayload = {
      organization_id: 'a1111111-1111-4111-a111-111111111111',
      material_family: 'STAINLESS_STEEL_SHEET',
      material_specification: 'SS304',
      length_mm: -50, // invalid!
      width_mm: 1000,
      thickness_mm: 2,
      total_quantity: 0,
      unit_price_bdt: 500,
      city: 'Gazipur',
    };

    const req = new NextRequest('http://localhost:3000/api/listings', {
      method: 'POST',
      body: JSON.stringify(invalidPayload),
    });

    const res = await postListing(req);
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.success).toBe(false);
    expect(json.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/listings/[id] returns 404 for nonexistent listing', async () => {
    const req = new NextRequest('http://localhost:3000/api/listings/non-existent-id');
    const res = await getListingDetail(req, { params: { id: 'non-existent-id' } });
    const json = await res.json();

    expect(res.status).toBe(404);
    expect(json.success).toBe(false);
  });

  it('PATCH /api/listings/[id] rejects attempts to modify reserved_quantity directly', async () => {
    const req = new NextRequest('http://localhost:3000/api/listings/c1111111-1111-4111-c111-111111111111', {
      method: 'PATCH',
      body: JSON.stringify({ reserved_quantity: 50 }),
    });

    const res = await patchListing(req, { params: { id: 'c1111111-1111-4111-c111-111111111111' } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('FORBIDDEN_FIELD');
  });

  it('PATCH /api/listings/[id] rejects reducing total_quantity below reserved stock', async () => {
    // Listing c4444444-4444-4444-c444-444444444444 has reserved_quantity = 10
    const req = new NextRequest('http://localhost:3000/api/listings/c4444444-4444-4444-c444-444444444444', {
      method: 'PATCH',
      body: JSON.stringify({ total_quantity: 4 }), // 4 < 10!
    });

    const res = await patchListing(req, { params: { id: 'c4444444-4444-4444-c444-444444444444' } });
    const json = await res.json();

    expect(res.status).toBe(400);
    expect(json.error.code).toBe('INVALID_QUANTITY');
  });

  it('POST /api/ai/extract-material returns structured attributes in mock mode', async () => {
    const req = new NextRequest('http://localhost:3000/api/ai/extract-material', {
      method: 'POST',
      body: JSON.stringify({
        prompt: 'We have 40 unused stainless steel sheets, grade SS304, 2mm thick, 1000 by 500 mm in Gazipur at 450 taka.',
        mock: true,
      }),
    });

    const res = await postAiExtract(req);
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.material_specification).toBe('SS304');
    expect(json.data.total_quantity).toBe(40);
  });
});
