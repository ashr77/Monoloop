// ============================================================================
// MONOLOOP - Shared TypeScript Contracts & Interfaces
// TSUNAGU Hackathon 2026
// ============================================================================

import {
  MaterialFamily,
  MaterialSpecification,
  QuantityUnit,
  MaterialCondition,
  ListingStatus,
  RequirementStatus,
  ExchangeStatus,
  ExchangeItemStatus,
  MatchingStatus,
} from './constants';

// --- Organizations ---
export interface Organization {
  id: string;
  name: string;
  organization_type: 'SUPPLIER' | 'BUYER' | 'HYBRID';
  city: string;
  address?: string | null;
  created_at: string;
}

// --- Material Listings (Supply Feature - Member 1) ---
export interface MaterialListing {
  id: string;
  organization_id: string;
  material_family: MaterialFamily;
  material_specification: MaterialSpecification;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  total_quantity: number;
  reserved_quantity: number;
  available_quantity: number; // total_quantity - reserved_quantity
  quantity_unit: QuantityUnit;
  condition: MaterialCondition;
  unit_price_bdt: number;
  description?: string | null;
  image_url?: string | null;
  city: string;
  status: ListingStatus;
  created_at: string;
  updated_at: string;
  // Optional expanded join for UI convenience
  organization?: Organization;
}

// --- Material Requirements (Demand Feature - Member 2) ---
export type DemandMaterialSpecification = MaterialSpecification;

export interface MaterialRequirement {
  id: string;
  organization_id: string;
  material_family: MaterialFamily;
  material_specification: DemandMaterialSpecification;
  length_mm: number;
  width_mm: number;
  thickness_mm: number;
  length_min_mm?: number | null;
  length_max_mm?: number | null;
  width_min_mm?: number | null;
  width_max_mm?: number | null;
  thickness_min_mm?: number | null;
  thickness_max_mm?: number | null;
  required_quantity: number;
  quantity_unit: QuantityUnit;
  maximum_budget_bdt?: number | null;
  allow_split_suppliers: boolean;
  condition_requirement: 'ANY' | MaterialCondition;
  status: RequirementStatus;
  created_at: string;
  organization?: Organization;
}

// --- Match Proposals & Allocations (Matching Feature - Member 3) ---
export interface MatchAllocation {
  listing_id: string;
  supplier_organization_id: string;
  supplier_name: string;
  allocated_quantity: number;
  unit_price_bdt: number;
  subtotal_bdt: number;
  city: string;
  technical_notes: string;
}

export interface MatchProposal {
  requirement_id: string;
  requested_quantity: number;
  matching_status: MatchingStatus;
  allocations: MatchAllocation[];
  compatible_supplier_ids: string[];
  listing_ids: string[];
  allocated_quantities: Record<string, number>;
  estimated_material_costs_bdt: number;
  estimated_transportation_costs_bdt?: number;
  total_estimated_cost_bdt: number;
  compatibility_explanations: string[];
  rejection_reasons?: string[];
  unfulfilled_quantity: number;
}

// --- Exchanges & Atomic Reservations (Exchange Feature - Member 4) ---
export interface ExchangeItem {
  id: string;
  exchange_id: string;
  listing_id: string;
  supplier_organization_id: string;
  quantity: number;
  status: ExchangeItemStatus;
  created_at: string;
  listing?: MaterialListing;
  supplier?: Organization;
}

export interface Exchange {
  id: string;
  requirement_id?: string | null;
  buyer_organization_id: string;
  status: ExchangeStatus;
  created_at: string;
  updated_at: string;
  items?: ExchangeItem[];
  buyer?: Organization;
  requirement?: MaterialRequirement;
}

// --- Activity Logs ---
export interface ActivityLog {
  id: string;
  exchange_id?: string | null;
  action: string;
  details: Record<string, unknown>;
  created_at: string;
}

// --- Unified API Response ---
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    [key: string]: unknown;
  };
}
