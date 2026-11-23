// /matches: overview of every open requirement with its live match status (Member 3).
import { MatchesOverview } from '@/features/matching/components/MatchesOverview';

export const metadata = {
  title: 'Matches | MONOLOOP',
  description: 'Live compatibility and allocation status for every open buyer requirement.',
};

export default function MatchesOverviewPage() {
  return <MatchesOverview />;
}
