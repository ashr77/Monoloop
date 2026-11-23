// ============================================================================
// MONOLOOP - Name-only baseline matcher (Member 3)
//
// Simulates a conventional marketplace search: a listing "matches" when its
// material family and grade NAME match the request. It ignores size,
// thickness, condition, reservations and listing status, and reports total
// stock as available. Used only for evaluation and the UI comparison.
// ============================================================================

import type { MaterialListing, MaterialRequirement } from '@/lib/types';

const name = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export function baselineMatches(requirement: MaterialRequirement, listings: MaterialListing[]): MaterialListing[] {
  return listings.filter(
    (l) =>
      name(l.material_family) === name(requirement.material_family) &&
      name(l.material_specification) === name(requirement.material_specification) &&
      l.status !== 'ARCHIVED'
  );
}

/** Naive allocation: take total stock (ignores reservations) from the cheapest name matches. */
export function baselineAllocate(
  requirement: MaterialRequirement,
  listings: MaterialListing[]
): { listing_id: string; quantity: number; unit_price_bdt: number }[] {
  let remaining = requirement.required_quantity;
  const out: { listing_id: string; quantity: number; unit_price_bdt: number }[] = [];
  for (const l of [...baselineMatches(requirement, listings)].sort((a, b) => a.unit_price_bdt - b.unit_price_bdt)) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, l.total_quantity);
    if (take > 0) {
      out.push({ listing_id: l.id, quantity: take, unit_price_bdt: Number(l.unit_price_bdt) });
      remaining -= take;
    }
  }
  return out;
}
