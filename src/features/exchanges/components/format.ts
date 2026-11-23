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

export const STAGE_META: Record<ExchangeStage, { label: string; className: string }> = {
  AWAITING_SUPPLIERS: { label: 'Awaiting suppliers', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  SUPPLIER_DECLINED: { label: 'Supplier declined', className: 'bg-red-50 text-red-800 border-red-200' },
  RESERVED: { label: 'Stock reserved', className: 'bg-blue-50 text-blue-800 border-blue-200' },
  COMPLETED: { label: 'Completed', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-slate-100 text-slate-600 border-slate-200' },
};

export const ITEM_STATUS_META: Record<string, { label: string; className: string }> = {
  PENDING: { label: 'Pending', className: 'text-amber-700' },
  ACCEPTED: { label: 'Accepted · reserved', className: 'text-blue-700' },
  REJECTED: { label: 'Declined', className: 'text-red-700' },
  CANCELLED: { label: 'Cancelled · released', className: 'text-slate-500' },
  COMPLETED: { label: 'Transferred', className: 'text-emerald-700' },
};

export const ACTIVITY_LABEL: Record<string, string> = {
  EXCHANGE_REQUESTED: 'Exchange requested',
  ITEM_ACCEPTED: 'Supplier accepted, stock reserved',
  ITEM_REJECTED: 'Supplier declined',
  EXCHANGE_RESERVED: 'All suppliers accepted, exchange reserved',
  EXCHANGE_COMPLETED: 'Transfer confirmed, inventory updated',
  EXCHANGE_CANCELLED: 'Exchange cancelled, reservations released',
};
