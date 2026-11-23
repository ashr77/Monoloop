'use client';

// Per-listing rule breakdown (Member 3). Client component for the filter toggle.

import { useState } from 'react';
import { Check, X } from 'lucide-react';
import type { ListingEvaluation, RuleId } from '../types';
import { bdt, num, t } from './theme';

const COLUMNS: { label: string; rules: RuleId[] }[] = [
  { label: 'Grade', rules: ['SPECIFICATION'] },
  { label: 'Size', rules: ['DIMENSIONS'] },
  { label: 'Thickness', rules: ['THICKNESS'] },
  { label: 'Condition', rules: ['CONDITION'] },
  { label: 'Stock', rules: ['AVAILABILITY'] },
  { label: 'Status', rules: ['LISTING_ACTIVE', 'NOT_OWN_LISTING'] },
];

type Filter = 'all' | 'compatible' | 'rejected';

export function EvaluationTable({ evaluations, overBudget = false }: { evaluations: ListingEvaluation[]; overBudget?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const counts = {
    all: evaluations.length,
    compatible: evaluations.filter((e) => e.compatible).length,
    rejected: evaluations.filter((e) => !e.compatible).length,
  };
  const rows = evaluations.filter((e) => filter === 'all' || (filter === 'compatible' ? e.compatible : !e.compatible));

  if (evaluations.length === 0) {
    return (
      <div className="border border-dashed border-[#d8d4bb] px-6 py-12 text-center">
        <p className={`${t.mono} text-xs ${t.accentText}`}>00</p>
        <p className="mt-2 text-xl font-medium tracking-[-0.02em]">No listings of this material family yet</p>
        <p className={`mt-1 text-sm ${t.muted}`}>Matches appear as soon as suppliers publish compatible surplus.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1" role="tablist" aria-label="Filter listings">
        {(['all', 'compatible', 'rejected'] as Filter[]).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filter === f}
            onClick={() => setFilter(f)}
            className={`flex h-9 items-center gap-2 border px-3.5 text-sm capitalize transition-colors ${
              filter === f ? 'border-[#1d1d1d] bg-[#1d1d1d] text-[#f3f1e5]' : 'border-[#d8d4bb] text-[#1d1d1d]/65 hover:border-[#1d1d1d]/40 hover:text-[#1d1d1d]'
            }`}
          >
            {f}
            <span className={`${t.mono} text-[11px] opacity-60`}>{counts[f]}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto border border-[#d8d4bb] bg-white">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-[#d8d4bb] text-left">
              <th scope="col" className={`${t.eyebrow} ${t.faint} px-4 py-3 font-medium`}>Listing</th>
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" className={`${t.eyebrow} ${t.faint} px-2 py-3 text-center font-medium`}>
                  {c.label}
                </th>
              ))}
              <th scope="col" className={`${t.eyebrow} ${t.faint} px-4 py-3 text-right font-medium`}>Allocated</th>
              <th scope="col" className={`${t.eyebrow} ${t.faint} px-4 py-3 font-medium`}>Verdict</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => (
              <tr key={e.listing_id} className={`border-b border-[#d8d4bb]/70 align-top last:border-0 ${e.allocated_quantity > 0 ? 'bg-[#d4b48c]/[0.08]' : ''}`}>
                <td className="px-4 py-4">
                  <p className="font-medium">{e.supplier_name}</p>
                  <p className={`text-xs ${t.muted}`}>
                    {e.city} · {e.material_specification} · <span className={t.mono}>{e.dimensions}</span>
                  </p>
                  <p className={`text-xs ${t.faint}`}>
                    {e.condition.toLowerCase()} · {num(e.available_quantity)} avail. · {bdt(e.unit_price_bdt)}/pc
                  </p>
                </td>
                {COLUMNS.map((c) => {
                  const checks = e.checks.filter((x) => c.rules.includes(x.rule));
                  const passed = checks.every((x) => x.passed);
                  const detail = checks.map((x) => `${x.message} (expected ${x.expected}; listing ${x.actual})`).join('\n');
                  return (
                    <td key={c.label} className="px-2 py-4 text-center">
                      <span
                        title={detail}
                        aria-label={`${c.label}: ${passed ? 'pass' : 'fail'}. ${detail}`}
                        className={`inline-flex size-6 items-center justify-center ${passed ? 'bg-[#1d1d1d]/[0.06] text-[#1d1d1d]' : 'bg-red-100 text-red-700'}`}
                      >
                        {passed ? <Check className="size-3.5" /> : <X className="size-3.5" />}
                      </span>
                    </td>
                  );
                })}
                <td className="px-4 py-4 text-right tabular-nums">
                  {e.allocated_quantity > 0 ? <span className="font-medium text-[#8b5e34]">{num(e.allocated_quantity)}</span> : <span className={t.faint}>—</span>}
                </td>
                <td className="max-w-[300px] px-4 py-4">
                  <p className={`text-xs font-medium ${e.compatible ? 'text-[#1d1d1d]' : 'text-red-700'}`}>
                    {!e.compatible
                      ? 'Rejected'
                      : e.allocated_quantity > 0
                        ? 'Selected'
                        : overBudget
                          ? 'Compatible, but over budget'
                          : 'Compatible, not needed'}
                  </p>
                  <p className={`text-xs leading-relaxed ${t.muted}`}>{e.reason}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={`text-xs ${t.faint}`}>Hover a mark for the expected and actual values behind each rule.</p>
    </div>
  );
}
