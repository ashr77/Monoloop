// ============================================================================
// Allocation optimality tests (Member 3)
// Compares the subset-enumeration allocator against an independent brute force
// over every integer allocation on many random small instances.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { allocate, type AllocationCandidate } from '@/features/matching/allocation';
import { estimateDistanceKm, estimateTransportBdt, SAME_CITY_KM, UNKNOWN_DISTANCE_KM } from '@/features/matching/costs';

/** Deterministic PRNG (mulberry32) so failures are reproducible. */
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Brute force: try every integer x_i in [0, available_i]; maximise quantity, then minimise cost. */
function bruteForce(qty: number, cands: AllocationCandidate[], transport: Record<string, number>, allowSplit: boolean) {
  let bestQty = 0;
  let bestCost = 0;
  const xs = new Array(cands.length).fill(0);
  const visit = (i: number) => {
    if (i === cands.length) {
      const q = xs.reduce((s, x) => s + x, 0);
      if (q > qty) return;
      const used = new Set(cands.filter((_, k) => xs[k] > 0).map((c) => c.supplier_id));
      if (!allowSplit && used.size > 1) return;
      const cost =
        cands.reduce((s, c, k) => s + xs[k] * c.unit_price_bdt, 0) +
        Array.from(used).reduce((s, id) => s + transport[id], 0);
      if (q > bestQty || (q === bestQty && cost < bestCost)) {
        bestQty = q;
        bestCost = cost;
      }
      return;
    }
    for (let x = 0; x <= cands[i].available_quantity; x++) {
      xs[i] = x;
      visit(i + 1);
    }
    xs[i] = 0;
  };
  visit(0);
  return { qty: bestQty, cost: bestCost };
}

describe('allocate() optimality', () => {
  it('matches brute force on 300 random small instances', () => {
    const rand = rng(20261124);
    for (let t = 0; t < 300; t++) {
      const supplierCount = 1 + Math.floor(rand() * 3);
      const listingCount = 1 + Math.floor(rand() * 4);
      const transport: Record<string, number> = {};
      for (let s = 0; s < supplierCount; s++) transport[`s${s}`] = Math.floor(rand() * 40);
      const cands: AllocationCandidate[] = Array.from({ length: listingCount }, (_, i) => ({
        listing_id: `l${i}`,
        supplier_id: `s${Math.floor(rand() * supplierCount)}`,
        unit_price_bdt: 1 + Math.floor(rand() * 20),
        available_quantity: Math.floor(rand() * 5),
      }));
      const qty = 1 + Math.floor(rand() * 8);
      const allowSplit = rand() < 0.7;

      const plan = allocate({ requiredQuantity: qty, allowSplitSuppliers: allowSplit, candidates: cands, transportBySupplier: transport });
      const expected = bruteForce(qty, cands, transport, allowSplit);

      const ctx = JSON.stringify({ t, qty, allowSplit, cands, transport });
      expect(plan.allocatedQuantity, ctx).toBe(expected.qty);
      expect(plan.totalCostBdt, ctx).toBe(expected.cost);
      // Feasibility: never exceed availability or the requested quantity.
      for (const line of plan.lines) {
        const c = cands.find((x) => x.listing_id === line.listing_id)!;
        expect(line.quantity).toBeLessThanOrEqual(c.available_quantity);
        expect(line.quantity).toBeGreaterThan(0);
      }
      expect(plan.allocatedQuantity).toBeLessThanOrEqual(qty);
      if (!allowSplit) expect(plan.supplierIds.length).toBeLessThanOrEqual(1);
    }
  });

  it('returns an empty plan when nothing is usable', () => {
    const plan = allocate({ requiredQuantity: 10, allowSplitSuppliers: true, candidates: [], transportBySupplier: {} });
    expect(plan.method).toBe('NONE');
    expect(plan.allocatedQuantity).toBe(0);
  });

  it('falls back to greedy above the exhaustive supplier limit', () => {
    const cands = Array.from({ length: 14 }, (_, i) => ({
      listing_id: `l${String(i).padStart(2, '0')}`,
      supplier_id: `s${String(i).padStart(2, '0')}`,
      unit_price_bdt: 100 + i,
      available_quantity: 5,
    }));
    const transport = Object.fromEntries(cands.map((c) => [c.supplier_id, 10]));
    const plan = allocate({ requiredQuantity: 12, allowSplitSuppliers: true, candidates: cands, transportBySupplier: transport });
    expect(plan.method).toBe('GREEDY');
    expect(plan.allocatedQuantity).toBe(12);
    expect(plan.lines.map((l) => l.quantity)).toEqual([5, 5, 2]);
  });
});

describe('cost model', () => {
  it('distances are symmetric and case-insensitive', () => {
    expect(estimateDistanceKm('Dhaka', 'Chattogram')).toEqual(estimateDistanceKm('chattogram', 'DHAKA'));
    expect(estimateDistanceKm('Dhaka', 'Gazipur').km).toBe(35);
  });

  it('handles same-city and unknown cities explicitly', () => {
    expect(estimateDistanceKm('Khulna', 'Khulna')).toEqual({ km: SAME_CITY_KM, known: true });
    expect(estimateDistanceKm('Dhaka', 'Sylhet')).toEqual({ km: UNKNOWN_DISTANCE_KM, known: false });
    expect(estimateDistanceKm(null, 'Dhaka').known).toBe(false);
  });

  it('transport grows with distance', () => {
    expect(estimateTransportBdt(250)).toBeGreaterThan(estimateTransportBdt(10));
  });
});
