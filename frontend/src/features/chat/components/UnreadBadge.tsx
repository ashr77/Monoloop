'use client';

import { useChatIdentity, useInbox } from '@/hooks';

/** Unread chat count for the organization chosen on the Messages page (navbar badge). */
export function UnreadBadge() {
  const { organization } = useChatIdentity();
  const unread = useInbox(organization?.id ?? null).data?.unreadTotal ?? 0;
  if (!unread) return null;
  return (
    <span className="min-w-[1.25rem] px-1 rounded-full bg-red-600 text-white text-[11px] font-bold leading-5 text-center"
      aria-label={`${unread} unread messages`}>
      {unread > 99 ? '99+' : unread}
    </span>
  );
}
