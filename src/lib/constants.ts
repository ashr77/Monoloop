// ============================================================================
// MONOLOOP - Shared Constants & Controlled Vocabularies
// TSUNAGU Hackathon 2026
// ============================================================================

export const MATERIAL_FAMILIES = [
  'STAINLESS_STEEL_SHEET',
  'PLYWOOD_PANEL',
] as const;

export type MaterialFamily = (typeof MATERIAL_FAMILIES)[number];

export const MATERIAL_SPECIFICATIONS = {
  STAINLESS_STEEL_SHEET: ['SS304', 'SS201', 'SS316'] as const,
  PLYWOOD_PANEL: ['PLYWOOD_STANDARD', 'PLYWOOD_MARINE', 'PLYWOOD_COMMERCIAL'] as const,
} as const;

export const ALL_SPECIFICATIONS = [
  ...MATERIAL_SPECIFICATIONS.STAINLESS_STEEL_SHEET,
  ...MATERIAL_SPECIFICATIONS.PLYWOOD_PANEL,
] as const;

export type MaterialSpecification = (typeof ALL_SPECIFICATIONS)[number];

export const QUANTITY_UNITS = ['PIECE'] as const;
export type QuantityUnit = (typeof QUANTITY_UNITS)[number];

export const MATERIAL_CONDITIONS = ['UNUSED', 'LEFTOVER', 'OFFCUT'] as const;
export type MaterialCondition = (typeof MATERIAL_CONDITIONS)[number];

export const LISTING_STATUSES = ['ACTIVE', 'RESERVED', 'COMPLETED', 'ARCHIVED'] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

export const REQUIREMENT_STATUSES = ['OPEN', 'FULFILLED', 'CANCELLED'] as const;
export type RequirementStatus = (typeof REQUIREMENT_STATUSES)[number];

export const EXCHANGE_STATUSES = ['PROPOSED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type ExchangeStatus = (typeof EXCHANGE_STATUSES)[number];

export const EXCHANGE_ITEM_STATUSES = [
  'PENDING',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'COMPLETED',
] as const;
export type ExchangeItemStatus = (typeof EXCHANGE_ITEM_STATUSES)[number];

export const MATCHING_STATUSES = [
  'EXACT_MATCH',
  'MULTI_SUPPLIER_MATCH',
  'PARTIAL_MATCH',
  'NO_MATCH',
] as const;
export type MatchingStatus = (typeof MATCHING_STATUSES)[number];

export const BANGLADESH_CITIES = [
  'Gazipur',
  'Dhaka',
  'Narayanganj',
  'Chattogram',
  'Khulna',
  'Bogura',
  'Cumilla',
] as const;

// Synthetic demo organizations for hackathon use (Clearly labeled as DEMO)
export const DEMO_ORGANIZATIONS = [
  {
    id: 'a1111111-1111-4111-a111-111111111111',
    name: 'Gazipur Metal Works Ltd.',
    organization_type: 'SUPPLIER' as const,
    city: 'Gazipur',
    address: 'Plot 42, Tongi Industrial Area, Gazipur',
  },
  {
    id: 'a2222222-2222-4222-a222-222222222222',
    name: 'Dhaka Precision Steel Fabrications',
    organization_type: 'SUPPLIER' as const,
    city: 'Dhaka',
    address: 'Tejgaon Industrial Area, Dhaka',
  },
  {
    id: 'a3333333-3333-4333-a333-333333333333',
    name: 'Narayanganj Industrial Supplies & Scrap',
    organization_type: 'SUPPLIER' as const,
    city: 'Narayanganj',
    address: 'BSCIC Estate, Fatullah, Narayanganj',
  },
  {
    id: 'a4444444-4444-4444-a444-444444444444',
    name: 'GreenWood Furniture Workshop & Crafts',
    organization_type: 'SUPPLIER' as const,
    city: 'Dhaka',
    address: 'Badda, Dhaka',
  },
  {
    id: 'b1111111-1111-4111-b111-111111111111',
    name: 'Apex Modular Enclosures (Buyer Demo)',
    organization_type: 'BUYER' as const,
    city: 'Dhaka',
    address: 'Uttara Sector 3, Dhaka',
  },
  {
    id: 'b2222222-2222-4222-b222-222222222222',
    name: 'Delta Interior Fixtures (Buyer Demo)',
    organization_type: 'BUYER' as const,
    city: 'Gazipur',
    address: 'Konabari, Gazipur',
  },
] as const;
