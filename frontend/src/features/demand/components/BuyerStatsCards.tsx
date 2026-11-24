'use client';

import { MetricStrip } from '@/components/ui';
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
    <MetricStrip
      metrics={[
        { label: 'Active requirements', value: statistics.activeRequirements, note: 'Currently open' },
        { label: 'Pieces required', value: statistics.totalRequired.toLocaleString(), note: 'Across active requirements', emphasis: true },
        { label: 'Fulfilled quantity', value: statistics.fulfilledQuantity.toLocaleString(), note: 'Completed exchange items', tone: 'success' },
        { label: 'Pending matches', value: statistics.pendingMatches.toLocaleString(), note: 'With proposed exchanges', tone: 'copper' },
        { label: 'Material categories', value: statistics.materialCategories, note: 'Distinct active families' },
      ]}
    />
  );
}
