import { Suspense } from 'react';
import { ExchangesDashboard } from '@/features/exchanges/components/ExchangesDashboard';

export const metadata = {
  title: 'Exchanges | MONOLOOP',
  description: 'Exchange requests, supplier acceptance, atomic stock reservation and transfer confirmation.',
};

export default function ExchangesPage() {
  // useSearchParams() in the dashboard requires a Suspense boundary.
  return (
    <Suspense fallback={<div className="max-w-7xl mx-auto px-4 py-12 text-sm text-slate-500">Loading exchanges…</div>}>
      <ExchangesDashboard />
    </Suspense>
  );
}
