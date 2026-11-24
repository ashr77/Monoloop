import { Suspense } from 'react';
import { ExchangesDashboard } from '@/features/exchanges/components/ExchangesDashboard';
import { TableSkeleton } from '@/components/ui';

export const metadata = {
  title: 'Exchanges | MONOLOOP',
  description: 'Exchange requests, supplier acceptance, atomic stock reservation and transfer confirmation.',
};

export default function ExchangesPage() {
  // useSearchParams() in the dashboard requires a Suspense boundary.
  return (
    <Suspense
      fallback={
        <div className="page-shell space-y-8 pb-20 pt-12">
          <p className="t-eyebrow">Exchange coordination</p>
          <TableSkeleton rows={4} columns={5} label="Loading exchanges" />
        </div>
      }
    >
      <ExchangesDashboard />
    </Suspense>
  );
}
