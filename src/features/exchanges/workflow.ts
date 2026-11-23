// ============================================================================
// MONOLOOP - Exchange state machine (Member 4), pure TypeScript
// TSUNAGU Hackathon 2026
//
// Mirrors the PostgreSQL functions in supabase/migrations/00004_exchange_workflow.sql
// rule for rule. Used in demo/mock mode and by the unit tests. Each operation
// validates everything first and only then mutates, so a failed call leaves the
// state untouched (the in-memory equivalent of a rolled-back transaction).
// JavaScript runs one call at a time, so each call is also atomic.
// ============================================================================

import type { ActivityLog, Exchange, MaterialListing, MaterialRequirement } from '@/lib/types';
import {
  CreateExchangeItemInput,
  ExchangeError,
  ExchangeItemRecord,
  ExchangeItemView,
  ExchangeStage,
  ExchangeView,
} from './types';

export interface WorkflowState {
  listings: MaterialListing[];
  requirements: MaterialRequirement[];
  exchanges: Exchange[];
  items: ExchangeItemRecord[];
  logs: ActivityLog[];
}

export interface WorkflowEnv {
  now?: () => string;
  newId?: () => string;
}

const defaultNow = () => new Date().toISOString();
const defaultId = () => crypto.randomUUID();

function log(state: WorkflowState, env: WorkflowEnv, exchangeId: string, action: string, details: Record<string, unknown>) {
  state.logs.push({
    id: (env.newId ?? defaultId)(),
    exchange_id: exchangeId,
    action,
    details,
    created_at: (env.now ?? defaultNow)(),
  });
}

function touch(row: { updated_at?: string }, env: WorkflowEnv) {
  row.updated_at = (env.now ?? defaultNow)();
}

function findExchange(state: WorkflowState, id: string): Exchange {
  const ex = state.exchanges.find((e) => e.id === id);
  if (!ex) throw new ExchangeError('NOT_FOUND', `Exchange ${id} was not found.`);
  return ex;
}

function findItem(state: WorkflowState, exchangeId: string, itemId: string): ExchangeItemRecord {
  const item = state.items.find((i) => i.id === itemId);
  if (!item || item.exchange_id !== exchangeId) {
    throw new ExchangeError('NOT_FOUND', `Exchange item ${itemId} was not found in exchange ${exchangeId}.`);
  }
  return item;
}

function findListing(state: WorkflowState, id: string): MaterialListing {
  const listing = state.listings.find((l) => l.id === id);
  if (!listing) throw new ExchangeError('NOT_FOUND', `Listing ${id} was not found.`);
  return listing;
}

function setListingQuantities(listing: MaterialListing, total: number, reserved: number, env: WorkflowEnv) {
  if (reserved < 0 || total < 0 || reserved > total) {
    // Same invariant as the CHECK constraints on the listings table.
    throw new ExchangeError('INVALID_STATE', `Inventory invariant violated for listing ${listing.id}.`);
  }
  listing.total_quantity = total;
  listing.reserved_quantity = reserved;
  listing.available_quantity = total - reserved;
  touch(listing, env);
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export function createExchangeRequest(
  state: WorkflowState,
  input: { requirement_id: string; buyer_organization_id: string; items: CreateExchangeItemInput[] },
  env: WorkflowEnv = {}
): Exchange {
  const req = state.requirements.find((r) => r.id === input.requirement_id);
  if (!req) throw new ExchangeError('NOT_FOUND', `Requirement ${input.requirement_id} was not found.`);
  if (req.organization_id !== input.buyer_organization_id) {
    throw new ExchangeError(
      'FORBIDDEN_ORGANIZATION',
      'Only the organization that published this requirement can request an exchange for it.'
    );
  }
  if (req.status !== 'OPEN') {
    throw new ExchangeError(
      'REQUIREMENT_NOT_OPEN',
      `Requirement is ${req.status}; only OPEN requirements can start an exchange.`
    );
  }
  if (
    state.exchanges.some(
      (e) => e.requirement_id === req.id && (e.status === 'PROPOSED' || e.status === 'IN_PROGRESS')
    )
  ) {
    throw new ExchangeError('DUPLICATE_EXCHANGE', 'An active exchange already exists for this requirement.');
  }
  if (input.items.length === 0) {
    throw new ExchangeError('NO_ALLOCATION', 'An exchange needs at least one allocated listing.');
  }

  const seen = new Set<string>();
  const resolved = input.items.map((it) => {
    if (!Number.isInteger(it.quantity) || it.quantity <= 0) {
      throw new ExchangeError('VALIDATION_ERROR', 'Allocated quantity must be a positive integer.');
    }
    if (seen.has(it.listing_id)) {
      throw new ExchangeError('VALIDATION_ERROR', `Listing ${it.listing_id} appears more than once.`);
    }
    seen.add(it.listing_id);
    const listing = findListing(state, it.listing_id);
    if (listing.status !== 'ACTIVE') {
      throw new ExchangeError('LISTING_UNAVAILABLE', `Listing ${listing.id} is ${listing.status}, not ACTIVE.`);
    }
    if (listing.organization_id === input.buyer_organization_id) {
      throw new ExchangeError('VALIDATION_ERROR', 'A buyer cannot request its own listing.');
    }
    if (
      listing.material_family !== req.material_family ||
      listing.material_specification !== req.material_specification
    ) {
      throw new ExchangeError('VALIDATION_ERROR', `Listing ${listing.id} does not match the requirement material.`);
    }
    return { listing, quantity: it.quantity };
  });

  const now = (env.now ?? defaultNow)();
  const exchange: Exchange = {
    id: (env.newId ?? defaultId)(),
    requirement_id: req.id,
    buyer_organization_id: input.buyer_organization_id,
    status: 'PROPOSED',
    created_at: now,
    updated_at: now,
  };
  state.exchanges.push(exchange);

  for (const { listing, quantity } of resolved) {
    state.items.push({
      id: (env.newId ?? defaultId)(),
      exchange_id: exchange.id,
      listing_id: listing.id,
      supplier_organization_id: listing.organization_id,
      quantity,
      unit_price_bdt: Number(listing.unit_price_bdt),
      status: 'PENDING',
      created_at: now,
      updated_at: now,
    });
  }

  log(state, env, exchange.id, 'EXCHANGE_REQUESTED', {
    actor_organization_id: input.buyer_organization_id,
    requirement_id: req.id,
    item_count: resolved.length,
    total_quantity: resolved.reduce((s, r) => s + r.quantity, 0),
  });

  return exchange;
}

// ---------------------------------------------------------------------------
// supplier actions
// ---------------------------------------------------------------------------

export function acceptExchangeItem(
  state: WorkflowState,
  exchangeId: string,
  itemId: string,
  actorId: string,
  env: WorkflowEnv = {}
): Exchange {
  const exchange = findExchange(state, exchangeId);
  const item = findItem(state, exchangeId, itemId);

  if (item.supplier_organization_id !== actorId) {
    throw new ExchangeError('FORBIDDEN_ORGANIZATION', 'Only the supplier of this item can accept it.');
  }
  if (exchange.status !== 'PROPOSED') {
    throw new ExchangeError(
      'INVALID_STATE',
      `Exchange is ${exchange.status}; items can only be accepted while it is PROPOSED.`
    );
  }
  if (item.status !== 'PENDING') {
    throw new ExchangeError('INVALID_STATE', `Item is already ${item.status}.`);
  }

  const listing = findListing(state, item.listing_id);
  if (listing.status !== 'ACTIVE') {
    throw new ExchangeError('LISTING_UNAVAILABLE', `Listing is ${listing.status} and cannot be reserved.`);
  }
  const available = listing.total_quantity - listing.reserved_quantity;
  if (available < item.quantity) {
    throw new ExchangeError(
      'INSUFFICIENT_STOCK',
      `Only ${available} piece(s) are still available; ${item.quantity} requested. Stock changed since matching.`,
      { available, requested: item.quantity }
    );
  }

  setListingQuantities(listing, listing.total_quantity, listing.reserved_quantity + item.quantity, env);
  item.status = 'ACCEPTED';
  touch(item, env);
  log(state, env, exchange.id, 'ITEM_ACCEPTED', {
    actor_organization_id: actorId,
    exchange_item_id: item.id,
    listing_id: listing.id,
    quantity: item.quantity,
  });

  const allAccepted = state.items
    .filter((i) => i.exchange_id === exchange.id)
    .every((i) => i.status === 'ACCEPTED');
  if (allAccepted) {
    exchange.status = 'IN_PROGRESS';
    touch(exchange, env);
    log(state, env, exchange.id, 'EXCHANGE_RESERVED', { actor_organization_id: actorId });
  }
  return exchange;
}

export function rejectExchangeItem(
  state: WorkflowState,
  exchangeId: string,
  itemId: string,
  actorId: string,
  env: WorkflowEnv = {}
): Exchange {
  const exchange = findExchange(state, exchangeId);
  const item = findItem(state, exchangeId, itemId);

  if (item.supplier_organization_id !== actorId) {
    throw new ExchangeError('FORBIDDEN_ORGANIZATION', 'Only the supplier of this item can decline it.');
  }
  if (exchange.status !== 'PROPOSED') {
    throw new ExchangeError(
      'INVALID_STATE',
      `Exchange is ${exchange.status}; items can only be declined while it is PROPOSED.`
    );
  }
  if (item.status !== 'PENDING') {
    throw new ExchangeError('INVALID_STATE', `Item is already ${item.status}.`);
  }

  item.status = 'REJECTED';
  touch(item, env);
  log(state, env, exchange.id, 'ITEM_REJECTED', {
    actor_organization_id: actorId,
    exchange_item_id: item.id,
    listing_id: item.listing_id,
    quantity: item.quantity,
  });
  return exchange;
}

// ---------------------------------------------------------------------------
// buyer actions
// ---------------------------------------------------------------------------

export function completeExchange(
  state: WorkflowState,
  exchangeId: string,
  actorId: string,
  env: WorkflowEnv = {}
): Exchange {
  const exchange = findExchange(state, exchangeId);
  if (exchange.buyer_organization_id !== actorId) {
    throw new ExchangeError('FORBIDDEN_ORGANIZATION', 'Only the buyer can confirm completion of this exchange.');
  }
  if (exchange.status !== 'IN_PROGRESS') {
    throw new ExchangeError(
      'INVALID_STATE',
      `Exchange is ${exchange.status}; only a fully reserved (IN_PROGRESS) exchange can be completed.`
    );
  }

  const items = state.items.filter((i) => i.exchange_id === exchange.id);
  // Validate everything before mutating anything.
  const plan = items.map((item) => {
    if (item.status !== 'ACCEPTED') {
      throw new ExchangeError('INVALID_STATE', `Item ${item.id} is ${item.status}, expected ACCEPTED.`);
    }
    const listing = findListing(state, item.listing_id);
    if (listing.reserved_quantity < item.quantity || listing.total_quantity < item.quantity) {
      throw new ExchangeError('INVALID_STATE', `Reservation for listing ${listing.id} is inconsistent.`);
    }
    return { item, listing };
  });

  let totalQty = 0;
  let totalValue = 0;
  for (const { item, listing } of plan) {
    setListingQuantities(
      listing,
      listing.total_quantity - item.quantity,
      listing.reserved_quantity - item.quantity,
      env
    );
    if (listing.total_quantity === 0) listing.status = 'COMPLETED';
    item.status = 'COMPLETED';
    touch(item, env);
    totalQty += item.quantity;
    totalValue += item.quantity * item.unit_price_bdt;
  }

  exchange.status = 'COMPLETED';
  touch(exchange, env);

  if (exchange.requirement_id) {
    const req = state.requirements.find((r) => r.id === exchange.requirement_id);
    if (req) {
      const exchangeIds = new Set(
        state.exchanges.filter((e) => e.requirement_id === req.id).map((e) => e.id)
      );
      const completedForReq = state.items
        .filter((i) => exchangeIds.has(i.exchange_id) && i.status === 'COMPLETED')
        .reduce((s, i) => s + i.quantity, 0);
      if (completedForReq >= Number(req.required_quantity)) req.status = 'FULFILLED';
    }
  }

  log(state, env, exchange.id, 'EXCHANGE_COMPLETED', {
    actor_organization_id: actorId,
    total_quantity: totalQty,
    total_value_bdt: totalValue,
  });
  return exchange;
}

export function cancelExchange(
  state: WorkflowState,
  exchangeId: string,
  actorId: string,
  env: WorkflowEnv = {}
): Exchange {
  const exchange = findExchange(state, exchangeId);
  if (exchange.buyer_organization_id !== actorId) {
    throw new ExchangeError('FORBIDDEN_ORGANIZATION', 'Only the buyer can cancel this exchange.');
  }
  if (exchange.status !== 'PROPOSED' && exchange.status !== 'IN_PROGRESS') {
    throw new ExchangeError('INVALID_STATE', `Exchange is already ${exchange.status}.`);
  }

  const items = state.items.filter((i) => i.exchange_id === exchange.id);
  const releases = items
    .filter((i) => i.status === 'ACCEPTED')
    .map((item) => {
      const listing = findListing(state, item.listing_id);
      if (listing.reserved_quantity < item.quantity) {
        throw new ExchangeError('INVALID_STATE', `Reservation for listing ${listing.id} is inconsistent.`);
      }
      return { item, listing };
    });

  let released = 0;
  for (const { item, listing } of releases) {
    setListingQuantities(listing, listing.total_quantity, listing.reserved_quantity - item.quantity, env);
    released += item.quantity;
  }
  for (const item of items) {
    if (item.status === 'PENDING' || item.status === 'ACCEPTED') {
      item.status = 'CANCELLED';
      touch(item, env);
    }
  }

  exchange.status = 'CANCELLED';
  touch(exchange, env);
  log(state, env, exchange.id, 'EXCHANGE_CANCELLED', {
    actor_organization_id: actorId,
    released_quantity: released,
  });
  return exchange;
}

// ---------------------------------------------------------------------------
// read model
// ---------------------------------------------------------------------------

export function deriveStage(exchange: Pick<Exchange, 'status'>, items: Pick<ExchangeItemRecord, 'status'>[]): ExchangeStage {
  switch (exchange.status) {
    case 'COMPLETED':
      return 'COMPLETED';
    case 'CANCELLED':
      return 'CANCELLED';
    case 'IN_PROGRESS':
      return 'RESERVED';
    default:
      return items.some((i) => i.status === 'REJECTED') ? 'SUPPLIER_DECLINED' : 'AWAITING_SUPPLIERS';
  }
}

export function summarizeExchange(
  exchange: Exchange,
  items: ExchangeItemView[],
  activity: ActivityLog[]
): ExchangeView {
  const counts = { pending: 0, accepted: 0, rejected: 0, completed: 0, cancelled: 0 };
  for (const i of items) {
    if (i.status === 'PENDING') counts.pending++;
    else if (i.status === 'ACCEPTED') counts.accepted++;
    else if (i.status === 'REJECTED') counts.rejected++;
    else if (i.status === 'COMPLETED') counts.completed++;
    else if (i.status === 'CANCELLED') counts.cancelled++;
  }
  return {
    ...exchange,
    stage: deriveStage(exchange, items),
    items,
    activity: [...activity].sort((a, b) => a.created_at.localeCompare(b.created_at)),
    total_quantity: items.reduce((s, i) => s + i.quantity, 0),
    total_value_bdt: items.reduce((s, i) => s + i.subtotal_bdt, 0),
    counts,
  };
}
