'use client';

// /matches overview: every open requirement with its live match status (Member 3).
// One request; the backend matches all open requirements with two database queries.
import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useMatchesOverview } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { SPEC_LABEL, bdt, matchMono, matchSans, num, t, unitNoun } from './theme';
import { MatchLoadError, MatchSkeleton } from './MatchStates';
import type { MatchResult } from '../types';

const TONE: Record<string, string> = {
  EXACT_MATCH: 'bg-[#d4b48c]/30 text-[#5c3d1e]',
  MULTI_SUPPLIER_MATCH: 'bg-[#d4b48c]/30 text-[#5c3d1e]',
  PARTIAL_MATCH: 'bg-amber-100 text-amber-900',
  NO_MATCH: 'bg-red-100/70 text-red-800',
};

function statusLabel(r: MatchResult) {
  if (r.budget.status === 'OVER_BUDGET') return 'Over budget';
  return {
    EXACT_MATCH: 'One supplier',
    MULTI_SUPPLIER_MATCH: `${new Set(r.allocations.map((a) => a.supplier_organization_id)).size} suppliers`,
    PARTIAL_MATCH: 'Partial',
    NO_MATCH: 'No compatible stock',
  }[r.matching_status];
}

export function MatchesOverview() {
  const query = useMatchesOverview();
  if (query.isPending) return <MatchSkeleton label="Matching every open requirement…" />;
  if (query.isError) {
    return (
      <div className={`${matchSans.className} ${matchSans.variable} ${matchMono.variable} ${t.page} min-h-[calc(100vh-9rem)]`}>
        <MatchLoadError message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
  }
  const rows = query.data;
  const fulfilled = rows.filter((o) => o.result.unfulfilled_quantity === 0 && o.result.allocations.length > 0).length;

  return (
    <div className={`${matchSans.className} ${matchSans.variable} ${matchMono.variable} ${t.page} min-h-[calc(100vh-9rem)]`}>
      <div className="mx-auto max-w-7xl space-y-10 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
        <header className={`space-y-4 border-b pb-10 ${t.line}`}>
          <p className={`${t.eyebrow} ${t.muted}`}>Matching · live</p>
          <h1 className={`text-4xl leading-[1.02] sm:text-6xl ${t.display}`}>
            {fulfilled} of {rows.length} open requirements
            <br />
            <span className="text-[#1d1d1d]/40">can be fulfilled right now.</span>
          </h1>
          <p className={`max-w-2xl text-base ${t.muted}`}>
            Every open requirement is checked against current surplus stock. Open one to see the allocation and why each listing was
            accepted or rejected.
          </p>
        </header>

        {rows.length === 0 ? (
          <div className="border border-dashed border-[#d8d4bb] px-6 py-14 text-center">
            <p className={`${t.mono} text-xs ${t.accentText}`}>00</p>
            <p className="mt-2 text-2xl font-medium tracking-[-0.02em]">No open requirements</p>
            <p className={`mt-1 text-sm ${t.muted}`}>Buyers publish requirements on the demand page.</p>
            <Link href="/demand" className={`${t.btnInk} mt-6`}>
              Go to demand
            </Link>
          </div>
        ) : (
          <ul className="divide-y divide-[#d8d4bb] border-y border-[#d8d4bb]">
            {rows.map(({ requirement: req, result: r }) => {
              const pct = Math.round((r.allocated_quantity / Math.max(1, r.requested_quantity)) * 100);
              return (
                <li key={req.id}>
                  <Link
                    href={`/matches/${req.id}`}
                    className="group grid gap-4 py-6 transition-colors hover:bg-white/50 md:grid-cols-12 md:items-center"
                  >
                    <div className="space-y-1 md:col-span-5">
                      <p className={`${t.eyebrow} ${t.faint}`}>{req.organization?.name ?? 'Buyer'}</p>
                      <p className="text-xl font-medium tracking-[-0.02em]">
                        {num(req.required_quantity)} × {SPEC_LABEL[req.material_specification] ?? req.material_specification}{' '}
                        <span className="text-[#1d1d1d]/40">{unitNoun(req.material_family)}</span>
                      </p>
                      <p className={`${t.mono} text-xs ${t.muted}`}>
                        {num(req.length_mm)}×{num(req.width_mm)}×{num(req.thickness_mm)} mm
                      </p>
                    </div>
                    <div className="space-y-2 md:col-span-4">
                      <span className={`${t.eyebrow} inline-flex items-center gap-1.5 px-2 py-1 ${TONE[r.budget.status === 'OVER_BUDGET' ? 'NO_MATCH' : r.matching_status]}`}>
                        <span className="size-1.5 rounded-full bg-current" aria-hidden /> {statusLabel(r)}
                      </span>
                      <div className="h-1.5 w-full bg-[#e7e3cc]" aria-hidden>
                        <div className="h-full bg-[#8b5e34]" style={{ width: `${pct}%` }} />
                      </div>
                      <p className={`text-xs ${t.muted}`}>
                        {num(r.allocated_quantity)} / {num(r.requested_quantity)} allocated
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-4 md:col-span-3 md:justify-end">
                      <span className="tabular-nums">{r.allocations.length ? bdt(r.total_estimated_cost_bdt) : '—'}</span>
                      <ArrowUpRight className="size-5 text-[#1d1d1d]/40 transition-colors group-hover:text-[#8b5e34]" />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
