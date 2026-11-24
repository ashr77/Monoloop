// ============================================================================
// MONOLOOP - Resource recovery dashboard (Member 4).
// Only COMPLETED exchanges are counted as reuse; reserved stock is "pipeline".
// ============================================================================

import { ArrowRight, Recycle } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Organization } from '@/lib/types';
import type { ImpactReport } from '../impact';
import { FAMILY_LABEL, bdt, num } from '@/features/exchanges/components/format';
import { EmptyState, FactList, LinkButton, MetricStrip, PageHeader } from '@/components/ui';
import { OrgScopeSelect } from './OrgScopeSelect';

interface Props {
  report: ImpactReport;
  organizations: Organization[];
  scopeName: string | null;
}

export function ImpactDashboard({ report, organizations, scopeName }: Props) {
  const { recovered, pipeline, inventory } = report;
  const empty = recovered.completed_exchanges === 0;

  return (
    <div className="page-shell pb-20">
      <PageHeader
        eyebrow="Resource recovery"
        title={scopeName ? `Impact: ${scopeName}` : 'Platform resource recovery'}
        actions={<OrgScopeSelect organizations={organizations} value={report.scope.organization_id} />}
      />

      <div className="space-y-14 pt-10">
        {/* Headline: completed reuse only */}
        <section aria-label="Confirmed reuse">
          <MetricStrip
            metrics={[
              {
                label: 'Value recovered',
                value: bdt(recovered.transferred_value_bdt),
                note: 'Material value at agreed unit prices',
                emphasis: true,
                tone: 'copper',
              },
              {
                label: 'Pieces reused',
                value: num(recovered.transferred_units),
                note: `${num(recovered.completed_exchanges)} completed exchange${recovered.completed_exchanges === 1 ? '' : 's'}`,
              },
              {
                label: 'Material diverted',
                value: `${num(recovered.estimated_mass_kg / 1000, 2)} t`,
                note: 'Indicative, from nominal dimensions',
              },
              {
                label: 'Requirements fulfilled',
                value: num(recovered.fulfilled_requirements),
                note: `${num(recovered.multi_supplier_exchanges)} combined multiple suppliers`,
              },
            ]}
          />
        </section>

        {empty && (
          <EmptyState
            icon={<Recycle className="size-6" aria-hidden />}
            title="No completed exchanges yet."
            description="Figures appear here only after a buyer confirms a transfer. Proposed or reserved stock is never counted as reuse."
            action={
              <LinkButton href="/exchanges" variant="secondary" size="sm" trailing={<ArrowRight className="size-3.5" aria-hidden />}>
                Open exchanges
              </LinkButton>
            }
          />
        )}

        {/* Breakdown */}
        {!empty && (
          <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
            <Block id="by-family" title="Reused by material">
              <BarList
                rows={report.by_family.map((f) => ({
                  key: f.material_family,
                  label: FAMILY_LABEL[f.material_family] ?? f.material_family,
                  value: f.value_bdt,
                  display: bdt(f.value_bdt),
                  detail: `${num(f.units)} pcs · ~${num(f.mass_kg, 0)} kg`,
                }))}
              />
            </Block>
            <Block id="by-supplier" title="Supplier contributions">
              <BarList
                rows={report.top_suppliers.map((s) => ({
                  key: s.organization_id,
                  label: s.name,
                  value: s.value_bdt,
                  display: bdt(s.value_bdt),
                  detail: `${num(s.units)} pcs · ${s.exchanges} exchange${s.exchanges === 1 ? '' : 's'}`,
                }))}
              />
            </Block>
          </div>
        )}

        {/* Pipeline & inventory */}
        <div className="grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2">
          <Block id="pipeline" title="In the pipeline">
            <FactList
              facts={[
                { label: 'Awaiting suppliers', value: <Figure>{num(pipeline.awaiting_suppliers)}</Figure> },
                { label: 'Reserved, awaiting transfer', value: <Figure>{num(pipeline.reserved_exchanges)}</Figure> },
                {
                  label: 'Pieces reserved',
                  value: <Figure>{num(pipeline.reserved_units)}</Figure>,
                  note: bdt(pipeline.reserved_value_bdt),
                },
                { label: 'Cancelled', value: <Figure>{num(pipeline.cancelled_exchanges)}</Figure> },
              ]}
            />
          </Block>
          <Block id="inventory" title="Surplus still available">
            <FactList
              facts={[
                { label: 'Active listings', value: <Figure>{num(inventory.active_listings)}</Figure> },
                { label: 'Pieces available', value: <Figure>{num(inventory.available_units)}</Figure> },
                { label: 'Pieces reserved', value: <Figure>{num(inventory.reserved_units)}</Figure> },
                { label: 'Available value', value: <Figure>{bdt(inventory.available_value_bdt)}</Figure> },
              ]}
            />
          </Block>
        </div>


      </div>
    </div>
  );
}

/** A titled group separated by a hairline rule (no card). */
function Block({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section aria-labelledby={`${id}-heading`} className="space-y-5 border-t rule pt-5">
      <div className="space-y-1">
        <h2 id={`${id}-heading`} className="text-base font-medium tracking-[-0.01em] text-graphite">
          {title}
        </h2>
        {subtitle && <p className="text-xs text-slate-600">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Figure({ children }: { children: ReactNode }) {
  return <span className="text-xl font-medium tabular-nums tracking-[-0.02em]">{children}</span>;
}

/** Single-series horizontal bars: copper on a sand track, figures always printed. */
function BarList({
  rows,
}: {
  rows: { key: string; label: string; value: number; display: string; detail: string }[];
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-600">No data in this scope yet.</p>;
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-4">
      {rows.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate font-medium text-graphite">{r.label}</span>
            <span className="shrink-0 font-mono tabular-nums text-graphite">{r.display}</span>
          </div>
          <div className="mt-1.5 h-1.5 w-full rounded-xs bg-sand-100" aria-hidden>
            <div className="h-1.5 rounded-xs bg-copper" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          <div className="mt-1 text-xs text-slate-600">{r.detail}</div>
        </li>
      ))}
    </ul>
  );
}
