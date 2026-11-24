'use client';

import { useChatIdentity, useInbox } from '@/hooks';

/** Unread chat count for the organization chosen on the Messages page (navbar badge). */
export function UnreadBadge() {
  const { organization } = useChatIdentity();
  const unread = useInbox(organization?.id ?? null).data?.unreadTotal ?? 0;
  if (!unread) return null;
  return (
    <span
      className="inline-flex h-[1.125rem] min-w-[1.125rem] items-center justify-center rounded-xs bg-copper-600 px-1 font-mono text-[11px] font-medium tabular-nums leading-none text-white"
      aria-label={`${unread} unread messages`}
      role="status"
    >
      {unread > 99 ? '99+' : unread}
    </span>
  );
}
