'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Building2, Plus, RefreshCw, Search, Edit3, Cpu, FileText, AlertCircle } from 'lucide-react';
import { MaterialRequirement, Organization } from '@/lib/types';
import { DEMO_ORGANIZATIONS } from '@/lib/constants';
import { DEMO_BUYER_ORGANIZATIONS } from '@/features/demand/data/demoBuyers';
import { BuyerStatsCards } from './BuyerStatsCards';
import { RequirementFormModal } from './RequirementFormModal';
import { useOrganizations, useRequirements } from '@/hooks';
import { errorMessage } from '@/lib/api/client';

export function BuyerDemandDashboard() {
  const [selectedOrgId, setSelectedOrgId] = useState('ALL');
  const [searchTerm, setSearchTerm] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<MaterialRequirement | null>(null);
  const [toast, setToast] = useState('');

  // Data comes from the FastAPI backend through cached hooks (src/hooks).
  const orgsQuery = useOrganizations();
  const organizations = useMemo(() => {
    const live = orgsQuery.data;
    if (!live) return [...DEMO_ORGANIZATIONS, ...DEMO_BUYER_ORGANIZATIONS] as unknown as Organization[];
    return [...live, ...DEMO_BUYER_ORGANIZATIONS.filter((demo) => !live.some((o) => o.id === demo.id))];
  }, [orgsQuery.data]);

  const requirementsQuery = useRequirements(selectedOrgId === 'ALL' ? {} : { organization_id: selectedOrgId });
  const requirements = requirementsQuery.data?.items ?? [];
  const pendingMatchRequirementIds = requirementsQuery.data?.meta.pending_match_requirement_ids ?? [];
  const fulfilledQuantities = requirementsQuery.data?.meta.fulfilled_quantities_by_requirement ?? {};
  const loading = requirementsQuery.isPending;
  const loadError = requirementsQuery.isError ? errorMessage(requirementsQuery.error, 'Failed to load requirements.') : '';
  const fetchRequirements = () => void requirementsQuery.refetch();

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (requirement: MaterialRequirement) => {
    setEditing(requirement);
    setModalOpen(true);
  };

  const onSaved = () => {
    setToast(editing ? 'Requirement updated.' : 'Requirement published.');
    fetchRequirements();
    window.setTimeout(() => setToast(''), 4000);
  };

  const filtered = requirements.filter((requirement) => {
    const organizationName =
      requirement.organization?.name ||
      organizations.find((organization) => organization.id === requirement.organization_id)?.name ||
      '';
    const query = searchTerm.toLowerCase();
    return (
      !query ||
      requirement.material_specification.toLowerCase().includes(query) ||
      organizationName.toLowerCase().includes(query) ||
      requirement.status.toLowerCase().includes(query)
    );
  });

  const activeBuyer = organizations.find((organization) => organization.id === selectedOrgId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-sm flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="inline-flex rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold text-blue-800">
            Demand Management
          </span>
          <h1 className="mt-2 text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Buyer Material Requirements
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Publish exact specifications and find compatible surplus inventory.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1.5">
            <Building2 className="ml-1.5 h-4 w-4 text-slate-500" />
            <select
              value={selectedOrgId}
              onChange={(event) => setSelectedOrgId(event.target.value)}
              className="bg-transparent pr-2 text-xs font-bold text-slate-800 outline-none"
            >
              <option value="ALL">All Demo Buyers</option>
              {organizations
                .filter((organization) => organization.organization_type === 'BUYER' || organization.organization_type === 'HYBRID')
                .map((organization) => (
                  <option key={organization.id} value={organization.id}>
                    {organization.name}
                  </option>
                ))}
            </select>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            New Requirement
          </button>
        </div>
      </div>

      <BuyerStatsCards
        requirements={requirements}
        pendingMatchRequirementIds={pendingMatchRequirementIds}
        fulfilledQuantities={fulfilledQuantities}
      />

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">
              {activeBuyer ? `${activeBuyer.name} Requirements` : 'Published Requirements'}
            </h2>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
              {requirements.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search requirements..."
                className="rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <button
              type="button"
              onClick={fetchRequirements}
              className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100"
              aria-label="Refresh requirements"
            >
              <RefreshCw className={`h-4 w-4 ${requirementsQuery.isFetching ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-sm text-slate-500">
            <RefreshCw className="mx-auto mb-2 h-7 w-7 animate-spin text-emerald-600" />
            Loading requirements...
          </div>
        ) : loadError ? (
          <div className="m-4 rounded-xl border border-red-200 bg-red-50 p-6 text-center text-sm text-red-700">
            <AlertCircle className="mx-auto mb-2 h-6 w-6" />
            {loadError}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 font-semibold text-slate-700">No material requirements found</p>
            <p className="mt-1 text-sm text-slate-500">Create your first requirement to start finding supply.</p>
            <button type="button" onClick={openCreate} className="mt-4 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-bold text-white">
              Create Requirement
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3">Material</th>
                  <th className="px-4 py-3">Dimensions</th>
                  <th className="px-4 py-3">Quantity</th>
                  <th className="px-4 py-3">Maximum Budget</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm text-slate-700">
                {filtered.map((requirement) => {
                  const organizationName =
                    requirement.organization?.name ||
                    organizations.find((organization) => organization.id === requirement.organization_id)?.name ||
                    'Unknown buyer';
                  return (
                    <tr key={requirement.id} className="hover:bg-slate-50/70">
                      <td className="px-4 py-4">
                        <div className="font-bold text-slate-900">{requirement.material_specification}</div>
                        <div className="mt-0.5 text-xs text-slate-500">
                          {requirement.material_family === 'STAINLESS_STEEL_SHEET' ? 'Stainless Steel Sheet' : 'Plywood Panel'}
                        </div>
                        <div className="mt-0.5 text-[11px] font-medium text-blue-700">{organizationName}</div>
                      </td>
                      <td className="px-4 py-4 font-mono text-xs">
                        {requirement.length_mm} × {requirement.width_mm} mm
                        <div className="mt-1 text-slate-400">Thickness: {requirement.thickness_mm} mm</div>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-bold text-slate-900">{requirement.required_quantity}</span> pcs
                        {requirement.allow_split_suppliers && (
                          <div className="mt-1 text-[11px] text-emerald-700">Multi-supplier allowed</div>
                        )}
                      </td>
                      <td className="px-4 py-4 font-semibold">
                        {requirement.maximum_budget_bdt === null || requirement.maximum_budget_bdt === undefined
                          ? 'Not set'
                          : `BDT ${Number(requirement.maximum_budget_bdt).toLocaleString()}`}
                      </td>
                      <td className="px-4 py-4">
                        <span className={`rounded-full px-2 py-1 text-[11px] font-bold ${
                          requirement.status === 'OPEN'
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : requirement.status === 'FULFILLED'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : 'bg-slate-100 text-slate-600 border border-slate-200'
                        }`}>
                          {requirement.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500">
                        {new Date(requirement.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-end gap-2">
                          {requirement.status === 'OPEN' && (
                            <button type="button" onClick={() => openEdit(requirement)} title="Edit requirement" className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-100">
                              <Edit3 className="h-4 w-4" />
                            </button>
                          )}
                          <Link href={`/matches/${requirement.id}`} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800">
                            <Cpu className="h-3.5 w-3.5" />
                            Find Matches
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
