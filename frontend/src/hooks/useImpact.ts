'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api/endpoints';
import { queryKeys } from './queryKeys';

export function useImpact(organizationId: string | null) {
  return useQuery({
    queryKey: queryKeys.impact(organizationId),
    queryFn: ({ signal }) => api.impact.get(organizationId, signal),
  });
}
