'use client';

// ============================================================================
// MONOLOOP - Exchange coordination dashboard (Member 4)
// Buyers track requests, suppliers accept or decline their items, the buyer
// confirms the transfer. "Acting as" is the demo identity sent to the API.
// ============================================================================

import Link from 'next/link';
import { requirementSize } from '@/lib/dimensions';
import { useIdentity } from '@/lib/auth/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  Building2,
  Check,
  CheckCircle2,
  ChevronDown,
  CreditCard,
  Info,
  Loader2,
  PackageCheck,
  RefreshCw,
  Undo2,
  X,
} from 'lucide-react';
import type { Organization } from '@/lib/types';
import type { ExchangeAction, ExchangeStage, ExchangeView } from '../types';
import { useExchangeAction, useExchanges, useOrganizations, useStartPayment } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import {
  ACTIVITY_LABEL,
  ITEM_STATUS_META,
  SPEC_LABEL,
  STAGE_META,
  bdt,
  dims,
  formatDate,
  num,
} from './format';

type Filter = 'ACTIVE' | 'COMPLETED' | 'CANCELLED' | 'ALL';

const FILTERS: { id: Filter; label: string; stages: ExchangeStage[] }[] = [
  { id: 'ACTIVE', label: 'Active', stages: ['AWAITING_SUPPLIERS', 'SUPPLIER_DECLINED', 'RESERVED'] },
  { id: 'COMPLETED', label: 'Completed', stages: ['COMPLETED'] },
  { id: 'CANCELLED', label: 'Cancelled', stages: ['CANCELLED'] },
  { id: 'ALL', label: 'All', stages: ['AWAITING_SUPPLIERS', 'SUPPLIER_DECLINED', 'RESERVED', 'COMPLETED', 'CANCELLED'] },
];

interface Toast {
  kind: 'success' | 'error';
  message: string;
}

export function ExchangesDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const identity = useIdentity();
  // Signed in: always the company itself (admins: everything, read-only). Demo: the ?as= switcher.
  const actingAs = identity.locked ? identity.organizationId ?? 'ALL' : searchParams.get('as') ?? 'ALL';
  const highlight = searchParams.get('highlight');

  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);

  // Data comes from the FastAPI backend through cached hooks (src/hooks).
  const exchangesQuery = useExchanges(actingAs !== 'ALL' ? { organization_id: actingAs } : {});
  const exchanges = useMemo(() => exchangesQuery.data ?? [], [exchangesQuery.data]);
  const loading = exchangesQuery.isPending;
  const loadError = exchangesQuery.isError ? errorMessage(exchangesQuery.error, 'Failed to load exchanges') : null;
  const load = () => void exchangesQuery.refetch();
  const orgsData = useOrganizations().data;
  const organizations = useMemo(() => orgsData ?? [], [orgsData]);
  const exchangeAction = useExchangeAction();
  const startPayment = useStartPayment();

  // Back from the payment gateway: the backend has validated the payment and adds ?payment=…
  const paymentReturn = searchParams.get('payment');
  useEffect(() => {
    if (!paymentReturn) return;
    const messages: Record<string, Toast> = {
      success: { kind: 'success', message: 'Payment received and verified. You can now confirm the transfer.' },
      failed: { kind: 'error', message: 'Payment failed or could not be verified. No money was recorded; you can try again.' },
      cancelled: { kind: 'error', message: 'Payment cancelled. You can pay again whenever you are ready.' },
      invalid: { kind: 'error', message: 'Unknown payment reference. Please try again.' },
    };
    setToast(messages[paymentReturn] ?? messages.invalid);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('payment');
    router.replace(`/exchanges${params.size ? `?${params}` : ''}`, { scroll: false });
  }, [paymentReturn, searchParams, router]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // When arriving from "Request exchange", show the new request even if the filter would hide it.
  useEffect(() => {
    if (highlight) setFilter('ACTIVE');
  }, [highlight]);

  // Organizations known to the API plus any that appear in exchanges.
  const orgOptions = useMemo(() => {
    const map = new Map<string, Organization>();
    for (const o of organizations) map.set(o.id, o);
    for (const ex of exchanges) {
      if (ex.buyer) map.set(ex.buyer.id, ex.buyer);
      for (const i of ex.items) if (i.supplier) map.set(i.supplier.id, i.supplier);
    }
    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [organizations, exchanges]);

  const orgName = (id: string) => orgOptions.find((o) => o.id === id)?.name ?? 'organization';

  function setActingAs(id: string) {
    const params = new URLSearchParams();
    if (id !== 'ALL') params.set('as', id);
    router.replace(`/exchanges${params.size ? `?${params}` : ''}`, { scroll: false });
  }

  async function act(ex: ExchangeView, action: ExchangeAction, itemId?: string) {
    if (actingAs === 'ALL') return;
    setBusy(`${ex.id}:${action}:${itemId ?? ''}`);
    try {
      await exchangeAction.mutateAsync({ exchangeId: ex.id, action, organizationId: actingAs, itemId });
      const messages: Record<ExchangeAction, string> = {
        accept: 'Accepted. Stock is now reserved for this buyer.',
        reject: 'Declined. The buyer has been notified on this exchange.',
        complete: 'Transfer confirmed. Inventory and impact figures are updated.',
        cancel: 'Exchange cancelled. Any reserved stock was released.',
      };
      setToast({ kind: 'success', message: messages[action] });
    } catch (error) {
      setToast({ kind: 'error', message: errorMessage(error, 'Action failed.') });
    } finally {
      setBusy(null);
    }
  }

  async function pay(ex: ExchangeView) {
    if (actingAs === 'ALL') return;
    setBusy(`${ex.id}:pay:`);
    try {
      const session = await startPayment.mutateAsync({ exchangeId: ex.id, organizationId: actingAs });
      window.location.assign(session.gateway_url); // SSLCommerz checkout page
    } catch (error) {
      setToast({ kind: 'error', message: errorMessage(error, 'Could not start the payment.') });
      setBusy(null);
    }
  }

  const stats = useMemo(() => {
    const by = (s: ExchangeStage) => exchanges.filter((e) => e.stage === s).length;
    const reservedUnits = exchanges
      .filter((e) => e.status === 'PROPOSED' || e.status === 'IN_PROGRESS')
      .flatMap((e) => e.items)
      .filter((i) => i.status === 'ACCEPTED')
      .reduce((s, i) => s + i.quantity, 0);
    return {
      awaiting: by('AWAITING_SUPPLIERS') + by('SUPPLIER_DECLINED'),
      reserved: by('RESERVED'),
      completed: by('COMPLETED'),
      cancelled: by('CANCELLED'),
      reservedUnits,
    };
  }, [exchanges]);

  const visible = exchanges.filter((e) => FILTERS.find((f) => f.id === filter)!.stages.includes(e.stage));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 max-w-sm px-4 py-3 rounded-xl shadow-lg flex items-start gap-2 text-sm text-white ${
            toast.kind === 'success' ? 'bg-emerald-700' : 'bg-red-700'
          }`}
        >
          {toast.kind === 'success' ? (
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 flex-shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}

      {/* Header & identity switcher */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Exchange Coordination
            </span>
            <span className="text-xs text-slate-400 font-mono">TSUNAGU Hackathon 2026</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Exchange Requests &amp; Reservations
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Suppliers accept their share, stock is reserved atomically, and the buyer confirms the transfer.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {identity.locked ? (
            <span className="flex items-center gap-2 bg-slate-100 px-3 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-800">
              <Building2 className="w-4 h-4 text-slate-500" />
              {identity.organization?.name ?? 'Admin · all exchanges (read-only)'}
            </span>
          ) : (
          <label className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
            <Building2 className="w-4 h-4 text-slate-500 ml-1.5" />
            <span className="sr-only">Acting as</span>
            <select
              value={actingAs}
              onChange={(e) => setActingAs(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-2 max-w-[18rem]"
            >
              <option value="ALL">All organizations (view only)</option>
              {orgOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  Acting as: {o.name}
                </option>
              ))}
            </select>
          </label>
          )}
          <button
            onClick={load}
            disabled={loading}
            className="p-2 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs flex items-center gap-1 transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* Workflow note */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-3">
        <Info className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            <strong>Requested → Accepted → Reserved → Completed.</strong> A match is only a proposal. Stock is re-checked and
            reserved in a single database transaction when each supplier accepts, so the same pieces can never be promised
            twice. Cancelling releases reservations; completing deducts inventory exactly once.
          </p>
          {actingAs === 'ALL' && !identity.locked && (
            <p className="font-semibold">Choose an organization in &ldquo;Acting as&rdquo; to accept, decline, complete or cancel.</p>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat label="Awaiting suppliers" value={stats.awaiting} note="Requested, not yet reserved" />
        <Stat label="Reserved" value={stats.reserved} note="Ready for transfer" />
        <Stat label="Reserved pieces" value={stats.reservedUnits} note="Held by accepted items" />
        <Stat label="Completed" value={stats.completed} note="Counted as reuse" />
        <Stat label="Cancelled" value={stats.cancelled} note="Reservations released" />
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter exchanges">
        {FILTERS.map((f) => {
          const count = exchanges.filter((e) => f.stages.includes(e.stage)).length;
          return (
            <button
              key={f.id}
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                filter === f.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {f.label} <span className="opacity-70">({count})</span>
            </button>
          );
        })}
      </div>

      {/* List */}
      {loading && exchanges.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <Loader2 className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">Loading exchanges…</p>
        </div>
      ) : loadError ? (
        <div className="p-8 text-center bg-white rounded-2xl border border-red-200 text-red-700 space-y-3">
          <AlertTriangle className="w-8 h-8 mx-auto" />
          <p className="text-sm">{loadError}</p>
          <button onClick={load} className="text-sm font-semibold underline">
            Try again
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-dashed border-slate-300 space-y-3">
          <ArrowLeftRight className="w-8 h-8 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-700">No {filter === 'ALL' ? '' : filter.toLowerCase() + ' '}exchanges yet.</p>
          <p className="text-sm text-slate-500">
            Open a requirement&rsquo;s matches and choose <strong>Request exchange</strong> to start one.
          </p>
          <Link href="/demand" className="inline-flex text-sm font-semibold text-emerald-700 hover:underline">
            Go to buyer requirements →
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {visible.map((ex) => (
            <ExchangeCard
              key={ex.id}
              ex={ex}
              actingAs={actingAs}
              highlighted={ex.id === highlight}
              busy={busy}
              onAct={act}
              onPay={pay}
              onSwitch={identity.locked ? undefined : setActingAs}
              orgName={orgName}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm space-y-1">
      <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="text-2xl font-extrabold text-slate-900 tabular-nums">{num(value)}</div>
      <div className="text-xs text-slate-500">{note}</div>
    </div>
  );
}

const STEPS = ['Requested', 'Suppliers accepted', 'Reserved', 'Completed'];

function stepIndex(ex: ExchangeView): number {
  if (ex.stage === 'COMPLETED') return 4;
  if (ex.stage === 'RESERVED') return 3;
  if (ex.counts.accepted > 0) return 2;
  return 1;
}

function Stepper({ ex }: { ex: ExchangeView }) {
  const done = stepIndex(ex);
  const halted = ex.stage === 'CANCELLED' || ex.stage === 'SUPPLIER_DECLINED';
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label="Exchange progress">
      {STEPS.map((label, i) => {
        const reached = i < done && ex.stage !== 'CANCELLED';
        return (
          <li key={label} className="space-y-1.5">
            <div
              className={`h-1.5 rounded-full ${
                reached ? (halted ? 'bg-slate-400' : 'bg-emerald-600') : 'bg-slate-200'
              }`}
            />
            <div className={`text-[11px] font-medium ${reached ? 'text-slate-800' : 'text-slate-400'}`}>
              {i === 1 && ex.items.length > 0 ? `${label} (${ex.counts.accepted + ex.counts.completed}/${ex.items.length})` : label}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

interface CardProps {
  ex: ExchangeView;
  actingAs: string;
  highlighted: boolean;
  busy: string | null;
  onAct: (ex: ExchangeView, action: ExchangeAction, itemId?: string) => void;
  onPay: (ex: ExchangeView) => void;
  /** Demo only: jump to another organization's view. Absent when signed in. */
  onSwitch?: (orgId: string) => void;
  orgName: (id: string) => string;
}

function ExchangeCard({ ex, actingAs, highlighted, busy, onAct, onPay, onSwitch, orgName }: CardProps) {
  const req = ex.requirement;
  const stage = STAGE_META[ex.stage];
  const isBuyer = actingAs === ex.buyer_organization_id;
  const supplierIds = new Set(ex.items.map((i) => i.supplier_organization_id));
  const role = isBuyer ? 'Buyer' : supplierIds.has(actingAs) ? 'Supplier' : null;
  const active = ex.stage !== 'COMPLETED' && ex.stage !== 'CANCELLED';
  const isBusy = (action: string, itemId = '') => busy === `${ex.id}:${action}:${itemId}`;
  const anyBusy = busy?.startsWith(ex.id) ?? false;
  const paid = ex.payment?.status === 'PAID';
  const needsPayment = Boolean(ex.payment_required) && !paid;

  return (
    <article
      className={`bg-white rounded-2xl border shadow-sm overflow-hidden ${
        highlighted ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-slate-200'
      }`}
      aria-labelledby={`ex-${ex.id}`}
    >
      {/* Header */}
      <div className="p-5 border-b border-slate-100 flex flex-col lg:flex-row lg:items-start justify-between gap-4">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${stage.className}`}>{stage.label}</span>
            {role && (
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-900 text-white">You: {role}</span>
            )}
            {paid && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border bg-emerald-50 text-emerald-800 border-emerald-200">
                <CreditCard className="w-3 h-3" /> Paid{ex.payment?.card_type ? ` · ${ex.payment.card_type}` : ''}
              </span>
            )}
            <span className="text-xs text-slate-400 font-mono">#{ex.id.slice(0, 8)}</span>
          </div>
          <h2 id={`ex-${ex.id}`} className="text-lg font-bold text-slate-900">
            {num(ex.total_quantity)} × {req ? SPEC_LABEL[req.material_specification] ?? req.material_specification : 'material'}{' '}
            <span className="font-normal text-slate-500">{req ? requirementSize(req, '×') : ''}</span>
          </h2>
          <p className="text-sm text-slate-500">
            Buyer <strong className="text-slate-700">{ex.buyer?.name ?? orgName(ex.buyer_organization_id)}</strong>
            {ex.buyer?.city ? ` · ${ex.buyer.city}` : ''} · requested {formatDate(ex.created_at)}
            {req && ex.total_quantity < req.required_quantity && (
              <> · partial ({num(ex.total_quantity)} of {num(req.required_quantity)} needed)</>
            )}
          </p>
        </div>
        <div className="text-left lg:text-right shrink-0">
          <div className="text-xs uppercase tracking-wider text-slate-500 font-semibold">Material value</div>
          <div className="text-xl font-extrabold text-slate-900 tabular-nums">{bdt(ex.total_value_bdt)}</div>
          <div className="text-xs text-slate-500">
            {ex.items.length} supplier item{ex.items.length === 1 ? '' : 's'} · excl. transport
          </div>
        </div>
      </div>

      <div className="px-5 pt-4">
        <Stepper ex={ex} />
      </div>

      {ex.stage === 'SUPPLIER_DECLINED' && (
        <div className="mx-5 mt-4 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            A supplier declined, so this exchange can&rsquo;t be completed. The buyer should cancel it to release any reserved
            stock, then request again from the matches page.
          </span>
        </div>
      )}

      {/* Items */}
      <div className="p-5 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wider text-slate-500 border-b border-slate-200">
              <th className="py-2 pr-4 font-semibold">Supplier</th>
              <th className="py-2 pr-4 font-semibold">Listing</th>
              <th className="py-2 pr-4 font-semibold text-right">Qty</th>
              <th className="py-2 pr-4 font-semibold text-right">Unit</th>
              <th className="py-2 pr-4 font-semibold text-right">Subtotal</th>
              <th className="py-2 pr-4 font-semibold">Status</th>
              <th className="py-2 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {ex.items.map((item) => {
              const meta = ITEM_STATUS_META[item.status];
              const mine = actingAs === item.supplier_organization_id;
              const canRespond = item.status === 'PENDING' && ex.status === 'PROPOSED';
              return (
                <tr key={item.id} className="border-b border-slate-100 last:border-0 align-top">
                  <td className="py-3 pr-4">
                    <div className="font-semibold text-slate-800">{item.supplier?.name ?? orgName(item.supplier_organization_id)}</div>
                    <div className="text-xs text-slate-500">{item.listing?.city ?? item.supplier?.city}</div>
                  </td>
                  <td className="py-3 pr-4 text-slate-600">
                    <div>{item.listing ? SPEC_LABEL[item.listing.material_specification] ?? item.listing.material_specification : '—'}</div>
                    <div className="text-xs text-slate-500">
                      {dims(item.listing)} · {item.listing?.condition?.toLowerCase()}
                    </div>
                    {item.listing && item.status === 'PENDING' && (
                      <div className="text-xs text-slate-500">Available now: {num(item.listing.available_quantity)}</div>
                    )}
                  </td>
                  <td className="py-3 pr-4 text-right font-semibold tabular-nums">{num(item.quantity)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{bdt(item.unit_price_bdt)}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{bdt(item.subtotal_bdt)}</td>
                  <td className={`py-3 pr-4 font-medium ${meta.className}`}>{meta.label}</td>
                  <td className="py-3 text-right whitespace-nowrap">
                    {canRespond && mine ? (
                      <div className="inline-flex gap-2">
                        <button
                          onClick={() => onAct(ex, 'accept', item.id)}
                          disabled={anyBusy}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold"
                        >
                          {isBusy('accept', item.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                          Accept &amp; reserve
                        </button>
                        <button
                          onClick={() => onAct(ex, 'reject', item.id)}
                          disabled={anyBusy}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-bold"
                        >
                          {isBusy('reject', item.id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          Decline
                        </button>
                      </div>
                    ) : canRespond && onSwitch ? (
                      <button
                        onClick={() => onSwitch(item.supplier_organization_id)}
                        className="text-xs font-semibold text-emerald-700 hover:underline"
                        title="Demo: switch identity to this supplier"
                      >
                        Act as this supplier →
                      </button>
                    ) : (
                      <span className="text-xs text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Buyer actions */}
      {active && (
        <div className="px-5 py-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            {ex.stage === 'RESERVED' && needsPayment
              ? `All suppliers accepted and the stock is reserved. Pay ${bdt(ex.total_value_bdt)} securely with SSLCommerz, then confirm the transfer.`
              : ex.stage === 'RESERVED' && paid
              ? `Paid ${bdt(ex.payment!.amount_bdt)} (ref ${ex.payment!.tran_id}). Confirm once the materials have been handed over.`
              : ex.stage === 'RESERVED'
              ? 'All suppliers accepted and the stock is reserved. Confirm once the materials have been handed over.'
              : ex.stage === 'SUPPLIER_DECLINED'
                ? 'Cancel to release the stock other suppliers reserved.'
                : `Waiting for ${ex.counts.pending} supplier response${ex.counts.pending === 1 ? '' : 's'}.`}
          </p>
          {isBuyer ? (
            <div className="flex gap-2">
              <button
                onClick={() => onAct(ex, 'cancel')}
                disabled={anyBusy || paid}
                title={paid ? 'Paid exchanges cannot be cancelled (refunds are not supported in this prototype)' : undefined}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 disabled:opacity-60 text-slate-700 text-xs font-bold"
              >
                {isBusy('cancel') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Undo2 className="w-3.5 h-3.5" />}
                Cancel exchange
              </button>
              {ex.stage === 'RESERVED' && needsPayment && (
                <button
                  onClick={() => onPay(ex)}
                  disabled={anyBusy}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold"
                >
                  {isBusy('pay') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CreditCard className="w-3.5 h-3.5" />}
                  Pay {bdt(ex.total_value_bdt)}
                </button>
              )}
              <button
                onClick={() => onAct(ex, 'complete')}
                disabled={anyBusy || ex.stage !== 'RESERVED' || needsPayment}
                title={
                  ex.stage !== 'RESERVED' ? 'Every supplier must accept first' : needsPayment ? 'Pay for the exchange first' : undefined
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white text-xs font-bold"
              >
                {isBusy('complete') ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PackageCheck className="w-3.5 h-3.5" />}
                Confirm transfer
              </button>
            </div>
          ) : onSwitch ? (
            <button
              onClick={() => onSwitch(ex.buyer_organization_id)}
              className="text-xs font-semibold text-emerald-700 hover:underline self-start sm:self-auto"
              title="Demo: switch identity to the buyer"
            >
              Act as buyer →
            </button>
          ) : null}
        </div>
      )}

      {/* Activity */}
      <details className="group border-t border-slate-100">
        <summary className="px-5 py-3 text-xs font-semibold text-slate-600 cursor-pointer flex items-center gap-1.5 list-none">
          <ChevronDown className="w-3.5 h-3.5 transition group-open:rotate-180" />
          Activity log ({ex.activity.length})
        </summary>
        <ol className="px-5 pb-4 space-y-2">
          {ex.activity.map((log) => {
            const actor = log.details?.actor_organization_id as string | undefined;
            return (
              <li key={log.id} className="text-xs text-slate-600 flex gap-3">
                <span className="font-mono text-slate-400 shrink-0">{formatDate(log.created_at)}</span>
                <span>
                  {ACTIVITY_LABEL[log.action] ?? log.action}
                  {actor ? <span className="text-slate-400"> · {orgName(actor)}</span> : null}
                  {typeof log.details?.quantity === 'number' ? (
                    <span className="text-slate-400"> · {num(log.details.quantity as number)} pcs</span>
                  ) : null}
                  {typeof log.details?.released_quantity === 'number' && (log.details.released_quantity as number) > 0 ? (
                    <span className="text-slate-400"> · {num(log.details.released_quantity as number)} pcs released</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </details>
    </article>
  );
}
