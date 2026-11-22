'use client';

import { useState } from 'react';
import {
  Search,
  Filter,
  Edit2,
  Archive,
  Clock,
  MapPin,
  AlertCircle,
} from 'lucide-react';
import { MaterialListing } from '@/lib/types';
import { MaterialFamily } from '@/lib/constants';

interface Props {
  listings: MaterialListing[];
  onEdit: (listing: MaterialListing) => void;
  onRefresh: () => void;
}

export function SupplierListingTable({ listings, onEdit, onRefresh }: Props) {
  const [searchTerm, setSearchTerm] = useState('');
  const [familyFilter, setFamilyFilter] = useState<'ALL' | MaterialFamily>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'ARCHIVED'>('ACTIVE');
  const [isArchivingId, setIsArchivingId] = useState<string | null>(null);

  // Filter listings
  const filtered = listings.filter((item) => {
    // Family Filter
    if (familyFilter !== 'ALL' && item.material_family !== familyFilter) {
      return false;
    }

    // Status Filter
    if (statusFilter !== 'ALL' && item.status !== statusFilter) {
      return false;
    }

    // Search Query
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      const matchSpec = item.material_specification.toLowerCase().includes(q);
      const matchCity = item.city.toLowerCase().includes(q);
      const matchDesc = item.description ? item.description.toLowerCase().includes(q) : false;
      const matchOrg = item.organization?.name.toLowerCase().includes(q) || false;
      if (!matchSpec && !matchCity && !matchDesc && !matchOrg) return false;
    }

    return true;
  });

  const handleArchive = async (id: string) => {
    if (!window.confirm('Are you sure you want to archive this surplus listing? It will no longer match new requirements.')) {
      return;
    }

    const target = listings.find((l) => l.id === id);
    setIsArchivingId(id);
    try {
      const res = await fetch(`/api/listings/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          ...(target?.organization_id ? { 'x-organization-id': target.organization_id } : {}),
        },
        body: JSON.stringify({ status: 'ARCHIVED' }),
      });
      const data = await res.json();
      if (data.success) {
        onRefresh();
      } else {
        alert(data.error?.message || 'Failed to archive listing');
      }
    } catch {
      alert('Network error while archiving listing');
    } finally {
      setIsArchivingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      {/* Table Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-slate-50/50">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by grade (e.g. SS304), location, or description..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-lg border border-slate-300 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
          />
        </div>

        {/* Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Family Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <Filter className="w-3.5 h-3.5 text-slate-400" />
            <select
              value={familyFilter}
              onChange={(e) => setFamilyFilter(e.target.value as 'ALL' | MaterialFamily)}
              className="bg-transparent focus:outline-none font-medium cursor-pointer"
            >
              <option value="ALL">All Materials</option>
              <option value="STAINLESS_STEEL_SHEET">Stainless Steel</option>
              <option value="PLYWOOD_PANEL">Plywood Panel</option>
            </select>
          </div>

          {/* Status Filter */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs text-slate-700">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'ALL' | 'ACTIVE' | 'ARCHIVED')}
              className="bg-transparent focus:outline-none font-medium cursor-pointer"
            >
              <option value="ACTIVE">Active Only</option>
              <option value="ARCHIVED">Archived Only</option>
              <option value="ALL">All Statuses</option>
            </select>
          </div>
        </div>
      </div>

      {/* Table Content */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              <th className="py-3 px-4">Material & Specification</th>
              <th className="py-3 px-4">Dimensions (L × W × T)</th>
              <th className="py-3 px-4">Available / Total Pieces</th>
              <th className="py-3 px-4">Condition</th>
              <th className="py-3 px-4">Unit Price (BDT)</th>
              <th className="py-3 px-4">Location</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs sm:text-sm text-slate-700">
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">
                  <div className="max-w-xs mx-auto space-y-2">
                    <AlertCircle className="w-8 h-8 text-slate-300 mx-auto" />
                    <p className="font-medium text-slate-600">No surplus listings found</p>
                    <p className="text-xs text-slate-400">
                      Try adjusting your search criteria or add a new listing.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              filtered.map((item) => {
                const isArchived = item.status === 'ARCHIVED';
                return (
                  <tr
                    key={item.id}
                    className={`hover:bg-slate-50/80 transition-colors ${
                      isArchived ? 'opacity-60 bg-slate-50/40' : ''
                    }`}
                  >
                    {/* Material & Spec */}
                    <td className="py-3.5 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{item.material_specification}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {item.material_family === 'STAINLESS_STEEL_SHEET'
                          ? 'Stainless Steel Sheet'
                          : 'Plywood Panel'}
                      </div>
                      {item.organization && (
                        <div className="text-[10px] text-emerald-700 font-medium mt-0.5 truncate max-w-[200px]">
                          {item.organization.name}
                        </div>
                      )}
                    </td>

                    {/* Dimensions */}
                    <td className="py-3.5 px-4 font-mono text-xs">
                      <div>
                        {item.length_mm} × {item.width_mm} mm
                      </div>
                      <div className="text-slate-400 text-[11px]">Gauge: {item.thickness_mm} mm</div>
                    </td>

                    {/* Available / Total Pieces */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-emerald-700 text-sm">
                          {item.available_quantity} pcs
                        </span>
                        <span className="text-[11px] text-slate-400">/ {item.total_quantity} total</span>
                      </div>
                      {item.reserved_quantity > 0 && (
                        <div className="text-[11px] text-amber-600 flex items-center gap-1 mt-0.5">
                          <Clock className="w-3 h-3" />
                          <span>{item.reserved_quantity} reserved</span>
                        </div>
                      )}
                    </td>

                    {/* Condition */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[11px] font-semibold ${
                          item.condition === 'UNUSED'
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : item.condition === 'LEFTOVER'
                            ? 'bg-blue-50 text-blue-800 border border-blue-200'
                            : 'bg-amber-50 text-amber-800 border border-amber-200'
                        }`}
                      >
                        {item.condition}
                      </span>
                    </td>

                    {/* Price */}
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      ৳{item.unit_price_bdt.toLocaleString()}
                      <span className="text-[11px] text-slate-400 font-normal"> / pc</span>
                    </td>

                    {/* Location */}
                    <td className="py-3.5 px-4 text-xs text-slate-600">
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{item.city}</span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3.5 px-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          item.status === 'ACTIVE'
                            ? 'bg-emerald-100 text-emerald-800'
                            : item.status === 'ARCHIVED'
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-blue-100 text-blue-800'
                        }`}
                      >
                        {item.status}
                      </span>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onEdit(item)}
                          disabled={isArchived}
                          className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 hover:text-slate-900 disabled:opacity-30 transition"
                          title="Edit Listing Attributes"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        {!isArchived && (
                          <button
                            onClick={() => handleArchive(item.id)}
                            disabled={isArchivingId === item.id}
                            className="p-1.5 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 transition"
                            title="Archive Listing"
                          >
                            <Archive className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
