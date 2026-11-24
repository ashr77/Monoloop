// ============================================================================
// MONOLOOP - Typed API endpoints (one function per FastAPI route)
// Interactive documentation: http://localhost:8000/docs
// ============================================================================

import type { MaterialListing, MaterialRequirement, Organization } from '@/lib/types';
import type { MatchResult } from '@/features/matching/types';
import type { ExchangeAction, ExchangeView, PaymentStart } from '@/features/exchanges/types';
import type { ImpactReport } from '@/features/analytics/impact';
import type { ConversationSummary, ConversationView } from '@/features/chat/types';
import type { AppNotification, NotificationFeed } from '@/features/notifications/types';
import type { MaterialExtractionResult, RequirementExtractionResult, SpeechLanguage } from '@/lib/ai/schemas';
import type { AuthSession, CompanyRecord, Profile } from '@/lib/auth/session';
import { apiRequest } from './client';

export interface ListingFilters {
  organization_id?: string;
  material_family?: string;
  status?: string;
  search?: string;
}

export interface RequirementFilters {
  organization_id?: string;
  material_family?: string;
  status?: string;
}

export interface RequirementListMeta {
  total?: number;
  pending_match_requirement_ids?: string[];
  fulfilled_quantities_by_requirement?: Record<string, number>;
}

export interface ExchangeFilters {
  organization_id?: string;
  status?: string;
}

export interface MatchOverviewRow {
  requirement: MaterialRequirement;
  result: MatchResult;
}

export interface UploadedImage {
  url: string;
  path: string;
  size_bytes: number;
  mime_type: string;
}

export interface TranscribeAudioInput {
  audio_base64: string;
  mime_type: string;
  language: SpeechLanguage;
}

export interface TranscriptionResult {
  transcript: string;
  language: SpeechLanguage;
}

export type ListingInput = Record<string, unknown>;
export type RequirementInput = Record<string, unknown>;

const enc = encodeURIComponent;

export interface SignupInput {
  company_name: string;
  city: string;
  address?: string;
  license_number: string;
  email: string;
  password: string;
}

export const api = {
  organizations: {
    list: (signal?: AbortSignal) =>
      apiRequest<Organization[]>('/api/organizations', { signal }).then((r) => r.data),
  },

  listings: {
    list: (filters: ListingFilters = {}, signal?: AbortSignal) =>
      apiRequest<MaterialListing[]>('/api/listings', { query: { ...filters }, signal }).then((r) => r.data),
    get: (id: string, signal?: AbortSignal) =>
      apiRequest<MaterialListing>(`/api/listings/${enc(id)}`, { signal }).then((r) => r.data),
    create: (body: ListingInput, organizationId: string) =>
      apiRequest<MaterialListing>('/api/listings', { method: 'POST', body, organizationId }).then((r) => r.data),
    update: (id: string, body: ListingInput, organizationId: string) =>
      apiRequest<MaterialListing>(`/api/listings/${enc(id)}`, { method: 'PATCH', body, organizationId }).then((r) => r.data),
  },

  uploads: {
    /** Store a listing photo; the returned URL goes into `image_url` like a pasted link. */
    listingImage: (body: { image_base64: string; mime_type: string }, organizationId: string) =>
      apiRequest<UploadedImage>('/api/uploads/listing-image', { method: 'POST', body, organizationId, timeoutMs: 60_000 }).then(
        (r) => r.data
      ),
  },

  requirements: {
    list: (filters: RequirementFilters = {}, signal?: AbortSignal, organizationId?: string) =>
      apiRequest<MaterialRequirement[]>('/api/requirements', { query: { ...filters }, signal, organizationId }).then((r) => ({
        items: r.data,
        meta: (r.meta ?? {}) as RequirementListMeta,
      })),
    get: (id: string, signal?: AbortSignal) =>
      apiRequest<MaterialRequirement>(`/api/requirements/${enc(id)}`, { signal }).then((r) => r.data),
    create: (body: RequirementInput, organizationId: string) =>
      apiRequest<MaterialRequirement>('/api/requirements', { method: 'POST', body, organizationId }).then((r) => r.data),
    update: (id: string, body: RequirementInput, organizationId: string) =>
      apiRequest<MaterialRequirement>(`/api/requirements/${enc(id)}`, { method: 'PATCH', body, organizationId }).then(
        (r) => r.data
      ),
  },

  matches: {
    /** Every OPEN requirement with its live match (one request, two DB queries). */
    overview: (signal?: AbortSignal) =>
      apiRequest<MatchOverviewRow[]>('/api/matches', { signal }).then((r) => r.data),
    /** Match result plus the requirement it was computed for. */
    get: (requirementId: string, signal?: AbortSignal, organizationId?: string) =>
      apiRequest<MatchResult>(`/api/matches/${enc(requirementId)}`, { signal, organizationId }).then((r) => ({
        result: r.data,
        requirement: (r.meta as { requirement?: MaterialRequirement } | undefined)?.requirement,
      })),
  },

  exchanges: {
    list: (filters: ExchangeFilters = {}, signal?: AbortSignal) =>
      apiRequest<ExchangeView[]>('/api/exchanges', { query: { ...filters }, signal }).then((r) => r.data),
    get: (id: string, signal?: AbortSignal) =>
      apiRequest<ExchangeView>(`/api/exchanges/${enc(id)}`, { signal }).then((r) => r.data),
    request: (requirementId: string, buyerOrganizationId: string) =>
      apiRequest<ExchangeView>('/api/exchanges', {
        method: 'POST',
        body: { requirement_id: requirementId, buyer_organization_id: buyerOrganizationId },
        organizationId: buyerOrganizationId,
      }).then((r) => r.data),
    requestListing: (listingId: string, quantity: number, buyerOrganizationId: string) =>
      apiRequest<ExchangeView>('/api/exchanges', {
        method: 'POST',
        body: {
          listing_id: listingId,
          quantity,
          buyer_organization_id: buyerOrganizationId,
        },
        organizationId: buyerOrganizationId,
      }).then((r) => r.data),
    act: (exchangeId: string, action: ExchangeAction, organizationId: string, itemId?: string) =>
      apiRequest<ExchangeView>(`/api/exchanges/${enc(exchangeId)}/${action}`, {
        method: 'POST',
        body: itemId ? { exchange_item_id: itemId } : {},
        organizationId,
      }).then((r) => r.data),
  },

  payments: {
    /** Starts an SSLCommerz payment for a RESERVED exchange; the browser then goes to gateway_url. */
    start: (exchangeId: string, organizationId: string) =>
      apiRequest<PaymentStart>(`/api/payments/exchanges/${enc(exchangeId)}`, {
        method: 'POST',
        organizationId,
        timeoutMs: 30_000,
      }).then((r) => r.data),
  },

  health: {
    get: () =>
      // Long timeout: a sleeping free-tier backend can take ~50 s to wake up.
      apiRequest<{ status: string; auth_mode?: 'demo' | 'jwt'; payment_configured?: boolean }>('/api/health', {
        timeoutMs: 75_000,
      }).then((r) => r.data),
  },

  auth: {
    signup: (body: SignupInput) =>
      apiRequest<AuthSession>('/api/auth/signup', { method: 'POST', body, timeoutMs: 30_000 }).then((r) => r.data),
    login: (email: string, password: string) =>
      apiRequest<AuthSession>('/api/auth/login', { method: 'POST', body: { email, password } }).then((r) => r.data),
    me: () => apiRequest<Profile>('/api/auth/me').then((r) => r.data),
    updateProfile: (body: Partial<Omit<SignupInput, 'email' | 'password'>>) =>
      apiRequest<{ profile: Profile; reapproval_required: boolean }>('/api/auth/profile', { method: 'PATCH', body }).then(
        (r) => r.data
      ),
    changePassword: (current_password: string, new_password: string) =>
      apiRequest<{ changed: boolean }>('/api/auth/password', {
        method: 'POST',
        body: { current_password, new_password },
      }).then((r) => r.data),
    resubmit: (body: Partial<Omit<SignupInput, 'email' | 'password'>>) =>
      apiRequest<Profile>('/api/auth/application', { method: 'PATCH', body }).then((r) => r.data),
  },

  admin: {
    applications: (status?: CompanyRecord['status'] | 'ALL', signal?: AbortSignal) =>
      apiRequest<CompanyRecord[]>('/api/admin/organizations', { query: { status }, signal }).then((r) => r.data),
    review: (organizationId: string, decision: 'approve' | 'reject' | 'suspend', reason?: string) =>
      apiRequest<CompanyRecord>(`/api/admin/organizations/${enc(organizationId)}/${decision}`, {
        method: 'POST',
        body: decision === 'approve' ? undefined : { reason },
      }).then((r) => r.data),
  },

  impact: {
    get: (organizationId?: string | null, signal?: AbortSignal) =>
      apiRequest<ImpactReport>('/api/impact', { query: { organization_id: organizationId }, signal }).then((r) => r.data),
  },

  /** Buyer ↔ supplier chat about a listing (participants only). */
  notifications: {
    /** Order and payment events on the acting organization's exchanges, newest first. */
    list: (organizationId: string, signal?: AbortSignal): Promise<NotificationFeed> =>
      apiRequest<AppNotification[]>('/api/notifications', { organizationId, signal }).then((r) => ({
        items: r.data,
        unreadTotal: Number((r.meta as { unread_total?: number } | undefined)?.unread_total ?? 0),
      })),
    markRead: (body: { ids?: string[]; all?: boolean }, organizationId: string) =>
      apiRequest<{ unread_total: number }>('/api/notifications/read', { method: 'POST', body, organizationId }).then(
        (r) => r.data
      ),
  },

  chat: {
    list: (organizationId: string, signal?: AbortSignal) =>
      apiRequest<ConversationSummary[]>('/api/conversations', { organizationId, signal }).then((r) => ({
        items: r.data,
        unreadTotal: Number((r.meta as { unread_total?: number } | undefined)?.unread_total ?? 0),
      })),
    open: (listingId: string, buyerOrganizationId: string) =>
      apiRequest<ConversationView>('/api/conversations', {
        method: 'POST',
        body: { listing_id: listingId },
        organizationId: buyerOrganizationId,
      }).then((r) => r.data),
    get: (conversationId: string, organizationId: string, afterSeq = 0, signal?: AbortSignal) =>
      apiRequest<ConversationView>(`/api/conversations/${enc(conversationId)}`, {
        query: { after_seq: afterSeq },
        organizationId,
        signal,
      }).then((r) => r.data),
    send: (conversationId: string, body: string, organizationId: string, afterSeq = 0) =>
      apiRequest<ConversationView>(`/api/conversations/${enc(conversationId)}/messages`, {
        method: 'POST',
        query: { after_seq: afterSeq },
        body: { body },
        organizationId,
      }).then((r) => r.data),
    markRead: (conversationId: string, organizationId: string) =>
      apiRequest<{ unread: number }>(`/api/conversations/${enc(conversationId)}/read`, {
        method: 'POST',
        organizationId,
      }).then((r) => r.data),
  },

  ai: {
    extractMaterial: (prompt: string, mock?: boolean) =>
      apiRequest<MaterialExtractionResult>('/api/ai/extract-material', {
        method: 'POST',
        body: mock === undefined ? { prompt } : { prompt, mock },
        timeoutMs: 30_000,
      }).then((r) => r.data),
    /** Server-side speech-to-text fallback for browsers without the Web Speech API. */
    transcribe: (body: TranscribeAudioInput) =>
      apiRequest<TranscriptionResult>('/api/ai/transcribe', { method: 'POST', body, timeoutMs: 45_000 }).then(
        (r) => r.data
      ),
    extractRequirement: (prompt: string, mock?: boolean) =>
      apiRequest<RequirementExtractionResult>('/api/ai/extract-requirement', {
        method: 'POST',
        body: mock === undefined ? { prompt } : { prompt, mock },
        timeoutMs: 30_000,
      }).then((r) => r.data),
  },
};
