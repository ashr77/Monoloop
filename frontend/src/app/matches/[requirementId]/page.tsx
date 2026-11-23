import { MatchDetail } from '@/features/matching/components/MatchDetail';

export const metadata = {
  title: 'Matches | MONOLOOP',
  description: 'Explainable compatibility matching and multi-supplier allocation for a buyer requirement.',
};

interface Props {
  params: { requirementId: string };
}

// Data is fetched in the browser from the FastAPI backend (useMatch hook).
export default function MatchesPage({ params }: Props) {
  return <MatchDetail requirementId={params.requirementId} />;
}
