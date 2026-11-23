// ============================================================================
// MONOLOOP - Resource recovery dashboard (Member 4). Server component.
// Only COMPLETED exchanges are counted as reuse; reserved stock is "pipeline".
// ============================================================================

import Link from 'next/link';
import { Activity, ArrowRight, Info, Recycle } from 'lucide-react';
import type { Organization } from '@/lib/types';
import type { ImpactReport } from '../impact';
import { FAMILY_LABEL, bdt, formatDate, num } from '@/features/exchanges/components/format';
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Header */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Resource Recovery
            </span>
            <span className="text-xs text-slate-400 font-mono">TSUNAGU Hackathon 2026</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            {scopeName ? `Impact: ${scopeName}` : 'Platform Resource Recovery'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Materials that moved from one business&rsquo;s surplus into another&rsquo;s production.
          </p>
        </div>
        <OrgScopeSelect organizations={organizations} value={report.scope.organization_id} />
      </div>

      {/* Headline: completed reuse only */}
      <section aria-labelledby="recovered-heading" className="space-y-3">
        <h2 id="recovered-heading" className="text-sm font-bold uppercase tracking-wider text-slate-500">
          Confirmed reuse
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Tile label="Value recovered" value={bdt(recovered.transferred_value_bdt)} note="Material value at agreed unit prices" strong />
          <Tile label="Pieces reused" value={num(recovered.transferred_units)} note={`${num(recovered.completed_exchanges)} completed exchange${recovered.completed_exchanges === 1 ? '' : 's'}`} />
          <Tile label="Material diverted" value={`${num(recovered.estimated_mass_kg / 1000, 2)} t`} note="Indicative, from nominal dimensions" />
          <Tile
            label="Requirements fulfilled"
            value={num(recovered.fulfilled_requirements)}
            note={`${num(recovered.multi_supplier_exchanges)} combined multiple suppliers`}
          />
        </div>
      </section>

      {empty && (
        <div className="p-6 bg-white rounded-2xl border border-dashed border-slate-300 text-center space-y-2">
          <Recycle className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No completed exchanges yet.</p>
          <p className="text-sm text-slate-500">
            Figures appear here only after a buyer confirms a transfer. Proposed or reserved stock is never counted as reuse.
          </p>
          <Link href="/exchanges" className="inline-flex items-center gap-1 text-sm font-semibold text-emerald-700 hover:underline">
            Open exchanges <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      )}

      {/* Breakdown */}
      {!empty && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Panel title="Reused by material" subtitle="Value recovered (BDT)">
            <BarList
              rows={report.by_family.map((f) => ({
                key: f.material_family,
                label: FAMILY_LABEL[f.material_family] ?? f.material_family,
                value: f.value_bdt,
                display: bdt(f.value_bdt),
                detail: `${num(f.units)} pcs · ~${num(f.mass_kg, 0)} kg`,
              }))}
            />
          </Panel>
          <Panel title="Supplier contributions" subtitle="Value of surplus each supplier put back into use (BDT)">
            <BarList
              rows={report.top_suppliers.map((s) => ({
                key: s.organization_id,
                label: s.name,
                value: s.value_bdt,
                display: bdt(s.value_bdt),
                detail: `${num(s.units)} pcs · ${s.exchanges} exchange${s.exchanges === 1 ? '' : 's'}`,
              }))}
            />
          </Panel>
        </div>
      )}

      {/* Pipeline & inventory */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Panel title="In the pipeline" subtitle="Not yet counted as reuse">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Awaiting suppliers" value={num(pipeline.awaiting_suppliers)} />
            <Fact label="Reserved, awaiting transfer" value={num(pipeline.reserved_exchanges)} />
            <Fact label="Pieces reserved" value={num(pipeline.reserved_units)} note={bdt(pipeline.reserved_value_bdt)} />
            <Fact label="Cancelled" value={num(pipeline.cancelled_exchanges)} />
          </dl>
        </Panel>
        <Panel title="Surplus still available" subtitle="Active listings right now">
          <dl className="grid grid-cols-2 gap-4">
            <Fact label="Active listings" value={num(inventory.active_listings)} />
            <Fact label="Pieces available" value={num(inventory.available_units)} />
            <Fact label="Pieces reserved" value={num(inventory.reserved_units)} />
            <Fact label="Available value" value={bdt(inventory.available_value_bdt)} />
          </dl>
        </Panel>
      </div>

      {/* Recent completed */}
      {!empty && (
        <Panel title="Recently completed exchanges">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
                  <th className="py-2 pr-4 font-semibold">Completed</th>
                  <th className="py-2 pr-4 font-semibold">Buyer</th>
                  <th className="py-2 pr-4 font-semibold">Material</th>
                  <th className="py-2 pr-4 font-semibold">Suppliers</th>
                  <th className="py-2 pr-4 font-semibold text-right">Pieces</th>
                  <th className="py-2 font-semibold text-right">Value</th>
                </tr>
              </thead>
              <tbody>
                {report.recent_completed.map((r) => (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2.5 pr-4 text-slate-500 whitespace-nowrap">{formatDate(r.completed_at)}</td>
                    <td className="py-2.5 pr-4 font-medium text-slate-800">{r.buyer_name}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.material}</td>
                    <td className="py-2.5 pr-4 text-slate-600">{r.suppliers.join(', ')}</td>
                    <td className="py-2.5 pr-4 text-right tabular-nums">{num(r.units)}</td>
                    <td className="py-2.5 text-right tabular-nums font-semibold">{bdt(r.value_bdt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      )}

      {/* Assumptions */}
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-3">
        <Info className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <strong>How these figures are calculated</strong>
          <ul className="mt-1 list-disc pl-4 space-y-0.5">
            {report.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Tile({ label, value, note, strong }: { label: string; value: string; note: string; strong?: boolean }) {
  return (
    <div className={`p-5 rounded-xl border shadow-sm space-y-1 ${strong ? 'bg-emerald-700 border-emerald-700' : 'bg-white border-slate-200'}`}>
      <div className={`text-xs font-semibold uppercase tracking-wider ${strong ? 'text-emerald-100' : 'text-slate-500'}`}>{label}</div>
      <div className={`text-2xl sm:text-3xl font-extrabold tabular-nums ${strong ? 'text-white' : 'text-slate-900'}`}>{value}</div>
      <div className={`text-xs ${strong ? 'text-emerald-100' : 'text-slate-500'}`}>{note}</div>
    </div>
  );
}

function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
      <div>
        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
          <Activity className="w-4 h-4 text-emerald-600" />
          {title}
        </h3>
        {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div>
      <dt className="text-xs text-slate-500">{label}</dt>
      <dd className="text-xl font-bold text-slate-900 tabular-nums">{value}</dd>
      {note && <dd className="text-xs text-slate-500">{note}</dd>}
    </div>
  );
}

/** Single-series horizontal bars: one hue, values in text colour, figures always printed. */
function BarList({
  rows,
}: {
  rows: { key: string; label: string; value: number; display: string; detail: string }[];
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.key} title={`${r.label}: ${r.display} · ${r.detail}`}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="font-medium text-slate-800 truncate">{r.label}</span>
            <span className="font-semibold text-slate-900 tabular-nums shrink-0">{r.display}</span>
          </div>
          <div className="mt-1 h-2 w-full rounded bg-slate-100" aria-hidden>
            <div className="h-2 rounded bg-emerald-600" style={{ width: `${Math.max(2, (r.value / max) * 100)}%` }} />
          </div>
          <div className="mt-0.5 text-xs text-slate-500">{r.detail}</div>
        </li>
      ))}
    </ul>
  );
}
