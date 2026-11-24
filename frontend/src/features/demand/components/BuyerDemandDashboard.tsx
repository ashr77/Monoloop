'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { ArrowRight, Building2, ChevronDown, Cpu, Edit3, Plus, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Fragment, useEffect, useMemo, useState } from 'react';
import { Collapse, rowMotion } from '@/components/motion';
import {
  Button,
  EmptyState,
  ErrorState,
  LinkButton,
  LoadMore,
  Menu,
  MenuCheckItem,
  MenuLabel,
  Note,
  PageHeader,
  SearchInput,
  SectionHeading,
  Segmented,
  Skeleton,
  StatusBadge,
  TableSkeleton,
  Toast,
  ToolbarSelect,
  type ToastMessage,
  type Tone,
} from '@/components/ui';
import { DEMO_BUYER_ORGANIZATIONS } from '@/features/demand/data/demoBuyers';
import { RequestExchangeButton } from '@/features/exchanges/components/RequestExchangeButton';
import { SPEC_LABEL, bdt, num } from '@/features/exchanges/components/format';
import type { MatchResult } from '@/features/matching/types';
import { useMatch, useOrganizations, useRequirements } from '@/hooks';
import { sortBy, useIncremental, usePersistentState } from '@/hooks/useViewPrefs';
import { errorMessage } from '@/lib/api/client';
import { useIdentity } from '@/lib/auth/AuthProvider';
import { DEMO_ORGANIZATIONS, MaterialFamily } from '@/lib/constants';
import { axisLabel } from '@/lib/dimensions';
import { MaterialRequirement, Organization } from '@/lib/types';
import { cn } from '@/lib/utils';
import { BuyerStatsCards } from './BuyerStatsCards';
import { RequirementFormModal } from './RequirementFormModal';

type StatusFilter = 'ALL' | 'OPEN' | 'FULFILLED' | 'CANCELLED';
type SortId = 'newest' | 'oldest' | 'quantity' | 'budget';
const SORTS: { id: SortId; label: string }[] = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'quantity', label: 'Largest quantity' },
  { id: 'budget', label: 'Highest budget' },
];
const STATUS_TONE: Record<string, Tone> = { OPEN: 'success', FULFILLED: 'copper', CANCELLED: 'muted' };
const FAMILY_LABEL: Record<string, string> = { STAINLESS_STEEL_SHEET: 'Stainless steel sheet', PLYWOOD_PANEL: 'Plywood panel' };

export function BuyerDemandDashboard() {
  const identity = useIdentity();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [pickedOrgId, setSelectedOrgId] = useState('ALL');
  const selectedOrgId = identity.locked ? identity.organizationId ?? 'ALL' : pickedOrgId;
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [familyFilter, setFamilyFilter] = useState<'ALL' | MaterialFamily>('ALL');
  const [sort, setSort] = usePersistentState<SortId>('demand.sort', 'newest');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRequirement | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [recommendationRequirementId, setRecommendationRequirementId] = useState<string | null>(null);
  const [recommendationOrganizationId, setRecommendationOrganizationId] = useState<string | null>(null);
  const recommendationQuery = useMatch(recommendationRequirementId || '', recommendationOrganizationId || undefined);

  // Data comes from the FastAPI backend through cached hooks (src/hooks).
  const orgsQuery = useOrganizations();
  const organizations = useMemo(() => {
    const live = orgsQuery.data;
    if (!live) return [...DEMO_ORGANIZATIONS, ...DEMO_BUYER_ORGANIZATIONS] as unknown as Organization[];
    return [...live, ...DEMO_BUYER_ORGANIZATIONS.filter((demo) => !live.some((o) => o.id === demo.id))];
  }, [orgsQuery.data]);

  const requirementsQuery = useRequirements(
    selectedOrgId === 'ALL' ? {} : { organization_id: selectedOrgId },
    selectedOrgId === 'ALL' ? undefined : selectedOrgId
  );
  const requirements = useMemo(() => requirementsQuery.data?.items ?? [], [requirementsQuery.data]);
  const pendingMatchRequirementIds = requirementsQuery.data?.meta.pending_match_requirement_ids ?? [];
  const fulfilledQuantities = requirementsQuery.data?.meta.fulfilled_quantities_by_requirement ?? {};
  const loading = requirementsQuery.isPending;
  const loadError = requirementsQuery.isError ? errorMessage(requirementsQuery.error, 'Failed to load requirements.') : '';
  const fetchRequirements = () => void requirementsQuery.refetch();

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  // "Post a requirement" links elsewhere arrive with ?compose=1.
  const compose = searchParams.get('compose') === '1';
  useEffect(() => {
    if (!compose || identity.mode === 'loading') return;
    if (!identity.isAdmin) openCreate();
    const params = new URLSearchParams(searchParams.toString());
    params.delete('compose');
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compose, identity.mode, identity.isAdmin]);

  const openEdit = (requirement: MaterialRequirement) => {
    setEditing(requirement);
    setModalOpen(true);
  };

  const onSaved = (saved: MaterialRequirement) => {
    setToast({ kind: 'success', message: editing ? 'Requirement updated.' : 'Requirement published.' });
    if (!editing) {
      setRecommendationRequirementId(saved.id);
      setRecommendationOrganizationId(saved.organization_id);
    }
    fetchRequirements();
  };

  const orgName = (r: MaterialRequirement) =>
    r.organization?.name || organizations.find((organization) => organization.id === r.organization_id)?.name || '';

  const filtered = useMemo(() => {
    const query = searchTerm.toLowerCase();
    const rows = requirements.filter((requirement) => {
      if (statusFilter !== 'ALL' && requirement.status !== statusFilter) return false;
      if (familyFilter !== 'ALL' && requirement.material_family !== familyFilter) return false;
      return (
        !query ||
        requirement.material_specification.toLowerCase().includes(query) ||
        orgName(requirement).toLowerCase().includes(query) ||
        requirement.status.toLowerCase().includes(query)
      );
    });
    switch (sort) {
      case 'oldest':
        return sortBy(rows, (r) => r.created_at, 'asc');
      case 'quantity':
        return sortBy(rows, (r) => r.required_quantity, 'desc');
      case 'budget':
        return sortBy(rows, (r) => Number(r.maximum_budget_bdt ?? -1), 'desc');
      default:
        return sortBy(rows, (r) => r.created_at, 'desc');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requirements, searchTerm, statusFilter, familyFilter, sort, organizations]);

  const { visible, more, shown, total } = useIncremental(filtered, 12, [searchTerm, statusFilter, familyFilter, sort, selectedOrgId].join('|'));
  const counts = useMemo(() => {
    const c = { ALL: requirements.length, OPEN: 0, FULFILLED: 0, CANCELLED: 0 } as Record<StatusFilter, number>;
    for (const r of requirements) c[r.status as StatusFilter] = (c[r.status as StatusFilter] ?? 0) + 1;
    return c;
  }, [requirements]);
  const anyFilter = searchTerm !== '' || statusFilter !== 'ALL' || familyFilter !== 'ALL';
  const clearAll = () => {
    setSearchTerm('');
    setStatusFilter('ALL');
    setFamilyFilter('ALL');
  };

  const activeBuyer = organizations.find((organization) => organization.id === selectedOrgId);
  const pendingSet = new Set(pendingMatchRequirementIds);

  return (
    <div className="page-shell pb-20">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <PageHeader
        eyebrow="Demand · Requirements"
        title={identity.locked ? 'Your material requirements' : 'Buyer material requirements'}
        description="Publish exact specifications and find compatible surplus inventory."
        actions={
          <>
            {identity.locked ? (
              identity.organization && (
                <span className="inline-flex h-10 items-center gap-2 rounded-sm border border-graphite/15 px-3 text-[14px] font-medium text-graphite">
                  <Building2 className="size-4 text-slate-500" aria-hidden /> {identity.organization.name}
                </span>
              )
            ) : (
              <ToolbarSelect
                label="Buyer"
                icon={<Building2 className="size-3.5" />}
                value={selectedOrgId}
                onChange={(event) => setSelectedOrgId(event.target.value)}
                className="h-10 max-w-[20rem]"
              >
                <option value="ALL">All demo buyers</option>
                {organizations
                  .filter((organization) => organization.organization_type === 'BUYER' || organization.organization_type === 'HYBRID')
                  .map((organization) => (
                    <option key={organization.id} value={organization.id}>
                      {organization.name}
                    </option>
                  ))}
              </ToolbarSelect>
            )}
            <Button onClick={openCreate} leading={<Plus className="size-4" />}>
              New requirement
            </Button>
          </>
        }
      >
        <BuyerStatsCards
          requirements={requirements}
          pendingMatchRequirementIds={pendingMatchRequirementIds}
          fulfilledQuantities={fulfilledQuantities}
        />
      </PageHeader>

      {recommendationRequirementId && (
        <Recommendations
          requirementId={recommendationRequirementId}
          organizationId={recommendationOrganizationId}
          query={recommendationQuery}
          onDismiss={() => {
            setRecommendationRequirementId(null);
            setRecommendationOrganizationId(null);
          }}
        />
      )}

      <section className="space-y-5 pt-8" aria-labelledby="requirements-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 id="requirements-heading" className="text-heading-md font-medium">
              {activeBuyer ? `${activeBuyer.name} requirements` : 'Published requirements'}
            </h2>
            <p className="font-mono text-xs text-slate-600">{requirements.length} loaded</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={fetchRequirements}
            aria-label="Refresh requirements"
            leading={<RefreshCw className={`size-3.5 ${requirementsQuery.isFetching ? 'animate-spin' : ''}`} />}
          >
            Refresh
          </Button>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-4 overflow-x-auto px-4 scrollbar-none sm:mx-0 sm:px-0">
            <Segmented
              label="Requirement status"
              variant="tabs"
              value={statusFilter}
              onChange={setStatusFilter}
              options={[
                { value: 'ALL', label: 'All', count: counts.ALL },
                { value: 'OPEN', label: 'Open', count: counts.OPEN },
                { value: 'FULFILLED', label: 'Fulfilled', count: counts.FULFILLED },
                { value: 'CANCELLED', label: 'Cancelled', count: counts.CANCELLED },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <SearchInput value={searchTerm} onChange={setSearchTerm} label="Search requirements" placeholder="Search requirements…" className="w-full sm:w-64" />
            <ToolbarSelect label="Material family" value={familyFilter} onChange={(e) => setFamilyFilter(e.target.value as 'ALL' | MaterialFamily)}>
              <option value="ALL">All materials</option>
              <option value="STAINLESS_STEEL_SHEET">Stainless steel</option>
              <option value="PLYWOOD_PANEL">Plywood panel</option>
            </ToolbarSelect>
            <Menu label="Sort requirements" align="end" width="w-52" trigger={<span>Sort: {SORTS.find((s) => s.id === sort)?.label}</span>}>
              <MenuLabel>Sort by</MenuLabel>
              {SORTS.map((s) => (
                <MenuCheckItem key={s.id} radio checked={sort === s.id} onCheckedChange={() => setSort(s.id)}>
                  {s.label}
                </MenuCheckItem>
              ))}
            </Menu>
          </div>
        </div>

        {loading ? (
          <TableSkeleton rows={5} columns={6} label="Loading requirements" />
        ) : loadError ? (
          <ErrorState title="Requirements could not be loaded" message={loadError} onRetry={fetchRequirements} />
        ) : filtered.length === 0 ? (
          <EmptyState
            title={anyFilter ? 'No requirements match these filters' : 'No material requirements found'}
            description={anyFilter ? 'Clear the filters to see every requirement.' : 'Create your first requirement to start finding supply.'}
            action={
              anyFilter ? (
                <Button variant="secondary" onClick={clearAll}>
                  Clear filters
                </Button>
              ) : (
                <Button onClick={openCreate} leading={<Plus className="size-4" />}>
                  Create requirement
                </Button>
              )
            }
          />
        ) : (
          <>
          {/* Phones: one card per requirement instead of an 8-column table. */}
          <ul className="divide-y divide-graphite/[0.08] border-y border-graphite/15 md:hidden">
            {visible.map((requirement) => (
              <li key={requirement.id} className="space-y-2 py-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium text-graphite">
                      {SPEC_LABEL[requirement.material_specification] ?? requirement.material_specification}
                      <span className="font-normal text-slate-600"> · {FAMILY_LABEL[requirement.material_family]}</span>
                    </p>
                    <p className="truncate text-sm text-copper-700">{orgName(requirement) || 'Unknown buyer'}</p>
                  </div>
                  <StatusBadge tone={STATUS_TONE[requirement.status] ?? 'neutral'}>{requirement.status.toLowerCase()}</StatusBadge>
                </div>
                <p className="font-mono text-sm text-graphite">
                  {axisLabel(requirement, 'length')} × {axisLabel(requirement, 'width')}
                  <span className="text-slate-600"> · {axisLabel(requirement, 'thickness')} mm</span>
                </p>
                <p className="text-sm text-slate-700">
                  <span className="font-medium tabular-nums text-graphite">{num(requirement.required_quantity)}</span> pcs
                  {requirement.maximum_budget_bdt !== null && requirement.maximum_budget_bdt !== undefined && (
                    <> · up to {bdt(Number(requirement.maximum_budget_bdt))}</>
                  )}
                  {requirement.allow_split_suppliers && <> · multi-supplier</>}
                </p>
                <div className="flex items-center gap-2 pt-1">
                  <Link
                    href={`/matches/${requirement.id}`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-sm bg-graphite px-3 text-sm font-medium text-cream transition-colors hover:bg-graphite-700"
                  >
                    <Cpu className="size-4" aria-hidden />
                    Find matches
                  </Link>
                  {requirement.status === 'OPEN' && (
                    <button
                      type="button"
                      onClick={() => openEdit(requirement)}
                      className="inline-flex h-9 items-center gap-1.5 rounded-sm px-3 text-sm text-slate-700 hover:bg-graphite/[0.06]"
                    >
                      <Edit3 className="size-4" aria-hidden />
                      Edit
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="-mx-4 hidden overflow-x-auto px-4 sm:mx-0 sm:px-0 md:block">
            <table className="w-full border-collapse text-left lg:min-w-[52rem]">
              <thead>
                <tr className="border-b border-graphite/15">
                  <th scope="col" className="w-8 pb-2" aria-label="Expand" />
                  <th scope="col" className="t-label pb-2 pr-4 font-medium">Material</th>
                  <th scope="col" className="t-label pb-2 pr-4 font-medium">L × W · thickness (mm)</th>
                  <th scope="col" className="t-label pb-2 pr-4 text-right font-medium">Quantity</th>
                  <th scope="col" className="t-label hidden pb-2 pr-4 text-right font-medium lg:table-cell">Maximum budget</th>
                  <th scope="col" className="t-label pb-2 pr-4 font-medium">Status</th>
                  <th scope="col" className="t-label hidden pb-2 pr-4 font-medium lg:table-cell">Created</th>
                  <th scope="col" className="t-label pb-2 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[14px] text-graphite">
                <AnimatePresence initial={false}>
                  {visible.map((requirement) => {
                    const open = expanded === requirement.id;
                    const name = orgName(requirement) || 'Unknown buyer';
                    const fulfilled = fulfilledQuantities[requirement.id] ?? 0;
                    return (
                      <Fragment key={requirement.id}>
                        <motion.tr {...rowMotion} className={cn('border-b border-graphite/[0.08] transition-colors duration-fast hover:bg-sand-50', open && 'bg-sand-50')}>
                          <td className="py-3.5 pr-1 align-top">
                            <button
                              type="button"
                              onClick={() => setExpanded(open ? null : requirement.id)}
                              aria-expanded={open}
                              aria-controls={`req-${requirement.id}`}
                              aria-label={open ? 'Hide requirement details' : 'Show requirement details'}
                              className="mt-0.5 rounded-xs p-0.5 text-slate-500 hover:bg-graphite/[0.06] hover:text-graphite"
                            >
                              <ChevronDown className={cn('size-4 transition-transform duration-base ease-out', open ? 'rotate-0' : '-rotate-90')} />
                            </button>
                          </td>
                          <td className="py-3.5 pr-4 align-top">
                            <p className="font-medium">{SPEC_LABEL[requirement.material_specification] ?? requirement.material_specification}</p>
                            <p className="text-xs text-slate-600">{FAMILY_LABEL[requirement.material_family]}</p>
                            <p className="max-w-[14rem] truncate text-xs text-copper-700">{name}</p>
                          </td>
                          <td className="whitespace-nowrap py-3.5 pr-4 align-top font-mono text-xs">
                            {axisLabel(requirement, 'length')} × {axisLabel(requirement, 'width')}
                            <span className="text-slate-600"> · {axisLabel(requirement, 'thickness')}</span>
                          </td>
                          <td className="whitespace-nowrap py-3.5 pr-4 text-right align-top tabular-nums">
                            <span className="font-medium">{num(requirement.required_quantity)}</span> pcs
                            {requirement.allow_split_suppliers && <p className="text-xs text-slate-600">Multi-supplier allowed</p>}
                          </td>
                          <td className="hidden whitespace-nowrap py-3.5 pr-4 text-right align-top tabular-nums lg:table-cell">
                            {requirement.maximum_budget_bdt === null || requirement.maximum_budget_bdt === undefined ? (
                              <span className="text-slate-600">Not set</span>
                            ) : (
                              bdt(Number(requirement.maximum_budget_bdt))
                            )}
                          </td>
                          <td className="py-3.5 pr-4 align-top">
                            <StatusBadge tone={STATUS_TONE[requirement.status] ?? 'neutral'}>{requirement.status.toLowerCase()}</StatusBadge>
                            {pendingSet.has(requirement.id) && requirement.status === 'OPEN' && (
                              <p className="mt-1 text-xs text-copper-700">Exchange proposed</p>
                            )}
                          </td>
                          <td className="hidden whitespace-nowrap py-3.5 pr-4 align-top font-mono text-xs text-slate-600 lg:table-cell">
                            {new Date(requirement.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-3.5 align-top">
                            <div className="flex justify-end gap-1.5">
                              {requirement.status === 'OPEN' && (
                                <button
                                  type="button"
                                  onClick={() => openEdit(requirement)}
                                  title="Edit requirement"
                                  aria-label="Edit requirement"
                                  className="inline-flex size-7 items-center justify-center rounded-sm text-slate-600 hover:bg-graphite/[0.06] hover:text-graphite"
                                >
                                  <Edit3 className="size-4" />
                                </button>
                              )}
                              <Link
                                href={`/matches/${requirement.id}`}
                                aria-label="Find matches"
                                title="Find matches"
                                className="inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-sm bg-graphite px-2.5 text-xs font-medium text-cream transition-colors hover:bg-graphite-700"
                              >
                                <Cpu className="size-3.5" aria-hidden />
                                <span className="hidden lg:inline">Find matches</span>
                              </Link>
                            </div>
                          </td>
                        </motion.tr>
                        {open && (
                          <tr id={`req-${requirement.id}`} className="border-b border-graphite/[0.08] bg-sand-50">
                            <td />
                            <td colSpan={7} className="pb-5 pr-4">
                              <Collapse open={open}>
                                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 pt-1 text-[14px] md:grid-cols-4">
                                  {(['length', 'width', 'thickness'] as const).map((axis) => (
                                    <div key={axis}>
                                      <dt className="t-label">{axis}</dt>
                                      <dd className="font-mono">{axisLabel(requirement, axis)} {axisLabel(requirement, axis) === 'any' ? '' : 'mm'}</dd>
                                    </div>
                                  ))}
                                  <div>
                                    <dt className="t-label">Condition</dt>
                                    <dd>{requirement.condition_requirement === 'ANY' ? 'Any' : requirement.condition_requirement.toLowerCase()}</dd>
                                  </div>
                                  <div>
                                    <dt className="t-label">Sourcing</dt>
                                    <dd>{requirement.allow_split_suppliers ? 'Multiple suppliers may combine' : 'Single supplier only'}</dd>
                                  </div>
                                  <div>
                                    <dt className="t-label">Fulfilled so far</dt>
                                    <dd className="tabular-nums">
                                      {num(fulfilled)} / {num(requirement.required_quantity)} pcs
                                    </dd>
                                  </div>
                                  <div>
                                    <dt className="t-label">Buyer</dt>
                                    <dd className="truncate">{name}</dd>
                                  </div>
                                  <div>
                                    <dt className="t-label">Reference</dt>
                                    <dd className="font-mono text-xs">{requirement.id.slice(0, 8)}</dd>
                                  </div>
                                </dl>
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
          </>
        )}
        {!loading && !loadError && <LoadMore shown={shown} total={total} onMore={more} noun="requirements" />}
      </section>

      <RequirementFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSuccess={onSaved}
        initialData={editing}
        organizations={organizations}
        selectedOrgId={selectedOrgId !== 'ALL' ? selectedOrgId : undefined}
      />
    </div>
  );
}

/* ------------------------------------------------- recommended supplies */

function Recommendations({
  requirementId,
  organizationId,
  query,
  onDismiss,
}: {
  requirementId: string;
  organizationId: string | null;
  query: ReturnType<typeof useMatch>;
  onDismiss: () => void;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="mt-8 border-l-2 border-copper bg-sand-50 px-5 py-6 sm:px-7"
      aria-labelledby="recommended-heading"
    >
      <SectionHeading
        id="recommended-heading"
        title="Recommended supplies"
        hint="For your newly created requirement. Technically compatible listings, checked against every mandatory rule."
        action={
          <div className="flex items-center gap-2">
            {query.isFetching && <RefreshCw className="size-4 animate-spin text-slate-500" aria-label="Refreshing" />}
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Dismiss
            </Button>
          </div>
        }
      />
      <div className="mt-5">
        {query.isPending && (
          <div className="space-y-3" role="status" aria-label="Finding compatible available supply">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-16 w-full" />
            <p className="text-sm text-slate-600">Finding compatible available supply…</p>
          </div>
        )}
        {query.isError && <ErrorState title="Recommendations could not be loaded" message={errorMessage(query.error, 'Please try again.')} onRetry={() => void query.refetch()} />}
        {query.data &&
          (() => {
            const result: MatchResult = query.data.result;
            const compatible = result.evaluations
              .filter((evaluation) => evaluation.compatible)
              .sort((a, b) => b.available_quantity - a.available_quantity || a.unit_price_bdt - b.unit_price_bdt);
            const combinedAvailable = compatible.reduce((sum, evaluation) => sum + evaluation.available_quantity, 0);
            const required = result.requested_quantity;
            const fulfilment =
              combinedAvailable >= required
                ? { text: 'Full match available', tone: 'success' as const }
                : combinedAvailable > 0
                  ? { text: `Partial match: ${combinedAvailable}/${required} units available`, tone: 'warning' as const }
                  : { text: 'No compatible supply found', tone: 'danger' as const };

            return (
              <div className="space-y-5">
                <div className="flex flex-wrap gap-2">
                  <StatusBadge tone={fulfilment.tone}>
                    {fulfilment.text}
                  </StatusBadge>
                  {result.budget.status === 'OVER_BUDGET' && (
                    <StatusBadge tone="warning">
                      Over budget
                    </StatusBadge>
                  )}
                  {result.budget.status === 'WITHIN_BUDGET' && (
                    <StatusBadge tone="success">
                      Within budget
                    </StatusBadge>
                  )}
                </div>

                {compatible.length === 0 ? (
                  <p className="text-sm text-slate-700">No active, available supply listing satisfies every technical requirement.</p>
                ) : (
                  <ul className="divide-y divide-graphite/10 border-y border-graphite/10">
                    {compatible.map((evaluation, i) => {
                      const allocation =
                        result.allocations.find((item) => item.listing_id === evaluation.listing_id) ??
                        result.over_budget_alternative?.find((item) => item.listing_id === evaluation.listing_id);
                      return (
                        <motion.li
                          key={evaluation.listing_id}
                          initial={{ opacity: 0, y: 6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: i * 0.05 }}
                          className="grid gap-4 py-4 md:grid-cols-12 md:items-start"
                        >
                          <div className="md:col-span-4">
                            <p className="font-medium text-graphite">{evaluation.supplier_name}</p>
                            <p className="font-mono text-xs text-slate-600">
                              {evaluation.material_specification} · {evaluation.dimensions}
                            </p>
                            <p className="mt-1 text-xs text-slate-700">
                              {allocation
                                ? allocation.allocated_quantity >= evaluation.available_quantity
                                  ? 'Available stock included in the proposed allocation'
                                  : 'Partial quantity included in the proposed allocation'
                                : 'Technically compatible; not selected in the cheapest allocation'}
                            </p>
                          </div>
                          <dl className="grid grid-cols-3 gap-3 text-[14px] md:col-span-8 lg:grid-cols-6">
                            <Fact label="Available" value={`${evaluation.available_quantity} pcs`} />
                            <Fact label="Unit price" value={bdt(evaluation.unit_price_bdt)} />
                            {allocation && (
                              <>
                                <Fact label="Allocated" value={`${allocation.allocated_quantity} pcs`} />
                                <Fact label="Material" value={bdt(allocation.subtotal_bdt)} />
                                <Fact label="Transport" value={bdt(allocation.estimated_transport_bdt)} />
                                <Fact label="Distance" value={`${allocation.distance_km} km`} />
                              </>
                            )}
                          </dl>
                        </motion.li>
                      );
                    })}
                  </ul>
                )}

                {combinedAvailable > 0 && combinedAvailable < required && (
                  <Note tone="warning">
                    Combined availability: {combinedAvailable}/{required} units. {required - combinedAvailable} units remain unfulfilled.
                  </Note>
                )}
                {result.compatibility_explanations.length > 0 && (
                  <ol className="space-y-1.5">
                    {result.compatibility_explanations.map((line, index) => (
                      <li key={`${line}-${index}`} className="flex gap-3 text-[14px] text-slate-700">
                        <span className="font-mono text-xs text-copper-700">{String(index + 1).padStart(2, '0')}</span>
                        {line}
                      </li>
                    ))}
                  </ol>
                )}
                {result.allocations.length > 0 && (
                  <div className="flex flex-wrap items-center gap-3 pt-1">
                    <LinkButton href={`/matches/${requirementId}`} variant="secondary" size="sm" trailing={<ArrowRight className="size-3.5" />}>
                      Review matching details
                    </LinkButton>
                    {organizationId && (
                      <RequestExchangeButton
                        requirementId={requirementId}
                        buyerOrganizationId={organizationId}
                        className="inline-flex h-8 items-center gap-2 rounded-sm bg-copper-600 px-3 text-[14px] font-medium text-white hover:bg-copper-700 disabled:opacity-60"
                      />
                    )}
                  </div>
                )}
              </div>
            );
          })()}
      </div>
    </motion.section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="t-label">{label}</dt>
      <dd className="tabular-nums text-graphite">{value}</dd>
    </div>
  );
}

