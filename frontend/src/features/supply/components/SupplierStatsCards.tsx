'use client';

// Inventory figures for the loaded listings, as a single strip divided by rules.
import { MetricStrip } from '@/components/ui';
import { MaterialListing } from '@/lib/types';

interface Props {
  listings: MaterialListing[];
}

export function SupplierStatsCards({ listings }: Props) {
  const activeListings = listings.filter((l) => l.status === 'ACTIVE');

  const totalInventory = listings.reduce((sum, l) => sum + (l.status !== 'ARCHIVED' ? l.total_quantity : 0), 0);
  const totalReserved = listings.reduce((sum, l) => sum + (l.status !== 'ARCHIVED' ? l.reserved_quantity : 0), 0);
  const totalAvailable = listings.reduce((sum, l) => sum + (l.status !== 'ARCHIVED' ? l.available_quantity : 0), 0);

  const steelCount = activeListings.filter((l) => l.material_family === 'STAINLESS_STEEL_SHEET').length;
  const plywoodCount = activeListings.filter((l) => l.material_family === 'PLYWOOD_PANEL').length;

  return (
    <MetricStrip
      metrics={[
        { label: 'Active listings', value: activeListings.length, note: 'Available on exchange' },
        { label: 'Available stock', value: totalAvailable.toLocaleString(), note: 'Total minus reserved', emphasis: true },
        { label: 'Reserved stock', value: totalReserved.toLocaleString(), note: 'Locked in open proposals', tone: 'copper' },
        { label: 'Total pieces', value: totalInventory.toLocaleString(), note: 'Gross tracked stock' },
        { label: 'Categories', value: `${steelCount} · ${plywoodCount}`, note: 'Steel · plywood listings' },
      ]}
    />
  );
}
