'use client';

// ============================================================================
// MONOLOOP - Exchange coordination dashboard (Member 4)
// Buyers track requests, suppliers accept or decline their items, the buyer
// confirms the transfer. "Acting as" is the demo identity sent to the API.
// ============================================================================

import { requirementSize } from '@/lib/dimensions';
import { useIdentity } from '@/lib/auth/AuthProvider';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  ArrowRight,
  ArrowUpDown,
  Building2,
  Check,
  ChevronDown,
  CreditCard,
  PackageCheck,
  RefreshCw,
  Undo2,
  X,
} from 'lucide-react';
import type { Organization } from '@/lib/types';
import type { ExchangeAction, ExchangeStage, ExchangeView } from '../types';
import { useExchangeAction, useExchanges, useOrganizations, useStartPayment } from '@/hooks';
import { usePersistentState, useIncremental, sortBy } from '@/hooks/useViewPrefs';
import { errorMessage } from '@/lib/api/client';
import { cn } from '@/lib/utils';
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadMore,
  MetricStrip,
  Note,
  PageHeader,
  Segmented,
  StatusBadge,
  TableSkeleton,
  Tag,
  Toast,
  ToolbarSelect,
  type ToastMessage,
} from '@/components/ui';
import { AnimatePresence, motion, rowMotion, useReducedMotion } from '@/components/motion';
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
type Sort = 'newest' | 'oldest' | 'value';

const FILTERS: { id: Filter; label: string; stages: ExchangeStage[] }[] = [
  { id: 'ACTIVE', label: 'Active', stages: ['AWAITING_SUPPLIERS', 'SUPPLIER_DECLINED', 'RESERVED'] },
  { id: 'COMPLETED', label: 'Completed', stages: ['COMPLETED'] },
  { id: 'CANCELLED', label: 'Cancelled', stages: ['CANCELLED'] },
  { id: 'ALL', label: 'All', stages: ['AWAITING_SUPPLIERS', 'SUPPLIER_DECLINED', 'RESERVED', 'COMPLETED', 'CANCELLED'] },
];

const SORTS: { id: Sort; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'value', label: 'Highest value' },
];

const PAGE_SIZE = 8;

/** An action that needs an explicit confirmation before it is sent. */
interface PendingConfirm {
  ex: ExchangeView;
  action: Extract<ExchangeAction, 'complete' | 'cancel' | 'reject'>;
  itemId?: string;
}

export function ExchangesDashboard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const identity = useIdentity();
  const reduceMotion = useReducedMotion();
  // Signed in: always the company itself (admins: everything, read-only). Demo: the ?as= switcher.
  const actingAs = identity.locked ? identity.organizationId ?? 'ALL' : searchParams.get('as') ?? 'ALL';
  const highlight = searchParams.get('highlight');

  const [filter, setFilter] = usePersistentState<Filter>('exchanges.filter', 'ACTIVE');
  const [sort, setSort] = usePersistentState<Sort>('exchanges.sort', 'newest');
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);

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
    const messages: Record<string, ToastMessage> = {
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

  // When arriving from "Request exchange", show the new request even if the filter would hide it.
  useEffect(() => {
    if (highlight) setFilter('ACTIVE');
  }, [highlight, setFilter]);

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

  async function runConfirmed() {
    if (!confirm) return;
    await act(confirm.ex, confirm.action, confirm.itemId);
    setConfirm(null);
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

  // Filter → sort → (pin the highlighted request on top so it is never hidden behind "Load more").
  const ordered = useMemo(() => {
    const stages = FILTERS.find((f) => f.id === filter)!.stages;
    const filtered = exchanges.filter((e) => stages.includes(e.stage));
    const sorted =
      sort === 'value'
        ? sortBy(filtered, (e) => e.total_value_bdt, 'desc')
        : sortBy(filtered, (e) => new Date(e.created_at).getTime(), sort === 'oldest' ? 'asc' : 'desc');
    if (!highlight) return sorted;
    const hit = sorted.find((e) => e.id === highlight);
    return hit ? [hit, ...sorted.filter((e) => e.id !== highlight)] : sorted;
  }, [exchanges, filter, sort, highlight]);

  const page = useIncremental(ordered, PAGE_SIZE, `${filter}:${sort}:${actingAs}`);

  // Bring the highlighted request into view once, after it has rendered.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!highlight || loading || scrolledFor.current === highlight) return;
    const el = document.getElementById(`exchange-${highlight}`);
    if (!el) return;
    scrolledFor.current = highlight;
    const raf = requestAnimationFrame(() =>
      el.scrollIntoView({ block: 'center', behavior: reduceMotion ? 'auto' : 'smooth' })
    );
    return () => cancelAnimationFrame(raf);
  }, [highlight, loading, page.visible, reduceMotion]);

  // Keep the last request's copy while the dialog animates out.
  const lastConfirm = useRef<PendingConfirm | null>(null);
  if (confirm) lastConfirm.current = confirm;
  const confirmCopy = lastConfirm.current ? confirmText(lastConfirm.current, orgName) : null;
  const confirmBusy = confirm
    ? busy === `${confirm.ex.id}:${confirm.action}:${confirm.itemId ?? ''}`
    : false;

  return (
    <div className="page-shell pb-20">
      <Toast toast={toast} onDismiss={() => setToast(null)} duration={5000} />

      <PageHeader
        eyebrow="Exchange coordination"
        title="Exchange requests & reservations"
        description="Suppliers accept their share, stock is reserved atomically, and the buyer confirms the transfer."
        actions={
          <>
            {identity.locked ? (
              <span className="inline-flex h-8 min-w-0 items-center gap-1.5 text-[13px] text-slate-600">
                <Building2 className="size-4 text-slate-500" aria-hidden />
                <span className="sr-only">Signed in as</span>
                <span className="truncate font-medium text-graphite">
                  {identity.organization?.name ?? 'Admin · all exchanges (read-only)'}
                </span>
              </span>
            ) : (
              <ToolbarSelect
                label="Acting as"
                icon={<Building2 className="size-4" />}
                value={actingAs}
                onChange={(e) => setActingAs(e.target.value)}
                className="max-w-[20rem]"
              >
                <option value="ALL">All organizations (view only)</option>
                {orgOptions.map((o) => (
                  <option key={o.id} value={o.id}>
                    Acting as: {o.name}
                  </option>
                ))}
              </ToolbarSelect>
            )}
            <Button
              variant="secondary"
              size="sm"
              onClick={load}
              disabled={loading}
              leading={
                <RefreshCw
                  className={cn('size-3.5', exchangesQuery.isFetching && 'animate-spin')}
                  aria-hidden
                />
              }
            >
              Refresh
            </Button>
          </>
        }
      >
        <MetricStrip
          metrics={[
            { label: 'Awaiting suppliers', value: num(stats.awaiting), note: 'Requested, not yet reserved', tone: stats.awaiting ? 'warning' : 'default' },
            { label: 'Reserved', value: num(stats.reserved), note: 'Ready for transfer', tone: 'copper', emphasis: true },
            { label: 'Reserved pieces', value: num(stats.reservedUnits), note: 'Held by accepted items' },
            { label: 'Completed', value: num(stats.completed), note: 'Counted as reuse' },
            { label: 'Cancelled', value: num(stats.cancelled), note: 'Reservations released' },
          ]}
        />
      </PageHeader>

      <div className="space-y-8 pt-8">
        {actingAs === 'ALL' && !identity.locked && (
          <Note>
            <p className="font-medium text-graphite">
              Choose an organization in &ldquo;Acting as&rdquo; to accept, decline, complete or cancel.
            </p>
          </Note>
        )}

        {/* Toolbar: filter tabs + sort */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <Segmented<Filter>
              variant="tabs"
              label="Filter exchanges"
              value={filter}
              onChange={setFilter}
              options={FILTERS.map((f) => ({
                value: f.id,
                label: f.label,
                count: exchanges.filter((e) => f.stages.includes(e.stage)).length,
              }))}
            />
          </div>
          <ToolbarSelect
            label="Sort exchanges"
            icon={<ArrowUpDown className="size-3.5" />}
            value={sort}
            onChange={(e) => setSort(e.target.value as Sort)}
            className="self-start sm:self-auto"
          >
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </ToolbarSelect>
        </div>

        {/* List */}
        {loading && exchanges.length === 0 ? (
          <TableSkeleton rows={4} columns={5} label="Loading exchanges" />
        ) : loadError ? (
          <ErrorState title="Exchanges could not be loaded" message={loadError} onRetry={load} />
        ) : ordered.length === 0 ? (
          <EmptyState
            icon={<ArrowLeftRight className="size-6" aria-hidden />}
            title={`No ${filter === 'ALL' ? '' : filter.toLowerCase() + ' '}exchanges yet.`}
            description={
              <>
                Open a requirement&rsquo;s matches and choose <strong className="font-medium text-graphite">Request exchange</strong>{' '}
                to start one.
              </>
            }
            action={
              <LinkButton href="/demand" variant="secondary" size="sm" trailing={<ArrowRight className="size-3.5" aria-hidden />}>
                Go to buyer requirements
              </LinkButton>
            }
          />
        ) : (
          <div>
            <div className="space-y-5">
              <AnimatePresence initial={false}>
                {page.visible.map((ex) => (
                  <ExchangeRecord
                    key={ex.id}
                    ex={ex}
                    actingAs={actingAs}
                    highlighted={ex.id === highlight}
                    busy={busy}
                    onAct={act}
                    onConfirm={setConfirm}
                    onPay={pay}
                    onSwitch={identity.locked ? undefined : setActingAs}
                    orgName={orgName}
                  />
                ))}
              </AnimatePresence>
            </div>
            <LoadMore shown={page.shown} total={page.total} onMore={page.more} noun="exchanges" />
          </div>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => {
          if (!confirmBusy) setConfirm(null);
        }}
        onConfirm={() => void runConfirmed()}
        title={confirmCopy?.title ?? ''}
        description={confirmCopy?.description}
        confirmLabel={confirmCopy?.confirmLabel}
        tone={confirmCopy?.tone}
        busy={confirmBusy}
      >
        {confirmCopy?.body}
      </ConfirmDialog>
    </div>
  );
}

/** Grade for the title: the requirement's, or (direct listing orders) the ordered listing's. */
function materialName(ex: ExchangeView): string {
  const spec = ex.requirement?.material_specification ?? ex.items[0]?.listing?.material_specification;
  return spec ? SPEC_LABEL[spec] ?? spec : 'material';
}

/* ----------------------------------------------------------- confirmations */

function confirmText(c: PendingConfirm, orgName: (id: string) => string) {
  const { ex } = c;
  const material = materialName(ex);
  const summary = (
    <p className="font-mono text-xs text-slate-600">
      #{ex.id.slice(0, 8)} · {num(ex.total_quantity)} × {material} · {bdt(ex.total_value_bdt)}
    </p>
  );
  if (c.action === 'complete') {
    return {
      title: 'Confirm the transfer?',
      description:
        'Only confirm once the materials have been handed over. Completing deducts the reserved pieces from each supplier’s inventory exactly once and counts the exchange as reuse. This cannot be undone.',
      confirmLabel: 'Confirm transfer',
      tone: 'primary' as const,
      body: summary,
    };
  }
  if (c.action === 'cancel') {
    return {
      title: 'Cancel this exchange?',
      description:
        'Cancelling releases every piece reserved for this exchange back to the suppliers’ available stock. Nothing is transferred, and you would need to request again from the matches page.',
      confirmLabel: 'Cancel exchange',
      tone: 'danger' as const,
      body: summary,
    };
  }
  const item = ex.items.find((i) => i.id === c.itemId);
  return {
    title: 'Decline this item?',
    description: `${ex.buyer?.name ?? orgName(ex.buyer_organization_id)} will see that you declined. The exchange can then no longer be completed and the buyer will have to cancel it and request again.`,
    confirmLabel: 'Decline item',
    tone: 'danger' as const,
    body: item ? (
      <p className="font-mono text-xs text-slate-600">
        {num(item.quantity)} pcs · {dims(item.listing)} · {bdt(item.subtotal_bdt)}
      </p>
    ) : (
      summary
    ),
  };
}

/* ---------------------------------------------------------------- progress */

const STEPS = ['Requested', 'Suppliers accepted', 'Reserved', 'Completed'];

function stepIndex(ex: ExchangeView): number {
  if (ex.stage === 'COMPLETED') return 4;
  if (ex.stage === 'RESERVED') return 3;
  if (ex.counts.accepted > 0) return 2;
  return 1;
}

/** Connected timeline: copper nodes and line for reached steps; slate when the exchange halted. */
function Stepper({ ex }: { ex: ExchangeView }) {
  const done = stepIndex(ex);
  const halted = ex.stage === 'CANCELLED' || ex.stage === 'SUPPLIER_DECLINED';
  const reachedAt = (i: number) => i < done && ex.stage !== 'CANCELLED';
  const current = !halted && ex.stage !== 'COMPLETED' ? done : -1;

  return (
    <div className="space-y-2">
      <ol className="grid grid-cols-4" aria-label="Exchange progress">
        {STEPS.map((label, i) => {
          const reached = reachedAt(i);
          const isCurrent = i === current;
          const lineReached = i < STEPS.length - 1 && reachedAt(i + 1);
          const text =
            i === 1 && ex.items.length > 0 ? `${label} (${ex.counts.accepted + ex.counts.completed}/${ex.items.length})` : label;
          return (
            <li key={label} className="relative min-w-0 pr-2" aria-current={isCurrent ? 'step' : undefined}>
              <div className="flex items-center">
                <span
                  className={cn(
                    'relative z-10 flex size-4 shrink-0 items-center justify-center rounded-full border',
                    reached
                      ? halted
                        ? 'border-slate-400 bg-slate-400 text-cream'
                        : 'border-copper-600 bg-copper-600 text-white'
                      : isCurrent
                        ? 'border-copper bg-cream-paper ring-2 ring-copper/20'
                        : 'border-graphite/25 bg-cream-paper'
                  )}
                  aria-hidden
                >
                  {reached && <Check className="size-2.5" strokeWidth={3} />}
                </span>
                {i < STEPS.length - 1 && (
                  <span
                    className={cn(
                      'h-px flex-1',
                      lineReached ? (halted ? 'bg-slate-400' : 'h-0.5 bg-copper') : 'bg-graphite/15'
                    )}
                    aria-hidden
                  />
                )}
              </div>
              <p
                className={cn(
                  'mt-2 text-[11px] font-medium leading-snug',
                  reached ? 'text-graphite' : isCurrent ? 'text-copper-700' : 'text-slate-600'
                )}
              >
                {text}
                <span className="sr-only">{reached ? ' (done)' : isCurrent ? ' (in progress)' : ' (not reached)'}</span>
              </p>
            </li>
          );
        })}
      </ol>
      {halted && (
        <p
          className={cn(
            'flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.06em]',
            ex.stage === 'CANCELLED' ? 'text-slate-600' : 'text-brick-700'
          )}
        >
          <X className="size-3" aria-hidden />
          {ex.stage === 'CANCELLED' ? 'Halted · exchange cancelled' : 'Halted · a supplier declined'}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- next action */

interface NextStep {
  /** `you` = the current identity must act; `other` = waiting on someone else; `done` = nothing left. */
  who: 'you' | 'other' | 'done';
  text: string;
}

function nextStep(ex: ExchangeView, actingAs: string, isBuyer: boolean, needsPayment: boolean): NextStep {
  const plural = (n: number, w: string) => `${num(n)} ${w}${n === 1 ? '' : 's'}`;
  switch (ex.stage) {
    case 'COMPLETED':
      return { who: 'done', text: 'Transfer confirmed. Inventory has been updated and the exchange counts as reuse.' };
    case 'CANCELLED':
      return { who: 'done', text: 'Cancelled. Any reserved stock was released back to the suppliers.' };
    case 'SUPPLIER_DECLINED':
      return isBuyer
        ? { who: 'you', text: 'Your turn: cancel this exchange to release the stock other suppliers reserved.' }
        : { who: 'other', text: 'A supplier declined. Waiting on the buyer to cancel and release reserved stock.' };
    case 'RESERVED':
      if (isBuyer) {
        return needsPayment
          ? { who: 'you', text: `Your turn: pay ${bdt(ex.total_value_bdt)}, then confirm the transfer.` }
          : { who: 'you', text: 'Your turn: confirm the transfer once the materials have been handed over.' };
      }
      return needsPayment
        ? { who: 'other', text: `Stock reserved. Waiting on the buyer to pay ${bdt(ex.total_value_bdt)} and confirm the transfer.` }
        : { who: 'other', text: 'Stock reserved. Waiting on the buyer to confirm the transfer.' };
    case 'AWAITING_SUPPLIERS':
    default: {
      const mine = ex.items.filter(
        (i) => i.supplier_organization_id === actingAs && i.status === 'PENDING' && ex.status === 'PROPOSED'
      ).length;
      if (mine > 0) {
        return {
          who: 'you',
          text: mine === 1 ? 'Your turn: accept or decline your item.' : `Your turn: accept or decline your ${num(mine)} items.`,
        };
      }
      return { who: 'other', text: `Waiting on ${plural(ex.counts.pending, 'supplier')} to accept.` };
    }
  }
}

/* ------------------------------------------------------------------ record */

interface RecordProps {
  ex: ExchangeView;
  actingAs: string;
  highlighted: boolean;
  busy: string | null;
  onAct: (ex: ExchangeView, action: ExchangeAction, itemId?: string) => void;
  onConfirm: (c: PendingConfirm) => void;
  onPay: (ex: ExchangeView) => void;
  /** Demo only: jump to another organization's view. Absent when signed in. */
  onSwitch?: (orgId: string) => void;
  orgName: (id: string) => string;
}

function ExchangeRecord({ ex, actingAs, highlighted, busy, onAct, onConfirm, onPay, onSwitch, orgName }: RecordProps) {
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
  const next = nextStep(ex, actingAs, isBuyer, needsPayment);
  const buyerName = ex.buyer?.name ?? orgName(ex.buyer_organization_id);

  return (
    <motion.article
      {...rowMotion}
      id={`exchange-${ex.id}`}
      className={cn(
        'scroll-mt-24 overflow-hidden rounded-sm border bg-cream-paper',
        highlighted ? 'border-graphite/10 border-l-[3px] border-l-copper bg-sand-50' : 'border-graphite/10'
      )}
      aria-labelledby={`ex-${ex.id}`}
    >
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 px-5 pb-4 pt-5 lg:flex-row lg:items-start sm:px-6">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusBadge tone={stage.tone}>{stage.label}</StatusBadge>
            {role && <Tag className="border-graphite/30 text-graphite">You: {role}</Tag>}
            {paid && (
              <StatusBadge tone="success" solid>
                <CreditCard className="size-3" aria-hidden /> Paid{ex.payment?.card_type ? ` · ${ex.payment.card_type}` : ''}
              </StatusBadge>
            )}
            {highlighted && <Tag className="border-copper/40 text-copper-700">New request</Tag>}
            <span className="font-mono text-xs text-slate-600">#{ex.id.slice(0, 8)}</span>
          </div>
          <h2 id={`ex-${ex.id}`} className="text-lg font-medium tracking-[-0.02em] text-graphite">
            {num(ex.total_quantity)} × {materialName(ex)}{' '}
            <span className="font-mono text-sm font-normal text-slate-600">{req ? requirementSize(req, '×') : dims(ex.items[0]?.listing)}</span>
          </h2>
          <p className="text-sm text-slate-600">
            Buyer <span className="font-medium text-graphite">{buyerName}</span>
            {ex.buyer?.city ? ` · ${ex.buyer.city}` : ''} · requested{' '}
            <span className="font-mono text-xs">{formatDate(ex.created_at)}</span>
            {req && ex.total_quantity < req.required_quantity && (
              <> · partial ({num(ex.total_quantity)} of {num(req.required_quantity)} needed)</>
            )}
          </p>
        </div>
        <div className="shrink-0 text-left lg:text-right">
          <div className="t-label">Material value</div>
          <div className="text-xl font-medium tabular-nums tracking-[-0.02em] text-graphite">{bdt(ex.total_value_bdt)}</div>
          <div className="text-xs text-slate-600">
            {ex.items.length} supplier item{ex.items.length === 1 ? '' : 's'} · excl. transport
          </div>
        </div>
      </div>

      {/* Next action */}
      <div
        className={cn(
          'mx-5 flex items-start gap-2 border-l-2 py-1 pl-3 text-sm sm:mx-6',
          next.who === 'you'
            ? 'border-copper font-medium text-copper-700'
            : next.who === 'other'
              ? 'border-graphite/20 text-slate-700'
              : 'border-graphite/10 text-slate-600'
        )}
      >
        <span className="t-label mt-0.5 shrink-0 text-inherit">{next.who === 'done' ? 'Outcome' : 'Next'}</span>
        <span>{next.text}</span>
      </div>

      <div className="px-5 pt-5 sm:px-6">
        <Stepper ex={ex} />
      </div>

      {ex.stage === 'SUPPLIER_DECLINED' && (
        <Note tone="danger" className="mx-5 mt-5 sm:mx-6">
          A supplier declined, so this exchange can&rsquo;t be completed. The buyer should cancel it to release any reserved
          stock, then request again from the matches page.
        </Note>
      )}

      {/* Supplier responsibilities: each supplier answers for their own line */}
      <section className="mt-5 border-t rule" aria-label="Supplier items">
        <p className="t-label px-5 pt-4 sm:px-6">Suppliers · each accepts or declines their own item</p>
        <div className="overflow-x-auto px-5 pb-2 sm:px-6">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b rule text-left">
                <th scope="col" className="t-label py-2.5 pr-4 font-medium">Supplier</th>
                <th scope="col" className="t-label py-2.5 pr-4 font-medium">Listing</th>
                <th scope="col" className="t-label py-2.5 pr-4 text-right font-medium">Qty</th>
                <th scope="col" className="t-label py-2.5 pr-4 text-right font-medium">Unit</th>
                <th scope="col" className="t-label py-2.5 pr-4 text-right font-medium">Subtotal</th>
                <th scope="col" className="t-label py-2.5 pr-4 font-medium">Status</th>
                <th scope="col" className="t-label py-2.5 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite/[0.08]">
              {ex.items.map((item) => {
                const meta = ITEM_STATUS_META[item.status];
                const mine = actingAs === item.supplier_organization_id;
                const canRespond = item.status === 'PENDING' && ex.status === 'PROPOSED';
                return (
                  <tr key={item.id} className={cn('align-top', mine && canRespond && 'bg-sand-50/70')}>
                    <td className="py-3 pr-4">
                      <div className="flex flex-wrap items-center gap-1.5 font-medium text-graphite">
                        {item.supplier?.name ?? orgName(item.supplier_organization_id)}
                        {mine && <Tag className="border-graphite/30 text-graphite">You</Tag>}
                      </div>
                      <div className="text-xs text-slate-600">{item.listing?.city ?? item.supplier?.city}</div>
                    </td>
                    <td className="py-3 pr-4 text-slate-700">
                      <div>{item.listing ? SPEC_LABEL[item.listing.material_specification] ?? item.listing.material_specification : '—'}</div>
                      <div className="font-mono text-xs text-slate-600">
                        {dims(item.listing)} · {item.listing?.condition?.toLowerCase()}
                      </div>
                      {item.listing && item.status === 'PENDING' && (
                        <div className="text-xs text-slate-600">Available now: {num(item.listing.available_quantity)}</div>
                      )}
                    </td>
                    <td className="py-3 pr-4 text-right font-medium tabular-nums text-graphite">{num(item.quantity)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-slate-600">{bdt(item.unit_price_bdt)}</td>
                    <td className="py-3 pr-4 text-right tabular-nums text-graphite">{bdt(item.subtotal_bdt)}</td>
                    <td className="py-3 pr-4">
                      {meta ? <StatusBadge tone={meta.tone}>{meta.label}</StatusBadge> : item.status}
                      {canRespond && !mine && <div className="mt-0.5 text-xs text-slate-600">Supplier to respond</div>}
                    </td>
                    <td className="whitespace-nowrap py-3 text-right">
                      {canRespond && mine ? (
                        <div className="inline-flex gap-2">
                          <Button
                            size="xs"
                            variant="primary"
                            onClick={() => onAct(ex, 'accept', item.id)}
                            disabled={anyBusy}
                            busy={isBusy('accept', item.id)}
                            leading={<Check className="size-3.5" aria-hidden />}
                          >
                            Accept &amp; reserve
                          </Button>
                          <Button
                            size="xs"
                            variant="secondary"
                            onClick={() => onConfirm({ ex, action: 'reject', itemId: item.id })}
                            disabled={anyBusy}
                            busy={isBusy('reject', item.id)}
                            leading={<X className="size-3.5" aria-hidden />}
                          >
                            Decline
                          </Button>
                        </div>
                      ) : canRespond && onSwitch ? (
                        <Button
                          variant="link"
                          size="xs"
                          onClick={() => onSwitch(item.supplier_organization_id)}
                          title="Demo: switch identity to this supplier"
                        >
                          Act as this supplier →
                        </Button>
                      ) : (
                        <span className="text-xs text-slate-500" aria-label="No action">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Buyer responsibilities */}
      {active && (
        <section
          className="flex flex-col justify-between gap-3 border-t rule bg-cream/60 px-5 py-4 sm:flex-row sm:items-center sm:px-6"
          aria-label="Buyer actions"
        >
          <div className="min-w-0 space-y-0.5">
            <p className="t-label">Buyer · {buyerName}</p>
            <p className="text-xs text-slate-600">
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
          </div>
          {isBuyer ? (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onConfirm({ ex, action: 'cancel' })}
                disabled={anyBusy || paid}
                busy={isBusy('cancel')}
                title={paid ? 'Paid exchanges cannot be cancelled (refunds are not supported in this prototype)' : undefined}
                leading={<Undo2 className="size-3.5" aria-hidden />}
              >
                Cancel exchange
              </Button>
              {ex.stage === 'RESERVED' && needsPayment && (
                <Button
                  variant="ink"
                  size="sm"
                  onClick={() => onPay(ex)}
                  disabled={anyBusy}
                  busy={isBusy('pay')}
                  leading={<CreditCard className="size-3.5" aria-hidden />}
                >
                  Pay {bdt(ex.total_value_bdt)}
                </Button>
              )}
              <Button
                variant="primary"
                size="sm"
                onClick={() => onConfirm({ ex, action: 'complete' })}
                disabled={anyBusy || ex.stage !== 'RESERVED' || needsPayment}
                busy={isBusy('complete')}
                title={
                  ex.stage !== 'RESERVED' ? 'Every supplier must accept first' : needsPayment ? 'Pay for the exchange first' : undefined
                }
                leading={<PackageCheck className="size-3.5" aria-hidden />}
              >
                Confirm transfer
              </Button>
            </div>
          ) : onSwitch ? (
            <Button
              variant="link"
              size="xs"
              onClick={() => onSwitch(ex.buyer_organization_id)}
              className="self-start sm:self-auto"
              title="Demo: switch identity to the buyer"
            >
              Act as buyer →
            </Button>
          ) : null}
        </section>
      )}

      {/* Activity */}
      <details className="group border-t rule">
        <summary className="flex cursor-pointer list-none items-center gap-1.5 px-5 py-3 text-xs font-medium text-slate-700 hover:text-graphite focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-copper sm:px-6 [&::-webkit-details-marker]:hidden">
          <ChevronDown className="size-3.5 transition-transform duration-base ease-out group-open:rotate-180" aria-hidden />
          Activity log <span className="font-mono text-[11px] text-slate-500">{ex.activity.length}</span>
        </summary>
        <ol className="space-y-2 px-5 pb-4 sm:px-6">
          {ex.activity.map((log) => {
            const actor = log.details?.actor_organization_id as string | undefined;
            return (
              <li key={log.id} className="flex gap-3 text-xs text-slate-700">
                <span className="w-28 shrink-0 font-mono tabular-nums text-slate-600">{formatDate(log.created_at)}</span>
                <span>
                  {ACTIVITY_LABEL[log.action] ?? log.action}
                  {actor ? <span className="text-slate-600"> · {orgName(actor)}</span> : null}
                  {typeof log.details?.quantity === 'number' ? (
                    <span className="text-slate-600"> · {num(log.details.quantity as number)} pcs</span>
                  ) : null}
                  {typeof log.details?.released_quantity === 'number' && (log.details.released_quantity as number) > 0 ? (
                    <span className="text-slate-600"> · {num(log.details.released_quantity as number)} pcs released</span>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ol>
      </details>
    </motion.article>
  );
}
