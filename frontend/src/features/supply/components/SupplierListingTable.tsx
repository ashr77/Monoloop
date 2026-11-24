'use client';

// ============================================================================
// Supply listings: marketplace + inventory table (Member 1).
// Behaviour is unchanged (search, family/status filters, chat, order, edit,
// archive). Added presentation controls: sort, grade/condition/price/stock
// filters, list/grid view, density, visible columns, expandable rows and
// incremental loading. Preferences persist per browser.
// ============================================================================

import { AnimatePresence, motion } from 'framer-motion';
import {
  Archive,
  ChevronDown,
  Columns3,
  Edit2,
  LayoutGrid,
  List,
  Loader2,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  ShoppingCart,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Fragment, useMemo, useRef, useState } from 'react';
import { Collapse, rowMotion } from '@/components/motion';
import {
  ConfirmDialog,
  EmptyState,
  LoadMore,
  Menu,
  MenuCheckItem,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  NumberField,
  Popover,
  SearchInput,
  Segmented,
  StatusBadge,
  Tag,
  Toast,
  ToolbarSelect,
  type Tone,
  type ToastMessage,
} from '@/components/ui';
import { SPEC_LABEL, bdt, num } from '@/features/exchanges/components/format';
import { useOpenConversation, useSaveListing } from '@/hooks';
import { useMediaQuery, WIDE_TABLES } from '@/hooks/useMediaQuery';
import { sortBy, useIncremental, usePersistentState } from '@/hooks/useViewPrefs';
import { errorMessage } from '@/lib/api/client';
import { ALL_SPECIFICATIONS, MATERIAL_CONDITIONS, MaterialFamily } from '@/lib/constants';
import type { MaterialListing, Organization } from '@/lib/types';
import { cn } from '@/lib/utils';
import { ListingOrderDialog } from './ListingOrderDialog';

interface Props {
  listings: MaterialListing[];
  onEdit: (listing: MaterialListing) => void;
  onRefresh: () => void;
  organizations?: Organization[];
  buyerOrganizationId?: string;
  onBuyerOrganizationChange?: (organizationId: string) => void;
  /** Signed-in company: always orders and chats as itself, so no picker. */
  buyerLocked?: boolean;
}

type ColumnId = 'dimensions' | 'stock' | 'condition' | 'price' | 'location' | 'status';
const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'dimensions', label: 'Dimensions' },
  { id: 'stock', label: 'Availability' },
  { id: 'condition', label: 'Condition' },
  { id: 'price', label: 'Unit price' },
  { id: 'location', label: 'Location' },
  { id: 'status', label: 'Status' },
];

type SortId = 'newest' | 'price-asc' | 'price-desc' | 'available' | 'thickness';
const SORTS: { id: SortId; label: string; short: string }[] = [
  { id: 'newest', label: 'Newest first', short: 'Newest' },
  { id: 'price-asc', label: 'Unit price · low to high', short: 'Price ↑' },
  { id: 'price-desc', label: 'Unit price · high to low', short: 'Price ↓' },
  { id: 'available', label: 'Most available stock', short: 'Most stock' },
  { id: 'thickness', label: 'Thickness · thin to thick', short: 'Thickness ↑' },
];

const FAMILY_LABEL: Record<MaterialFamily, string> = {
  STAINLESS_STEEL_SHEET: 'Stainless steel sheet',
  PLYWOOD_PANEL: 'Plywood panel',
};

const STATUS_TONE: Record<string, Tone> = { ACTIVE: 'success', RESERVED: 'copper', COMPLETED: 'muted', ARCHIVED: 'muted' };
const CONDITION_LABEL: Record<string, string> = { UNUSED: 'Unused', LEFTOVER: 'Leftover', OFFCUT: 'Offcut' };

const dimsOf = (l: MaterialListing) => `${num(l.length_mm)} × ${num(l.width_mm)}`;
const gaugeOf = (l: MaterialListing) => `${num(l.thickness_mm, l.thickness_mm % 1 ? 1 : 0)} mm`;

export function SupplierListingTable({
  listings,
  onEdit,
  onRefresh,
  organizations = [],
  buyerOrganizationId,
  onBuyerOrganizationChange,
  buyerLocked,
}: Props) {
  const saveListing = useSaveListing();
  // Original filters
  const [searchTerm, setSearchTerm] = useState('');
  const [familyFilter, setFamilyFilter] = useState<'ALL' | MaterialFamily>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  // Added refinements (presentation only)
  const [grades, setGrades] = useState<string[]>([]);
  const [conditions, setConditions] = useState<string[]>([]);
  const [priceMin, setPriceMin] = useState('');
  const [priceMax, setPriceMax] = useState('');
  const [minAvailable, setMinAvailable] = useState('');
  // Persisted view preferences
  const [sort, setSort] = usePersistentState<SortId>('supply.sort', 'newest');
  const [savedView, setView] = usePersistentState<'list' | 'grid'>('supply.view', 'list');
  // The table needs ~900px; narrower screens (phones, half-width windows) always get the cards.
  const wide = useMediaQuery(WIDE_TABLES);
  const view = wide ? savedView : 'grid';
  const [density, setDensity] = usePersistentState<'comfortable' | 'compact'>('supply.density', 'comfortable');
  const [hidden, setHidden] = usePersistentState<ColumnId[]>('supply.hiddenColumns', []);

  const [expanded, setExpanded] = useState<string | null>(null);
  const [isArchivingId, setIsArchivingId] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<MaterialListing | null>(null);
  const [orderListing, setOrderListing] = useState<MaterialListing | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);

  const show = (c: ColumnId) => !hidden.includes(c);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const pMin = priceMin === '' ? null : Number(priceMin);
    const pMax = priceMax === '' ? null : Number(priceMax);
    const aMin = minAvailable === '' ? null : Number(minAvailable);
    const rows = listings.filter((item) => {
      if (familyFilter !== 'ALL' && item.material_family !== familyFilter) return false;
      if (statusFilter !== 'ALL' && item.status !== statusFilter) return false;
      if (q) {
        const matchSpec = item.material_specification.toLowerCase().includes(q);
        const matchCity = item.city.toLowerCase().includes(q);
        const matchDesc = item.description ? item.description.toLowerCase().includes(q) : false;
        const matchOrg = item.organization?.name.toLowerCase().includes(q) || false;
        if (!matchSpec && !matchCity && !matchDesc && !matchOrg) return false;
      }
      if (grades.length && !grades.includes(item.material_specification)) return false;
      if (conditions.length && !conditions.includes(item.condition)) return false;
      if (pMin !== null && item.unit_price_bdt < pMin) return false;
      if (pMax !== null && item.unit_price_bdt > pMax) return false;
      if (aMin !== null && item.available_quantity < aMin) return false;
      return true;
    });
    switch (sort) {
      case 'price-asc':
        return sortBy(rows, (l) => l.unit_price_bdt, 'asc');
      case 'price-desc':
        return sortBy(rows, (l) => l.unit_price_bdt, 'desc');
      case 'available':
        return sortBy(rows, (l) => l.available_quantity, 'desc');
      case 'thickness':
        return sortBy(rows, (l) => l.thickness_mm, 'asc');
      default:
        return sortBy(rows, (l) => l.created_at, 'desc');
    }
  }, [listings, familyFilter, statusFilter, searchTerm, grades, conditions, priceMin, priceMax, minAvailable, sort]);

  const resetKey = [searchTerm, familyFilter, statusFilter, grades.join(), conditions.join(), priceMin, priceMax, minAvailable, sort].join('|');
  const { visible, more, shown, total } = useIncremental(filtered, 12, resetKey);

  const refinementCount = grades.length + conditions.length + (priceMin ? 1 : 0) + (priceMax ? 1 : 0) + (minAvailable ? 1 : 0);
  const anyFilter = refinementCount > 0 || familyFilter !== 'ALL' || statusFilter !== 'ACTIVE' || searchTerm.trim() !== '';
  const clearAll = () => {
    setSearchTerm('');
    setFamilyFilter('ALL');
    setStatusFilter('ACTIVE');
    setGrades([]);
    setConditions([]);
    setPriceMin('');
    setPriceMax('');
    setMinAvailable('');
  };

  const handleArchive = async (id: string) => {
    const target = listings.find((l) => l.id === id);
    if (!target) return;
    setIsArchivingId(id);
    try {
      await saveListing.mutateAsync({ id, body: { status: 'ARCHIVED' }, organizationId: target.organization_id });
      onRefresh();
      setToast({ kind: 'success', message: 'Listing archived. It will no longer match new requirements.' });
      setArchiveTarget(null);
    } catch (error) {
      setToast({ kind: 'error', message: errorMessage(error, 'Failed to archive listing') });
    } finally {
      setIsArchivingId(null);
    }
  };

  // Buyer ↔ supplier chat: uses the same "Order as buyer…" identity as ordering.
  const router = useRouter();
  const openConversation = useOpenConversation();
  const buyerPicker = useRef<HTMLSelectElement>(null);
  const [needBuyer, setNeedBuyer] = useState(false);
  const [chatPendingId, setChatPendingId] = useState<string | null>(null);

  const startChat = async (listing: MaterialListing) => {
    if (!buyerOrganizationId) {
      setNeedBuyer(true);
      buyerPicker.current?.focus();
      return;
    }
    setChatPendingId(listing.id);
    try {
      const conversation = await openConversation.mutateAsync({
        listingId: listing.id,
        buyerOrganizationId,
      });
      router.push(`/messages/${conversation.id}?as=${buyerOrganizationId}`);
    } catch (error) {
      setToast({ kind: 'error', message: errorMessage(error, 'Could not open the chat.') });
      setChatPendingId(null);
    }
  };

  const isOwn = (item: MaterialListing) => Boolean(buyerLocked && item.organization_id === buyerOrganizationId);
  const canChat = (item: MaterialListing) => item.status === 'ACTIVE' && organizations.length > 0 && !isOwn(item);
  const canOrder = (item: MaterialListing) => item.status === 'ACTIVE' && item.available_quantity > 0 && !isOwn(item);

  const compact = density === 'compact';
  const cell = compact ? 'py-2' : 'py-3.5';
  const visibleColumnCount = 2 + COLUMNS.filter((c) => show(c.id)).length + 1;

  /* --------------------------------------------------------------- actions */
  const Actions = ({ item, layout }: { item: MaterialListing; layout: 'row' | 'card' }) => {
    const isArchived = item.status === 'ARCHIVED';
    return (
      <div className={cn('flex items-center gap-1.5', layout === 'row' ? 'justify-end' : 'justify-between')}>
        <div className="flex items-center gap-1.5">
          {canChat(item) && (
            <button
              type="button"
              onClick={() => startChat(item)}
              disabled={chatPendingId === item.id}
              aria-busy={chatPendingId === item.id || undefined}
              className="inline-flex h-7 items-center gap-1.5 rounded-sm border border-graphite/20 px-2.5 text-xs font-medium text-graphite transition-colors hover:border-graphite/45 hover:bg-graphite/[0.04] disabled:opacity-60"
              title={`Chat with ${item.organization?.name ?? 'the supplier'} about this listing`}
            >
              {chatPendingId === item.id ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <MessageCircle className="size-3.5" aria-hidden />}
              Chat
            </button>
          )}
          {canOrder(item) && (
            <button
              type="button"
              onClick={() => setOrderListing(item)}
              className="inline-flex h-7 items-center gap-1.5 rounded-sm bg-copper-600 px-2.5 text-xs font-medium text-white transition-colors hover:bg-copper-700"
              title="Order this supply listing"
            >
              <ShoppingCart className="size-3.5" aria-hidden />
              Order
            </button>
          )}
        </div>
        <Menu
          align="end"
          width="w-48"
          label={`More actions for ${SPEC_LABEL[item.material_specification] ?? item.material_specification} listing`}
          triggerClassName="h-7 w-7 justify-center border-transparent bg-transparent px-0 hover:bg-graphite/[0.06] [&>svg:last-child]:hidden"
          trigger={<MoreHorizontal className="size-4 text-slate-600" aria-hidden />}
        >
          <MenuItem icon={<Edit2 className="size-4" />} onSelect={() => onEdit(item)} disabled={isArchived} hint={isArchived ? 'Archived listings are read-only' : undefined}>
            Edit listing
          </MenuItem>
          {!isArchived && (
            <MenuItem icon={<Archive className="size-4" />} onSelect={() => setArchiveTarget(item)} disabled={isArchivingId === item.id}>
              Archive…
            </MenuItem>
          )}
        </Menu>
      </div>
    );
  };

  return (
    <>
      {orderListing && (
        <ListingOrderDialog
          listing={orderListing}
          buyerOrganizationId={buyerOrganizationId}
          onClose={() => setOrderListing(null)}
          onOrdered={onRefresh}
        />
      )}
      <ConfirmDialog
        open={archiveTarget !== null}
        onClose={() => setArchiveTarget(null)}
        onConfirm={() => archiveTarget && handleArchive(archiveTarget.id)}
        busy={isArchivingId !== null}
        tone="danger"
        confirmLabel="Archive listing"
        title="Archive this surplus listing?"
        description="It will no longer match new requirements."
      >
        {archiveTarget && (
          <p className="font-mono text-xs text-slate-700">
            {archiveTarget.material_specification} · {dimsOf(archiveTarget)} × {gaugeOf(archiveTarget)} · {num(archiveTarget.available_quantity)} available
          </p>
        )}
      </ConfirmDialog>
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      {/* ------------------------------------------------------- toolbar */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <SearchInput
              value={searchTerm}
              onChange={setSearchTerm}
              label="Search listings"
              placeholder="Grade (e.g. SS304), city, supplier, description"
              className="w-full sm:w-64"
            />
            <ToolbarSelect label="Material family" value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value as 'ALL' | MaterialFamily)}>
              <option value="ALL">All materials</option>
              <option value="STAINLESS_STEEL_SHEET">Stainless steel</option>
              <option value="PLYWOOD_PANEL">Plywood panel</option>
            </ToolbarSelect>
            <ToolbarSelect label="Listing status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'ARCHIVED')}>
              <option value="ACTIVE">Active only</option>
              <option value="ARCHIVED">Archived only</option>
              <option value="ALL">All statuses</option>
            </ToolbarSelect>
            <Popover
              label="More filters"
              active={refinementCount > 0}
              width="w-[22rem]"
              trigger={
                <>
                  <SlidersHorizontal className="size-3.5" aria-hidden /> Filters
                  {refinementCount > 0 && <span className="font-mono text-xs">{refinementCount}</span>}
                </>
              }
            >
              <div className="space-y-5">
                <fieldset>
                  <legend className="t-label">Grade</legend>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {ALL_SPECIFICATIONS.map((s) => {
                      const on = grades.includes(s);
                      return (
                        <button
                          key={s}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setGrades((g) => (on ? g.filter((x) => x !== s) : [...g, s]))}
                          className={cn(
                            'h-7 rounded-sm border px-2 text-xs transition-colors',
                            on ? 'border-graphite bg-graphite text-cream' : 'border-graphite/15 text-graphite hover:border-graphite/40'
                          )}
                        >
                          {SPEC_LABEL[s] ?? s}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <fieldset>
                  <legend className="t-label">Condition</legend>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {MATERIAL_CONDITIONS.map((c) => {
                      const on = conditions.includes(c);
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={on}
                          onClick={() => setConditions((x) => (on ? x.filter((y) => y !== c) : [...x, c]))}
                          className={cn(
                            'h-7 rounded-sm border px-2 text-xs transition-colors',
                            on ? 'border-graphite bg-graphite text-cream' : 'border-graphite/15 text-graphite hover:border-graphite/40'
                          )}
                        >
                          {CONDITION_LABEL[c]}
                        </button>
                      );
                    })}
                  </div>
                </fieldset>
                <div className="grid grid-cols-2 gap-3">
                  <NumberField label="Min price (BDT)" min={0} value={priceMin} onChange={(e) => setPriceMin(e.target.value)} />
                  <NumberField label="Max price (BDT)" min={0} value={priceMax} onChange={(e) => setPriceMax(e.target.value)} />
                </div>
                <NumberField label="Minimum pieces available" min={0} step={1} value={minAvailable} onChange={(e) => setMinAvailable(e.target.value)} />
                <div className="flex justify-between border-t border-graphite/10 pt-3">
                  <button
                    type="button"
                    onClick={() => {
                      setGrades([]);
                      setConditions([]);
                      setPriceMin('');
                      setPriceMax('');
                      setMinAvailable('');
                    }}
                    className="text-xs font-medium text-slate-700 underline decoration-graphite/30 underline-offset-[3px] hover:text-graphite"
                  >
                    Reset refinements
                  </button>
                  <span className="font-mono text-xs text-slate-600">{filtered.length} match</span>
                </div>
              </div>
            </Popover>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {organizations.length > 0 && !buyerLocked && (
              <ToolbarSelect
                ref={buyerPicker}
                label="Buyer identity"
                invalid={needBuyer && !buyerOrganizationId}
                value={buyerOrganizationId || ''}
                onChange={(event) => {
                  setNeedBuyer(false);
                  onBuyerOrganizationChange?.(event.target.value);
                }}
                className="max-w-[14rem]"
              >
                <option value="">Order as buyer…</option>
                {organizations
                  .filter((organization) => organization.organization_type === 'BUYER' || organization.organization_type === 'HYBRID')
                  .map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
              </ToolbarSelect>
            )}
            <Menu label="Sort listings" align="end" width="w-56" trigger={<span className="text-[14px]">Sort: {SORTS.find((s) => s.id === sort)?.short}</span>}>
              <MenuLabel>Sort by</MenuLabel>
              {SORTS.map((s) => (
                <MenuCheckItem key={s.id} radio checked={sort === s.id} onCheckedChange={() => setSort(s.id)}>
                  {s.label}
                </MenuCheckItem>
              ))}
            </Menu>
            {wide && view === 'list' && (
              <Menu label="Table options" align="end" width="w-56" trigger={<Columns3 className="size-3.5" aria-hidden />}>
                <MenuLabel>Density</MenuLabel>
                <MenuCheckItem radio checked={!compact} onCheckedChange={() => setDensity('comfortable')} keepOpen>
                  Comfortable
                </MenuCheckItem>
                <MenuCheckItem radio checked={compact} onCheckedChange={() => setDensity('compact')} keepOpen>
                  Compact
                </MenuCheckItem>
                <MenuSeparator />
                <MenuLabel>Visible columns</MenuLabel>
                {COLUMNS.map((c) => (
                  <MenuCheckItem
                    key={c.id}
                    checked={show(c.id)}
                    onCheckedChange={(on) => setHidden((h) => (on ? h.filter((x) => x !== c.id) : [...h, c.id]))}
                  >
                    {c.label}
                  </MenuCheckItem>
                ))}
              </Menu>
            )}
            {wide && (
              <Segmented
                label="Layout"
                value={view}
                onChange={setView}
                options={[
                  { value: 'list', label: <List className="size-3.5" />, ariaLabel: 'List view' },
                  { value: 'grid', label: <LayoutGrid className="size-3.5" />, ariaLabel: 'Grid view' },
                ]}
              />
            )}
          </div>
        </div>

        {needBuyer && !buyerOrganizationId && (
          <p className="text-xs font-medium text-brick-700" role="alert">
            Choose who is buying (“Order as buyer…”) to start a chat.
          </p>
        )}

        {anyFilter && (
          <div className="flex flex-wrap items-center gap-1.5">
            {searchTerm.trim() && <Chip onClear={() => setSearchTerm('')}>“{searchTerm.trim()}”</Chip>}
            {familyFilter !== 'ALL' && <Chip onClear={() => setFamilyFilter('ALL')}>{FAMILY_LABEL[familyFilter]}</Chip>}
            {statusFilter !== 'ACTIVE' && <Chip onClear={() => setStatusFilter('ACTIVE')}>{statusFilter === 'ALL' ? 'All statuses' : 'Archived'}</Chip>}
            {grades.map((g) => (
              <Chip key={g} onClear={() => setGrades((x) => x.filter((y) => y !== g))}>{SPEC_LABEL[g] ?? g}</Chip>
            ))}
            {conditions.map((c) => (
              <Chip key={c} onClear={() => setConditions((x) => x.filter((y) => y !== c))}>{CONDITION_LABEL[c]}</Chip>
            ))}
            {priceMin && <Chip onClear={() => setPriceMin('')}>≥ {bdt(Number(priceMin))}</Chip>}
            {priceMax && <Chip onClear={() => setPriceMax('')}>≤ {bdt(Number(priceMax))}</Chip>}
            {minAvailable && <Chip onClear={() => setMinAvailable('')}>≥ {minAvailable} pcs available</Chip>}
            <button type="button" onClick={clearAll} className="ml-1 text-xs font-medium text-copper-700 hover:underline">
              Clear all
            </button>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------- content */}
      <div className="mt-5">
        {filtered.length === 0 ? (
          <EmptyState
            title="No surplus listings found"
            description={anyFilter ? 'Nothing matches these filters. Loosen them or clear all to see every listing.' : 'Add a new listing to put surplus on the network.'}
            action={
              anyFilter ? (
                <button type="button" onClick={clearAll} className="inline-flex h-9 items-center rounded-sm border border-graphite/20 px-4 text-sm font-medium hover:bg-graphite/[0.04]">
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : view === 'grid' ? (
          <ul className="grid gap-px overflow-hidden border border-graphite/10 bg-graphite/10 sm:grid-cols-2 xl:grid-cols-3">
            <AnimatePresence initial={false}>
              {visible.map((item) => (
                <motion.li key={item.id} {...rowMotion} className={cn('flex flex-col gap-4 bg-cream-paper p-5', item.status === 'ARCHIVED' && 'opacity-60')}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="t-label">{FAMILY_LABEL[item.material_family]}</p>
                      <p className="mt-1 text-lg font-medium tracking-[-0.02em] text-graphite">
                        {SPEC_LABEL[item.material_specification] ?? item.material_specification}
                      </p>
                      {item.organization && <p className="truncate text-xs text-slate-600">{item.organization.name}</p>}
                    </div>
                    <StatusBadge tone={STATUS_TONE[item.status] ?? 'neutral'}>{item.status.toLowerCase()}</StatusBadge>
                  </div>
                  <dl className="grid grid-cols-2 gap-3 text-[14px]">
                    <div>
                      <dt className="t-label">Size · mm</dt>
                      <dd className="font-mono text-graphite">{dimsOf(item)}</dd>
                      <dd className="font-mono text-xs text-slate-600">{gaugeOf(item)} thick</dd>
                    </div>
                    <div>
                      <dt className="t-label">Available</dt>
                      <dd className="tabular-nums text-graphite">
                        <span className="font-medium">{num(item.available_quantity)}</span> / {num(item.total_quantity)} pcs
                      </dd>
                      {item.reserved_quantity > 0 && <dd className="text-xs text-copper-700">{num(item.reserved_quantity)} reserved</dd>}
                    </div>
                    <div>
                      <dt className="t-label">Unit price</dt>
                      <dd className="tabular-nums text-graphite">{bdt(item.unit_price_bdt)}</dd>
                    </div>
                    <div>
                      <dt className="t-label">Location</dt>
                      <dd className="text-graphite">{item.city}</dd>
                    </div>
                  </dl>
                  <div className="flex items-center gap-1.5">
                    <Tag>{CONDITION_LABEL[item.condition] ?? item.condition}</Tag>
                  </div>
                  <div className="mt-auto border-t border-graphite/10 pt-3">
                    <Actions item={item} layout="card" />
                  </div>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-graphite/15">
                  <th scope="col" className="w-8 pb-2" aria-label="Expand" />
                  <th scope="col" className="t-label pb-2 pr-4 font-medium">Material</th>
                  {show('dimensions') && <th scope="col" className="t-label pb-2 pr-4 font-medium">L × W · thickness</th>}
                  {show('stock') && <th scope="col" className="t-label pb-2 pr-4 text-right font-medium">Available / total</th>}
                  {show('condition') && <th scope="col" className="t-label pb-2 pr-4 font-medium">Condition</th>}
                  {show('price') && <th scope="col" className="t-label pb-2 pr-4 text-right font-medium">Unit price</th>}
                  {show('location') && <th scope="col" className="t-label pb-2 pr-4 font-medium">Location</th>}
                  {show('status') && <th scope="col" className="t-label pb-2 pr-4 font-medium">Status</th>}
                  <th scope="col" className="t-label pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[14px] text-graphite">
                <AnimatePresence initial={false}>
                  {visible.map((item) => {
                    const isArchived = item.status === 'ARCHIVED';
                    const open = expanded === item.id;
                    return (
                      <Fragment key={item.id}>
                        <motion.tr
                          {...rowMotion}
                          className={cn(
                            'group border-b border-graphite/[0.08] transition-colors duration-fast hover:bg-sand-50',
                            open && 'bg-sand-50',
                            isArchived && 'text-graphite/60'
                          )}
                        >
                          <td className={cn(cell, 'pr-1 align-top')}>
                            <button
                              type="button"
                              onClick={() => setExpanded(open ? null : item.id)}
                              aria-expanded={open}
                              aria-controls={`listing-${item.id}`}
                              aria-label={open ? 'Hide listing details' : 'Show listing details'}
                              className="mt-0.5 rounded-xs p-0.5 text-slate-500 hover:bg-graphite/[0.06] hover:text-graphite"
                            >
                              <ChevronDown className={cn('size-4 transition-transform duration-base ease-out', open ? 'rotate-0' : '-rotate-90')} />
                            </button>
                          </td>
                          <td className={cn(cell, 'pr-4 align-top')}>
                            <p className="font-medium">{SPEC_LABEL[item.material_specification] ?? item.material_specification}</p>
                            {!compact && <p className="text-xs text-slate-600">{FAMILY_LABEL[item.material_family]}</p>}
                            {item.organization && <p className="max-w-[14rem] truncate text-xs text-copper-700">{item.organization.name}</p>}
                          </td>
                          {show('dimensions') && (
                            <td className={cn(cell, 'whitespace-nowrap pr-4 align-top font-mono text-xs')}>
                              {dimsOf(item)} <span className="text-slate-600">· {gaugeOf(item)}</span>
                            </td>
                          )}
                          {show('stock') && (
                            <td className={cn(cell, 'whitespace-nowrap pr-4 text-right align-top tabular-nums')}>
                              <span className="font-medium">{num(item.available_quantity)}</span>
                              <span className="text-slate-600"> / {num(item.total_quantity)}</span>
                              {item.reserved_quantity > 0 && <p className="text-xs text-copper-700">{num(item.reserved_quantity)} reserved</p>}
                            </td>
                          )}
                          {show('condition') && (
                            <td className={cn(cell, 'pr-4 align-top')}>
                              <Tag>{CONDITION_LABEL[item.condition] ?? item.condition}</Tag>
                            </td>
                          )}
                          {show('price') && (
                            <td className={cn(cell, 'whitespace-nowrap pr-4 text-right align-top tabular-nums')}>
                              {bdt(item.unit_price_bdt)}
                              <span className="text-xs text-slate-600"> /pc</span>
                            </td>
                          )}
                          {show('location') && (
                            <td className={cn(cell, 'whitespace-nowrap pr-4 align-top')}>
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="size-3.5 text-slate-500" aria-hidden /> {item.city}
                              </span>
                            </td>
                          )}
                          {show('status') && (
                            <td className={cn(cell, 'pr-4 align-top')}>
                              <StatusBadge tone={STATUS_TONE[item.status] ?? 'neutral'}>{item.status.toLowerCase()}</StatusBadge>
                            </td>
                          )}
                          <td className={cn(cell, 'align-top')}>
                            <Actions item={item} layout="row" />
                          </td>
                        </motion.tr>
                        {open && (
                          <tr id={`listing-${item.id}`} className="border-b border-graphite/[0.08] bg-sand-50">
                            <td />
                            <td colSpan={visibleColumnCount - 1} className="pb-5 pr-4">
                              <Collapse open={open}>
                                <div className="grid gap-6 pt-1 md:grid-cols-3">
                                  <div className="space-y-1 md:col-span-2">
                                    <p className="t-label">Description</p>
                                    <p className="text-[14px] leading-relaxed text-graphite/90">{item.description || 'No description provided.'}</p>
                                  </div>
                                  <dl className="grid grid-cols-2 gap-3 text-[14px]">
                                    <div>
                                      <dt className="t-label">Total</dt>
                                      <dd className="tabular-nums">{num(item.total_quantity)} pcs</dd>
                                    </div>
                                    <div>
                                      <dt className="t-label">Reserved</dt>
                                      <dd className="tabular-nums">{num(item.reserved_quantity)} pcs</dd>
                                    </div>
                                    <div>
                                      <dt className="t-label">Supplier</dt>
                                      <dd className="truncate">{item.organization?.name ?? '—'}</dd>
                                    </div>
                                    <div>
                                      <dt className="t-label">Listed</dt>
                                      <dd>{new Date(item.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</dd>
                                    </div>
                                  </dl>
                                </div>
                              </Collapse>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
        <LoadMore shown={shown} total={total} onMore={more} noun="listings" />
      </div>
    </>
  );
}

function Chip({ children, onClear }: { children: React.ReactNode; onClear: () => void }) {
  return (
    <span className="inline-flex h-6 items-center gap-1 rounded-xs bg-graphite/[0.06] pl-2 pr-1 text-xs text-graphite">
      {children}
      <button type="button" onClick={onClear} className="rounded-xs p-0.5 text-slate-600 hover:bg-graphite/10 hover:text-graphite" aria-label="Remove filter">
        <X className="size-3" />
      </button>
    </span>
  );
}

