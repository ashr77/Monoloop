// ============================================================================
// MONOLOOP - Typed API endpoints (one function per FastAPI route)
// Interactive documentation: http://localhost:8000/docs
// ============================================================================

import type { MaterialListing, MaterialRequirement, Organization } from '@/lib/types';
import type { MatchResult } from '@/features/matching/types';
import type { ExchangeAction, ExchangeView, PaymentStart } from '@/features/exchanges/types';
import type { ImpactReport } from '@/features/analytics/impact';
import type { MaterialExtractionResult } from '@/lib/ai/schemas';
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

  impact: {
    get: (organizationId?: string | null, signal?: AbortSignal) =>
      apiRequest<ImpactReport>('/api/impact', { query: { organization_id: organizationId }, signal }).then((r) => r.data),
  },

  ai: {
    extractMaterial: (prompt: string, mock?: boolean) =>
      apiRequest<MaterialExtractionResult>('/api/ai/extract-material', {
        method: 'POST',
        body: mock === undefined ? { prompt } : { prompt, mock },
        timeoutMs: 30_000,
      }).then((r) => r.data),
  },
};
