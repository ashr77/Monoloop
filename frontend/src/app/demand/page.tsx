import { Suspense } from 'react';
import { TableSkeleton } from '@/components/ui';
import { BuyerDemandDashboard } from '@/features/demand/components/BuyerDemandDashboard';

export default function DemandPage() {
  // The dashboard reads ?compose= (useSearchParams needs a Suspense boundary).
  return (
    <Suspense
      fallback={
        <div className="page-shell py-12">
          <TableSkeleton rows={5} columns={6} label="Loading requirements" />
        </div>
      }
    >
      <BuyerDemandDashboard />
    </Suspense>
  );
}
