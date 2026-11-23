'use client';

import { CheckCircle2, Clock, FileText, Layers, Layers3 } from 'lucide-react';
import { MaterialRequirement } from '@/lib/types';

interface Props {
  requirements: MaterialRequirement[];
  pendingMatchRequirementIds: string[];
  fulfilledQuantities: Record<string, number>;
}

export function calculateBuyerStatistics({
  requirements,
  pendingMatchRequirementIds,
  fulfilledQuantities,
}: Props) {
  const activeRequirements = requirements.filter((requirement) => requirement.status === 'OPEN');
  const totalRequired = activeRequirements.reduce(
    (total, requirement) => total + requirement.required_quantity,
    0
  );
  const fulfilledQuantity = Object.values(fulfilledQuantities).reduce(
    (total, quantity) => total + quantity,
    0
  );
  const activeRequirementIds = new Set(activeRequirements.map((requirement) => requirement.id));
  const pendingMatches = new Set(
    pendingMatchRequirementIds.filter((id) => activeRequirementIds.has(id))
  ).size;
  const materialCategories = new Set(
    activeRequirements.map((requirement) => requirement.material_family)
  ).size;

  return {
    activeRequirements: activeRequirements.length,
    totalRequired,
    fulfilledQuantity,
    pendingMatches,
    materialCategories,
  };
}

export function BuyerStatsCards(props: Props) {
  const statistics = calculateBuyerStatistics(props);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wider">Active Requirements</span>
          <FileText className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-2xl font-extrabold text-slate-900">{statistics.activeRequirements}</div>
        <div className="text-xs text-slate-500">Currently open</div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wider">Total Pieces Required</span>
          <Layers className="w-4 h-4 text-blue-600" />
        </div>
        <div className="text-2xl font-extrabold text-slate-900">{statistics.totalRequired.toLocaleString()}</div>
        <div className="text-xs text-slate-500">Across active requirements</div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wider">Fulfilled Quantity</span>
          <CheckCircle2 className="w-4 h-4 text-amber-600" />
        </div>
        <div className="text-2xl font-extrabold text-amber-700">{statistics.fulfilledQuantity.toLocaleString()}</div>
        <div className="text-xs text-amber-600">Completed exchange items</div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wider">Pending Matches</span>
          <Clock className="w-4 h-4 text-emerald-600" />
        </div>
        <div className="text-2xl font-extrabold text-emerald-700">{statistics.pendingMatches.toLocaleString()}</div>
        <div className="text-xs text-emerald-600">Requirements with proposed exchanges</div>
      </div>

      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-2">
        <div className="flex items-center justify-between text-slate-500">
          <span className="text-xs font-semibold uppercase tracking-wider">Material Categories</span>
          <Layers3 className="w-4 h-4 text-purple-600" />
        </div>
        <div className="text-2xl font-extrabold text-slate-900">{statistics.materialCategories}</div>
        <div className="text-xs text-slate-400">Distinct active material families</div>
      </div>
    </div>
  );
}
