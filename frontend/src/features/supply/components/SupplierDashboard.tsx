'use client';

import { useState } from 'react';
import {
  Plus,
  RefreshCw,
  Building2,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { MaterialListing, Organization } from '@/lib/types';
import { DEMO_ORGANIZATIONS } from '@/lib/constants';
import { useIdentity } from '@/lib/auth/AuthProvider';
import { SupplierStatsCards } from './SupplierStatsCards';
import { SupplierListingTable } from './SupplierListingTable';
import { ListingFormModal } from './ListingFormModal';
import { useListings, useOrganizations } from '@/hooks';
import { errorMessage } from '@/lib/api/client';

export function SupplierDashboard() {
  const identity = useIdentity();
  const [pickedOrgId, setSelectedOrgId] = useState<string>('ALL');
  // Signed in (AUTH_MODE=jwt): the company's own listings by default, or the whole marketplace.
  const [scope, setScope] = useState<'MINE' | 'ALL'>('MINE');
  const ownOrgId = identity.locked ? identity.organizationId : null;
  const selectedOrgId = identity.locked ? (scope === 'MINE' && ownOrgId ? ownOrgId : 'ALL') : pickedOrgId;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<MaterialListing | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pickedBuyerId, setBuyerOrganizationId] = useState('');
  const buyerOrganizationId = ownOrgId ?? pickedBuyerId; // a signed-in company always orders as itself

  // Data comes from the FastAPI backend through cached hooks (src/hooks).
  const orgsQuery = useOrganizations();
  const organizations = orgsQuery.data ?? (DEMO_ORGANIZATIONS as unknown as Organization[]);
  const listingsQuery = useListings(selectedOrgId !== 'ALL' ? { organization_id: selectedOrgId } : {});
  const listings = listingsQuery.data ?? [];
  const isLoading = listingsQuery.isPending;
  const isRefreshing = listingsQuery.isFetching;
  const fetchListings = () => void listingsQuery.refetch();

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleOpenCreate = () => {
    setEditingListing(null);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (listing: MaterialListing) => {
    setEditingListing(listing);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    showToast(
      editingListing
        ? 'Listing attributes successfully updated!'
        : 'New surplus listing published to the network!'
    );
    fetchListings();
  };

  const activeSupplier = organizations.find((o) => o.id === selectedOrgId);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-emerald-700 text-white px-4 py-3 rounded-xl shadow-lg flex items-center gap-2 text-sm animate-bounce">
          <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Banner / Supplier Context Switcher */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
              Supply Management (Member 1)
            </span>
            <span className="text-xs text-slate-400 font-mono">TSUNAGU Hackathon 2026</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight mt-1">
            Supplier Surplus Inventory Portal
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Catalog surplus offcuts, sheets, and excess materials. Available inventory feeds the matching engine.
          </p>
        </div>

        {/* Demo Organization Switcher & Create Action */}
        <div className="flex flex-wrap items-center gap-3">
          {identity.locked ? (
            <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
              <Building2 className="w-4 h-4 text-slate-500 ml-1.5" />
              <select
                value={ownOrgId ? scope : 'ALL'}
                onChange={(e) => setScope(e.target.value as 'MINE' | 'ALL')}
                className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-2"
                aria-label="Which listings to show"
              >
                {ownOrgId && <option value="MINE">My listings · {identity.organization?.name}</option>}
                <option value="ALL">All companies (marketplace)</option>
              </select>
            </div>
          ) : (
          <div className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
            <Building2 className="w-4 h-4 text-slate-500 ml-1.5" />
            <select
              value={selectedOrgId}
              onChange={(e) => setSelectedOrgId(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-2"
            >
              <option value="ALL">All Demo Suppliers (Combined View)</option>
              {DEMO_ORGANIZATIONS.filter((o) => o.organization_type === 'SUPPLIER').map((org) => (
                <option key={org.id} value={org.id}>
                  {org.name} ({org.city})
                </option>
              ))}
            </select>
          </div>
          )}

          {!identity.isAdmin && (
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>+ Create Surplus Listing</span>
          </button>
          )}
        </div>
      </div>

      {/* Information Note */}
      <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl text-xs text-emerald-900 flex items-start gap-3">
        <Info className="w-4 h-4 text-emerald-600 flex-shrink-0 mt-0.5" />
        <div>
          <strong>Atomic Inventory Invariant:</strong> Available Quantity = Total Quantity &minus; Reserved Quantity.
          Reserved stock cannot be manually overwritten or released without transactional exchange resolution.
          AI assistant provides speed with strict human verification.
        </div>
      </div>

      {/* KPI Stats Cards */}
      <SupplierStatsCards listings={listings} />

      {/* Listing Management Table */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-slate-900">
              {activeSupplier ? `${activeSupplier.name} Listings` : 'All Registered Surplus Inventory'}
            </h2>
            <span className="text-xs bg-slate-100 text-slate-600 font-semibold px-2 py-0.5 rounded-full">
              {listings.length} items
            </span>
          </div>

          <button
            onClick={fetchListings}
            disabled={isRefreshing}
            className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 text-xs flex items-center gap-1 transition"
            title="Refresh Data"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>

        {listingsQuery.isError ? (
          <div className="p-8 text-center bg-white rounded-2xl border border-red-200 text-red-700 text-sm" role="alert">
            {errorMessage(listingsQuery.error, 'Failed to load listings.')}
          </div>
        ) : isLoading ? (
          <div className="p-12 text-center text-slate-400 bg-white rounded-2xl border border-slate-200">
            <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-600">Loading surplus inventory...</p>
          </div>
        ) : (
          <SupplierListingTable
            listings={listings}
            onEdit={handleOpenEdit}
            onRefresh={fetchListings}
            organizations={organizations}
            buyerOrganizationId={buyerOrganizationId}
            onBuyerOrganizationChange={setBuyerOrganizationId}
            buyerLocked={identity.locked}
          />
        )}
      </div>

      {/* Create / Edit Modal */}
      <ListingFormModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={handleModalSuccess}
        initialData={editingListing}
        selectedOrgId={ownOrgId ?? (selectedOrgId !== 'ALL' ? selectedOrgId : undefined)}
        organizations={organizations}
      />
    </div>
  );
}
