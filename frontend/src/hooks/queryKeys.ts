// Query-key factory: one place that defines the cache layout, so invalidation is exact.
import type { ExchangeFilters, ListingFilters, RequirementFilters } from '@/lib/api/endpoints';

export const queryKeys = {
  organizations: ['organizations'] as const,
  listings: {
    all: ['listings'] as const,
    list: (f: ListingFilters) => ['listings', 'list', f] as const,
  },
  requirements: {
    all: ['requirements'] as const,
    list: (f: RequirementFilters) => ['requirements', 'list', f] as const,
  },
  matches: {
    all: ['matches'] as const,
    overview: ['matches', 'overview'] as const,
    detail: (requirementId: string) => ['matches', 'detail', requirementId] as const,
  },
  exchanges: {
    all: ['exchanges'] as const,
    list: (f: ExchangeFilters) => ['exchanges', 'list', f] as const,
  },
  impact: (organizationId: string | null) => ['impact', organizationId] as const,
  notifications: (organizationId: string) => ['notifications', organizationId] as const,
  chat: {
    all: ['chat'] as const,
    inbox: (organizationId: string) => ['chat', 'inbox', organizationId] as const,
    thread: (conversationId: string, organizationId: string) =>
      ['chat', 'thread', conversationId, organizationId] as const,
  },
};
