'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ListingFilters, type ListingInput } from '@/lib/api/endpoints';
import { queryKeys } from './queryKeys';
import { invalidateInventory } from './invalidation';

export function useListings(filters: ListingFilters = {}) {
  return useQuery({
    queryKey: queryKeys.listings.list(filters),
    queryFn: ({ signal }) => api.listings.list(filters, signal),
  });
}

export function useSaveListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id?: string; body: ListingInput; organizationId: string }) =>
      v.id ? api.listings.update(v.id, v.body, v.organizationId) : api.listings.create(v.body, v.organizationId),
    onSuccess: () => invalidateInventory(qc),
  });
}
