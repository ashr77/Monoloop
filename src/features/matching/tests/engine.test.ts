// ============================================================================
// Matching engine tests (Member 3) — execution plan tests T4–T8 + edge cases
// ============================================================================

import { describe, it, expect } from 'vitest';
import { runMatching } from '@/features/matching/engine';
import { estimateTransportBdt } from '@/features/matching/costs';
import { SEED_LISTINGS, SEED_ORGANIZATIONS, SEED_REQUIREMENTS } from '@/data/seed';
import { BUYER, NOW, SUP_A, SUP_B, SUP_C, listing, requirement } from './helpers';
import type { MatchResult } from '@/features/matching/types';

const match = (req = requirement(), listings = [listing()]) =>
  runMatching({ requirement: req, listings, buyerOrganization: BUYER, now: NOW });

const evalFor = (r: MatchResult, id: string) => r.evaluations.find((e) => e.listing_id === id)!;
const failedRules = (r: MatchResult, id: string) => evalFor(r, id).checks.filter((c) => !c.passed).map((c) => c.rule);

// Transport estimates for the helper suppliers delivering to Dhaka.
const T_GAZIPUR = estimateTransportBdt(35);
const T_DHAKA = estimateTransportBdt(10);

describe('Stage 1: mandatory compatibility rules', () => {
  it('T4: rejects a different grade (SS201 offered for SS304) with an explanation', () => {
    const l = listing({ material_specification: 'SS201' });
    const r = match(requirement(), [l]);
    expect(evalFor(r, l.id).compatible).toBe(false);
    expect(failedRules(r, l.id)).toEqual(['SPECIFICATION']);
    expect(evalFor(r, l.id).reason).toBe('Grade SS201 does not satisfy required SS304.');
    expect(r.matching_status).toBe('NO_MATCH');
    expect(r.rejection_reasons?.join(' ')).toContain('SS201');
  });

  it('T5: rejects the wrong thickness', () => {
    const l = listing({ thickness_mm: 1.5 });
    const r = match(requirement(), [l]);
    expect(failedRules(r, l.id)).toEqual(['THICKNESS']);
    expect(evalFor(r, l.id).reason).toContain('1.5 mm does not match required 2 mm');
  });

  it('rejects a different size and never cuts sheets down', () => {
    const l = listing({ length_mm: 3000, width_mm: 1500 });
    const r = match(requirement(), [l]);
    expect(failedRules(r, l.id)).toEqual(['DIMENSIONS']);
    expect(evalFor(r, l.id).reason).toContain('sheets are not cut down');
  });

  it('accepts the same sheet in rotated orientation and says so', () => {
    const l = listing({ length_mm: 1200, width_mm: 2400 });
    const r = match(requirement({ required_quantity: 10 }), [l]);
    expect(evalFor(r, l.id).compatible).toBe(true);
    expect(evalFor(r, l.id).rotated).toBe(true);
    expect(evalFor(r, l.id).checks.find((c) => c.rule === 'DIMENSIONS')!.message).toContain('rotated');
  });

  it('tolerates floating point noise in dimensions only', () => {
    const l = listing({ thickness_mm: 1.9999999 });
    expect(evalFor(match(requirement({ required_quantity: 1 }), [l]), l.id).compatible).toBe(true);
  });

  it('rejects unknown or missing specifications instead of assuming compatibility', () => {
    const unknown = listing({ material_specification: 'SS999' as never });
    const missingThickness = listing({ thickness_mm: 0 });
    const r = match(requirement(), [unknown, missingThickness]);
    expect(evalFor(r, unknown.id).reason).toContain('not a recognised standard');
    expect(evalFor(r, missingThickness.id).reason).toContain('missing or invalid');
    expect(r.matching_status).toBe('NO_MATCH');
  });

  it('does not claim "within budget" when nothing compatible could be priced', () => {
    const r = match(requirement({ maximum_budget_bdt: 100_000 }), [listing({ material_specification: 'SS201' })]);
    expect(r.budget.status).toBe('NOT_APPLICABLE');
    expect(r.compatibility_explanations.join(' ')).not.toContain('within');
  });

  it('rejects a different material family', () => {
    const l = listing({ material_family: 'PLYWOOD_PANEL', material_specification: 'PLYWOOD_STANDARD' });
    expect(failedRules(match(requirement(), [l]), l.id)).toContain('MATERIAL_FAMILY');
  });

  it('applies the condition requirement (ANY vs specific)', () => {
    const leftover = listing({ condition: 'LEFTOVER' });
    expect(evalFor(match(requirement({ condition_requirement: 'ANY' }), [leftover]), leftover.id).compatible).toBe(true);
    const r = match(requirement({ condition_requirement: 'UNUSED' }), [leftover]);
    expect(failedRules(r, leftover.id)).toEqual(['CONDITION']);
  });

  it('excludes inactive listings and the buyer\'s own listings', () => {
    const archived = listing({ status: 'ARCHIVED' });
    const own = listing({ organization_id: BUYER.id, organization: BUYER, city: 'Dhaka' });
    const r = match(requirement(), [archived, own]);
    expect(failedRules(r, archived.id)).toEqual(['LISTING_ACTIVE']);
    expect(failedRules(r, own.id)).toEqual(['NOT_OWN_LISTING']);
  });

  it('reports every failed rule, not just the first', () => {
    const l = listing({ material_specification: 'SS201', thickness_mm: 3, condition: 'OFFCUT' });
    const r = match(requirement({ condition_requirement: 'UNUSED' }), [l]);
    expect(failedRules(r, l.id)).toEqual(['SPECIFICATION', 'THICKNESS', 'CONDITION']);
  });
});

describe('Stage 2: allocation', () => {
  it('T6: Supplier A has 40, B has 35, buyer needs 60 → allocates 40 + 20', () => {
    const a = listing({ supplier: SUP_A, total_quantity: 40, unit_price_bdt: 4000 });
    const b = listing({ supplier: SUP_B, total_quantity: 35, unit_price_bdt: 4200 });
    const r = match(requirement({ required_quantity: 60 }), [a, b]);

    expect(r.matching_status).toBe('MULTI_SUPPLIER_MATCH');
    expect(r.allocated_quantities).toEqual({ [a.id]: 40, [b.id]: 20 });
    expect(r.unfulfilled_quantity).toBe(0);
    expect(r.estimated_material_costs_bdt).toBe(40 * 4000 + 20 * 4200);
    expect(r.estimated_transportation_costs_bdt).toBe(T_GAZIPUR + T_DHAKA);
    expect(r.total_estimated_cost_bdt).toBe(40 * 4000 + 20 * 4200 + T_GAZIPUR + T_DHAKA);
    expect(r.allocation_method).toBe('EXHAUSTIVE_OPTIMAL');
  });

  it('T7: compatible inventory totals 45 → reports 15 unfulfilled', () => {
    const a = listing({ supplier: SUP_A, total_quantity: 30 });
    const b = listing({ supplier: SUP_B, total_quantity: 15 });
    const r = match(requirement({ required_quantity: 60 }), [a, b]);
    expect(r.matching_status).toBe('PARTIAL_MATCH');
    expect(r.allocated_quantity).toBe(45);
    expect(r.unfulfilled_quantity).toBe(15);
  });

  it('T8: all candidates exceed the budget → no budget-feasible allocation', () => {
    const a = listing({ supplier: SUP_A, total_quantity: 100, unit_price_bdt: 4000 });
    const r = match(requirement({ required_quantity: 60, maximum_budget_bdt: 200_000 }), [a]);
    expect(r.matching_status).toBe('NO_MATCH');
    expect(r.budget.status).toBe('OVER_BUDGET');
    expect(r.budget.message).toContain('No budget-feasible allocation');
    expect(r.budget.cheapest_estimated_cost_bdt).toBe(60 * 4000 + T_GAZIPUR);
    expect(r.allocations).toEqual([]);
    expect(r.unfulfilled_quantity).toBe(60);
    expect(r.over_budget_alternative?.[0].allocated_quantity).toBe(60);
  });

  it('budget includes estimated transport (delivered cost)', () => {
    const a = listing({ supplier: SUP_A, total_quantity: 100, unit_price_bdt: 1000 });
    // Material alone fits (60,000) but delivered cost (60,000 + transport) does not.
    const r = match(requirement({ required_quantity: 60, maximum_budget_bdt: 60_000 }), [a]);
    expect(r.budget.status).toBe('OVER_BUDGET');
    const ok = match(requirement({ required_quantity: 60, maximum_budget_bdt: 60_000 + T_GAZIPUR }), [a]);
    expect(ok.budget.status).toBe('WITHIN_BUDGET');
    expect(ok.matching_status).toBe('EXACT_MATCH');
  });

  it('prorates the budget for partial fulfilment', () => {
    const a = listing({ supplier: SUP_A, total_quantity: 30, unit_price_bdt: 1000 });
    // 30 of 60 pieces → half of a 70,000 budget = 35,000 ≥ 30,000 + transport.
    const r = match(requirement({ required_quantity: 60, maximum_budget_bdt: 70_000 }), [a]);
    expect(r.matching_status).toBe('PARTIAL_MATCH');
    expect(r.budget.status).toBe('WITHIN_BUDGET');
    expect(r.budget.message).toContain('prorated');
  });

  it('never counts reserved stock as available', () => {
    const a = listing({ total_quantity: 60, reserved_quantity: 50 });
    const r = match(requirement({ required_quantity: 20 }), [a]);
    expect(r.allocated_quantities[a.id]).toBe(10);
    expect(r.matching_status).toBe('PARTIAL_MATCH');
  });

  it('a fully reserved listing is rejected for availability', () => {
    const a = listing({ total_quantity: 40, reserved_quantity: 40 });
    expect(failedRules(match(requirement(), [a]), a.id)).toEqual(['AVAILABILITY']);
  });

  it('EXACT_MATCH when one supplier covers everything', () => {
    const a = listing({ supplier: SUP_A, total_quantity: 100 });
    const b = listing({ supplier: SUP_B, total_quantity: 100, unit_price_bdt: 4500 });
    const r = match(requirement({ required_quantity: 60 }), [a, b]);
    expect(r.matching_status).toBe('EXACT_MATCH');
    expect(r.listing_ids).toEqual([a.id]);
  });

  it('weighs transport: a nearby slightly dearer supplier beats a cheap distant one', () => {
    const far = listing({ supplier: SUP_C, total_quantity: 10, unit_price_bdt: 1000 }); // Chattogram, 250 km
    const near = listing({ supplier: SUP_B, total_quantity: 10, unit_price_bdt: 1100 }); // Dhaka
    const r = match(requirement({ required_quantity: 10 }), [far, near]);
    expect(r.listing_ids).toEqual([near.id]);
    expect(evalFor(r, far.id).compatible).toBe(true);
    expect(evalFor(r, far.id).allocated_quantity).toBe(0);
  });

  it('explains why suppliers were combined', () => {
    const a = listing({ supplier: SUP_A, total_quantity: 40, unit_price_bdt: 4000 });
    const b = listing({ supplier: SUP_B, total_quantity: 35, unit_price_bdt: 4200 });
    expect(match(requirement({ required_quantity: 60 }), [a, b]).compatibility_explanations[0]).toBe(
      'No single supplier holds 60 compatible pieces (largest: 40); combining 2 suppliers fulfils the requirement.'
    );

    // A alone could cover 60 (63,600 delivered), but 30 cheap units from B make the split cheaper (62,700).
    const big = listing({ supplier: SUP_A, total_quantity: 60, unit_price_bdt: 1000 });
    const cheap = listing({ supplier: SUP_B, total_quantity: 30, unit_price_bdt: 900 });
    const r = match(requirement({ required_quantity: 60 }), [big, cheap]);
    expect(r.matching_status).toBe('MULTI_SUPPLIER_MATCH');
    expect(r.total_estimated_cost_bdt).toBe(30 * 900 + 30 * 1000 + T_DHAKA + T_GAZIPUR);
    expect(r.compatibility_explanations[0]).toContain('cheaper overall');
  });

  it('avoids adding a second supplier when one is cheaper overall', () => {
    // A alone: 20 × 1000 + T_GAZIPUR. Splitting with B adds another transport charge.
    const a = listing({ supplier: SUP_A, total_quantity: 20, unit_price_bdt: 1000 });
    const b = listing({ supplier: SUP_B, total_quantity: 20, unit_price_bdt: 990 });
    const r = match(requirement({ required_quantity: 20 }), [a, b]);
    expect(r.matching_status).toBe('EXACT_MATCH');
    expect(new Set(r.allocations.map((x) => x.supplier_organization_id)).size).toBe(1);
  });

  describe('allow_split_suppliers = false', () => {
    it('uses one supplier only; reports the shortfall', () => {
      const a = listing({ supplier: SUP_A, total_quantity: 40 });
      const b = listing({ supplier: SUP_B, total_quantity: 35 });
      const r = match(requirement({ required_quantity: 60, allow_split_suppliers: false }), [a, b]);
      expect(r.matching_status).toBe('PARTIAL_MATCH');
      expect(r.allocated_quantities).toEqual({ [a.id]: 40 });
      expect(r.unfulfilled_quantity).toBe(20);
      expect(r.compatibility_explanations[0]).toContain('single supplier');
    });

    it('still combines two listings from the same supplier', () => {
      const a1 = listing({ supplier: SUP_A, total_quantity: 30, unit_price_bdt: 4000 });
      const a2 = listing({ supplier: SUP_A, total_quantity: 30, unit_price_bdt: 4100 });
      const r = match(requirement({ required_quantity: 60, allow_split_suppliers: false }), [a1, a2]);
      expect(r.matching_status).toBe('EXACT_MATCH');
      expect(r.allocations).toHaveLength(2);
      // Transport is charged once per supplier, not per listing.
      expect(r.estimated_transportation_costs_bdt).toBe(T_GAZIPUR);
    });
  });
});

describe('contract & explainability', () => {
  const a = listing({ supplier: SUP_A, total_quantity: 40, unit_price_bdt: 4000 });
  const b = listing({ supplier: SUP_B, total_quantity: 35, unit_price_bdt: 4200 });
  const bad = listing({ supplier: SUP_C, material_specification: 'SS201' });
  const r = match(requirement({ required_quantity: 60, maximum_budget_bdt: 300_000 }), [a, b, bad]);

  it('returns every MatchProposal contract field', () => {
    for (const key of [
      'requirement_id',
      'requested_quantity',
      'matching_status',
      'allocations',
      'compatible_supplier_ids',
      'listing_ids',
      'allocated_quantities',
      'estimated_material_costs_bdt',
      'total_estimated_cost_bdt',
      'compatibility_explanations',
      'unfulfilled_quantity',
    ]) {
      expect(r).toHaveProperty(key);
    }
    for (const alloc of r.allocations) {
      expect(alloc.subtotal_bdt).toBe(alloc.allocated_quantity * alloc.unit_price_bdt);
      expect(Number.isInteger(alloc.allocated_quantity)).toBe(true);
    }
  });

  it('is internally consistent', () => {
    const allocated = r.allocations.reduce((s, x) => s + x.allocated_quantity, 0);
    expect(allocated + r.unfulfilled_quantity).toBe(r.requested_quantity);
    expect(r.total_estimated_cost_bdt).toBe(r.estimated_material_costs_bdt + (r.estimated_transportation_costs_bdt ?? 0));
    expect(r.compatible_supplier_ids).toEqual([SUP_A.id, SUP_B.id].sort());
  });

  it('explains inclusions and rejections', () => {
    expect(r.compatibility_explanations.some((l) => l.includes('Supplier A'))).toBe(true);
    expect(r.rejection_reasons?.some((l) => l.includes('Supplier C') && l.includes('SS201'))).toBe(true);
    expect(r.evaluations[0].allocated_quantity).toBeGreaterThan(0); // allocated listings first
  });

  it('compares against the name-only baseline', () => {
    const thin = listing({ supplier: SUP_C, thickness_mm: 1 });
    const res = match(requirement(), [a, thin]);
    expect(res.baseline.suggested_listing_ids.sort()).toEqual([a.id, thin.id].sort());
    expect(res.baseline.incompatible_suggestion_ids).toEqual([thin.id]);
  });

  it('is deterministic', () => {
    const again = match(requirement({ required_quantity: 60, maximum_budget_bdt: 300_000 }), [b, bad, a]);
    expect(again.allocations).toEqual(r.allocations);
    expect(again.matching_status).toBe(r.matching_status);
  });
});

describe('seed data scenario (Member 1 listings + seed requirement)', () => {
  it('80 × SS304 2mm UNUSED → Gazipur 50 + Dhaka 30, within the 360,000 BDT budget', () => {
    const orgs = new Map(SEED_ORGANIZATIONS.map((o) => [o.id, o]));
    const listings = SEED_LISTINGS.map((l) => ({ ...l, organization: orgs.get(l.organization_id) }));
    const req = SEED_REQUIREMENTS[0];
    const r = runMatching({ requirement: req, listings, buyerOrganization: orgs.get(req.organization_id), now: NOW });

    expect(r.matching_status).toBe('MULTI_SUPPLIER_MATCH');
    expect(r.allocated_quantities).toEqual({
      'c1111111-1111-4111-c111-111111111111': 50,
      'c2222222-2222-4222-c222-222222222222': 30,
    });
    expect(r.budget.status).toBe('WITHIN_BUDGET');
    expect(r.total_estimated_cost_bdt).toBe(50 * 4200 + 30 * 4350 + T_GAZIPUR + T_DHAKA);
    // SS201 (grade) and the 2000×1000×1.5 sheet (size) are rejected with reasons.
    expect(evalFor(r, 'c3333333-3333-4333-c333-333333333333').checks.find((c) => !c.passed)?.rule).toBe('SPECIFICATION');
    expect(evalFor(r, 'c4444444-4444-4444-c444-444444444444').compatible).toBe(false);
  });
});
