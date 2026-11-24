'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type RequirementFilters, type RequirementInput } from '@/lib/api/endpoints';
import { queryKeys } from './queryKeys';

/** Requirements plus exchange statistics (`meta`). */
export function useRequirements(filters: RequirementFilters = {}, organizationId?: string) {
  return useQuery({
    queryKey: [...queryKeys.requirements.list(filters), organizationId],
    queryFn: ({ signal }) => api.requirements.list(filters, signal, organizationId),
  });
}

export function useSaveRequirement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; body: RequirementInput; organizationId: string }) =>
      v.id ? api.requirements.update(v.id, v.body, v.organizationId) : api.requirements.create(v.body, v.organizationId),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.requirements.all }),
        qc.invalidateQueries({ queryKey: queryKeys.matches.all }),
      ]),
  });
}
