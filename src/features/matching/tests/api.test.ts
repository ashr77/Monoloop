// ============================================================================
// Matching API route tests (Member 3) — in-memory demo stores of
// Member 1 (listings) and Member 2 (requirements)
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/matches/[requirementId]/route';
import { listingRepository } from '@/lib/supabase/repository';
import { requirementRepository } from '@/features/demand/services/requirementRepository';
import { estimateTransportBdt } from '@/features/matching/costs';

const SEED_REQ = 'd1111111-1111-4111-d111-111111111111'; // Apex (Dhaka): 80 × SS304 2400×1200×2, UNUSED, ৳360,000
const GAZIPUR_LISTING = 'c1111111-1111-4111-c111-111111111111';
const call = (id: string) =>
  GET(new NextRequest(`http://localhost:3000/api/matches/${id}`), { params: { requirementId: id } });

describe('GET /api/matches/[requirementId]', () => {
  beforeEach(() => {
    listingRepository.setMockMode(true);
    listingRepository._resetStore();
    requirementRepository.setMockMode(true);
    requirementRepository._resetStore();
  });

  it('returns a MatchResult for the seed requirement', async () => {
    const res = await call(SEED_REQ);
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.requirement_id).toBe(SEED_REQ);
    expect(json.data.matching_status).toBe('MULTI_SUPPLIER_MATCH');
    expect(json.data.unfulfilled_quantity).toBe(0);
    expect(json.data.allocations.map((a: { supplier_name: string }) => a.supplier_name)).toEqual([
      'Gazipur Metal Works Ltd.',
      'Dhaka Precision Steel Fabrications',
    ]);
    expect(json.data.total_estimated_cost_bdt).toBe(50 * 4200 + 30 * 4350 + estimateTransportBdt(35) + estimateTransportBdt(10));
    expect(json.meta.compatible_listings).toBe(2);
    // Only same-family listings are evaluated.
    expect(
      json.data.evaluations.every((e: { checks: { rule: string; passed: boolean }[] }) =>
        e.checks.find((c) => c.rule === 'MATERIAL_FAMILY')!.passed
      )
    ).toBe(true);
  });

  it("matches Member 2's demo buyer requirements (marine plywood, single supplier)", async () => {
    const json = await (await call('e1111111-1111-4111-e111-111111111111')).json();
    expect(json.data.matching_status).toBe('EXACT_MATCH');
    expect(json.data.allocated_quantities).toEqual({ 'c6666666-6666-4666-c666-666666666666': 12 });
    expect(json.data.budget.status).toBe('WITHIN_BUDGET');
  });

  it('reports NO_MATCH with a NOT_APPLICABLE budget when no grade/size matches', async () => {
    // d222…: SS201 2000×1000×1.5 — no such stock in the seed listings.
    const json = await (await call('d2222222-2222-4222-d222-222222222222')).json();
    expect(json.data.matching_status).toBe('NO_MATCH');
    expect(json.data.budget.status).toBe('NOT_APPLICABLE');
    expect(json.data.unfulfilled_quantity).toBe(25);
  });

  it('includes transport in the budget check (delivered cost)', async () => {
    // d333…: 40 plywood panels, budget ৳76,000. Material is ৳74,000 but delivery to Gazipur adds ৳3,600.
    const json = await (await call('d3333333-3333-4333-d333-333333333333')).json();
    expect(json.data.matching_status).toBe('NO_MATCH');
    expect(json.data.budget.status).toBe('OVER_BUDGET');
    expect(json.data.budget.cheapest_estimated_cost_bdt).toBe(40 * 1850 + estimateTransportBdt(35));
    expect(json.data.over_budget_alternative).toHaveLength(1);
  });

  it('returns 404 for an unknown requirement', async () => {
    const res = await call('00000000-0000-4000-8000-000000000000');
    expect(res.status).toBe(404);
    expect((await res.json()).error.code).toBe('NOT_FOUND');
  });

  it('returns 409 for a requirement that is not OPEN', async () => {
    await requirementRepository.updateRequirement(SEED_REQ, { status: 'CANCELLED' });
    const res = await call(SEED_REQ);
    const json = await res.json();
    expect(res.status).toBe(409);
    expect(json.error.code).toBe('REQUIREMENT_NOT_OPEN');
    expect(json.error.details.requirement_status).toBe('CANCELLED');
  });

  it('reflects reserved stock changes made by exchanges (reads live inventory)', async () => {
    // Reserve 45 of the 50 Gazipur sheets → the engine may only use the remaining 5.
    const store = (globalThis as unknown as { __monoloop_listings: { id: string; reserved_quantity: number }[] })
      .__monoloop_listings;
    store.find((l) => l.id === GAZIPUR_LISTING)!.reserved_quantity = 45;

    const json = await (await call(SEED_REQ)).json();
    expect(json.data.allocated_quantities[GAZIPUR_LISTING]).toBe(5);
    expect(json.data.matching_status).toBe('PARTIAL_MATCH');
    expect(json.data.unfulfilled_quantity).toBe(35);
  });
});
