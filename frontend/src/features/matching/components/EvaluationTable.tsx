'use client';

// Per-listing rule breakdown (Member 3). Client component for the filter toggle and row disclosure.

import { Fragment, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';
import { Collapse } from '@/components/motion';
import { EmptyState, Segmented, StatusBadge, type Tone } from '@/components/ui';
import { cn } from '@/lib/utils';
import { RULE_LABELS, type ListingEvaluation, type RuleId } from '../types';
import { bdt, num } from './theme';

const COLUMNS: { label: string; rules: RuleId[] }[] = [
  { label: 'Grade', rules: ['SPECIFICATION'] },
  { label: 'Size', rules: ['DIMENSIONS'] },
  { label: 'Thickness', rules: ['THICKNESS'] },
  { label: 'Condition', rules: ['CONDITION'] },
  { label: 'Stock', rules: ['AVAILABILITY'] },
  { label: 'Status', rules: ['LISTING_ACTIVE', 'NOT_OWN_LISTING'] },
];

type Filter = 'all' | 'compatible' | 'rejected';

function verdict(e: ListingEvaluation, overBudget: boolean): { label: string; tone: Tone } {
  if (!e.compatible) return { label: 'Rejected', tone: 'danger' };
  if (e.allocated_quantity > 0) return { label: 'Selected', tone: 'copper' };
  if (overBudget) return { label: 'Compatible, but over budget', tone: 'warning' };
  return { label: 'Compatible, not needed', tone: 'muted' };
}

export function EvaluationTable({ evaluations, overBudget = false }: { evaluations: ListingEvaluation[]; overBudget?: boolean }) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const counts = {
    all: evaluations.length,
    compatible: evaluations.filter((e) => e.compatible).length,
    rejected: evaluations.filter((e) => !e.compatible).length,
  };
  const rows = evaluations.filter((e) => filter === 'all' || (filter === 'compatible' ? e.compatible : !e.compatible));
  const toggle = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (evaluations.length === 0) {
    return (
      <EmptyState
        title="No listings of this material family yet"
        description="Matches appear as soon as suppliers publish compatible surplus."
      />
    );
  }

  const colCount = COLUMNS.length + 3;

  return (
    <div className="space-y-4">
      <Segmented<Filter>
        label="Filter listings"
        value={filter}
        onChange={setFilter}
        options={[
          { value: 'all', label: 'All', count: counts.all },
          { value: 'compatible', label: 'Compatible', count: counts.compatible },
          { value: 'rejected', label: 'Rejected', count: counts.rejected },
        ]}
      />

      <div className="overflow-x-auto border-y rule bg-cream-paper">
        <table className="w-full min-w-[920px] border-collapse text-sm">
          <thead>
            <tr className="border-b rule text-left">
              <th scope="col" className="t-label px-4 py-3">
                Listing
              </th>
              {COLUMNS.map((c) => (
                <th key={c.label} scope="col" className="t-label px-2 py-3 text-center">
                  {c.label}
                </th>
              ))}
              <th scope="col" className="t-label px-4 py-3 text-right">
                Allocated
              </th>
              <th scope="col" className="t-label px-4 py-3">
                Verdict
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((e) => {
              const isOpen = open.has(e.listing_id);
              const detailId = `rules-${e.listing_id}`;
              const v = verdict(e, overBudget);
              return (
                <Fragment key={e.listing_id}>
                  <tr className={cn('border-t border-graphite/[0.08] align-top first:border-0', e.allocated_quantity > 0 && 'bg-sand-50')}>
                    <td className="px-4 py-4">
                      <p className="font-medium text-graphite">{e.supplier_name}</p>
                      <p className="text-xs text-slate-600">
                        {e.city} · {e.material_specification} · <span className="font-mono">{e.dimensions}</span>
                      </p>
                      <p className="text-xs text-slate-600">
                        {e.condition.toLowerCase()} · {num(e.available_quantity)} avail. · {bdt(e.unit_price_bdt)}/pc
                      </p>
                      <button
                        type="button"
                        onClick={() => toggle(e.listing_id)}
                        aria-expanded={isOpen}
                        aria-controls={isOpen ? detailId : undefined}
                        className="mt-2 inline-flex items-center gap-1 rounded-xs text-xs font-medium text-copper-700 underline decoration-copper/40 underline-offset-[3px] transition-colors duration-fast hover:decoration-copper"
                      >
                        {isOpen ? 'Hide rule details' : 'Show rule details'}
                        <ChevronDown
                          className={cn('size-3.5 transition-transform duration-base ease-out', isOpen && 'rotate-180')}
                          aria-hidden
                        />
                      </button>
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
                            className={cn(
                              'inline-flex size-6 items-center justify-center rounded-xs',
                              passed ? 'bg-graphite/[0.06] text-graphite' : 'bg-brick-50 text-brick-700 ring-1 ring-inset ring-brick-100'
                            )}
                          >
                            {passed ? <Check className="size-3.5" aria-hidden /> : <X className="size-3.5" aria-hidden />}
                          </span>
                        </td>
                      );
                    })}
                    <td className="px-4 py-4 text-right tabular-nums">
                      {e.allocated_quantity > 0 ? (
                        <span className="font-mono font-medium text-copper-700">{num(e.allocated_quantity)}</span>
                      ) : (
                        <span className="text-slate-500">—</span>
                      )}
                    </td>
                    <td className="max-w-[300px] space-y-1 px-4 py-4">
                      <StatusBadge tone={v.tone}>{v.label}</StatusBadge>
                      <p className="text-xs leading-relaxed text-slate-600">{e.reason}</p>
                    </td>
                  </tr>
                  <tr className={cn(e.allocated_quantity > 0 && 'bg-sand-50')}>
                    <td colSpan={colCount} className="p-0">
                      <Collapse open={isOpen}>
                        <div id={detailId} className="px-4 pb-5">
                          <ul
                            aria-label={`Rule checks for ${e.supplier_name}`}
                            className="divide-y divide-graphite/[0.08] border-y rule"
                          >
                            {e.checks.map((x) => (
                              <li key={x.rule} className="grid gap-2 py-2.5 sm:grid-cols-12 sm:items-baseline sm:gap-4">
                                <div className="sm:col-span-3">
                                  <StatusBadge tone={x.passed ? 'neutral' : 'danger'}>
                                    {x.passed ? 'Pass' : 'Fail'} · {RULE_LABELS[x.rule] ?? x.rule}
                                  </StatusBadge>
                                </div>
                                <p className="text-[14px] leading-relaxed text-graphite sm:col-span-5">{x.message}</p>
                                <dl className="grid grid-cols-2 gap-3 text-xs sm:col-span-4">
                                  <div>
                                    <dt className="t-label">Expected</dt>
                                    <dd className="font-mono text-graphite">{x.expected}</dd>
                                  </div>
                                  <div>
                                    <dt className="t-label">Listing</dt>
                                    <dd className={cn('font-mono', x.passed ? 'text-graphite' : 'text-brick-700')}>{x.actual}</dd>
                                  </div>
                                </dl>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </Collapse>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-600">Hover a mark, or show rule details, for the expected and actual values behind each rule.</p>
    </div>
  );
}
