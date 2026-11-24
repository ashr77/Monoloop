'use client';

// Buyer ↔ supplier chat. The thread fetches everything once, then every CHAT_POLL_MS asks only
// for messages after the last one it has (after_seq) and appends them. Sending returns the same
// shape, so a sent message shows immediately. Polling pauses while the tab is in the background.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api/endpoints';
import type { ChatMessage, ConversationView } from '@/features/chat/types';
import { queryKeys } from './queryKeys';

export const CHAT_POLL_MS = 3_000;
export const INBOX_POLL_MS = 15_000;

/** A buyer opens (or reopens) its chat about a listing. */
export function useOpenConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { listingId: string; buyerOrganizationId: string }) =>
      api.chat.open(v.listingId, v.buyerOrganizationId),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.chat.all }),
  });
}

/** The organization's chats, refreshed every INBOX_POLL_MS (drives the unread badge too). */
export function useInbox(organizationId: string | null) {
  return useQuery({
    queryKey: queryKeys.chat.inbox(organizationId ?? ''),
    enabled: Boolean(organizationId),
    queryFn: ({ signal }) => api.chat.list(organizationId!, signal),
    refetchInterval: INBOX_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 5_000,
  });
}

export function useConversationThread(conversationId: string, organizationId: string | null) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [view, setView] = useState<ConversationView | null>(null);
  const lastSeq = useRef(0);

  // Switching side (buyer ↔ supplier) or chat starts over. The cursor resets during render, before
  // the new query's first fetch can read it.
  const threadKey = `${conversationId}:${organizationId ?? ''}`;
  const keyRef = useRef(threadKey);
  if (keyRef.current !== threadKey) {
    keyRef.current = threadKey;
    lastSeq.current = 0;
  }
  useEffect(() => {
    setMessages([]);
    setView(null);
  }, [threadKey]);

  const merge = useCallback((next: ConversationView) => {
    setView(next);
    if (next.messages.length) {
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.seq));
        const added = next.messages.filter((m) => !seen.has(m.seq));
        return added.length ? [...prev, ...added].sort((a, b) => a.seq - b.seq) : prev;
      });
    }
    lastSeq.current = Math.max(lastSeq.current, next.last_seq);
  }, []);

  const query = useQuery({
    queryKey: queryKeys.chat.thread(conversationId, organizationId ?? ''),
    enabled: Boolean(organizationId),
    queryFn: ({ signal }) => api.chat.get(conversationId, organizationId!, lastSeq.current, signal),
    refetchInterval: CHAT_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: 0,
    // A response holds only the messages after the cursor, never a full thread: don't reuse it
    // from cache when the chat is opened again.
    gcTime: 0,
    retry: false,
  });

  useEffect(() => {
    if (query.data) merge(query.data);
  }, [query.data, merge]);

  const send = useMutation({
    mutationFn: (body: string) => api.chat.send(conversationId, body, organizationId!, lastSeq.current),
    onSuccess: (next) => {
      merge(next);
      void qc.invalidateQueries({ queryKey: ['chat', 'inbox'] });
    },
  });

  // Clear my unread count whenever messages from the other side arrive while the chat is open.
  const markedSeq = useRef(0);
  useEffect(() => {
    if (!organizationId || !view || view.unread === 0 || markedSeq.current >= lastSeq.current) return;
    markedSeq.current = lastSeq.current;
    void api.chat
      .markRead(conversationId, organizationId)
      .then(() => qc.invalidateQueries({ queryKey: ['chat', 'inbox'] }))
      .catch(() => undefined);
  }, [view, conversationId, organizationId, qc]);

  return { view, messages, query, send };
}
