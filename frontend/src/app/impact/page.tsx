import { ImpactView } from '@/features/analytics/components/ImpactView';

export const metadata = {
  title: 'Impact | MONOLOOP',
  description: 'Resource recovery from completed industrial surplus exchanges.',
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Data is fetched in the browser from the FastAPI backend (useImpact hook).
export default function ImpactPage({ searchParams }: { searchParams: { org?: string } }) {
  const org = searchParams.org && UUID.test(searchParams.org) ? searchParams.org : null;
  return <ImpactView org={org} />;
}
