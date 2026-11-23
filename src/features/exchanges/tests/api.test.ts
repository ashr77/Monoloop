// ============================================================================
// Exchange & impact API tests (Member 4) — full demo flow through the real
// route handlers, using the shared in-memory stores of Members 1–3.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as listExchanges, POST as createExchange } from '@/app/api/exchanges/route';
import { GET as getExchange } from '@/app/api/exchanges/[id]/route';
import { POST as acceptItem } from '@/app/api/exchanges/[id]/accept/route';
import { POST as rejectItem } from '@/app/api/exchanges/[id]/reject/route';
import { POST as completeEx } from '@/app/api/exchanges/[id]/complete/route';
import { POST as cancelEx } from '@/app/api/exchanges/[id]/cancel/route';
import { GET as getImpact } from '@/app/api/impact/route';
import { GET as getMatches } from '@/app/api/matches/[requirementId]/route';
import { GET as getListing } from '@/app/api/listings/[id]/route';
import { listingRepository } from '@/lib/supabase/repository';
import { requirementRepository } from '@/features/demand/services/requirementRepository';
import { exchangeRepository } from '../services/exchangeRepository';
import { toExchangeError } from '../services/exchangeRepository';

// Seed scenario: Apex (buyer) needs 80 × SS304 2400×1200×2.
// Matching proposes Gazipur 50 (c111…) + Dhaka 30 (c222…).
const REQ = 'd1111111-1111-4111-d111-111111111111';
const APEX = 'b1111111-1111-4111-b111-111111111111';
const DELTA = 'b2222222-2222-4222-b222-222222222222';
const GAZIPUR = 'a1111111-1111-4111-a111-111111111111';
const DHAKA = 'a2222222-2222-4222-a222-222222222222';
const L_GAZIPUR = 'c1111111-1111-4111-c111-111111111111';
const L_DHAKA = 'c2222222-2222-4222-c222-222222222222';

const BASE = 'http://localhost:3000';

function post(url: string, body: unknown, actor?: string) {
  return new NextRequest(`${BASE}${url}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: actor ? { 'x-organization-id': actor } : {},
  });
}

async function json(res: Response) {
  return { status: res.status, body: await res.json() };
}

async function request() {
  return json(await createExchange(post('/api/exchanges', { requirement_id: REQ, buyer_organization_id: APEX }, APEX)));
}

const action = (fn: typeof acceptItem, id: string, actor: string | undefined, body: unknown = {}) =>
  fn(post(`/api/exchanges/${id}/x`, body, actor), { params: { id } }).then(json);

const itemOf = (ex: { items: { id: string; listing_id: string }[] }, listingId: string) =>
  ex.items.find((i) => i.listing_id === listingId)!;

async function listing(id: string) {
  return (await json(await getListing(new NextRequest(`${BASE}/api/listings/${id}`), { params: { id } }))).body.data;
}

beforeEach(() => {
  listingRepository.setMockMode(true);
  listingRepository._resetStore();
  requirementRepository.setMockMode(true);
  requirementRepository._resetStore();
  exchangeRepository._resetStore();
});

describe('POST /api/exchanges', () => {
  it('creates an exchange from the live match proposal', async () => {
    const { status, body } = await request();
    expect(status).toBe(201);
    expect(body.data.status).toBe('PROPOSED');
    expect(body.data.stage).toBe('AWAITING_SUPPLIERS');
    expect(body.meta.matching_status).toBe('MULTI_SUPPLIER_MATCH');
    expect(
      body.data.items.map((i: { listing_id: string; quantity: number; status: string }) => [i.listing_id, i.quantity, i.status])
    ).toEqual([
      [L_GAZIPUR, 50, 'PENDING'],
      [L_DHAKA, 30, 'PENDING'],
    ]);
    expect(body.data.total_quantity).toBe(80);
    expect(body.data.total_value_bdt).toBe(50 * 4200 + 30 * 4350);
    expect(body.data.buyer.name).toContain('Apex');
    expect(body.data.items[0].supplier.name).toBe('Gazipur Metal Works Ltd.');
  });

  it('validates input, ownership and duplicates', async () => {
    expect((await json(await createExchange(post('/api/exchanges', { requirement_id: 'nope' })))).status).toBe(400);
    expect(
      (await json(await createExchange(post('/api/exchanges', { requirement_id: REQ, buyer_organization_id: DELTA }, DELTA)))).body.error.code
    ).toBe('FORBIDDEN_ORGANIZATION');
    expect(
      (await json(await createExchange(post('/api/exchanges', { requirement_id: REQ, buyer_organization_id: APEX }, DELTA)))).status
    ).toBe(403);
    expect(
      (await json(await createExchange(post('/api/exchanges', { requirement_id: 'd9999999-9999-4999-d999-999999999999', buyer_organization_id: APEX })))).status
    ).toBe(404);

    expect((await request()).status).toBe(201);
    const dup = await request();
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_EXCHANGE');
  });

  it('returns 422 when matching finds nothing to allocate', async () => {
    // d222…: SS201 2000×1000×1.5 — no compatible stock in the seed.
    const res = await json(
      await createExchange(post('/api/exchanges', { requirement_id: 'd2222222-2222-4222-d222-222222222222', buyer_organization_id: APEX }))
    );
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('NO_ALLOCATION');
  });

  it('rejects malformed JSON with 400', async () => {
    const req = new NextRequest(`${BASE}/api/exchanges`, { method: 'POST', body: '{oops' });
    expect((await createExchange(req)).status).toBe(400);
  });
});

describe('full exchange flow: request → accept → reserve → complete', () => {
  it('updates inventory, requirement, matching and impact exactly once', async () => {
    const created = (await request()).body.data;
    const id = created.id;
    const gazipurItem = itemOf(created, L_GAZIPUR);
    const dhakaItem = itemOf(created, L_DHAKA);

    // Actor checks
    expect((await action(acceptItem, id, undefined, { exchange_item_id: gazipurItem.id })).status).toBe(400);
    expect((await action(acceptItem, id, DHAKA, { exchange_item_id: gazipurItem.id })).status).toBe(403);
    expect((await action(acceptItem, id, GAZIPUR, {})).status).toBe(400);

    // Supplier 1 accepts → reserved
    let res = await action(acceptItem, id, GAZIPUR, { exchange_item_id: gazipurItem.id });
    expect(res.status).toBe(200);
    expect(res.body.data.stage).toBe('AWAITING_SUPPLIERS');
    expect((await listing(L_GAZIPUR)).reserved_quantity).toBe(50);

    // Buyer cannot complete yet
    expect((await action(completeEx, id, APEX)).status).toBe(409);

    // Supplier 2 accepts → RESERVED
    res = await action(acceptItem, id, DHAKA, { exchange_item_id: dhakaItem.id });
    expect(res.body.data.status).toBe('IN_PROGRESS');
    expect(res.body.data.stage).toBe('RESERVED');

    // Reserved stock is not proposed by matching while the requirement is open
    const impactBefore = (await json(await getImpact(new NextRequest(`${BASE}/api/impact`)))).body.data;
    expect(impactBefore.recovered.transferred_units).toBe(0);
    expect(impactBefore.pipeline.reserved_units).toBe(80);
    expect(impactBefore.pipeline.reserved_exchanges).toBe(1);

    // Only the buyer can complete
    expect((await action(completeEx, id, GAZIPUR)).status).toBe(403);
    res = await action(completeEx, id, APEX);
    expect(res.status).toBe(200);
    expect(res.body.data.stage).toBe('COMPLETED');
    expect(res.body.data.activity.map((a: { action: string }) => a.action)).toEqual([
      'EXCHANGE_REQUESTED',
      'ITEM_ACCEPTED',
      'ITEM_ACCEPTED',
      'EXCHANGE_RESERVED',
      'EXCHANGE_COMPLETED',
    ]);

    // Inventory: 50 → 0 (listing completed), 40 → 10
    expect(await listing(L_GAZIPUR)).toMatchObject({ total_quantity: 0, reserved_quantity: 0, status: 'COMPLETED' });
    expect(await listing(L_DHAKA)).toMatchObject({ total_quantity: 10, reserved_quantity: 0, available_quantity: 10 });

    // Requirement fulfilled → matching now refuses it
    const match = await getMatches(new NextRequest(`${BASE}/api/matches/${REQ}`), { params: { requirementId: REQ } });
    expect(match.status).toBe(409);

    // Completing twice is refused; inventory unchanged
    expect((await action(completeEx, id, APEX)).status).toBe(409);
    expect((await listing(L_DHAKA)).total_quantity).toBe(10);

    // Impact counts the transfer once
    const impact = (await json(await getImpact(new NextRequest(`${BASE}/api/impact`)))).body.data;
    expect(impact.recovered).toMatchObject({
      completed_exchanges: 1,
      transferred_units: 80,
      transferred_value_bdt: 50 * 4200 + 30 * 4350,
      fulfilled_requirements: 1,
      multi_supplier_exchanges: 1,
    });
    expect(impact.pipeline.reserved_units).toBe(0);
    // 2.4 × 1.2 × 0.002 m³ × 7930 kg/m³ ≈ 45.67 kg per sheet
    expect(impact.recovered.estimated_mass_kg).toBeCloseTo(80 * 2.4 * 1.2 * 0.002 * 7930, 3);
    expect(impact.top_suppliers.map((s: { name: string; units: number }) => [s.name, s.units])).toEqual([
      ['Gazipur Metal Works Ltd.', 50],
      ['Dhaka Precision Steel Fabrications', 30],
    ]);

    // Organization-scoped impact: Dhaka supplier only sees its own 30 sheets
    const dhakaImpact = (await json(await getImpact(new NextRequest(`${BASE}/api/impact?organization_id=${DHAKA}`)))).body.data;
    expect(dhakaImpact.recovered.transferred_units).toBe(30);
  });
});

describe('rejection and cancellation', () => {
  it('a declined item blocks completion; cancelling releases reserved stock and allows a new request', async () => {
    const created = (await request()).body.data;
    const id = created.id;
    await action(acceptItem, id, GAZIPUR, { exchange_item_id: itemOf(created, L_GAZIPUR).id });
    const rejected = await action(rejectItem, id, DHAKA, { exchange_item_id: itemOf(created, L_DHAKA).id });
    expect(rejected.body.data.stage).toBe('SUPPLIER_DECLINED');
    expect((await action(completeEx, id, APEX)).status).toBe(409);

    expect((await action(cancelEx, id, GAZIPUR)).status).toBe(403);
    const cancelled = await action(cancelEx, id, APEX);
    expect(cancelled.body.data.stage).toBe('CANCELLED');
    expect((await listing(L_GAZIPUR)).reserved_quantity).toBe(0);

    expect((await request()).status).toBe(201);
  });
});

describe('GET /api/exchanges', () => {
  it('filters by participating organization and status', async () => {
    await request();
    const all = (await json(await listExchanges(new NextRequest(`${BASE}/api/exchanges`)))).body;
    expect(all.meta.total).toBe(1);

    const asSupplier = (await json(await listExchanges(new NextRequest(`${BASE}/api/exchanges?organization_id=${DHAKA}`)))).body;
    expect(asSupplier.data).toHaveLength(1);
    const unrelated = (await json(await listExchanges(new NextRequest(`${BASE}/api/exchanges?organization_id=${DELTA}`)))).body;
    expect(unrelated.data).toHaveLength(0);

    const completed = (await json(await listExchanges(new NextRequest(`${BASE}/api/exchanges?status=COMPLETED`)))).body;
    expect(completed.data).toHaveLength(0);
    expect((await listExchanges(new NextRequest(`${BASE}/api/exchanges?status=WHATEVER`))).status).toBe(400);
  });

  it('GET /api/exchanges/[id] returns 404 for unknown ids', async () => {
    const res = await getExchange(new NextRequest(`${BASE}/api/exchanges/x`), { params: { id: 'x' } });
    expect(res.status).toBe(404);
  });
});

describe('database error mapping', () => {
  it('maps PL/pgSQL MONOLOOP errors and constraint violations to typed codes', () => {
    expect(toExchangeError({ message: 'MONOLOOP:INSUFFICIENT_STOCK:Only 3 piece(s) are still available' })).toMatchObject({
      code: 'INSUFFICIENT_STOCK',
      status: 409,
      message: 'Only 3 piece(s) are still available',
    });
    expect(toExchangeError({ message: 'duplicate key', code: '23505' }).code).toBe('DUPLICATE_EXCHANGE');
    expect(toExchangeError({ message: 'boom' }).code).toBe('INTERNAL_ERROR');
  });
});
