'use client';

// /matches overview: every open requirement with its live match status (Member 3).
// One request; the backend matches all open requirements with two database queries.
// Filtering, sorting and "load more" are purely client-side over the data already loaded.
import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowUpDown, ArrowUpRight } from 'lucide-react';
import { useMatchesOverview } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { useIdentity } from '@/lib/auth/AuthProvider';
import { requirementSize } from '@/lib/dimensions';
import type { MatchOverviewRow as Row } from '@/lib/api/endpoints';
import { usePersistentState, useIncremental, sortBy } from '@/hooks/useViewPrefs';
import { AnimatePresence, motion, rowMotion } from '@/components/motion';
import {
  Button,
  EmptyState,
  LinkButton,
  LoadMore,
  Menu,
  MenuCheckItem,
  MenuLabel,
  Segmented,
  StatusBadge,
  Toolbar,
  type Tone,
} from '@/components/ui';
import { SPEC_LABEL, bdt, num, unitNoun } from './theme';
import { MatchLoadError, MatchSkeleton } from './MatchStates';
import type { MatchResult } from '../types';

type Bucket = 'fulfillable' | 'partial' | 'none';
type Filter = 'all' | Bucket;
type SortKey = 'allocated' | 'quantity' | 'cost' | 'newest';

/** Same classification as the original status label/tone logic: over budget reads as "no match". */
function bucketOf(r: MatchResult): Bucket {
  if (r.budget.status === 'OVER_BUDGET') return 'none';
  if (r.matching_status === 'EXACT_MATCH' || r.matching_status === 'MULTI_SUPPLIER_MATCH') return 'fulfillable';
  if (r.matching_status === 'PARTIAL_MATCH') return 'partial';
  return 'none';
}

const TONE: Record<Bucket, Tone> = { fulfillable: 'success', partial: 'warning', none: 'danger' };

function statusLabel(r: MatchResult) {
  if (r.budget.status === 'OVER_BUDGET') return 'Over budget';
  return {
    EXACT_MATCH: 'One supplier',
    MULTI_SUPPLIER_MATCH: `${new Set(r.allocations.map((a) => a.supplier_organization_id)).size} suppliers`,
    PARTIAL_MATCH: 'Partial',
    NO_MATCH: 'No compatible stock',
  }[r.matching_status];
}

const pctOf = (r: MatchResult) => Math.round((r.allocated_quantity / Math.max(1, r.requested_quantity)) * 100);

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'allocated', label: 'Most allocated %' },
  { value: 'quantity', label: 'Largest quantity' },
  { value: 'cost', label: 'Lowest est. cost' },
  { value: 'newest', label: 'Newest requirement' },
];

function sortRows(rows: Row[], key: SortKey): Row[] {
  switch (key) {
    case 'allocated':
      return sortBy(rows, (o) => pctOf(o.result), 'desc');
    case 'quantity':
      return sortBy(rows, (o) => o.requirement.required_quantity, 'desc');
    case 'cost':
      // Nothing allocated → no cost to compare: keep those last.
      return sortBy(rows, (o) => (o.result.allocations.length ? o.result.total_estimated_cost_bdt : Number.POSITIVE_INFINITY), 'asc');
    case 'newest':
      return sortBy(rows, (o) => o.requirement.created_at ?? '', 'desc');
  }
}

export function MatchesOverview() {
  const query = useMatchesOverview();
  const identity = useIdentity();
  // Signed-in companies get only their own requirements from the API; admins and demo mode see all.
  const own = identity.locked && !identity.isAdmin;
  const [filter, setFilter] = usePersistentState<Filter>('matches.filter', 'all');
  const [sort, setSort] = usePersistentState<SortKey>('matches.sort', 'allocated');

  const rows = useMemo(() => query.data ?? [], [query.data]);
  const counts = useMemo(() => {
    const c = { all: rows.length, fulfillable: 0, partial: 0, none: 0 };
    for (const o of rows) c[bucketOf(o.result)] += 1;
    return c;
  }, [rows]);
  const filtered = useMemo(
    () => sortRows(filter === 'all' ? rows : rows.filter((o) => bucketOf(o.result) === filter), sort),
    [rows, filter, sort]
  );
  const { visible, more, shown, total } = useIncremental(filtered, 10, `${filter}:${sort}`);

  if (query.isPending) return <MatchSkeleton label="Matching every open requirement…" />;
  if (query.isError) {
    return (
      <div className="min-h-[calc(100vh-9rem)] bg-cream text-graphite">
        <MatchLoadError message={errorMessage(query.error)} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const fulfilled = rows.filter((o) => o.result.unfulfilled_quantity === 0 && o.result.allocations.length > 0).length;
  const sortLabel = SORTS.find((s) => s.value === sort)?.label ?? 'Sort';

  return (
    <div className="min-h-[calc(100vh-9rem)] bg-cream text-graphite">
      <div className="page-shell space-y-8 pb-16">
        <header className="space-y-4 border-b rule pb-10 pt-10 sm:pt-12">
          <h1 className="text-heading-lg font-medium sm:text-display-md">
            {rows.length === 0 ? (
              own ? 'Your matches' : 'Matching'
            ) : (
              <>
                {own ? `${fulfilled} of your ${rows.length} open requirements` : `${fulfilled} of ${rows.length} open requirements`}
                <br />
                <span className="text-slate-500">can be fulfilled right now.</span>
              </>
            )}
          </h1>
          <p className="max-w-prose text-[15px] leading-relaxed text-slate-600">
            {own
              ? 'Each of your open requirements is checked against all surplus stock on the network. Open one to see the allocation and why each listing was accepted or rejected.'
              : 'Every open requirement is checked against current surplus stock. Open one to see the allocation and why each listing was accepted or rejected.'}
          </p>
        </header>

        {rows.length === 0 ? (
          own ? (
            <EmptyState
              title="You have no open requirements yet"
              description="Post what your production needs. Meguri checks it against every surplus listing and shows the matches here."
              action={
                <LinkButton href="/demand?compose=1" variant="ink">
                  Post a requirement
                </LinkButton>
              }
            />
          ) : (
            <EmptyState
              title="No open requirements"
              description="Buyers publish requirements on the demand page."
              action={
                <LinkButton href="/demand" variant="ink">
                  Go to demand
                </LinkButton>
              }
            />
          )
        ) : (
          <section aria-label="Open requirements" className="space-y-4">
            <Toolbar className="justify-between gap-3">
              <div className="-mx-1 max-w-full overflow-x-auto px-1 py-0.5 scrollbar-none">
                <Segmented<Filter>
                  label="Filter by match status"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All', count: counts.all },
                    { value: 'fulfillable', label: 'Fulfillable', count: counts.fulfillable },
                    { value: 'partial', label: 'Partial', count: counts.partial },
                    { value: 'none', label: 'No match', count: counts.none },
                  ]}
                />
              </div>
              <Menu
                align="end"
                width="w-56"
                label={`Sort: ${sortLabel}`}
                trigger={
                  <>
                    <ArrowUpDown className="size-3.5 text-slate-500" aria-hidden />
                    <span className="text-slate-600">Sort</span> {sortLabel}
                  </>
                }
              >
                <MenuLabel>Sort requirements</MenuLabel>
                {SORTS.map((s) => (
                  <MenuCheckItem key={s.value} radio checked={sort === s.value} onCheckedChange={() => setSort(s.value)}>
                    {s.label}
                  </MenuCheckItem>
                ))}
              </Menu>
            </Toolbar>

            {total === 0 ? (
              <EmptyState
                title="No requirements match this filter"
                description="Try another status, or show every open requirement."
                action={
                  <Button variant="secondary" size="sm" onClick={() => setFilter('all')}>
                    Show all requirements
                  </Button>
                }
              />
            ) : (
              <>
                <ul className="divide-y divide-graphite/10 border-y rule">
                  <AnimatePresence initial={false}>
                    {visible.map(({ requirement: req, result: r }) => {
                      const pct = pctOf(r);
                      const bucket = bucketOf(r);
                      return (
                        <motion.li key={req.id} {...rowMotion}>
                          <Link
                            href={`/matches/${req.id}`}
                            className="group grid gap-4 px-1 py-6 transition-colors duration-fast hover:bg-cream-paper md:grid-cols-12 md:items-center md:px-3"
                          >
                            <div className="min-w-0 space-y-1 md:col-span-5">
                              <p className="t-label truncate">{req.organization?.name ?? 'Buyer'}</p>
                              <p className="text-xl font-medium tracking-[-0.02em] text-graphite">
                                {num(req.required_quantity)} × {SPEC_LABEL[req.material_specification] ?? req.material_specification}{' '}
                                <span className="text-slate-500">{unitNoun(req.material_family)}</span>
                              </p>
                              <p className="font-mono text-xs text-slate-600">{requirementSize(req, '×')}</p>
                            </div>
                            <div className="space-y-2 md:col-span-4">
                              <StatusBadge tone={TONE[bucket]}>
                                {statusLabel(r)}
                              </StatusBadge>
                              <div className="h-1 w-full overflow-hidden rounded-xs bg-graphite/[0.08]" aria-hidden>
                                <div
                                  className={bucket === 'none' ? 'h-full bg-brick-500' : 'h-full bg-copper'}
                                  style={{ width: `${pct}%` }}
                                />
                              </div>
                              <p className="text-xs text-slate-600">
                                <span className="font-mono tabular-nums text-graphite">
                                  {num(r.allocated_quantity)} / {num(r.requested_quantity)}
                                </span>{' '}
                                allocated · {pct}%
                              </p>
                            </div>
                            <div className="flex items-center justify-between gap-4 md:col-span-3 md:justify-end">
                              <span className="t-num text-[15px] text-graphite">
                                {r.allocations.length ? bdt(r.total_estimated_cost_bdt) : '—'}
                              </span>
                              <ArrowUpRight
                                className="size-5 text-slate-500 transition-[color,transform] duration-fast ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-copper-700"
                                aria-hidden
                              />
                            </div>
                          </Link>
                        </motion.li>
                      );
                    })}
                  </AnimatePresence>
                </ul>
                <LoadMore shown={shown} total={total} onMore={more} noun="requirements" />
              </>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
