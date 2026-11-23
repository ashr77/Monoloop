// ============================================================================
// MONOLOOP - Resource recovery analytics (Member 4), pure functions
// TSUNAGU Hackathon 2026
//
// Only COMPLETED exchange items count as reuse. Proposed or reserved exchanges
// are reported separately as "pipeline" and never as recovered resources.
// Mass figures are indicative estimates from nominal dimensions and densities.
// ============================================================================

import type { MaterialFamily } from '@/lib/constants';
import type { MaterialListing } from '@/lib/types';
import type { ExchangeView } from '@/features/exchanges/types';

/** Nominal densities used for indicative mass estimates (kg/m³). */
export const DENSITY_KG_PER_M3: Record<MaterialFamily, number> = {
  STAINLESS_STEEL_SHEET: 7930, // austenitic stainless (SS304 ≈ 7,930 kg/m³)
  PLYWOOD_PANEL: 600, // typical structural plywood, 500–700 kg/m³
};

export function estimatePieceMassKg(
  family: MaterialFamily,
  length_mm: number,
  width_mm: number,
  thickness_mm: number
): number {
  const volumeM3 = (length_mm * width_mm * thickness_mm) / 1e9;
  return volumeM3 * DENSITY_KG_PER_M3[family];
}

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

const familyLabel: Record<string, string> = {
  STAINLESS_STEEL_SHEET: 'Stainless steel sheet',
  PLYWOOD_PANEL: 'Plywood panel',
};

/**
 * @param exchanges  every exchange visible in scope (already filtered by org if needed)
 * @param listings   listings in scope (for the current inventory snapshot)
 * @param organizationId  when set, completed items count only where the org is buyer or supplier
 */
export function computeImpact(
  exchanges: ExchangeView[],
  listings: MaterialListing[],
  organizationId: string | null = null
): ImpactReport {
  const inScope = (ex: ExchangeView, supplierId: string) =>
    !organizationId || ex.buyer_organization_id === organizationId || supplierId === organizationId;

  const recovered = {
    completed_exchanges: 0,
    transferred_units: 0,
    transferred_value_bdt: 0,
    estimated_mass_kg: 0,
    fulfilled_requirements: 0,
    multi_supplier_exchanges: 0,
  };
  const pipeline = {
    awaiting_suppliers: 0,
    reserved_exchanges: 0,
    reserved_units: 0,
    reserved_value_bdt: 0,
    cancelled_exchanges: 0,
  };
  const families = new Map<MaterialFamily, FamilyBreakdown>();
  const suppliers = new Map<string, SupplierContribution & { exchangeIds: Set<string> }>();
  const fulfilledReqs = new Set<string>();
  const recent: CompletedExchangeSummary[] = [];

  for (const ex of exchanges) {
    if (ex.stage === 'AWAITING_SUPPLIERS' || ex.stage === 'SUPPLIER_DECLINED') pipeline.awaiting_suppliers++;
    if (ex.stage === 'CANCELLED') pipeline.cancelled_exchanges++;
    if (ex.stage === 'RESERVED') pipeline.reserved_exchanges++;

    // Stock currently held for this exchange (accepted, not yet transferred).
    if (ex.status === 'PROPOSED' || ex.status === 'IN_PROGRESS') {
      for (const item of ex.items) {
        if (item.status === 'ACCEPTED' && inScope(ex, item.supplier_organization_id)) {
          pipeline.reserved_units += item.quantity;
          pipeline.reserved_value_bdt += item.subtotal_bdt;
        }
      }
    }

    if (ex.status !== 'COMPLETED') continue;
    const done = ex.items.filter((i) => i.status === 'COMPLETED' && inScope(ex, i.supplier_organization_id));
    if (done.length === 0) continue;

    recovered.completed_exchanges++;
    if (new Set(ex.items.map((i) => i.supplier_organization_id)).size > 1) recovered.multi_supplier_exchanges++;
    if (ex.requirement?.status === 'FULFILLED' && ex.requirement_id) fulfilledReqs.add(ex.requirement_id);

    let exUnits = 0;
    let exValue = 0;
    for (const item of done) {
      const l = item.listing;
      const family = (l?.material_family ?? ex.requirement?.material_family) as MaterialFamily | undefined;
      const mass =
        l && family
          ? estimatePieceMassKg(family, l.length_mm, l.width_mm, l.thickness_mm) * item.quantity
          : 0;

      recovered.transferred_units += item.quantity;
      recovered.transferred_value_bdt += item.subtotal_bdt;
      recovered.estimated_mass_kg += mass;
      exUnits += item.quantity;
      exValue += item.subtotal_bdt;

      if (family) {
        const f = families.get(family) ?? { material_family: family, units: 0, value_bdt: 0, mass_kg: 0 };
        f.units += item.quantity;
        f.value_bdt += item.subtotal_bdt;
        f.mass_kg += mass;
        families.set(family, f);
      }

      const s = suppliers.get(item.supplier_organization_id) ?? {
        organization_id: item.supplier_organization_id,
        name: item.supplier?.name ?? 'Unknown supplier',
        units: 0,
        value_bdt: 0,
        exchanges: 0,
        exchangeIds: new Set<string>(),
      };
      s.units += item.quantity;
      s.value_bdt += item.subtotal_bdt;
      s.exchangeIds.add(ex.id);
      suppliers.set(item.supplier_organization_id, s);
    }

    const req = ex.requirement;
    recent.push({
      id: ex.id,
      completed_at: ex.updated_at,
      buyer_name: ex.buyer?.name ?? 'Unknown buyer',
      material: req
        ? `${familyLabel[req.material_family] ?? req.material_family} · ${req.material_specification}`
        : 'Material',
      units: exUnits,
      value_bdt: exValue,
      suppliers: Array.from(new Set(done.map((i) => i.supplier?.name ?? 'Unknown supplier'))),
    });
  }
  recovered.fulfilled_requirements = fulfilledReqs.size;

  const inventory = { active_listings: 0, available_units: 0, reserved_units: 0, available_value_bdt: 0 };
  for (const l of listings) {
    if (organizationId && l.organization_id !== organizationId) continue;
    if (l.status !== 'ACTIVE') continue;
    const total = Number(l.total_quantity);
    const reserved = Number(l.reserved_quantity);
    inventory.active_listings++;
    inventory.available_units += total - reserved;
    inventory.reserved_units += reserved;
    inventory.available_value_bdt += (total - reserved) * Number(l.unit_price_bdt);
  }

  return {
    scope: { organization_id: organizationId },
    recovered,
    pipeline,
    inventory,
    by_family: Array.from(families.values()).sort((a, b) => b.value_bdt - a.value_bdt),
    top_suppliers: Array.from(suppliers.values())
      .map(({ exchangeIds, ...rest }) => ({ ...rest, exchanges: exchangeIds.size }))
      .sort((a, b) => b.value_bdt - a.value_bdt),
    recent_completed: recent.sort((a, b) => b.completed_at.localeCompare(a.completed_at)).slice(0, 8),
    assumptions: [
      'Only exchanges confirmed as COMPLETED count as reuse; proposed or reserved stock is shown as pipeline only.',
      'Value is the supplier unit price captured when the exchange was requested, in BDT, excluding transport.',
      `Mass is an indicative estimate from nominal dimensions: stainless steel ${DENSITY_KG_PER_M3.STAINLESS_STEEL_SHEET} kg/m³, plywood ${DENSITY_KG_PER_M3.PLYWOOD_PANEL} kg/m³.`,
      'All organizations and transactions in this prototype are simulated; figures are not real environmental savings.',
    ],
  };
}
