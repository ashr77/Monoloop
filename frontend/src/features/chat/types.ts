// ============================================================================
// MONOLOOP - Buyer ↔ supplier chat about a listing (Member 1)
// Mirrors backend/app/schemas/chat.py. Messages only; ordering is the direct
// listing order flow (ListingOrderDialog).
// ============================================================================

import type { MaterialListing, Organization } from '@/lib/types';

export type ChatRole = 'BUYER' | 'SUPPLIER';

export interface ChatMessage {
  id: string;
  seq: number;
  conversation_id: string;
  sender_organization_id: string;
  body: string;
  created_at: string;
}

export interface ConversationSummary {
  id: string;
  role: ChatRole;
  listing: MaterialListing | null;
  buyer: Organization | null;
  supplier: Organization | null;
  counterpart: Organization | null;
  last_message_at: string;
  last_message_preview: string;
  unread: number;
  created_at: string;
}

export interface ConversationView extends ConversationSummary {
  /** Only messages after the requested after_seq. */
  messages: ChatMessage[];
  last_seq: number;
}
