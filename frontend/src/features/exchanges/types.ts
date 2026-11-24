// ============================================================================
// MONOLOOP - Exchange module types (Member 4)
// TSUNAGU Hackathon 2026
// ============================================================================

import type {
  ActivityLog,
  Exchange,
  ExchangeItem,
  MaterialListing,
  MaterialRequirement,
  Organization,
} from '@/lib/types';

/** Exchange item row as stored (adds the price snapshot from migration 00004). */
export interface ExchangeItemRecord extends ExchangeItem {
  unit_price_bdt: number;
  updated_at?: string;
}

/**
 * What the UI sees. Derived from exchange.status + item statuses:
 *  AWAITING_SUPPLIERS – requested, at least one supplier has not answered
 *  SUPPLIER_DECLINED  – a supplier declined; buyer must cancel (releases stock)
 *  RESERVED           – every supplier accepted, stock is held; buyer can complete
 *  COMPLETED          – transfer confirmed, inventory deducted
 *  CANCELLED          – cancelled, reservations released
 */
export type ExchangeStage =
  | 'AWAITING_SUPPLIERS'
  | 'SUPPLIER_DECLINED'
  | 'RESERVED'
  | 'COMPLETED'
  | 'CANCELLED';

export interface ExchangeItemView extends ExchangeItemRecord {
  subtotal_bdt: number;
  listing?: MaterialListing;
  supplier?: Organization;
}

/** Online payment for an exchange (SSLCommerz sandbox; backend migration 00007). */
export type PaymentStatus = 'INITIATED' | 'PAID' | 'FAILED' | 'CANCELLED';

export interface PaymentSummary {
  status: PaymentStatus;
  provider: string;
  tran_id: string;
  amount_bdt: number;
  card_type?: string | null;
  paid_at?: string | null;
}

export interface PaymentStart {
  payment_id: string;
  tran_id: string;
  amount_bdt: number;
  currency: string;
  gateway_url: string;
  sandbox: boolean;
}

export interface ExchangeView extends Exchange {
  stage: ExchangeStage;
  items: ExchangeItemView[];
  buyer?: Organization;
  requirement?: MaterialRequirement;
  activity: ActivityLog[];
  total_quantity: number;
  total_value_bdt: number;
  counts: { pending: number; accepted: number; rejected: number; completed: number; cancelled: number };
  /** True when the server requires payment before the transfer can be confirmed. */
  payment_required?: boolean;
  payment?: PaymentSummary | null;
}

export interface CreateExchangeItemInput {
  listing_id: string;
  quantity: number;
}

export type ExchangeAction = 'accept' | 'reject' | 'complete' | 'cancel';

export const EXCHANGE_ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  ACTOR_REQUIRED: 400,
  FORBIDDEN_ORGANIZATION: 403,
  NOT_FOUND: 404,
  INVALID_STATE: 409,
  INSUFFICIENT_STOCK: 409,
  LISTING_UNAVAILABLE: 409,
  DUPLICATE_EXCHANGE: 409,
  REQUIREMENT_NOT_OPEN: 409,
  NO_ALLOCATION: 422,
  INTERNAL_ERROR: 500,
} as const;

export type ExchangeErrorCode = keyof typeof EXCHANGE_ERROR_STATUS;

export class ExchangeError extends Error {
  readonly code: ExchangeErrorCode;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: ExchangeErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'ExchangeError';
    this.code = code;
    this.status = EXCHANGE_ERROR_STATUS[code];
    this.details = details;
  }
}
