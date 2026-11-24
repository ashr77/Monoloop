'use client';

// Loads the impact report through hooks and renders the dashboard (Member 4).
import { useImpact, useOrganizations } from '@/hooks';
import { errorMessage } from '@/lib/api/client';
import { ErrorState, Skeleton } from '@/components/ui';
import { ImpactDashboard } from './ImpactDashboard';

export function ImpactView({ org }: { org: string | null }) {
  const report = useImpact(org);
  const organizations = useOrganizations();

  if (report.isPending || organizations.isPending) {
    return (
      <div className="page-shell pb-20" role="status" aria-busy="true" aria-label="Loading impact figures">
        <div className="space-y-4 border-b rule pb-8 pt-10 sm:pt-12">
          <Skeleton className="h-3 w-32" />
          <Skeleton className="h-9 w-2/3 max-w-xl" />
          <Skeleton className="h-4 w-1/2 max-w-md" />
        </div>
        <div className="grid grid-cols-2 gap-6 border-b rule py-6 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-2.5 w-24" />
              <Skeleton className="h-7 w-28" />
            </div>
          ))}
        </div>
        <div className="mt-10 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-3 w-full" />
          ))}
        </div>
        <span className="sr-only">Loading impact figures…</span>
      </div>
    );
  }

  if (report.isError || organizations.isError) {
    return (
      <div className="page-shell py-12">
        <ErrorState
          title="Impact figures could not be loaded."
          message={errorMessage(report.error ?? organizations.error, 'Unknown error')}
          onRetry={() => {
            if (report.isError) void report.refetch();
            if (organizations.isError) void organizations.refetch();
          }}
        />
      </div>
    );
  }

  const scopeName = org ? organizations.data.find((o) => o.id === org)?.name ?? 'Organization' : null;
  return <ImpactDashboard report={report.data} organizations={organizations.data} scopeName={scopeName} />;
}
