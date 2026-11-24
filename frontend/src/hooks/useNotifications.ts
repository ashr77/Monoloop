'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/endpoints';
import type { NotificationFeed } from '@/features/notifications/types';
import { queryKeys } from './queryKeys';

export const NOTIFICATIONS_POLL_MS = 15_000;

/** Bell feed for one organization; polls while the tab is visible. */
export function useNotifications(organizationId: string | null) {
  return useQuery({
    queryKey: queryKeys.notifications(organizationId ?? ''),
    enabled: Boolean(organizationId),
    queryFn: ({ signal }) => api.notifications.list(organizationId!, signal),
    refetchInterval: NOTIFICATIONS_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
}

/** Mark one, several or all notifications read. Updates the bell immediately, then confirms with the server. */
export function useMarkNotificationsRead(organizationId: string | null) {
  const qc = useQueryClient();
  const key = queryKeys.notifications(organizationId ?? '');
  return useMutation({
    mutationFn: (v: { ids?: string[]; all?: boolean }) => api.notifications.markRead(v, organizationId!),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<NotificationFeed>(key);
      if (previous) {
        const ids = new Set(v.ids ?? []);
        const items = previous.items.map((n) => (v.all || ids.has(n.id) ? { ...n, read: true } : n));
        qc.setQueryData<NotificationFeed>(key, { items, unreadTotal: items.filter((n) => !n.read).length });
      }
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: key }),
  });
}
