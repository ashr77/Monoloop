'use client';

// Match results for one requirement, loaded through the useMatch hook (Member 3).
import { useMatch } from '@/hooks';
import { ApiError, errorMessage } from '@/lib/api/client';
import { MatchResultsView } from './MatchResultsView';
import { MatchLoadError, MatchSkeleton, RequirementNotFound, RequirementNotOpen } from './MatchStates';

export function MatchDetail({ requirementId }: { requirementId: string }) {
  const query = useMatch(requirementId);

  if (query.isPending) return <MatchSkeleton />;

  if (query.isError) {
    const error = query.error;
    if (error instanceof ApiError && error.code === 'NOT_FOUND') return <RequirementNotFound />;
    const notOpen =
      error instanceof ApiError && error.code === 'REQUIREMENT_NOT_OPEN'
        ? ((error.details as { requirement_status?: string } | undefined)?.requirement_status ?? 'closed')
        : null;
    return (
      <div className="min-h-[calc(100vh-9rem)] bg-cream font-sans text-graphite">
        {notOpen ? (
          <RequirementNotOpen status={notOpen} />
        ) : (
          <MatchLoadError message={errorMessage(error)} onRetry={() => void query.refetch()} />
        )}
      </div>
    );
  }

  const { result, requirement } = query.data;
  if (!requirement) return <RequirementNotFound />;
  return (
    <div className="min-h-[calc(100vh-9rem)] bg-cream font-sans text-graphite">
      <MatchResultsView requirement={requirement} result={result} />
    </div>
  );
}
