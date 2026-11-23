'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/endpoints';
import { queryKeys } from './queryKeys';

/** Explainable match for one requirement (result + the requirement itself). */
export function useMatch(requirementId: string, organizationId?: string) {
  return useQuery({
    queryKey: [...queryKeys.matches.detail(requirementId), organizationId],
    queryFn: ({ signal }) => api.matches.get(requirementId, signal, organizationId),
    enabled: Boolean(requirementId),
    // 404 / 409 are answers, not transient failures: don't retry them.
    retry: (count, error) => count < 2 && !(error as { status?: number }).status,
  });
}

/** Every open requirement with its live match status. */
export function useMatchesOverview() {
  return useQuery({
    queryKey: queryKeys.matches.overview,
    queryFn: ({ signal }) => api.matches.overview(signal),
  });
}
