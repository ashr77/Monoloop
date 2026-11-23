import { AlertTriangle } from 'lucide-react';
import { getImpactReport } from '@/features/analytics/services/impact.service';
import { ImpactDashboard } from '@/features/analytics/components/ImpactDashboard';
import { requirementRepository } from '@/features/demand/services/requirementRepository';

// Impact depends on live exchanges; never prerender or cache it.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Impact | MONOLOOP',
  description: 'Resource recovery from completed industrial surplus exchanges.',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ImpactPage({ searchParams }: { searchParams: { org?: string } }) {
  const org = searchParams.org && UUID.test(searchParams.org) ? searchParams.org : null;
  try {
    const [report, organizations] = await Promise.all([
      getImpactReport(org),
      requirementRepository.getOrganizations(),
    ]);
    const scopeName = org ? organizations.find((o) => o.id === org)?.name ?? 'Organization' : null;
    return <ImpactDashboard report={report} organizations={organizations} scopeName={scopeName} />;
  } catch (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-16">
        <div className="p-8 bg-white rounded-2xl border border-red-200 text-center space-y-2 text-red-700">
          <AlertTriangle className="w-8 h-8 mx-auto" />
          <p className="font-semibold">Impact figures could not be loaded.</p>
          <p className="text-sm">{error instanceof Error ? error.message : 'Unknown error'}</p>
        </div>
      </div>
    );
  }
}
