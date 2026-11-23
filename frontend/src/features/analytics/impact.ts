// ============================================================================
// MONOLOOP - Resource recovery analytics types (Member 4)
// The report is computed by the FastAPI backend (backend/app/services/impact.py)
// and fetched with useImpact() from src/hooks.
// ============================================================================

import type { MaterialFamily } from '@/lib/constants';

export interface FamilyBreakdown {
  material_family: MaterialFamily;
  units: number;
  value_bdt: number;
  mass_kg: number;
}

export interface SupplierContribution {
  organization_id: string;
  name: string;
  units: number;
  value_bdt: number;
  exchanges: number;
}

export interface CompletedExchangeSummary {
  id: string;
  completed_at: string;
  buyer_name: string;
  material: string;
  units: number;
  value_bdt: number;
  suppliers: string[];
}

export interface ImpactReport {
  scope: { organization_id: string | null };
  recovered: {
    completed_exchanges: number;
    transferred_units: number;
    transferred_value_bdt: number;
    estimated_mass_kg: number;
    fulfilled_requirements: number;
    multi_supplier_exchanges: number;
  };
  pipeline: {
    awaiting_suppliers: number;
    reserved_exchanges: number;
    reserved_units: number;
    reserved_value_bdt: number;
    cancelled_exchanges: number;
  };
  inventory: {
    active_listings: number;
    available_units: number;
    reserved_units: number;
    available_value_bdt: number;
  };
  by_family: FamilyBreakdown[];
  top_suppliers: SupplierContribution[];
  recent_completed: CompletedExchangeSummary[];
  assumptions: string[];
}
