// ============================================================================
// MONOLOOP vs name-only baseline — evaluation (Member 3)
//
// Metrics (execution plan §14, proposal §11):
//  - Compatibility precision / recall of suggested listings vs hand labels
//  - Requirements fulfilled (full quantity, within budget) — and false claims
//  - Quantity allocation errors (pieces from incompatible or unavailable stock)
//  - Estimated delivered cost of fulfilled requirements
// ============================================================================

import { runMatching } from '../engine';
import { baselineAllocate, baselineMatches } from '../baseline';
import { availableQuantity } from '../rules';
import { EVAL_LISTINGS, EVAL_REQUIREMENTS, type LabelledRequirement } from './dataset';
import type { MaterialListing } from '@/lib/types';

export interface MethodMetrics {
  suggested: number;
  truePositives: number;
  precision: number;
  recall: number;
  fulfilledClaims: number;
  correctFulfilments: number;
  falseFulfilmentClaims: number;
  allocationErrorPieces: number;
}

export interface EvaluationReport {
  requirements: number;
  listings: number;
  fulfillableByLabel: number;
  monoloop: MethodMetrics & { estimatedCostOfFulfilledBdt: number };
  baseline: MethodMetrics;
  perRequirement: {
    id: string;
    truth: string[];
    monoloop: { compatible: string[]; status: string; allocated: number };
    baseline: { suggested: string[]; claimedFulfilled: boolean };
  }[];
}

const ratio = (a: number, b: number) => (b === 0 ? 1 : a / b);

/** Pieces taken from a listing that is incompatible, or beyond its unreserved stock. */
function allocationErrors(lines: { listing_id: string; quantity: number }[], truth: Set<string>, listings: MaterialListing[]): number {
  let errors = 0;
  for (const line of lines) {
    const listing = listings.find((l) => l.id === line.listing_id)!;
    if (!truth.has(line.listing_id)) errors += line.quantity;
    else errors += Math.max(0, line.quantity - availableQuantity(listing));
  }
  return errors;
}

export function evaluate(
  labelled: LabelledRequirement[] = EVAL_REQUIREMENTS,
  listings: MaterialListing[] = EVAL_LISTINGS,
  now = new Date('2026-11-24T00:00:00.000Z')
): EvaluationReport {
  const m = { suggested: 0, tp: 0, truth: 0, claims: 0, correct: 0, errors: 0, cost: 0 };
  const b = { suggested: 0, tp: 0, claims: 0, correct: 0, errors: 0 };
  const perRequirement: EvaluationReport['perRequirement'] = [];

  for (const item of labelled) {
    const truth = new Set(item.compatible);
    m.truth += truth.size;

    // MONOLOOP
    const result = runMatching({ requirement: item.requirement, listings, now });
    const compatible = result.evaluations.filter((e) => e.compatible).map((e) => e.listing_id);
    m.suggested += compatible.length;
    m.tp += compatible.filter((id) => truth.has(id)).length;
    const claimed = result.matching_status === 'EXACT_MATCH' || result.matching_status === 'MULTI_SUPPLIER_MATCH';
    if (claimed) {
      m.claims++;
      if (item.fulfillable) m.correct++;
      m.cost += result.total_estimated_cost_bdt;
    }
    m.errors += allocationErrors(
      result.allocations.map((a) => ({ listing_id: a.listing_id, quantity: a.allocated_quantity })),
      truth,
      listings
    );

    // Baseline
    const suggested = baselineMatches(item.requirement, listings).map((l) => l.id);
    b.suggested += suggested.length;
    b.tp += suggested.filter((id) => truth.has(id)).length;
    const lines = baselineAllocate(item.requirement, listings);
    const baselineClaimed = lines.reduce((s, l) => s + l.quantity, 0) >= item.requirement.required_quantity;
    if (baselineClaimed) {
      b.claims++;
      if (item.fulfillable) b.correct++;
    }
    b.errors += allocationErrors(lines, truth, listings);

    perRequirement.push({
      id: item.requirement.id,
      truth: item.compatible,
      monoloop: { compatible, status: result.matching_status, allocated: result.allocated_quantity },
      baseline: { suggested, claimedFulfilled: baselineClaimed },
    });
  }

  const truthTotal = m.truth;
  return {
    requirements: labelled.length,
    listings: listings.length,
    fulfillableByLabel: labelled.filter((x) => x.fulfillable).length,
    monoloop: {
      suggested: m.suggested,
      truePositives: m.tp,
      precision: ratio(m.tp, m.suggested),
      recall: ratio(m.tp, truthTotal),
      fulfilledClaims: m.claims,
      correctFulfilments: m.correct,
      falseFulfilmentClaims: m.claims - m.correct,
      allocationErrorPieces: m.errors,
      estimatedCostOfFulfilledBdt: m.cost,
    },
    baseline: {
      suggested: b.suggested,
      truePositives: b.tp,
      precision: ratio(b.tp, b.suggested),
      recall: ratio(b.tp, truthTotal),
      fulfilledClaims: b.claims,
      correctFulfilments: b.correct,
      falseFulfilmentClaims: b.claims - b.correct,
      allocationErrorPieces: b.errors,
    },
    perRequirement,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/** Markdown table for the proposal / docs. */
export function formatReport(r: EvaluationReport): string {
  const rows: [string, string, string][] = [
    ['Compatibility precision', pct(r.monoloop.precision), pct(r.baseline.precision)],
    ['Compatibility recall', pct(r.monoloop.recall), pct(r.baseline.recall)],
    ['Listings suggested (total)', String(r.monoloop.suggested), String(r.baseline.suggested)],
    [`Requirements reported fulfilled (truth: ${r.fulfillableByLabel})`, String(r.monoloop.fulfilledClaims), String(r.baseline.fulfilledClaims)],
    ['False "fulfilled" claims', String(r.monoloop.falseFulfilmentClaims), String(r.baseline.falseFulfilmentClaims)],
    ['Quantity allocation errors (pieces)', String(r.monoloop.allocationErrorPieces), String(r.baseline.allocationErrorPieces)],
  ];
  return [
    `Dataset: ${r.listings} listings, ${r.requirements} requirements (hand-labelled).`,
    '',
    '| Metric | MONOLOOP | Name-only baseline |',
    '| :-- | :-: | :-: |',
    ...rows.map(([k, a, b]) => `| ${k} | ${a} | ${b} |`),
    '',
    `Estimated delivered cost of MONOLOOP's fulfilled requirements: ${r.monoloop.estimatedCostOfFulfilledBdt.toLocaleString('en-US')} BDT.`,
  ].join('\n');
}
