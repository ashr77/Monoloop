'use client';

// Loads the impact report through hooks and renders the dashboard (Member 4).
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { useImpact, useOrganizations } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { ImpactDashboard } from './ImpactDashboard';

export function ImpactView({ org }: { org: string | null }) {
  const report = useImpact(org);
  const organizations = useOrganizations();

  if (report.isPending || organizations.isPending) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center text-sm text-slate-500" aria-busy="true">
        <RefreshCw className="w-6 h-6 mx-auto mb-2 animate-spin text-emerald-600" />
        Loading impact figures…
      </div>
    );
  }

  if (report.isError || organizations.isError) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="p-8 bg-white rounded-2xl border border-red-200 text-center space-y-2 text-red-700" role="alert">
          <AlertTriangle className="w-8 h-8 mx-auto" />
          <p className="font-semibold">Impact figures could not be loaded.</p>
          <p className="text-sm">{errorMessage(report.error ?? organizations.error, 'Unknown error')}</p>
        </div>
      </div>
    );
  }

  const scopeName = org ? organizations.data.find((o) => o.id === org)?.name ?? 'Organization' : null;
  return <ImpactDashboard report={report.data} organizations={organizations.data} scopeName={scopeName} />;
}
