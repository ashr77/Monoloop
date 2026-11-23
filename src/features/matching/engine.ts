// ============================================================================
// MONOLOOP - Explainable Matching Engine (Member 3)
//
//   Step 1  Specification validation   (rules.ts, unknown specs fail)
//   Step 2  Eligibility filtering      (all mandatory rules must pass)
//   Step 3  Cost ranking               (costs.ts, estimated delivered cost)
//   Step 4  Allocation                 (allocation.ts, optimal multi-supplier)
//
// Pure function: no I/O. Given a requirement and the listings, it returns a
// MatchResult (a superset of the frozen MatchProposal contract).
// A proposal is NOT a reservation: Member 4 re-checks stock on acceptance.
// ============================================================================

import type { MaterialListing, MaterialRequirement, Organization } from '@/lib/types';
import type { MatchingStatus } from '@/lib/constants';
import { evaluateListing } from './rules';
import { estimateDistanceKm, estimateTransportBdt } from './costs';
import { allocate, type AllocationPlan } from './allocation';
import { baselineMatches } from './baseline';
import type {
  BaselineComparison,
  BudgetAssessment,
  CostEstimate,
  ListingEvaluation,
  MatchAllocationDetail,
  MatchResult,
} from './types';

export const ENGINE_VERSION = '1.0.0';

export interface MatchingInput {
  requirement: MaterialRequirement;
  listings: MaterialListing[];
  /** Buyer organization (for delivery city). Falls back to requirement.organization. */
  buyerOrganization?: Organization | null;
  /** Injectable clock for deterministic tests. */
  now?: Date;
}

const bdt = (n: number) => `${Math.round(n).toLocaleString('en-US')} BDT`;

export function runMatching({ requirement, listings, buyerOrganization, now = new Date() }: MatchingInput): MatchResult {
  const buyer = buyerOrganization ?? requirement.organization ?? null;
  const buyerCity = buyer?.city ?? null;
  const required = Math.floor(requirement.required_quantity);

  // Steps 1-2: evaluate every listing against every mandatory rule.
  const evaluations = listings.map((l) =>
    evaluateListing(requirement, l, { buyerOrganizationId: requirement.organization_id })
  );
  const compatible = evaluations.filter((e) => e.compatible);

  // Step 3: transport + handling estimate per compatible supplier (charged once per supplier).
  const costBySupplier = new Map<string, CostEstimate>();
  for (const e of compatible) {
    if (costBySupplier.has(e.supplier_organization_id)) continue;
    const distance = estimateDistanceKm(e.city, buyerCity);
    costBySupplier.set(e.supplier_organization_id, {
      supplier_organization_id: e.supplier_organization_id,
      from_city: e.city,
      to_city: buyerCity ?? 'unknown',
      distance_km: distance.km,
      transport_bdt: estimateTransportBdt(distance.km),
    });
  }

  // Step 4: allocation.
  const plan = allocate({
    requiredQuantity: required,
    allowSplitSuppliers: requirement.allow_split_suppliers,
    candidates: compatible.map((e) => ({
      listing_id: e.listing_id,
      supplier_id: e.supplier_organization_id,
      unit_price_bdt: e.unit_price_bdt,
      available_quantity: e.available_quantity,
    })),
    transportBySupplier: Object.fromEntries(
      Array.from(costBySupplier.values()).map((c) => [c.supplier_organization_id, c.transport_bdt])
    ),
  });

  const details = toAllocationDetails(plan, evaluations, costBySupplier);

  // Budget: the total budget is prorated when only part of the quantity can be supplied.
  const budget = assessBudget(requirement.maximum_budget_bdt, plan, required);
  const overBudget = budget.status === 'OVER_BUDGET';
  const allocations = overBudget ? [] : details;
  const allocated = overBudget ? 0 : plan.allocatedQuantity;

  // Mark which listings were used.
  const usedQty = new Map(allocations.map((a) => [a.listing_id, a.allocated_quantity]));
  for (const e of evaluations) e.allocated_quantity = usedQty.get(e.listing_id) ?? 0;

  const status = deriveStatus(allocations, allocated, required);
  const unfulfilled = required - allocated;

  return {
    // --- Frozen MatchProposal contract fields ---
    requirement_id: requirement.id,
    requested_quantity: required,
    matching_status: status,
    allocations,
    compatible_supplier_ids: Array.from(new Set(compatible.map((e) => e.supplier_organization_id))).sort(),
    listing_ids: allocations.map((a) => a.listing_id),
    allocated_quantities: Object.fromEntries(allocations.map((a) => [a.listing_id, a.allocated_quantity])),
    estimated_material_costs_bdt: overBudget ? 0 : plan.materialCostBdt,
    estimated_transportation_costs_bdt: overBudget ? 0 : plan.transportCostBdt,
    total_estimated_cost_bdt: overBudget ? 0 : plan.totalCostBdt,
    compatibility_explanations: buildExplanations(
      status,
      allocations,
      allocated,
      required,
      compatible.length,
      budget,
      requirement.allow_split_suppliers,
      maxSingleSupplierCapacity(compatible)
    ),
    rejection_reasons: buildRejections(evaluations, requirement),
    unfulfilled_quantity: unfulfilled,

    // --- Explainability extensions ---
    engine_version: ENGINE_VERSION,
    generated_at: now.toISOString(),
    requirement_status: requirement.status,
    allow_split_suppliers: requirement.allow_split_suppliers,
    allocated_quantity: allocated,
    evaluations: sortEvaluations(evaluations, requirement.material_family),
    budget,
    baseline: compareBaseline(requirement, listings, evaluations),
    allocation_method: allocations.length > 0 ? plan.method : 'NONE',
    ...(overBudget ? { over_budget_alternative: details } : {}),
  };
}

/* --------------------------------------------------------------- helpers */

function toAllocationDetails(
  plan: AllocationPlan,
  evaluations: ListingEvaluation[],
  costBySupplier: Map<string, CostEstimate>
): MatchAllocationDetail[] {
  const charged = new Set<string>();
  return plan.lines.map((line) => {
    const ev = evaluations.find((e) => e.listing_id === line.listing_id)!;
    const cost = costBySupplier.get(line.supplier_id)!;
    const firstForSupplier = !charged.has(line.supplier_id);
    charged.add(line.supplier_id);
    return {
      listing_id: line.listing_id,
      supplier_organization_id: line.supplier_id,
      supplier_name: ev.supplier_name,
      allocated_quantity: line.quantity,
      unit_price_bdt: line.unit_price_bdt,
      subtotal_bdt: line.subtotal_bdt,
      city: ev.city,
      technical_notes: ev.reason,
      estimated_transport_bdt: firstForSupplier ? cost.transport_bdt : 0,
      distance_km: cost.distance_km,
    };
  });
}

function assessBudget(maxBudget: number | null | undefined, plan: AllocationPlan, required: number): BudgetAssessment {
  const limit = maxBudget === null || maxBudget === undefined ? null : Number(maxBudget);
  const cheapest = plan.allocatedQuantity > 0 ? plan.totalCostBdt : null;

  if (limit === null) {
    return { status: 'NO_BUDGET', maximum_budget_bdt: null, cheapest_estimated_cost_bdt: cheapest, message: 'No budget limit set.' };
  }
  if (cheapest === null) {
    return { status: 'NOT_APPLICABLE', maximum_budget_bdt: limit, cheapest_estimated_cost_bdt: null, message: 'No compatible stock to price against the budget.' };
  }

  const partial = plan.allocatedQuantity < required;
  const applicable = partial ? (limit * plan.allocatedQuantity) / required : limit;
  const scope = partial ? `prorated budget ${bdt(applicable)} for ${plan.allocatedQuantity} of ${required} pieces` : `budget ${bdt(limit)}`;

  if (plan.totalCostBdt <= applicable + 1e-6) {
    return {
      status: 'WITHIN_BUDGET',
      maximum_budget_bdt: limit,
      cheapest_estimated_cost_bdt: cheapest,
      message: `Estimated delivered cost ${bdt(cheapest)} is within the ${scope}.`,
    };
  }
  return {
    status: 'OVER_BUDGET',
    maximum_budget_bdt: limit,
    cheapest_estimated_cost_bdt: cheapest,
    message: `No budget-feasible allocation: the cheapest compatible option costs ${bdt(cheapest)}, above the ${scope}.`,
  };
}

function deriveStatus(allocations: MatchAllocationDetail[], allocated: number, required: number): MatchingStatus {
  if (allocations.length === 0 || allocated === 0) return 'NO_MATCH';
  if (allocated < required) return 'PARTIAL_MATCH';
  const suppliers = new Set(allocations.map((a) => a.supplier_organization_id));
  return suppliers.size > 1 ? 'MULTI_SUPPLIER_MATCH' : 'EXACT_MATCH';
}

function buildExplanations(
  status: MatchingStatus,
  allocations: MatchAllocationDetail[],
  allocated: number,
  required: number,
  compatibleCount: number,
  budget: BudgetAssessment,
  allowSplit: boolean,
  largestSingleSupplier: number
): string[] {
  const lines: string[] = [];
  const suppliers = new Set(allocations.map((a) => a.supplier_organization_id)).size;

  if (status === 'EXACT_MATCH') lines.push(`One supplier fulfils all ${required} pieces.`);
  if (status === 'MULTI_SUPPLIER_MATCH')
    lines.push(
      largestSingleSupplier < required
        ? `No single supplier holds ${required} compatible pieces (largest: ${largestSingleSupplier}); combining ${suppliers} suppliers fulfils the requirement.`
        : `Combining ${suppliers} suppliers is cheaper overall than sourcing all ${required} pieces from one supplier.`
    );
  if (status === 'PARTIAL_MATCH')
    lines.push(
      `Only ${allocated} of ${required} pieces can be supplied${allowSplit ? ' from all compatible stock' : ' by a single supplier (multi-supplier sourcing not allowed)'}; ${required - allocated} remain unfulfilled.`
    );
  if (status === 'NO_MATCH' && compatibleCount === 0) lines.push('No listing satisfies every mandatory specification.');

  for (const a of allocations) {
    lines.push(
      `${a.supplier_name} (${a.city}): ${a.allocated_quantity} pcs × ${bdt(a.unit_price_bdt)} = ${bdt(a.subtotal_bdt)}` +
        (a.estimated_transport_bdt > 0 ? ` + est. transport ${bdt(a.estimated_transport_bdt)} (${a.distance_km} km).` : '.')
    );
  }
  if (budget.status === 'WITHIN_BUDGET' || budget.status === 'OVER_BUDGET') lines.push(budget.message);
  return lines;
}

function maxSingleSupplierCapacity(compatible: ListingEvaluation[]): number {
  const bySupplier = new Map<string, number>();
  for (const e of compatible) {
    bySupplier.set(e.supplier_organization_id, (bySupplier.get(e.supplier_organization_id) ?? 0) + e.available_quantity);
  }
  return Math.max(0, ...Array.from(bySupplier.values()));
}

function buildRejections(evaluations: ListingEvaluation[], requirement: MaterialRequirement): string[] {
  const sameFamily = evaluations.filter((e) => !e.compatible && !otherFamily(e, requirement));
  const other = evaluations.filter((e) => otherFamily(e, requirement)).length;
  const lines = sameFamily.map((e) => `${e.supplier_name} – ${e.material_specification}, ${e.dimensions}: ${e.reason}`);
  if (other > 0) lines.push(`${other} listing(s) of other material families were excluded.`);
  return lines;
}

const otherFamily = (e: ListingEvaluation, r: MaterialRequirement) =>
  e.checks.some((c) => c.rule === 'MATERIAL_FAMILY' && !c.passed) && r.material_family !== undefined;

/** Allocated first, then other compatible, then same-family rejections, then other families. */
function sortEvaluations(evaluations: ListingEvaluation[], family: string): ListingEvaluation[] {
  const rank = (e: ListingEvaluation) =>
    e.allocated_quantity > 0 ? 0 : e.compatible ? 1 : e.checks.find((c) => c.rule === 'MATERIAL_FAMILY')?.actual === family ? 2 : 3;
  return [...evaluations].sort(
    (a, b) => rank(a) - rank(b) || a.unit_price_bdt - b.unit_price_bdt || a.listing_id.localeCompare(b.listing_id)
  );
}

function compareBaseline(
  requirement: MaterialRequirement,
  listings: MaterialListing[],
  evaluations: ListingEvaluation[]
): BaselineComparison {
  const suggested = baselineMatches(requirement, listings);
  const ids = suggested.map((l) => l.id);
  const incompatible = ids.filter((id) => !evaluations.find((e) => e.listing_id === id)?.compatible);
  const claimed = suggested.reduce((s, l) => s + l.total_quantity, 0);
  const message =
    suggested.length === 0
      ? 'A name-only search finds no listings either.'
      : incompatible.length === 0
        ? `A name-only search suggests ${suggested.length} listing(s), all technically compatible.`
        : `A name-only search suggests ${suggested.length} listing${suggested.length === 1 ? '' : 's'}; ${incompatible.length} of them ${incompatible.length === 1 ? 'fails' : 'fail'} a mandatory specification and would have misled the buyer.`;
  return { suggested_listing_ids: ids, incompatible_suggestion_ids: incompatible, claimed_quantity: claimed, message };
}
