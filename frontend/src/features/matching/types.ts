// ============================================================================
// MONOLOOP - Matching Engine Types (Member 3)
// TSUNAGU Hackathon 2026
//
// `MatchResult` EXTENDS the frozen `MatchProposal` contract in src/lib/types.ts.
// Member 4 can consume a MatchResult anywhere a MatchProposal is expected;
// the extra fields only power explainability in the matching UI.
// ============================================================================

import type { MatchAllocation, MatchProposal } from '@/lib/types';

/** Mandatory compatibility rules, evaluated in this order. */
export const RULE_IDS = [
  'LISTING_ACTIVE',
  'NOT_OWN_LISTING',
  'MATERIAL_FAMILY',
  'SPECIFICATION',
  'DIMENSIONS',
  'THICKNESS',
  'CONDITION',
  'AVAILABILITY',
] as const;
export type RuleId = (typeof RULE_IDS)[number];

export const RULE_LABELS: Record<RuleId, string> = {
  LISTING_ACTIVE: 'Listing active',
  NOT_OWN_LISTING: 'Different organization',
  MATERIAL_FAMILY: 'Material family',
  SPECIFICATION: 'Grade / specification',
  DIMENSIONS: 'Length × width',
  THICKNESS: 'Thickness',
  CONDITION: 'Condition',
  AVAILABILITY: 'Available stock',
};

export interface RuleCheck {
  rule: RuleId;
  passed: boolean;
  expected: string;
  actual: string;
  /** Human-readable explanation of the outcome. */
  message: string;
}

export interface ListingEvaluation {
  listing_id: string;
  supplier_organization_id: string;
  supplier_name: string;
  city: string;
  material_specification: string;
  dimensions: string;
  condition: string;
  available_quantity: number;
  unit_price_bdt: number;
  compatible: boolean;
  /** True when length/width only match after rotating the sheet 90°. */
  rotated: boolean;
  checks: RuleCheck[];
  /** First failed rule's message, or a compatibility summary. */
  reason: string;
  /** Quantity taken from this listing in the selected allocation (0 if none). */
  allocated_quantity: number;
}

export interface CostEstimate {
  supplier_organization_id: string;
  from_city: string;
  to_city: string;
  distance_km: number;
  /** Estimated one-off transport + handling cost for using this supplier. */
  transport_bdt: number;
}

export interface MatchAllocationDetail extends MatchAllocation {
  /** Transport + handling estimate attributed to this supplier (charged once per supplier). */
  estimated_transport_bdt: number;
  distance_km: number;
}

/** NOT_APPLICABLE: a budget is set but there is no compatible stock to price. */
export type BudgetStatus = 'NO_BUDGET' | 'WITHIN_BUDGET' | 'OVER_BUDGET' | 'NOT_APPLICABLE';

export interface BudgetAssessment {
  status: BudgetStatus;
  maximum_budget_bdt: number | null;
  /** Cheapest estimated delivered cost found (even if over budget), or null if nothing compatible. */
  cheapest_estimated_cost_bdt: number | null;
  message: string;
}

export interface BaselineComparison {
  /** Listings a name-only search (family + grade name) would suggest. */
  suggested_listing_ids: string[];
  /** Of those, how many fail a mandatory technical check. */
  incompatible_suggestion_ids: string[];
  /** Quantity the naive search would claim is available (uses total stock, ignores reservations). */
  claimed_quantity: number;
  message: string;
}

export interface MatchResult extends MatchProposal {
  allocations: MatchAllocationDetail[];
  engine_version: string;
  generated_at: string;
  requirement_status: string;
  allow_split_suppliers: boolean;
  allocated_quantity: number;
  evaluations: ListingEvaluation[];
  budget: BudgetAssessment;
  baseline: BaselineComparison;
  /** Which allocation method produced the result. */
  allocation_method: 'EXHAUSTIVE_OPTIMAL' | 'GREEDY' | 'NONE';
  /** If over budget, the cheapest full/partial allocation that was rejected for cost. */
  over_budget_alternative?: MatchAllocationDetail[];
}
