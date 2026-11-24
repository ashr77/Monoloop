import { Suspense } from 'react';
import { TableSkeleton } from '@/components/ui';
import { SupplierDashboard } from '@/features/supply/components/SupplierDashboard';

export const metadata = {
  title: 'Supplier Portal | MONOLOOP',
  description: 'Manage industrial surplus inventory, offcuts, and AI-assisted listings.',
};

export default function SupplyPage() {
  // The dashboard reads ?scope= and ?compose= (useSearchParams needs a Suspense boundary).
  return (
    <Suspense
      fallback={
        <div className="page-shell py-12">
          <TableSkeleton rows={6} columns={7} label="Loading surplus inventory" />
        </div>
      }
    >
      <SupplierDashboard />
    </Suspense>
  );
}
