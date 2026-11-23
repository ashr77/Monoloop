// ============================================================================
// Evaluation against the hand-labelled dataset and the name-only baseline.
// Run `npx vitest run src/features/matching/tests/evaluation.test.ts` to print
// the report table used in docs/MATCHING.md.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { evaluate, formatReport } from '@/features/matching/evaluation/evaluate';
import { EVAL_LISTINGS, EVAL_REQUIREMENTS } from '@/features/matching/evaluation/dataset';

describe('MONOLOOP vs name-only baseline (synthetic labelled dataset)', () => {
  const report = evaluate();

  it('uses a dataset of the size the execution plan asks for', () => {
    expect(EVAL_LISTINGS.length).toBeGreaterThanOrEqual(30);
    expect(EVAL_LISTINGS.length).toBeLessThanOrEqual(40);
    expect(EVAL_REQUIREMENTS.length).toBeGreaterThanOrEqual(10);
    expect(new Set(EVAL_LISTINGS.map((l) => l.organization_id)).size).toBeGreaterThanOrEqual(6);
  });

  it('MONOLOOP finds exactly the hand-labelled compatible listings for every requirement', () => {
    for (const row of report.perRequirement) {
      expect([...row.monoloop.compatible].sort(), row.id).toEqual([...row.truth].sort());
    }
    expect(report.monoloop.precision).toBe(1);
    expect(report.monoloop.recall).toBe(1);
  });

  it('MONOLOOP never allocates incompatible or reserved stock and never over-claims fulfilment', () => {
    expect(report.monoloop.allocationErrorPieces).toBe(0);
    expect(report.monoloop.falseFulfilmentClaims).toBe(0);
    expect(report.monoloop.correctFulfilments).toBe(report.fulfillableByLabel);
  });

  it('the name-only baseline is measurably worse', () => {
    expect(report.baseline.precision).toBeLessThan(report.monoloop.precision);
    expect(report.baseline.allocationErrorPieces).toBeGreaterThan(0);
    expect(report.baseline.falseFulfilmentClaims).toBeGreaterThan(0);
  });

  it('prints the report', () => {
    const table = formatReport(report);
    console.log(`\n${table}\n`);
    expect(table).toContain('| Compatibility precision | 100.0% |');
  });
});
