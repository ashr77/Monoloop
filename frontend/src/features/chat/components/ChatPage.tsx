'use client';

import { useChatIdentity } from '@/hooks';
import { ChatThread } from './ChatThread';

/**
 * Demo mode: ?as=<orgId> picks the side; without it the organization chosen on the Messages page is used.
 * Signed in (AUTH_MODE=jwt): always the signed-in company; ?as= is ignored and there is no side switcher.
 */
export function ChatPage({ conversationId, as }: { conversationId: string; as: string | null }) {
  const { organization, locked } = useChatIdentity();
  const organizationId = locked ? organization?.id ?? null : as ?? organization?.id ?? null;
  return (
    <ChatThread
      key={`${conversationId}:${organizationId}`}
      conversationId={conversationId}
      organizationId={organizationId}
      allowSwitch={!locked}
    />
  );
}
