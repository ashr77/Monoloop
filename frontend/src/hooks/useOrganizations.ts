'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/endpoints';
import { queryKeys } from './queryKeys';

/** Demo organizations; they rarely change, so they stay fresh for 10 minutes. */
export function useOrganizations() {
  return useQuery({
    queryKey: queryKeys.organizations,
    queryFn: ({ signal }) => api.organizations.list(signal),
    staleTime: 10 * 60_000,
  });
}
