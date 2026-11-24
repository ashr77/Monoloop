// Shared display helpers for the exchange and impact pages (Member 4).

import type { ExchangeStage } from '../types';

export const bdt = (v: number) =>
  `৳${Math.round(v).toLocaleString('en-US')}`;

export const num = (v: number, digits = 0) =>
  v.toLocaleString('en-US', { maximumFractionDigits: digits, minimumFractionDigits: digits });

export const SPEC_LABEL: Record<string, string> = {
  SS304: 'SS 304',
  SS201: 'SS 201',
  SS316: 'SS 316',
  PLYWOOD_STANDARD: 'Standard plywood',
  PLYWOOD_MARINE: 'Marine plywood',
  PLYWOOD_COMMERCIAL: 'Commercial plywood',
};

export const FAMILY_LABEL: Record<string, string> = {
  STAINLESS_STEEL_SHEET: 'Stainless steel sheet',
  PLYWOOD_PANEL: 'Plywood panel',
};

export const dims = (l?: { length_mm: number; width_mm: number; thickness_mm: number }) =>
  l ? `${num(Number(l.length_mm))}×${num(Number(l.width_mm))}×${num(Number(l.thickness_mm), Number(l.thickness_mm) % 1 ? 1 : 0)} mm` : '—';

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** Status tone for <StatusBadge> (Industrial Copper: moss / ochre / brick / copper / slate only). */
export type StatusTone = 'neutral' | 'copper' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

export const STAGE_META: Record<ExchangeStage, { label: string; className: string; tone: StatusTone }> = {
  AWAITING_SUPPLIERS: { label: 'Awaiting suppliers', className: 'text-ochre-700', tone: 'warning' },
  SUPPLIER_DECLINED: { label: 'Supplier declined', className: 'text-brick-700', tone: 'danger' },
  RESERVED: { label: 'Stock reserved', className: 'text-copper-700', tone: 'copper' },
  COMPLETED: { label: 'Completed', className: 'text-moss-700', tone: 'success' },
  CANCELLED: { label: 'Cancelled', className: 'text-slate-600', tone: 'muted' },
};

export const ITEM_STATUS_META: Record<string, { label: string; className: string; tone: StatusTone }> = {
  PENDING: { label: 'Pending', className: 'text-ochre-700', tone: 'warning' },
  ACCEPTED: { label: 'Accepted · reserved', className: 'text-copper-700', tone: 'copper' },
  REJECTED: { label: 'Declined', className: 'text-brick-700', tone: 'danger' },
  CANCELLED: { label: 'Cancelled · released', className: 'text-slate-600', tone: 'muted' },
  COMPLETED: { label: 'Transferred', className: 'text-moss-700', tone: 'success' },
};

export const ACTIVITY_LABEL: Record<string, string> = {
  EXCHANGE_REQUESTED: 'Exchange requested',
  ITEM_ACCEPTED: 'Supplier accepted, stock reserved',
  ITEM_REJECTED: 'Supplier declined',
  EXCHANGE_RESERVED: 'All suppliers accepted, exchange reserved',
  EXCHANGE_COMPLETED: 'Transfer confirmed, inventory updated',
  EXCHANGE_CANCELLED: 'Exchange cancelled, reservations released',
};
