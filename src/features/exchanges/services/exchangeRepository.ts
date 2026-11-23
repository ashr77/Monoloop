// ============================================================================
// MONOLOOP - Exchange repository (Member 4)
// TSUNAGU Hackathon 2026
//
// Supabase mode: every state change is a single PostgreSQL function call
//   (supabase/migrations/00004_exchange_workflow.sql) -> one atomic transaction.
// Demo / test mode: the same rules run in-memory via ../workflow.ts against the
//   shared in-memory listing (Member 1) and requirement (Member 2) stores.
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerClient } from '@/lib/supabase/server';
import { listingRepository } from '@/lib/supabase/repository';
import { requirementRepository } from '@/features/demand/services/requirementRepository';
import { SEED_ORGANIZATIONS } from '@/data/seed';
import { DEMO_BUYER_ORGANIZATIONS } from '@/features/demand/data/demoBuyers';
import type {
  ActivityLog,
  Exchange,
  MaterialListing,
  MaterialRequirement,
  Organization,
} from '@/lib/types';
import {
  CreateExchangeItemInput,
  EXCHANGE_ERROR_STATUS,
  ExchangeAction,
  ExchangeError,
  ExchangeErrorCode,
  ExchangeItemRecord,
  ExchangeView,
} from '../types';
import {
  WorkflowState,
  acceptExchangeItem,
  cancelExchange,
  completeExchange,
  createExchangeRequest,
  rejectExchangeItem,
  summarizeExchange,
} from '../workflow';

declare global {
  // eslint-disable-next-line no-var
  var __monoloop_exchanges:
    | { exchanges: Exchange[]; items: ExchangeItemRecord[]; logs: ActivityLog[] }
    | undefined;
}

function emptyStore() {
  return { exchanges: [] as Exchange[], items: [] as ExchangeItemRecord[], logs: [] as ActivityLog[] };
}

if (!globalThis.__monoloop_exchanges) {
  globalThis.__monoloop_exchanges = emptyStore();
}

/** Live view over the shared in-memory stores of all four modules. */
function mockState(): WorkflowState {
  // Importing the listing/requirement repositories initialises these globals.
  return {
    listings: globalThis.__monoloop_listings!,
    requirements: globalThis.__monoloop_requirements!,
    exchanges: globalThis.__monoloop_exchanges!.exchanges,
    items: globalThis.__monoloop_exchanges!.items,
    logs: globalThis.__monoloop_exchanges!.logs,
  };
}

function mockOrganizations(): Organization[] {
  const byId = new Map<string, Organization>();
  for (const o of [...(globalThis.__monoloop_organizations ?? []), ...SEED_ORGANIZATIONS, ...DEMO_BUYER_ORGANIZATIONS]) {
    if (!byId.has(o.id)) byId.set(o.id, o);
  }
  return Array.from(byId.values());
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const ERROR_PATTERN = /MONOLOOP:([A-Z_]+):([\s\S]*)$/;

/** Map a PostgREST / PL/pgSQL error to a typed ExchangeError. */
export function toExchangeError(error: { message?: string; code?: string; details?: string }): ExchangeError {
  const message = error.message ?? 'Unknown database error';
  const match = message.match(ERROR_PATTERN);
  if (match && match[1] in EXCHANGE_ERROR_STATUS) {
    return new ExchangeError(match[1] as ExchangeErrorCode, match[2].trim());
  }
  if (error.code === '23505') {
    return new ExchangeError('DUPLICATE_EXCHANGE', 'An active exchange already exists for this requirement.');
  }
  if (error.code === '23514') {
    return new ExchangeError('INSUFFICIENT_STOCK', 'Inventory constraint rejected the change.');
  }
  return new ExchangeError('INTERNAL_ERROR', `Database error: ${message}`);
}

function db(): SupabaseClient {
  const supabase = getSupabaseServerClient();
  if (!supabase) throw new ExchangeError('INTERNAL_ERROR', 'Database client could not be initialized.');
  return supabase;
}

const n = (v: unknown) => Number(v ?? 0);

function normalizeListing(l: MaterialListing): MaterialListing {
  const total = n(l.total_quantity);
  const reserved = n(l.reserved_quantity);
  return {
    ...l,
    length_mm: n(l.length_mm),
    width_mm: n(l.width_mm),
    thickness_mm: n(l.thickness_mm),
    unit_price_bdt: n(l.unit_price_bdt),
    total_quantity: total,
    reserved_quantity: reserved,
    available_quantity: total - reserved,
  };
}

function buildViews(
  exchanges: Exchange[],
  items: ExchangeItemRecord[],
  logs: ActivityLog[],
  listings: MaterialListing[],
  requirements: MaterialRequirement[],
  organizations: Organization[]
): ExchangeView[] {
  const orgById = new Map(organizations.map((o) => [o.id, o]));
  const listingById = new Map(listings.map((l) => [l.id, normalizeListing(l)]));
  const reqById = new Map(requirements.map((r) => [r.id, r]));

  return exchanges.map((ex) => {
    const exItems = items
      .filter((i) => i.exchange_id === ex.id)
      .map((i) => {
        const quantity = n(i.quantity);
        const unit = n(i.unit_price_bdt);
        const listing = listingById.get(i.listing_id);
        return {
          ...i,
          quantity,
          unit_price_bdt: unit,
          subtotal_bdt: quantity * unit,
          listing: listing ? { ...listing, organization: undefined } : undefined,
          supplier: orgById.get(i.supplier_organization_id),
        };
      })
      // Largest contribution first; listing id as a stable tie-break.
      .sort((a, b) => b.quantity - a.quantity || a.listing_id.localeCompare(b.listing_id));
    const requirement = ex.requirement_id ? reqById.get(ex.requirement_id) : undefined;
    return summarizeExchange(
      {
        ...ex,
        buyer: orgById.get(ex.buyer_organization_id),
        requirement: requirement ? { ...requirement, organization: undefined } : undefined,
      },
      exItems,
      logs.filter((l) => l.exchange_id === ex.id)
    );
  });
}

export interface ExchangeFilterOptions {
  /** Exchanges where this organization is the buyer or supplies at least one item. */
  organizationId?: string;
  status?: string;
}

function applyFilters(views: ExchangeView[], filters: ExchangeFilterOptions): ExchangeView[] {
  return views.filter((v) => {
    if (filters.status && v.status !== filters.status) return false;
    if (filters.organizationId) {
      const org = filters.organizationId;
      if (v.buyer_organization_id !== org && !v.items.some((i) => i.supplier_organization_id === org)) {
        return false;
      }
    }
    return true;
  });
}

// ---------------------------------------------------------------------------
// Supabase reads (flat queries, joined in TypeScript: avoids PostgREST
// ambiguity between exchanges→organizations and the exchange_items junction)
// ---------------------------------------------------------------------------

async function loadFromSupabase(exchangeId?: string): Promise<ExchangeView[]> {
  const supabase = db();

  let exQuery = supabase.from('exchanges').select('*').order('created_at', { ascending: false });
  if (exchangeId) exQuery = exQuery.eq('id', exchangeId);
  const exRes = await exQuery;
  if (exRes.error) throw toExchangeError(exRes.error);
  const exchanges = (exRes.data ?? []) as Exchange[];
  if (exchanges.length === 0) return [];

  const exIds = exchanges.map((e) => e.id);
  const [itemsRes, logsRes, orgsRes] = await Promise.all([
    supabase.from('exchange_items').select('*').in('exchange_id', exIds),
    supabase.from('activity_logs').select('*').in('exchange_id', exIds),
    supabase.from('organizations').select('*'),
  ]);
  if (itemsRes.error) throw toExchangeError(itemsRes.error);
  if (logsRes.error) throw toExchangeError(logsRes.error);
  if (orgsRes.error) throw toExchangeError(orgsRes.error);
  const items = (itemsRes.data ?? []) as ExchangeItemRecord[];

  const listingIds = Array.from(new Set(items.map((i) => i.listing_id)));
  const reqIds = Array.from(new Set(exchanges.map((e) => e.requirement_id).filter((x): x is string => Boolean(x))));
  const [listingsRes, reqsRes] = await Promise.all([
    listingIds.length
      ? supabase.from('listings').select('*').in('id', listingIds)
      : Promise.resolve({ data: [], error: null }),
    reqIds.length
      ? supabase.from('requirements').select('*').in('id', reqIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (listingsRes.error) throw toExchangeError(listingsRes.error);
  if (reqsRes.error) throw toExchangeError(reqsRes.error);

  return buildViews(
    exchanges,
    items,
    (logsRes.data ?? []) as ActivityLog[],
    (listingsRes.data ?? []) as MaterialListing[],
    (reqsRes.data ?? []) as MaterialRequirement[],
    (orgsRes.data ?? []) as Organization[]
  );
}

function loadFromMock(exchangeId?: string): ExchangeView[] {
  const s = mockState();
  const exchanges = (exchangeId ? s.exchanges.filter((e) => e.id === exchangeId) : [...s.exchanges]).sort((a, b) =>
    b.created_at.localeCompare(a.created_at)
  );
  // Deep copy so callers can never mutate the store through a view.
  return JSON.parse(
    JSON.stringify(buildViews(exchanges, s.items, s.logs, s.listings, s.requirements, mockOrganizations()))
  );
}

// ---------------------------------------------------------------------------
// public API
// ---------------------------------------------------------------------------

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const exchangeRepository = {
  isMockMode(): boolean {
    return listingRepository.isMockMode() || requirementRepository.isMockMode();
  },

  async list(filters: ExchangeFilterOptions = {}): Promise<ExchangeView[]> {
    const views = this.isMockMode() ? loadFromMock() : await loadFromSupabase();
    return applyFilters(views, filters);
  },

  async getById(id: string): Promise<ExchangeView | null> {
    if (!this.isMockMode() && !UUID_REGEX.test(id)) return null;
    const views = this.isMockMode() ? loadFromMock(id) : await loadFromSupabase(id);
    return views[0] ?? null;
  },

  async create(input: {
    requirement_id: string;
    buyer_organization_id: string;
    items: CreateExchangeItemInput[];
  }): Promise<ExchangeView> {
    let id: string;
    if (this.isMockMode()) {
      id = createExchangeRequest(mockState(), input).id;
    } else {
      const { data, error } = await db().rpc('create_exchange_request', {
        p_requirement_id: input.requirement_id,
        p_buyer_id: input.buyer_organization_id,
        p_items: input.items,
      });
      if (error) throw toExchangeError(error);
      id = data as string;
    }
    const view = await this.getById(id);
    if (!view) throw new ExchangeError('INTERNAL_ERROR', 'Exchange was created but could not be read back.');
    return view;
  },

  async act(
    action: ExchangeAction,
    exchangeId: string,
    actorId: string,
    itemId?: string
  ): Promise<ExchangeView> {
    if ((action === 'accept' || action === 'reject') && !itemId) {
      throw new ExchangeError('VALIDATION_ERROR', 'exchange_item_id is required.');
    }

    if (this.isMockMode()) {
      const s = mockState();
      if (action === 'accept') acceptExchangeItem(s, exchangeId, itemId!, actorId);
      else if (action === 'reject') rejectExchangeItem(s, exchangeId, itemId!, actorId);
      else if (action === 'complete') completeExchange(s, exchangeId, actorId);
      else cancelExchange(s, exchangeId, actorId);
    } else {
      const current = await this.getById(exchangeId);
      if (!current) throw new ExchangeError('NOT_FOUND', `Exchange ${exchangeId} was not found.`);
      if (itemId && !current.items.some((i) => i.id === itemId)) {
        throw new ExchangeError('NOT_FOUND', `Exchange item ${itemId} was not found in exchange ${exchangeId}.`);
      }
      const call =
        action === 'accept'
          ? db().rpc('accept_exchange_item', { p_item_id: itemId, p_actor_id: actorId })
          : action === 'reject'
            ? db().rpc('reject_exchange_item', { p_item_id: itemId, p_actor_id: actorId })
            : action === 'complete'
              ? db().rpc('complete_exchange', { p_exchange_id: exchangeId, p_actor_id: actorId })
              : db().rpc('cancel_exchange', { p_exchange_id: exchangeId, p_actor_id: actorId });
      const { error } = await call;
      if (error) throw toExchangeError(error);
    }

    const view = await this.getById(exchangeId);
    if (!view) throw new ExchangeError('NOT_FOUND', `Exchange ${exchangeId} was not found.`);
    return view;
  },

  /** Test helper: clear in-memory exchanges (listings/requirements reset separately). */
  _resetStore() {
    globalThis.__monoloop_exchanges = emptyStore();
  },
};
