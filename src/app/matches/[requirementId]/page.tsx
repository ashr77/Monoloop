import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import RequirementNotFound from './not-found';
import { matchRequirement } from '@/features/matching/services/matching.service';
import { MatchResultsView } from '@/features/matching/components/MatchResultsView';
import { matchMono, matchSans, t } from '@/features/matching/components/theme';

// Matches depend on live inventory; never prerender or cache them.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Matches | MONOLOOP',
  description: 'Explainable compatibility matching and multi-supplier allocation for a buyer requirement.',
};

interface Props {
  params: { requirementId: string };
}

export default async function MatchesPage({ params }: Props) {
  const outcome = await matchRequirement(params.requirementId);
  // Rendered inline rather than via notFound(): with loading.tsx the response is
  // already streaming (status 200), and notFound() only adds a dev-mode warning.
  if (outcome.kind === 'NOT_FOUND') return <RequirementNotFound />;

  return (
    <div className={`${matchSans.className} ${matchSans.variable} ${matchMono.variable} ${t.page} min-h-[calc(100vh-9rem)]`}>
      {outcome.kind === 'NOT_OPEN' ? (
        <div className="mx-auto max-w-3xl space-y-6 px-4 py-20 sm:px-6">
          <p className={`${t.eyebrow} ${t.muted}`}>Matching unavailable</p>
          <h1 className={`text-4xl ${t.display}`}>
            This requirement is {outcome.requirement.status.toLowerCase()}.
          </h1>
          <p className={`text-base ${t.muted}`}>
            Only open requirements are matched against surplus stock. Reopen it from the demand dashboard to see compatible suppliers.
          </p>
          <Link href="/demand" className={t.btnInk}>
            <ArrowLeft className="size-4" /> Back to requirements
          </Link>
        </div>
      ) : (
        <MatchResultsView requirement={outcome.requirement} result={outcome.result} />
      )}
    </div>
  );
}
