'use client';

// ============================================================================
// Product showcase: real MONOLOOP data rendered in compact product views.
// Every figure comes from the API through the existing hooks; when the API is
// unavailable the panel says so instead of showing placeholders.
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useMemo, useState, type ReactNode } from 'react';
import { EASE_OUT } from '@/components/motion';
import { Segmented, Skeleton, StatusBadge, Tag } from '@/components/ui';
import { FAMILY_LABEL, SPEC_LABEL, bdt, num } from '@/features/exchanges/components/format';
import { RULE_LABELS } from '@/features/matching/types';
import { useListings, useMatchesOverview } from '@/hooks';
import { requirementSize } from '@/lib/dimensions';
import { cn } from '@/lib/utils';

type Panel = 'market' | 'inventory' | 'requirements' | 'matching' | 'exchange';

const PANELS: { value: Panel; label: string; title: string; body: string; href: string; cta: string }[] = [
  {
    value: 'market',
    label: 'Marketplace',
    title: 'Search surplus by specification, not by name.',
    body: 'Every active listing with its grade, exact dimensions, available stock, unit price and location. Filter, sort and switch between a dense table and a visual grid.',
    href: '/supply?scope=all',
    cta: 'Explore the marketplace',
  },
  {
    value: 'inventory',
    label: 'Supplier inventory',
    title: 'Stock you can trust, down to the piece.',
    body: 'Available is always total minus reserved. Reserved stock is held only by accepted exchanges and released automatically when one is cancelled.',
    href: '/supply',
    cta: 'Manage inventory',
  },
  {
    value: 'requirements',
    label: 'Buyer requirements',
    title: 'Describe exactly what production needs.',
    body: 'Exact sizes or ranges, thickness tolerances, condition, budget, and whether several suppliers may combine to fill the order.',
    href: '/demand',
    cta: 'View requirements',
  },
  {
    value: 'matching',
    label: 'Matching',
    title: 'Every match shows its working.',
    body: 'Each listing is checked against eight mandatory rules. You see which passed, which failed and why — then the cheapest delivered allocation across suppliers.',
    href: '/matches',
    cta: 'Open matching',
  },
  {
    value: 'exchange',
    label: 'Exchange',
    title: 'From proposal to transfer, one accountable flow.',
    body: 'The buyer requests; each supplier accepts or declines its share and stock is reserved atomically; the buyer pays where enabled and confirms the transfer.',
    href: '/exchanges',
    cta: 'See exchanges',
  },
];

export function ProductShowcase() {
  const [panel, setPanel] = useState<Panel>('market');
  const meta = PANELS.find((p) => p.value === panel)!;

  return (
    <div className="grid gap-10 lg:grid-cols-12 lg:gap-14">
      <div className="min-w-0 space-y-8 lg:col-span-4">
        <div className="-mx-4 overflow-x-auto px-4 scrollbar-none lg:mx-0 lg:overflow-visible lg:px-0">
          <Segmented
            label="Product area"
            value={panel}
            onChange={setPanel}
            options={PANELS.map((p) => ({ value: p.value, label: p.label }))}
            className="lg:hidden"
          />
          <ul className="hidden space-y-0 lg:block" role="tablist" aria-label="Product area" aria-orientation="vertical">
            {PANELS.map((p, i) => {
              const active = p.value === panel;
              return (
                <li key={p.value}>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={active}
                    onClick={() => setPanel(p.value)}
                    className={cn(
                      'group relative flex w-full items-baseline gap-4 border-t border-graphite/10 py-4 text-left transition-colors duration-fast',
                      active ? 'text-graphite' : 'text-slate-600 hover:text-graphite'
                    )}
                  >
                    {active && (
                      <motion.span layoutId="showcase-rule" className="absolute -top-px left-0 h-0.5 w-full bg-copper" transition={{ duration: 0.35, ease: EASE_OUT }} />
                    )}
                    <span className="font-mono text-xs text-copper-700">{String(i + 1).padStart(2, '0')}</span>
                    <span className="text-lg font-medium tracking-[-0.02em]">{p.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
        <AnimatePresence mode="wait">
          <motion.div
            key={panel}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6, transition: { duration: 0.12 } }}
            transition={{ duration: 0.32, ease: EASE_OUT }}
            className="space-y-3"
          >
            <h3 className="text-heading-md font-medium">{meta.title}</h3>
            <p className="text-[15px] leading-relaxed text-slate-600">{meta.body}</p>
            <Link href={meta.href} className="group inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-copper-700">
              {meta.cta}
              <ArrowRight className="size-4 transition-transform duration-base group-hover:translate-x-0.5" aria-hidden />
            </Link>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="min-w-0 lg:col-span-8">
        <Frame path={meta.href}>
          <AnimatePresence mode="wait">
            <motion.div
              key={panel}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, transition: { duration: 0.1 } }}
              transition={{ duration: 0.3 }}
              role="tabpanel"
              aria-label={meta.label}
            >
              {panel === 'market' && <MarketPreview />}
              {panel === 'inventory' && <InventoryPreview />}
              {panel === 'requirements' && <RequirementsPreview />}
              {panel === 'matching' && <MatchingPreview />}
              {panel === 'exchange' && <ExchangePreview />}
            </motion.div>
          </AnimatePresence>
        </Frame>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ frame */

function Frame({ path, children }: { path: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-md border border-graphite/15 bg-cream-paper shadow-float">
      <div className="flex items-center gap-3 border-b border-graphite/10 px-4 py-2.5">
        <span className="flex gap-1.5" aria-hidden>
          <span className="size-2 rounded-full bg-graphite/15" />
          <span className="size-2 rounded-full bg-graphite/15" />
          <span className="size-2 rounded-full bg-graphite/15" />
        </span>
        <span className="truncate font-mono text-[11px] text-slate-600">monoloop{path.split('?')[0]}</span>
        <span className="ml-auto inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.08em] text-slate-600">
          <span className="size-1.5 rounded-full bg-copper" aria-hidden /> Live data
        </span>
      </div>
      <div className="min-h-[22rem] p-4 sm:p-6">{children}</div>
    </div>
  );
}

function Unavailable({ what }: { what: string }) {
  return <p className="py-16 text-center text-sm text-slate-600">{what} could not be loaded from the API right now.</p>;
}

function Rows({ n = 5 }: { n?: number }) {
  return (
    <div className="space-y-4 pt-2" aria-label="Loading" role="status">
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} className="flex items-center gap-6">
          <Skeleton className="h-4 w-1/3" />
          <Skeleton className="h-3 flex-1" />
          <Skeleton className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function ViewAll({ href, label }: { href: string; label: string }) {
  return (
    <Link href={href} className="group mt-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-copper-700">
      {label}
      <ArrowRight className="size-3.5 transition-transform duration-base group-hover:translate-x-0.5" aria-hidden />
    </Link>
  );
}

/* ---------------------------------------------------------------- panels */

function useActiveListings() {
  const q = useListings({ status: 'ACTIVE' });
  const rows = useMemo(
    () =>
      (q.data ?? [])
        .filter((l) => l.status === 'ACTIVE')
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [q.data]
  );
  return { q, rows };
}

function MarketPreview() {
  const { q, rows } = useActiveListings();
  if (q.isPending) return <Rows />;
  if (q.isError) return <Unavailable what="Listings" />;
  if (rows.length === 0) return <p className="py-16 text-center text-sm text-slate-600">No active listings yet.</p>;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[36rem] text-left text-[13px]">
          <thead>
            <tr className="border-b border-graphite/10">
              {['Material', 'Size (mm)', 'Available', 'Unit price', 'Location'].map((h, i) => (
                <th key={h} className={cn('t-label pb-2 font-medium', i < 4 && 'pr-3', i >= 2 && i <= 3 && 'text-right')}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 5).map((l, i) => (
              <motion.tr
                key={l.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05, duration: 0.3, ease: EASE_OUT }}
                className="border-b border-graphite/[0.07] last:border-0"
              >
                <td className="py-3 pr-3">
                  <p className="font-medium text-graphite">{SPEC_LABEL[l.material_specification] ?? l.material_specification}</p>
                  <p className="truncate text-xs text-slate-600">{l.organization?.name ?? FAMILY_LABEL[l.material_family]}</p>
                </td>
                <td className="py-3 pr-3 font-mono text-xs text-graphite">
                  {num(l.length_mm)}×{num(l.width_mm)}×{num(l.thickness_mm, l.thickness_mm % 1 ? 1 : 0)}
                </td>
                <td className="py-3 pr-3 text-right tabular-nums">{num(l.available_quantity)}</td>
                <td className="py-3 pr-3 text-right tabular-nums">{bdt(l.unit_price_bdt)}</td>
                <td className="py-3 text-slate-700">{l.city}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <ViewAll href="/supply?scope=all" label={`View all ${rows.length} active listings`} />
    </div>
  );
}

function InventoryPreview() {
  const { q, rows } = useActiveListings();
  if (q.isPending) return <Rows n={4} />;
  if (q.isError) return <Unavailable what="Inventory" />;
  // Prefer listings that actually carry reservations: they show the invariant at work.
  const picked = [...rows].sort((a, b) => b.reserved_quantity - a.reserved_quantity || b.total_quantity - a.total_quantity).slice(0, 4);
  if (picked.length === 0) return <p className="py-16 text-center text-sm text-slate-600">No active listings yet.</p>;
  return (
    <div className="space-y-5">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-slate-600">Available = Total − Reserved</p>
      <ul className="space-y-5">
        {picked.map((l, i) => {
          const total = Math.max(1, l.total_quantity);
          return (
            <li key={l.id} className="space-y-2">
              <div className="flex items-baseline justify-between gap-4 text-[13px]">
                <span className="min-w-0 truncate">
                  <span className="font-medium">{SPEC_LABEL[l.material_specification] ?? l.material_specification}</span>{' '}
                  <span className="text-slate-600">· {l.organization?.name ?? l.city}</span>
                </span>
                <span className="shrink-0 font-mono text-xs text-slate-700">
                  {num(l.available_quantity)} / {num(l.total_quantity)}
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded-xs bg-sand-100" role="img" aria-label={`${l.available_quantity} available, ${l.reserved_quantity} reserved of ${l.total_quantity}`}>
                <motion.span
                  className="h-full bg-graphite"
                  initial={{ width: 0 }}
                  animate={{ width: `${(l.available_quantity / total) * 100}%` }}
                  transition={{ delay: i * 0.08, duration: 0.6, ease: EASE_OUT }}
                />
                <motion.span
                  className="h-full bg-copper"
                  initial={{ width: 0 }}
                  animate={{ width: `${(l.reserved_quantity / total) * 100}%` }}
                  transition={{ delay: i * 0.08 + 0.2, duration: 0.6, ease: EASE_OUT }}
                />
              </div>
            </li>
          );
        })}
      </ul>
      <div className="flex gap-5 text-xs text-slate-700">
        <span className="inline-flex items-center gap-1.5"><span className="size-2 bg-graphite" aria-hidden /> Available</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-2 bg-copper" aria-hidden /> Reserved by accepted exchanges</span>
      </div>
      <ViewAll href="/supply" label="Open supplier inventory" />
    </div>
  );
}

function RequirementsPreview() {
  const q = useMatchesOverview();
  if (q.isPending) return <Rows n={4} />;
  if (q.isError) return <Unavailable what="Requirements" />;
  const rows = q.data;
  if (rows.length === 0) return <p className="py-16 text-center text-sm text-slate-600">No open requirements yet.</p>;
  return (
    <div>
      <ul className="divide-y divide-graphite/[0.07]">
        {rows.slice(0, 4).map(({ requirement: r }, i) => (
          <motion.li
            key={r.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3, ease: EASE_OUT }}
            className="grid gap-2 py-3.5 sm:grid-cols-[1fr_auto] sm:items-center"
          >
            <div className="min-w-0">
              <p className="font-medium text-graphite">
                {num(r.required_quantity)} × {SPEC_LABEL[r.material_specification] ?? r.material_specification}
              </p>
              <p className="truncate font-mono text-xs text-slate-600">{requirementSize(r, '×')}</p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 sm:justify-end">
              <Tag>{r.maximum_budget_bdt == null ? 'No budget cap' : `≤ ${bdt(r.maximum_budget_bdt)}`}</Tag>
              <Tag>{r.allow_split_suppliers ? 'Multi-supplier' : 'Single supplier'}</Tag>
              <Tag>{r.condition_requirement === 'ANY' ? 'Any condition' : r.condition_requirement.toLowerCase()}</Tag>
            </div>
          </motion.li>
        ))}
      </ul>
      <ViewAll href="/demand" label={`View all ${rows.length} open requirements`} />
    </div>
  );
}

function MatchingPreview() {
  const q = useMatchesOverview();
  if (q.isPending) return <Rows n={4} />;
  if (q.isError) return <Unavailable what="Matches" />;
  const row = q.data.find((o) => o.result.allocations.length > 0) ?? q.data[0];
  if (!row) return <p className="py-16 text-center text-sm text-slate-600">No open requirements to match yet.</p>;
  const { requirement: req, result } = row;
  const evaluation = result.evaluations.find((e) => e.allocated_quantity > 0) ?? result.evaluations[0];
  const pct = Math.round((result.allocated_quantity / Math.max(1, result.requested_quantity)) * 100);
  const tone =
    result.budget.status === 'OVER_BUDGET'
      ? ('danger' as const)
      : result.matching_status === 'PARTIAL_MATCH'
        ? ('warning' as const)
        : result.matching_status === 'NO_MATCH'
          ? ('danger' as const)
          : ('success' as const);
  const statusText =
    result.budget.status === 'OVER_BUDGET'
      ? 'Over budget'
      : { EXACT_MATCH: 'Exact match · one supplier', MULTI_SUPPLIER_MATCH: 'Combined from several suppliers', PARTIAL_MATCH: 'Partial match', NO_MATCH: 'No compatible stock' }[
          result.matching_status
        ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="t-label">{req.organization?.name ?? 'Buyer requirement'}</p>
          <p className="mt-1 text-lg font-medium tracking-[-0.02em]">
            {num(req.required_quantity)} × {SPEC_LABEL[req.material_specification] ?? req.material_specification}
          </p>
          <p className="font-mono text-xs text-slate-600">{requirementSize(req, '×')}</p>
        </div>
        <StatusBadge tone={tone} solid>
          {statusText}
        </StatusBadge>
      </div>
      <div>
        <div className="flex justify-between text-xs text-slate-700">
          <span>Allocated</span>
          <span className="font-mono">
            {num(result.allocated_quantity)} / {num(result.requested_quantity)} · {pct}%
          </span>
        </div>
        <div className="mt-1.5 h-2 overflow-hidden rounded-xs bg-sand-100">
          <motion.div className="h-full bg-copper" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.7, ease: EASE_OUT }} />
        </div>
      </div>
      {evaluation && (
        <div className="space-y-2">
          <p className="text-[13px] text-slate-700">
            Why <span className="font-medium text-graphite">{evaluation.supplier_name}</span>&rsquo;s listing{' '}
            {evaluation.compatible ? 'qualifies' : 'was rejected'}:
          </p>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
            {evaluation.checks.map((c, i) => (
              <motion.li
                key={c.rule}
                initial={{ opacity: 0, x: -4 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + i * 0.05, duration: 0.25 }}
                className="flex items-start gap-2 text-[13px]"
                title={c.message}
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-xs',
                    c.passed ? 'bg-moss-50 text-moss-700' : 'bg-brick-50 text-brick-700'
                  )}
                  aria-hidden
                >
                  {c.passed ? <Check className="size-3" strokeWidth={3} /> : <X className="size-3" strokeWidth={3} />}
                </span>
                <span className="min-w-0">
                  <span className="text-graphite">{RULE_LABELS[c.rule]}</span>
                  <span className="sr-only">{c.passed ? ' passed' : ' failed'}</span>{' '}
                  <span className="font-mono text-[11px] text-slate-600">{c.actual}</span>
                </span>
              </motion.li>
            ))}
          </ul>
        </div>
      )}
      <ViewAll href={`/matches/${req.id}`} label="Open the full explanation" />
    </div>
  );
}

const FLOW = [
  { step: 'Requested', who: 'Buyer', text: 'Requests the proposed allocation. Nothing is reserved yet.' },
  { step: 'Accepted', who: 'Each supplier', text: 'Accepts or declines its share. Acceptance re-checks and reserves stock in one transaction.' },
  { step: 'Reserved', who: 'System', text: 'When every supplier has accepted, the exchange is reserved and ready for payment and transfer.' },
  { step: 'Completed', who: 'Buyer', text: 'Confirms the hand-over. Inventory is deducted exactly once and counted as reuse.' },
];

function ExchangePreview() {
  return (
    <div className="space-y-6">
      <ol className="relative space-y-6 pl-8">
        <motion.span
          className="absolute left-[11px] top-2 w-px origin-top bg-copper"
          style={{ height: 'calc(100% - 1rem)' }}
          initial={{ scaleY: 0 }}
          animate={{ scaleY: 1 }}
          transition={{ duration: 1.1, ease: EASE_OUT }}
          aria-hidden
        />
        {FLOW.map((f, i) => (
          <motion.li
            key={f.step}
            className="relative"
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 + i * 0.18, duration: 0.35, ease: EASE_OUT }}
          >
            <span className="absolute -left-8 top-0.5 flex size-6 items-center justify-center rounded-full border border-copper bg-cream-paper font-mono text-[10px] text-copper-700">
              {i + 1}
            </span>
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <p className="font-medium text-graphite">{f.step}</p>
              <Tag>{f.who}</Tag>
            </div>
            <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-slate-700">{f.text}</p>
          </motion.li>
        ))}
      </ol>
      <p className="border-t border-graphite/10 pt-4 text-[13px] text-slate-700">
        A supplier can decline; the buyer then cancels to release any stock others reserved. Cancelling never deducts inventory.
      </p>
    </div>
  );
}
