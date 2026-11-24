// ============================================================================
// /matches/[requirementId] — results view (Member 3). Server component.
// ============================================================================

import Link from 'next/link';
import { ArrowLeft, ArrowRight, Info } from 'lucide-react';
import type { MaterialRequirement } from '@/lib/types';
import { requirementSize } from '@/lib/dimensions';
import type { MatchResult } from '../types';
import { PALETTE, SPEC_LABEL, SUPPLIER_COLORS, bdt, num, t, unitNoun } from './theme';
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
    <div className="mx-auto max-w-7xl space-y-14 px-4 py-10 sm:px-6 lg:px-8 lg:py-14">
      <RequirementHeader requirement={requirement} />
      <ResultSummary requirement={requirement} result={result} />

      {result.allocations.length > 0 && (
        <section className="space-y-6" aria-labelledby="allocation-heading">
          <SectionTitle index="01" id="allocation-heading" title="Proposed allocation" hint="Cheapest estimated delivered cost among all supplier combinations." />
          <AllocationBar result={result} colors={supplierColor} />
          <AllocationList result={result} colors={supplierColor} />
        </section>
      )}

      {result.budget.status === 'OVER_BUDGET' && result.over_budget_alternative && (
        <OverBudget result={result} />
      )}

      <section className="space-y-6" aria-labelledby="why-heading">
        <SectionTitle
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

function RequirementHeader({ requirement: r }: { requirement: MaterialRequirement }) {
  const facts: [string, string][] = [
    ['Size', requirementSize(r)],
    ['Condition', r.condition_requirement === 'ANY' ? 'Any' : r.condition_requirement.toLowerCase()],
    ['Budget', r.maximum_budget_bdt == null ? 'No limit' : bdt(r.maximum_budget_bdt)],
    ['Sourcing', r.allow_split_suppliers ? 'Multi-supplier allowed' : 'Single supplier only'],
  ];
  return (
    <header className={`space-y-8 border-b pb-10 ${t.line}`}>
      <Link href="/demand" className={`inline-flex items-center gap-2 text-sm ${t.muted} transition-colors hover:text-[#1d1d1d]`}>
        <ArrowLeft className="size-4" /> Back to requirements
      </Link>
      <div className="space-y-4">
        <p className={`${t.eyebrow} ${t.muted}`}>
          Matching · {r.organization?.name ?? 'Buyer'} · <span className="normal-case">{r.id.slice(0, 8)}</span>
        </p>
        <h1 className={`text-4xl leading-[1.02] sm:text-6xl ${t.display}`}>
          {num(r.required_quantity)} × {SPEC_LABEL[r.material_specification] ?? r.material_specification}{' '}
          <span className="text-[#1d1d1d]/40">{unitNoun(r.material_family)}</span>
        </h1>
      </div>
      <dl className={`grid grid-cols-2 border-l border-t lg:grid-cols-4 ${t.line}`}>
        {facts.map(([k, v]) => (
          <div key={k} className={`space-y-1.5 border-b border-r px-5 py-4 ${t.line}`}>
            <dt className={`${t.eyebrow} ${t.faint}`}>{k}</dt>
            <dd className="text-[15px] first-letter:uppercase">{v}</dd>
          </div>
        ))}
      </dl>
    </header>
  );
}

/* ------------------------------------------------------------- summary */

const STATUS_COPY: Record<string, { label: string; tone: string }> = {
  EXACT_MATCH: { label: 'Fulfilled by one supplier', tone: 'bg-[#d4b48c]/30 text-[#5c3d1e]' },
  MULTI_SUPPLIER_MATCH: { label: 'Fulfilled by combining suppliers', tone: 'bg-[#d4b48c]/30 text-[#5c3d1e]' },
  PARTIAL_MATCH: { label: 'Partially fulfillable', tone: 'bg-amber-100 text-amber-900' },
  NO_MATCH: { label: 'No compatible stock', tone: 'bg-red-100/70 text-red-800' },
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
      <div className="flex flex-wrap items-center gap-3">
        <span className={`${t.eyebrow} inline-flex items-center gap-1.5 px-2.5 py-1.5 ${status.tone}`}>
          <span className="size-1.5 rounded-full bg-current" aria-hidden /> {status.label}
        </span>
        <span className={`${t.eyebrow} ${t.faint}`}>
          {result.allocation_method === 'EXHAUSTIVE_OPTIMAL'
            ? 'Optimal allocation · all combinations checked'
            : result.allocation_method === 'GREEDY'
              ? 'Greedy allocation (large candidate set)'
              : `Engine v${result.engine_version}`}
        </span>
      </div>
      <dl className={`grid grid-cols-2 border-l border-t bg-white lg:grid-cols-4 ${t.line}`}>
        {stats.map(([k, v, note]) => (
          <div key={k} className={`space-y-2 border-b border-r px-5 py-5 ${t.line}`}>
            <dt className={`${t.eyebrow} ${t.faint}`}>{k}</dt>
            <dd className={`text-2xl tabular-nums sm:text-3xl ${t.display}`}>{v}</dd>
            <dd className={`text-xs ${t.faint}`}>{note}</dd>
          </div>
        ))}
      </dl>
      <ul className="space-y-2">
        {/* The over-budget panel below already states the budget message. */}
        {result.compatibility_explanations.filter((line) => !overBudget || line !== result.budget.message).map((line, i) => (
          <li key={i} className={`flex gap-3 text-sm leading-relaxed ${t.muted}`}>
            <span className={`${t.mono} mt-[3px] text-[11px] ${t.accentText}`}>{String(i + 1).padStart(2, '0')}</span>
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
      <div className={`flex h-12 w-full overflow-hidden border ${t.line} bg-white`} role="img" aria-label={`${result.allocated_quantity} of ${result.requested_quantity} pieces allocated`}>
        {result.allocations.map((a) => (
          <div
            key={a.listing_id}
            className="flex h-full items-center justify-center overflow-hidden border-r border-white/70 text-xs font-medium"
            style={{
              width: `${(a.allocated_quantity / total) * 100}%`,
              background: colors.get(a.supplier_organization_id),
              color: ['#d4b48c', '#e8d5b9'].includes(colors.get(a.supplier_organization_id)!) ? PALETTE.ink : '#fff',
            }}
            title={`${a.supplier_name}: ${a.allocated_quantity} pcs`}
          >
            <span className="truncate px-2">{a.allocated_quantity}</span>
          </div>
        ))}
        {result.unfulfilled_quantity > 0 && (
          <div
            className={`flex h-full items-center justify-center text-xs ${t.muted}`}
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
      <figcaption className={`flex flex-wrap gap-x-5 gap-y-1 text-xs ${t.muted}`}>
        {Array.from(new Map(result.allocations.map((a) => [a.supplier_organization_id, a.supplier_name])).entries()).map(([id, name]) => (
          <span key={id} className="inline-flex items-center gap-2">
            <span className="size-2.5" style={{ background: colors.get(id) }} aria-hidden /> {name}
          </span>
        ))}
        {result.unfulfilled_quantity > 0 && (
          <span className="inline-flex items-center gap-2">
            <span className="size-2.5 border border-[#d8d4bb]" style={{ background: PALETTE.paperStrong }} aria-hidden /> Unfulfilled
          </span>
        )}
      </figcaption>
    </figure>
  );
}

function AllocationList({ result, colors }: { result: MatchResult; colors: Map<string, string> }) {
  return (
    <ol className={`divide-y border-y ${t.line} divide-[#d8d4bb]`}>
      {result.allocations.map((a, i) => (
        <li key={a.listing_id} className="grid gap-4 py-6 md:grid-cols-12 md:items-start">
          <div className="flex items-start gap-4 md:col-span-5">
            <span className={`${t.mono} mt-1 text-xs ${t.accentText}`}>{String(i + 1).padStart(2, '0')}</span>
            <div className="space-y-1">
              <p className="flex items-center gap-2 text-lg font-medium tracking-[-0.02em]">
                <span className="size-2.5 shrink-0" style={{ background: colors.get(a.supplier_organization_id) }} aria-hidden />
                {a.supplier_name}
              </p>
              <p className={`text-sm ${t.muted}`}>
                {a.city} · {a.distance_km} km to buyer
              </p>
              <p className={`text-sm ${t.muted}`}>{a.technical_notes}</p>
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
    <section className="space-y-3 border border-red-200 bg-red-50/60 px-6 py-6" aria-label="Budget">
      <p className={`${t.eyebrow} text-red-800`}>Over budget</p>
      <p className="text-lg font-medium tracking-[-0.02em] text-red-900">{result.budget.message}</p>
      <p className="text-sm text-red-900/80">
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
    <section className="grid gap-6 border border-[#6e6a55]/30 bg-[#e9e4cf] px-6 py-6 text-[#4f4a2e] md:grid-cols-12" aria-label="Comparison with a name-only search">
      <div className="space-y-2 md:col-span-4">
        <p className={t.eyebrow}>Versus a name-only search</p>
        <p className="text-3xl font-medium tracking-[-0.04em]">
          {b.incompatible_suggestion_ids.length} of {b.suggested_listing_ids.length}
        </p>
        <p className="text-sm text-[#4f4a2e]/80">name matches would have been wrong</p>
      </div>
      <div className="space-y-2 text-sm leading-relaxed md:col-span-8">
        <p className="flex gap-2">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>{b.message}</span>
        </p>
        <p className="text-[#4f4a2e]/80">
          A conventional listing search matches &ldquo;{SPEC_LABEL[requirement.material_specification] ?? requirement.material_specification}&rdquo; by name and would report{' '}
          {num(b.claimed_quantity)} pieces in stock. MONOLOOP checks size, thickness, condition and reservations, and finds{' '}
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
    <section className={`flex flex-col gap-4 border-t pt-8 sm:flex-row sm:items-center sm:justify-between ${t.line}`}>
      <p className={`max-w-xl text-sm ${t.muted}`}>
        This is a proposal, not a reservation. Stock is re-checked and reserved only when each supplier accepts the exchange request.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link href="/demand" className={t.btnSecondary}>
          Back to requirements
        </Link>
        {canRequest ? (
          <RequestExchangeButton
            requirementId={requirement.id}
            buyerOrganizationId={requirement.organization_id}
            className={t.btnInk}
          />
        ) : (
          <Link href="/demand" className={t.btnInk} aria-label={`Adjust requirement ${requirement.id}`}>
            Adjust requirement <ArrowRight className="size-4" />
          </Link>
        )}
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- bits */

function SectionTitle({ index, id, title, hint }: { index: string; id: string; title: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-2 md:flex-row md:items-baseline md:gap-6">
      <span className={`${t.mono} text-sm ${t.accentText}`}>{index}</span>
      <div className="space-y-1">
        <h2 id={id} className={`text-2xl sm:text-3xl ${t.heading}`}>
          {title}
        </h2>
        {hint && <p className={`text-sm ${t.muted}`}>{hint}</p>}
      </div>
    </div>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="space-y-1">
      <dt className={`${t.eyebrow} ${t.faint}`}>{label}</dt>
      <dd className="tabular-nums">{value}</dd>
      {note && <dd className={`text-xs ${t.faint}`}>{note}</dd>}
    </div>
  );
}
