// ============================================================================
// Exchange state machine tests (Member 4) — pure, no I/O.
// Covers plan tests T9–T12 plus invariants.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import type { MaterialListing, MaterialRequirement } from '@/lib/types';
import {
  WorkflowState,
  acceptExchangeItem,
  cancelExchange,
  completeExchange,
  createExchangeRequest,
  deriveStage,
  rejectExchangeItem,
} from '../workflow';
import { ExchangeError } from '../types';

const SUP_A = 'a0000000-0000-4000-a000-00000000000a';
const SUP_B = 'a0000000-0000-4000-a000-00000000000b';
const BUYER_1 = 'b0000000-0000-4000-b000-000000000001';
const BUYER_2 = 'b0000000-0000-4000-b000-000000000002';

function listing(id: string, org: string, total: number, price: number, reserved = 0): MaterialListing {
  return {
    id,
    organization_id: org,
    material_family: 'STAINLESS_STEEL_SHEET',
    material_specification: 'SS304',
    length_mm: 1000,
    width_mm: 500,
    thickness_mm: 2,
    total_quantity: total,
    reserved_quantity: reserved,
    available_quantity: total - reserved,
    quantity_unit: 'PIECE',
    condition: 'UNUSED',
    unit_price_bdt: price,
    city: 'Gazipur',
    status: 'ACTIVE',
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-01T00:00:00.000Z',
  };
}

function requirement(id: string, org: string, qty: number): MaterialRequirement {
  return {
    id,
    organization_id: org,
    material_family: 'STAINLESS_STEEL_SHEET',
    material_specification: 'SS304',
    length_mm: 1000,
    width_mm: 500,
    thickness_mm: 2,
    required_quantity: qty,
    quantity_unit: 'PIECE',
    maximum_budget_bdt: null,
    allow_split_suppliers: true,
    condition_requirement: 'ANY',
    status: 'OPEN',
    created_at: '2026-11-01T00:00:00.000Z',
  };
}

let state: WorkflowState;
let seq = 0;
const env = {
  newId: () => `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
  now: () => `2026-11-24T00:00:${String(seq % 60).padStart(2, '0')}.000Z`,
};

const L_A = 'c0000000-0000-4000-c000-00000000000a';
const L_B = 'c0000000-0000-4000-c000-00000000000b';
const R_1 = 'd0000000-0000-4000-d000-000000000001';
const R_2 = 'd0000000-0000-4000-d000-000000000002';

const listingById = (id: string) => state.listings.find((l) => l.id === id)!;
const itemsOf = (exId: string) => state.items.filter((i) => i.exchange_id === exId);
const itemFor = (exId: string, listingId: string) => itemsOf(exId).find((i) => i.listing_id === listingId)!;

function expectCode(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ExchangeError);
    expect((e as ExchangeError).code).toBe(code);
    return;
  }
  throw new Error(`expected ExchangeError ${code}`);
}

/** Snapshot of everything that must be unchanged after a failed operation. */
const snapshot = () => JSON.stringify(state);

beforeEach(() => {
  seq = 0;
  state = {
    listings: [listing(L_A, SUP_A, 40, 450), listing(L_B, SUP_B, 35, 470)],
    requirements: [requirement(R_1, BUYER_1, 60), requirement(R_2, BUYER_2, 30)],
    exchanges: [],
    items: [],
    logs: [],
  };
});

function requestSixty() {
  return createExchangeRequest(
    state,
    {
      requirement_id: R_1,
      buyer_organization_id: BUYER_1,
      items: [
        { listing_id: L_A, quantity: 40 },
        { listing_id: L_B, quantity: 20 },
      ],
    },
    env
  );
}

describe('create exchange request', () => {
  it('creates a PROPOSED exchange with PENDING items and does not reserve stock', () => {
    const ex = requestSixty();
    expect(ex.status).toBe('PROPOSED');
    expect(itemsOf(ex.id).map((i) => [i.supplier_organization_id, i.quantity, i.status, i.unit_price_bdt])).toEqual([
      [SUP_A, 40, 'PENDING', 450],
      [SUP_B, 20, 'PENDING', 470],
    ]);
    expect(listingById(L_A).reserved_quantity).toBe(0);
    expect(listingById(L_B).reserved_quantity).toBe(0);
    expect(state.logs.map((l) => l.action)).toEqual(['EXCHANGE_REQUESTED']);
  });

  it('rejects a second active exchange for the same requirement', () => {
    requestSixty();
    expectCode(requestSixty, 'DUPLICATE_EXCHANGE');
  });

  it('only the requirement owner can request', () => {
    expectCode(
      () =>
        createExchangeRequest(state, {
          requirement_id: R_1,
          buyer_organization_id: BUYER_2,
          items: [{ listing_id: L_A, quantity: 1 }],
        }),
      'FORBIDDEN_ORGANIZATION'
    );
  });

  it('refuses incompatible material, non-positive quantity, and empty allocations without side effects', () => {
    state.listings.push({ ...listing('c0000000-0000-4000-c000-0000000000cc', SUP_A, 10, 300), material_specification: 'SS201' });
    const before = snapshot();
    expectCode(
      () =>
        createExchangeRequest(state, {
          requirement_id: R_1,
          buyer_organization_id: BUYER_1,
          items: [
            { listing_id: L_A, quantity: 10 },
            { listing_id: 'c0000000-0000-4000-c000-0000000000cc', quantity: 5 },
          ],
        }),
      'VALIDATION_ERROR'
    );
    expectCode(
      () => createExchangeRequest(state, { requirement_id: R_1, buyer_organization_id: BUYER_1, items: [{ listing_id: L_A, quantity: 0 }] }),
      'VALIDATION_ERROR'
    );
    expectCode(
      () => createExchangeRequest(state, { requirement_id: R_1, buyer_organization_id: BUYER_1, items: [] }),
      'NO_ALLOCATION'
    );
    expect(snapshot()).toBe(before);
  });

  it('refuses a requirement that is not OPEN', () => {
    state.requirements[0].status = 'CANCELLED';
    expectCode(requestSixty, 'REQUIREMENT_NOT_OPEN');
  });
});

describe('supplier acceptance & reservation', () => {
  it('reserves stock on accept and moves to IN_PROGRESS once every supplier accepts', () => {
    const ex = requestSixty();
    acceptExchangeItem(state, ex.id, itemFor(ex.id, L_A).id, SUP_A, env);
    expect(listingById(L_A).reserved_quantity).toBe(40);
    expect(listingById(L_A).available_quantity).toBe(0);
    expect(ex.status).toBe('PROPOSED');
    expect(deriveStage(ex, itemsOf(ex.id))).toBe('AWAITING_SUPPLIERS');

    acceptExchangeItem(state, ex.id, itemFor(ex.id, L_B).id, SUP_B, env);
    expect(listingById(L_B).reserved_quantity).toBe(20);
    expect(listingById(L_B).available_quantity).toBe(15);
    expect(ex.status).toBe('IN_PROGRESS');
    expect(deriveStage(ex, itemsOf(ex.id))).toBe('RESERVED');
    expect(state.logs.map((l) => l.action)).toEqual([
      'EXCHANGE_REQUESTED',
      'ITEM_ACCEPTED',
      'ITEM_ACCEPTED',
      'EXCHANGE_RESERVED',
    ]);
  });

  it('only the item supplier can accept or reject it', () => {
    const ex = requestSixty();
    expectCode(() => acceptExchangeItem(state, ex.id, itemFor(ex.id, L_A).id, SUP_B), 'FORBIDDEN_ORGANIZATION');
    expectCode(() => acceptExchangeItem(state, ex.id, itemFor(ex.id, L_A).id, BUYER_1), 'FORBIDDEN_ORGANIZATION');
    expectCode(() => rejectExchangeItem(state, ex.id, itemFor(ex.id, L_A).id, SUP_B), 'FORBIDDEN_ORGANIZATION');
  });

  it('cannot accept the same item twice (no double reservation)', () => {
    const ex = requestSixty();
    const item = itemFor(ex.id, L_A);
    acceptExchangeItem(state, ex.id, item.id, SUP_A, env);
    expectCode(() => acceptExchangeItem(state, ex.id, item.id, SUP_A), 'INVALID_STATE');
    expect(listingById(L_A).reserved_quantity).toBe(40);
  });

  it('item ids are scoped to their exchange', () => {
    const ex = requestSixty();
    expectCode(() => acceptExchangeItem(state, ex.id, 'not-an-item', SUP_A), 'NOT_FOUND');
  });

  it('T9: two buyers competing for the same stock never over-allocate it', () => {
    const ex1 = requestSixty(); // wants 40 of L_A
    const ex2 = createExchangeRequest(
      state,
      { requirement_id: R_2, buyer_organization_id: BUYER_2, items: [{ listing_id: L_A, quantity: 30 }] },
      env
    );

    acceptExchangeItem(state, ex2.id, itemFor(ex2.id, L_A).id, SUP_A, env); // 30 reserved, 10 left
    const before = snapshot();
    expectCode(() => acceptExchangeItem(state, ex1.id, itemFor(ex1.id, L_A).id, SUP_A, env), 'INSUFFICIENT_STOCK');
    expect(snapshot()).toBe(before); // failed accept changes nothing

    const l = listingById(L_A);
    expect(l.reserved_quantity).toBe(30);
    expect(l.reserved_quantity).toBeLessThanOrEqual(l.total_quantity);
    expect(itemFor(ex1.id, L_A).status).toBe('PENDING');
  });

  it('refuses to reserve from a listing that is no longer ACTIVE', () => {
    const ex = requestSixty();
    listingById(L_A).status = 'ARCHIVED';
    expectCode(() => acceptExchangeItem(state, ex.id, itemFor(ex.id, L_A).id, SUP_A), 'LISTING_UNAVAILABLE');
  });
});

describe('rejection & cancellation', () => {
  it('T10: a supplier declines — nothing is reserved for it, exchange cannot complete, cancel releases the rest', () => {
    const ex = requestSixty();
    acceptExchangeItem(state, ex.id, itemFor(ex.id, L_A).id, SUP_A, env);
    rejectExchangeItem(state, ex.id, itemFor(ex.id, L_B).id, SUP_B, env);

    expect(itemFor(ex.id, L_B).status).toBe('REJECTED');
    expect(listingById(L_B).reserved_quantity).toBe(0);
    expect(ex.status).toBe('PROPOSED');
    expect(deriveStage(ex, itemsOf(ex.id))).toBe('SUPPLIER_DECLINED');
    expectCode(() => completeExchange(state, ex.id, BUYER_1), 'INVALID_STATE');

    cancelExchange(state, ex.id, BUYER_1, env);
    expect(listingById(L_A).reserved_quantity).toBe(0);
    expect(itemFor(ex.id, L_A).status).toBe('CANCELLED');
    expect(itemFor(ex.id, L_B).status).toBe('REJECTED');
  });

  it('T11: cancelling a fully reserved exchange releases all reserved stock without reducing totals', () => {
    const ex = requestSixty();
    acceptExchangeItem(state, ex.id, itemFor(ex.id, L_A).id, SUP_A, env);
    acceptExchangeItem(state, ex.id, itemFor(ex.id, L_B).id, SUP_B, env);
    cancelExchange(state, ex.id, BUYER_1, env);

    expect(ex.status).toBe('CANCELLED');
    expect([listingById(L_A).total_quantity, listingById(L_A).reserved_quantity]).toEqual([40, 0]);
    expect([listingById(L_B).total_quantity, listingById(L_B).reserved_quantity]).toEqual([35, 0]);
    expect(state.logs.at(-1)!.details).toMatchObject({ released_quantity: 60 });

    // Can't cancel twice, and a new exchange may now be requested.
    expectCode(() => cancelExchange(state, ex.id, BUYER_1), 'INVALID_STATE');
    expect(() => requestSixty()).not.toThrow();
  });

  it('only the buyer can cancel or complete', () => {
    const ex = requestSixty();
    expectCode(() => cancelExchange(state, ex.id, SUP_A), 'FORBIDDEN_ORGANIZATION');
    expectCode(() => completeExchange(state, ex.id, SUP_A), 'FORBIDDEN_ORGANIZATION');
  });

  it('pending items cannot be accepted after the exchange is cancelled', () => {
    const ex = requestSixty();
    cancelExchange(state, ex.id, BUYER_1, env);
    expectCode(() => acceptExchangeItem(state, ex.id, itemFor(ex.id, L_A).id, SUP_A), 'INVALID_STATE');
    expect(listingById(L_A).reserved_quantity).toBe(0);
  });
});

describe('completion', () => {
  it('T12: completing deducts inventory exactly once and fulfils the requirement', () => {
    const ex = requestSixty();
    acceptExchangeItem(state, ex.id, itemFor(ex.id, L_A).id, SUP_A, env);
    acceptExchangeItem(state, ex.id, itemFor(ex.id, L_B).id, SUP_B, env);

    expectCode(() => completeExchange(state, 'missing', BUYER_1), 'NOT_FOUND');
    completeExchange(state, ex.id, BUYER_1, env);

    expect(ex.status).toBe('COMPLETED');
    expect(itemsOf(ex.id).every((i) => i.status === 'COMPLETED')).toBe(true);
    expect(listingById(L_A)).toMatchObject({ total_quantity: 0, reserved_quantity: 0, available_quantity: 0, status: 'COMPLETED' });
    expect(listingById(L_B)).toMatchObject({ total_quantity: 15, reserved_quantity: 0, available_quantity: 15, status: 'ACTIVE' });
    expect(state.requirements[0].status).toBe('FULFILLED');
    expect(state.logs.at(-1)).toMatchObject({
      action: 'EXCHANGE_COMPLETED',
      details: { total_quantity: 60, total_value_bdt: 40 * 450 + 20 * 470 },
    });

    // Second completion attempt is refused and changes nothing.
    const before = snapshot();
    expectCode(() => completeExchange(state, ex.id, BUYER_1), 'INVALID_STATE');
    expectCode(() => cancelExchange(state, ex.id, BUYER_1), 'INVALID_STATE');
    expect(snapshot()).toBe(before);
  });

  it('cannot complete before every supplier has accepted', () => {
    const ex = requestSixty();
    acceptExchangeItem(state, ex.id, itemFor(ex.id, L_A).id, SUP_A, env);
    expectCode(() => completeExchange(state, ex.id, BUYER_1), 'INVALID_STATE');
    expect(listingById(L_A).total_quantity).toBe(40);
  });

  it('a partial completion leaves the requirement OPEN', () => {
    const ex = createExchangeRequest(
      state,
      { requirement_id: R_1, buyer_organization_id: BUYER_1, items: [{ listing_id: L_B, quantity: 35 }] },
      env
    );
    acceptExchangeItem(state, ex.id, itemFor(ex.id, L_B).id, SUP_B, env);
    completeExchange(state, ex.id, BUYER_1, env);
    expect(state.requirements[0].status).toBe('OPEN');
  });

  it('uses the price captured at request time even if the listing price changes later', () => {
    const ex = requestSixty();
    listingById(L_A).unit_price_bdt = 9999;
    expect(itemFor(ex.id, L_A).unit_price_bdt).toBe(450);
  });
});
