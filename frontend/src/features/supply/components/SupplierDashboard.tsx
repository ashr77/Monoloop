'use client';

import { Building2, Plus, RefreshCw } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, ErrorState, Note, PageHeader, Segmented, TableSkeleton, Toast, ToolbarSelect, type ToastMessage } from '@/components/ui';
import { useListings, useOrganizations } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { useIdentity } from '@/lib/auth/AuthProvider';
import { DEMO_ORGANIZATIONS } from '@/lib/constants';
import { MaterialListing, Organization } from '@/lib/types';
import { ListingFormModal } from './ListingFormModal';
import { SupplierListingTable } from './SupplierListingTable';
import { SupplierStatsCards } from './SupplierStatsCards';

export function SupplierDashboard() {
  const identity = useIdentity();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [pickedOrgId, setSelectedOrgId] = useState<string>('ALL');
  // Signed in (AUTH_MODE=jwt): the company's own listings by default, or the whole marketplace.
  // The choice is mirrored in the URL (?scope=all) so the marketplace has its own link.
  const scope: 'MINE' | 'ALL' = searchParams.get('scope') === 'all' ? 'ALL' : 'MINE';
  const setScope = (next: 'MINE' | 'ALL') => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === 'ALL') params.set('scope', 'all');
    else params.delete('scope');
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false });
  };
  const ownOrgId = identity.locked ? identity.organizationId : null;
  const selectedOrgId = identity.locked ? (scope === 'MINE' && ownOrgId ? ownOrgId : 'ALL') : pickedOrgId;
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingListing, setEditingListing] = useState<MaterialListing | null>(null);
  const [toast, setToast] = useState<ToastMessage | null>(null);
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

  const handleOpenCreate = () => {
    setEditingListing(null);
    setIsModalOpen(true);
  };

  // "List surplus" links elsewhere arrive with ?compose=1: open the form once, then drop the flag.
  const compose = searchParams.get('compose') === '1';
  useEffect(() => {
    if (!compose || identity.mode === 'loading') return;
    if (!identity.isAdmin) handleOpenCreate();
    const params = new URLSearchParams(searchParams.toString());
    params.delete('compose');
    router.replace(`${pathname}${params.size ? `?${params}` : ''}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [compose, identity.mode, identity.isAdmin]);

  const handleOpenEdit = (listing: MaterialListing) => {
    setEditingListing(listing);
    setIsModalOpen(true);
  };

  const handleModalSuccess = () => {
    setToast({
      kind: 'success',
      message: editingListing ? 'Listing attributes successfully updated!' : 'New surplus listing published to the network!',
    });
    fetchListings();
  };

  const activeSupplier = organizations.find((o) => o.id === selectedOrgId);
  const marketplace = selectedOrgId === 'ALL';

  const title = marketplace ? 'Surplus marketplace' : identity.locked ? 'Your surplus inventory' : `${activeSupplier?.name ?? 'Supplier'} inventory`;

  return (
    <div className="page-shell pb-20">
      <Toast toast={toast} onDismiss={() => setToast(null)} />

      <PageHeader
        eyebrow={marketplace ? 'Supply · Marketplace' : 'Supply · Inventory'}
        title={title}
        description={
          marketplace
            ? 'Every surplus listing on the network: offcuts, sheets and excess stock with their exact specifications. Available inventory feeds the matching engine.'
            : 'Catalogue surplus offcuts, sheets and excess materials. Available inventory feeds the matching engine.'
        }
        actions={
          <>
            {identity.locked ? (
              ownOrgId ? (
                <Segmented
                  label="Which listings to show"
                  size="md"
                  value={scope}
                  onChange={setScope}
                  options={[
                    { value: 'MINE', label: 'My listings' },
                    { value: 'ALL', label: 'Marketplace' },
                  ]}
                />
              ) : null
            ) : (
              <ToolbarSelect
                label="Supplier"
                icon={<Building2 className="size-3.5" />}
                value={selectedOrgId}
                onChange={(e) => setSelectedOrgId(e.target.value)}
                className="h-10 max-w-[20rem]"
              >
                <option value="ALL">All demo suppliers (combined view)</option>
                {DEMO_ORGANIZATIONS.filter((o) => o.organization_type === 'SUPPLIER').map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name} ({org.city})
                  </option>
                ))}
              </ToolbarSelect>
            )}
            {!identity.isAdmin && (
              <Button onClick={handleOpenCreate} leading={<Plus className="size-4" />}>
                Post surplus
              </Button>
            )}
          </>
        }
      >
        <SupplierStatsCards listings={listings} />
      </PageHeader>

      <section className="space-y-6 pt-8" aria-labelledby="listings-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <h2 id="listings-heading" className="text-heading-md font-medium">
              {activeSupplier ? `${activeSupplier.name} listings` : 'All registered surplus inventory'}
            </h2>
            <p className="font-mono text-xs text-slate-600">{listings.length} items loaded</p>
          </div>
          <Button variant="ghost" size="sm" onClick={fetchListings} disabled={isRefreshing} leading={<RefreshCw className={`size-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />}>
            Refresh
          </Button>
        </div>

        <Note>
          <strong className="font-medium text-graphite">Available = Total − Reserved.</strong> Reserved stock cannot be manually
          overwritten or released without transactional exchange resolution. The AI assistant provides speed with strict human
          verification.
        </Note>

        {listingsQuery.isError ? (
          <ErrorState title="Listings could not be loaded" message={errorMessage(listingsQuery.error, 'Failed to load listings.')} onRetry={fetchListings} />
        ) : isLoading ? (
          <TableSkeleton rows={6} columns={7} label="Loading surplus inventory" />
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
      </section>

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
