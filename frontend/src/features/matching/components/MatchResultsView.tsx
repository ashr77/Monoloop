// ============================================================================
// /matches/[requirementId] — results view (Member 3).
// ============================================================================

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import type { MaterialRequirement } from '@/lib/types';
import { requirementSize } from '@/lib/dimensions';
import { FactList, LinkButton, SectionHeading, StatusBadge, type Tone } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { MatchResult } from '../types';
import { PALETTE, SPEC_LABEL, SUPPLIER_COLORS, bdt, num, supplierInk, t, unitNoun } from './theme';
import { EvaluationTable } from './EvaluationTable';
import { RequestExchangeButton } from '@/features/exchanges/components/RequestExchangeButton';

interface Props {
  requirement: MaterialRequirement;
  result: MatchResult;
}

export function MatchResultsView({ requirement, result }: Props) {
  const supplierColor = new Map<string, string>();
  for (const a of result.allocations) {
    if (!supplierColor.has(a.supplier_organization_id)) {
      supplierColor.set(a.supplier_organization_id, SUPPLIER_COLORS[supplierColor.size % SUPPLIER_COLORS.length]);
    }
  }

  return (
    <div className="page-shell space-y-14 pb-16">
      <RequirementHeader requirement={requirement} />
      <ResultSummary requirement={requirement} result={result} />

      {result.allocations.length > 0 && (
        <section className="space-y-6" aria-labelledby="allocation-heading">
          <SectionHeading
            index="01"
            id="allocation-heading"
            title="Proposed allocation"
            hint="Cheapest estimated delivered cost among all supplier combinations."
          />
          <AllocationBar result={result} colors={supplierColor} />
          <AllocationList result={result} colors={supplierColor} />
        </section>
      )}

      {result.budget.status === 'OVER_BUDGET' && result.over_budget_alternative && <OverBudget result={result} />}

      <section className="space-y-6" aria-labelledby="why-heading">
        <SectionHeading
          index={result.allocations.length > 0 ? '02' : '01'}
          id="why-heading"
          title="Why each listing was accepted or rejected"
          hint="Every mandatory rule is checked for every listing of this material family. Nothing is assumed."
        />
        <EvaluationTable evaluations={result.evaluations} overBudget={result.budget.status === 'OVER_BUDGET'} />
      </section>

      <BaselineCallout requirement={requirement} result={result} />

      <ActionBar requirement={requirement} result={result} />
    </div>
  );
}

/* ---------------------------------------------------------------- header */

const sentenceCase = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function RequirementHeader({ requirement: r }: { requirement: MaterialRequirement }) {
  const facts = [
    { label: 'Size', value: requirementSize(r) },
    { label: 'Condition', value: r.condition_requirement === 'ANY' ? 'Any' : sentenceCase(r.condition_requirement.toLowerCase()) },
    { label: 'Budget', value: r.maximum_budget_bdt == null ? 'No limit' : bdt(r.maximum_budget_bdt) },
    { label: 'Sourcing', value: r.allow_split_suppliers ? 'Multi-supplier allowed' : 'Single supplier only' },
  ];
  return (
    <header className="space-y-8 border-b rule pb-10 pt-8 sm:pt-10">
      <Link
        href="/demand"
        className="inline-flex items-center gap-2 rounded-xs text-sm text-slate-600 transition-colors duration-fast hover:text-graphite"
      >
        <ArrowLeft className="size-4" aria-hidden /> Back to requirements
      </Link>
      <div className="space-y-4">
        <p className="t-eyebrow">
          Matching · {r.organization?.name ?? 'Buyer'} · <span className="normal-case">{r.id.slice(0, 8)}</span>
        </p>
        <h1 className="text-heading-lg font-medium sm:text-display-md">
          {num(r.required_quantity)} × {SPEC_LABEL[r.material_specification] ?? r.material_specification}{' '}
          <span className="text-slate-500">{unitNoun(r.material_family)}</span>
        </h1>
      </div>
      <FactList facts={facts} columns={4} />
    </header>
  );
}

/* ------------------------------------------------------------- summary */

const STATUS_COPY: Record<string, { label: string; tone: Tone }> = {
  EXACT_MATCH: { label: 'Fulfilled by one supplier', tone: 'success' },
  MULTI_SUPPLIER_MATCH: { label: 'Fulfilled by combining suppliers', tone: 'copper' },
  PARTIAL_MATCH: { label: 'Partially fulfillable', tone: 'warning' },
  NO_MATCH: { label: 'No compatible stock', tone: 'danger' },
};

function ResultSummary({ requirement, result }: Props) {
  const overBudget = result.budget.status === 'OVER_BUDGET';
  const status = overBudget ? { label: 'No budget-feasible match', tone: STATUS_COPY.NO_MATCH.tone } : STATUS_COPY[result.matching_status];
  const compatible = result.evaluations.filter((e) => e.compatible).length;
  const suppliers = new Set(result.allocations.map((a) => a.supplier_organization_id)).size;
  const pct = Math.round((result.allocated_quantity / Math.max(1, result.requested_quantity)) * 100);

  const stats: [string, string, string][] = [
    ['Allocated', `${num(result.allocated_quantity)} / ${num(result.requested_quantity)}`, `${pct}% of the requirement`],
    ['Suppliers', String(suppliers), `${compatible} compatible of ${result.evaluations.length} evaluated`],
    [
      'Est. delivered cost',
      result.allocations.length ? bdt(result.total_estimated_cost_bdt) : '—',
      result.allocations.length
        ? `${bdt(result.estimated_material_costs_bdt)} material + ${bdt(result.estimated_transportation_costs_bdt ?? 0)} transport`
        : 'Nothing allocated',
    ],
    [
      'Budget',
      requirement.maximum_budget_bdt == null ? 'No limit' : bdt(requirement.maximum_budget_bdt),
      {
        WITHIN_BUDGET: 'Within budget',
        OVER_BUDGET: 'Exceeded by the cheapest option',
        NOT_APPLICABLE: 'Nothing compatible to price',
        NO_BUDGET: 'Not set',
      }[result.budget.status],
    ],
  ];

  return (
    <section aria-label="Match summary" className="space-y-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <StatusBadge tone={status.tone} className="py-1 text-[14px]">
          {status.label}
        </StatusBadge>
        <span className="t-label">
          {result.allocation_method === 'EXHAUSTIVE_OPTIMAL'
            ? 'Optimal allocation · all combinations checked'
            : result.allocation_method === 'GREEDY'
              ? 'Greedy allocation (large candidate set)'
              : `Engine v${result.engine_version}`}
        </span>
      </div>
      <dl className="grid grid-cols-2 border-y rule lg:grid-cols-4">
        {stats.map(([k, v, note], i) => (
          <div
            key={k}
            className={cn(
              'min-w-0 space-y-2 border-graphite/10 py-5 pr-4',
              i % 2 === 1 && 'border-l pl-4',
              i > 1 && 'border-t',
              'lg:border-t-0 lg:px-6 lg:first:pl-0 lg:[&:not(:first-child)]:border-l'
            )}
          >
            <dt className="t-label">{k}</dt>
            <dd className={cn('text-2xl font-medium tabular-nums tracking-[-0.03em] sm:text-3xl', k === 'Allocated' ? 'text-copper-700' : 'text-graphite')}>
              {v}
            </dd>
            <dd className="text-xs text-slate-600">{note}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-2">
        {/* The over-budget panel below already states the budget message. */}
        {result.compatibility_explanations.filter((line) => !overBudget || line !== result.budget.message).map((line, i) => (
          <li key={i} className="flex max-w-3xl gap-3 text-sm leading-relaxed text-slate-700">
            <span className="mt-[3px] font-mono text-xs text-copper-700">{String(i + 1).padStart(2, '0')}</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------------------------------------------------- allocation */

function AllocationBar({ result, colors }: { result: MatchResult; colors: Map<string, string> }) {
  const total = Math.max(1, result.requested_quantity);
  return (
    <figure className="space-y-3">
      <div
        className="flex h-12 w-full overflow-hidden rounded-sm border rule bg-cream-paper"
        role="img"
        aria-label={`${result.allocated_quantity} of ${result.requested_quantity} pieces allocated`}
      >
        {result.allocations.map((a) => {
          const color = colors.get(a.supplier_organization_id);
          return (
            <div
              key={a.listing_id}
              className="flex h-full items-center justify-center overflow-hidden border-r border-cream-paper/80 font-mono text-xs font-medium tabular-nums"
              style={{
                width: `${(a.allocated_quantity / total) * 100}%`,
                background: color,
                color: supplierInk(color),
              }}
              title={`${a.supplier_name}: ${a.allocated_quantity} pcs`}
            >
              <span className="truncate px-2">{a.allocated_quantity}</span>
            </div>
          );
        })}
        {result.unfulfilled_quantity > 0 && (
          <div
            className="flex h-full items-center justify-center font-mono text-xs text-slate-700"
            style={{
              width: `${(result.unfulfilled_quantity / total) * 100}%`,
              background: `repeating-linear-gradient(135deg, ${PALETTE.paperStrong} 0 6px, ${PALETTE.paper} 6px 12px)`,
            }}
            title={`${result.unfulfilled_quantity} pcs unfulfilled`}
          >
            <span className="truncate px-2">{result.unfulfilled_quantity} short</span>
          </div>
        )}
      </div>
      <figcaption className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
        {Array.from(new Map(result.allocations.map((a) => [a.supplier_organization_id, a.supplier_name])).entries()).map(([id, name]) => (
          <span key={id} className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-xs" style={{ background: colors.get(id) }} aria-hidden /> {name}
          </span>
        ))}
        {result.unfulfilled_quantity > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 rounded-xs border border-graphite/20" style={{ background: PALETTE.paperStrong }} aria-hidden /> Unfulfilled
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function AllocationList({ result, colors }: { result: MatchResult; colors: Map<string, string> }) {
  return (
    <ol className="divide-y divide-graphite/10 border-y rule">
      {result.allocations.map((a, i) => (
        <li key={a.listing_id} className="grid gap-4 py-6 md:grid-cols-12 md:items-start">
          <div className="flex items-start gap-4 md:col-span-5">
            <span className="mt-1 font-mono text-xs text-copper-700">{String(i + 1).padStart(2, '0')}</span>
            <div className="min-w-0 space-y-1">
              <p className="flex items-center gap-2 text-lg font-medium tracking-[-0.02em] text-graphite">
                <span className="size-2.5 shrink-0 rounded-xs" style={{ background: colors.get(a.supplier_organization_id) }} aria-hidden />
                {a.supplier_name}
              </p>
              <p className="text-sm text-slate-600">
                {a.city} · <span className="font-mono tabular-nums">{a.distance_km} km</span> to buyer
              </p>
              <p className="text-sm text-slate-600">{a.technical_notes}</p>
            </div>
          </div>
          <dl className="grid grid-cols-3 gap-4 text-sm md:col-span-7">
            <Fact label="Quantity" value={`${num(a.allocated_quantity)} pcs`} />
            <Fact label="Material" value={bdt(a.subtotal_bdt)} note={`${bdt(a.unit_price_bdt)} / pc`} />
            <Fact
              label="Transport est."
              value={a.estimated_transport_bdt > 0 ? bdt(a.estimated_transport_bdt) : 'Shared'}
              note={a.estimated_transport_bdt > 0 ? 'One pickup' : 'Same supplier pickup'}
            />
          </dl>
        </li>
      ))}
    </ol>
  );
}

function OverBudget({ result }: { result: MatchResult }) {
  const alt = result.over_budget_alternative!;
  const qty = alt.reduce((s, a) => s + a.allocated_quantity, 0);
  return (
    <section className="space-y-3 border-l-2 border-brick-600 bg-brick-50/60 px-6 py-6" aria-label="Budget">
      <p className="t-eyebrow text-brick-700">Over budget</p>
      <p className="text-lg font-medium tracking-[-0.02em] text-brick-700">{result.budget.message}</p>
      <p className="max-w-3xl text-sm leading-relaxed text-graphite/85">
        Cheapest option considered: {alt.map((a) => `${a.allocated_quantity} from ${a.supplier_name}`).join(' + ')} ({qty} pcs,{' '}
        {bdt(result.budget.cheapest_estimated_cost_bdt ?? 0)} delivered). Raise the budget or reduce the quantity to proceed.
      </p>
    </section>
  );
}

/* ------------------------------------------------------------ baseline */

function BaselineCallout({ requirement, result }: Props) {
  const b = result.baseline;
  return (
    <section className="grid gap-6 border-y border-sand-300 bg-sand-100 px-6 py-6 text-graphite md:grid-cols-12" aria-label="Comparison with a name-only search">
      <div className="space-y-2 md:col-span-4">
        <p className="t-eyebrow text-slate-700">Versus a name-only search</p>
        <p className="text-3xl font-medium tabular-nums tracking-[-0.04em]">
          {b.incompatible_suggestion_ids.length} of {b.suggested_listing_ids.length}
        </p>
        <p className="text-sm text-slate-700">name matches would have been wrong</p>
      </div>
      <div className="space-y-2 text-sm leading-relaxed md:col-span-8">
        <p className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0 text-copper-700" aria-hidden />
          <span>{b.message}</span>
        </p>
        <p className="text-slate-700">
          A conventional listing search matches &ldquo;{SPEC_LABEL[requirement.material_specification] ?? requirement.material_specification}&rdquo; by name and would report{' '}
          {num(b.claimed_quantity)} pieces in stock. Meguri checks size, thickness, condition and reservations, and finds{' '}
          {num(result.evaluations.filter((e) => e.compatible).reduce((s, e) => s + e.available_quantity, 0))} usable pieces.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------- actions */

function ActionBar({ requirement, result }: Props) {
  const canRequest = result.allocations.length > 0;
  return (
    <section className="flex flex-col gap-4 border-t rule pt-8 sm:flex-row sm:items-center sm:justify-between">
      <p className="max-w-xl text-sm leading-relaxed text-slate-600">
        This is a proposal, not a reservation. Stock is re-checked and reserved only when each supplier accepts the exchange request.
      </p>
      <div className="flex flex-wrap items-start gap-3">
        <LinkButton href="/demand" variant="secondary">
          Back to requirements
        </LinkButton>
        {canRequest ? (
          <RequestExchangeButton requirementId={requirement.id} buyerOrganizationId={requirement.organization_id} className={t.btnPrimary} />
        ) : (
          <LinkButton
            href="/demand"
            variant="ink"
            aria-label={`Adjust requirement ${requirement.id}`}
            trailing={<ArrowRight className="size-4" aria-hidden />}
          >
            Adjust requirement
          </LinkButton>
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- bits */

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="space-y-1">
      <dt className="t-label">{label}</dt>
      <dd className="tabular-nums text-graphite">{value}</dd>
      {note && <dd className="text-xs text-slate-600">{note}</dd>}
    </div>
  );
}
