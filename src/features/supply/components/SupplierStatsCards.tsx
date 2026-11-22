'use client';

import { Package, Layers, ShieldCheck, Clock, Layers3 } from 'lucide-react';
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
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {/* Active Listings */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wider">Active Listings</span>
          <Package className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-2xl font-extrabold text-slate-900">{activeListings.length}</div>
        <div className="text-xs text-slate-500">Available on exchange</div>
      </div>

      {/* Total Inventory Units */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wider">Total Pieces</span>
          <Layers className="w-4 h-4 text-blue-600" />
        </div>
        <div className="text-2xl font-extrabold text-slate-900">{totalInventory.toLocaleString()}</div>
        <div className="text-xs text-slate-500">Gross tracked stock</div>
      </div>

      {/* Reserved Units */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wider">Reserved Stock</span>
          <Clock className="w-4 h-4 text-amber-600" />
        </div>
        <div className="text-2xl font-extrabold text-amber-700">{totalReserved.toLocaleString()}</div>
        <div className="text-xs text-amber-600">Locked in open proposals</div>
      </div>

      {/* Available Units */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wider">Available Stock</span>
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-2xl font-extrabold text-emerald-700">{totalAvailable.toLocaleString()}</div>
        <div className="text-xs text-emerald-600">Total minus reserved</div>
      </div>

      {/* Material Breakdown */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wider">Categories</span>
          <Layers3 className="w-4 h-4 text-purple-600" />
        </div>
        <div className="flex items-center gap-3 text-xs pt-1">
          <div className="bg-slate-100 px-2 py-1 rounded">
            <span className="font-bold text-slate-800">{steelCount}</span> Steel
          </div>
          <div className="bg-slate-100 px-2 py-1 rounded">
            <span className="font-bold text-slate-800">{plywoodCount}</span> Plywood
          </div>
        </div>
        <div className="text-xs text-slate-400">Controlled families</div>
      </div>
    </div>
  );
}
