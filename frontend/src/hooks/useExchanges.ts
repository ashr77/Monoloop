'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, type ExchangeFilters } from '@/lib/api/endpoints';
import type { ExchangeAction } from '@/features/exchanges/types';
import { queryKeys } from './queryKeys';
import { invalidateInventory } from './invalidation';

export function useExchanges(filters: ExchangeFilters = {}) {
  return useQuery({
    queryKey: queryKeys.exchanges.list(filters),
    queryFn: ({ signal }) => api.exchanges.list(filters, signal),
    refetchInterval: 15_000, // other organizations act on the same exchanges
  });
}

export function useRequestExchange() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { requirementId: string; buyerOrganizationId: string }) =>
      api.exchanges.request(v.requirementId, v.buyerOrganizationId),
    onSuccess: () => invalidateInventory(qc),
  });
}

export function useExchangeAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { exchangeId: string; action: ExchangeAction; organizationId: string; itemId?: string }) =>
      api.exchanges.act(v.exchangeId, v.action, v.organizationId, v.itemId),
    onSuccess: () => invalidateInventory(qc),
  });
}

/** Starts the gateway payment; on success the caller redirects the browser to gateway_url. */
export function useStartPayment() {
  return useMutation({
    mutationFn: (v: { exchangeId: string; organizationId: string }) =>
      api.payments.start(v.exchangeId, v.organizationId),
  });
}
