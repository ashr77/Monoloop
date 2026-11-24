'use client';

import { useChatIdentity } from '@/hooks';
import { ChatThread } from './ChatThread';

/** ?as=<orgId> picks the side; without it the organization chosen on the Messages page is used. */
export function ChatPage({ conversationId, as }: { conversationId: string; as: string | null }) {
  const { organization } = useChatIdentity();
  const organizationId = as ?? organization?.id ?? null;
  return <ChatThread key={`${conversationId}:${organizationId}`} conversationId={conversationId} organizationId={organizationId} />;
}
