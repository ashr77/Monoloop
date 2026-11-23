// ============================================================================
// MONOLOOP - Stage 1: Mandatory compatibility rules (Member 3)
//
// Explicit engineering rules, never model guesses. Every rule is evaluated
// (no short-circuit) so the UI can show a complete pass/fail breakdown.
// A listing is compatible only if ALL rules pass. Unknown or missing
// specifications fail: compatibility is never silently assumed.
// ============================================================================

import type { MaterialListing, MaterialRequirement } from '@/lib/types';
import { MATERIAL_CONDITIONS, MATERIAL_SPECIFICATIONS, type MaterialFamily } from '@/lib/constants';
import type { ListingEvaluation, RuleCheck } from './types';

/** Dimensional tolerance (mm) to absorb floating point noise such as 1.9999999. */
export const DIMENSION_TOLERANCE_MM = 0.01;

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : String(Number(n.toFixed(2))));
export const formatSize = (l: number, w: number) => `${fmt(l)}×${fmt(w)} mm`;

const sameMm = (a: number, b: number) => Math.abs(a - b) <= DIMENSION_TOLERANCE_MM;
const isPositive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function isKnownSpecification(family: string, spec: string): boolean {
  const specs = MATERIAL_SPECIFICATIONS[family as MaterialFamily] as readonly string[] | undefined;
  return Boolean(specs && specs.includes(spec));
}

/** Available stock, recomputed defensively from total − reserved and never negative. */
export function availableQuantity(listing: MaterialListing): number {
  const total = Number(listing.total_quantity) || 0;
  const reserved = Number(listing.reserved_quantity) || 0;
  return Math.max(0, Math.floor(total - reserved));
}

export interface EvaluationContext {
  /** Organization requesting the match; its own listings are excluded. */
  buyerOrganizationId: string;
}

export function evaluateListing(
  requirement: MaterialRequirement,
  listing: MaterialListing,
  ctx: EvaluationContext
): ListingEvaluation {
  const checks: RuleCheck[] = [];
  const push = (c: RuleCheck) => checks.push(c);

  // 1. Listing must be ACTIVE (archived/completed/fully reserved listings are not offered).
  push({
    rule: 'LISTING_ACTIVE',
    passed: listing.status === 'ACTIVE',
    expected: 'ACTIVE',
    actual: listing.status,
    message:
      listing.status === 'ACTIVE' ? 'Listing is active.' : `Listing is ${listing.status.toLowerCase()}, not active.`,
  });

  // 2. A buyer cannot source from itself (relevant for HYBRID organizations).
  const own = listing.organization_id === ctx.buyerOrganizationId;
  push({
    rule: 'NOT_OWN_LISTING',
    passed: !own,
    expected: 'Another organization',
    actual: own ? 'Same organization' : 'Another organization',
    message: own ? 'Listing belongs to the requesting organization.' : 'Listing is from another organization.',
  });

  // 3. Material family must be identical.
  const familyOk = listing.material_family === requirement.material_family;
  push({
    rule: 'MATERIAL_FAMILY',
    passed: familyOk,
    expected: requirement.material_family,
    actual: listing.material_family,
    message: familyOk
      ? 'Material family matches.'
      : `Material family ${listing.material_family} does not match required ${requirement.material_family}.`,
  });

  // 4. Grade/specification: exact, and both sides must be recognised standards.
  const reqSpecKnown = isKnownSpecification(requirement.material_family, requirement.material_specification);
  const lstSpecKnown = isKnownSpecification(listing.material_family, listing.material_specification);
  const specOk = reqSpecKnown && lstSpecKnown && listing.material_specification === requirement.material_specification;
  push({
    rule: 'SPECIFICATION',
    passed: specOk,
    expected: requirement.material_specification || '(missing)',
    actual: listing.material_specification || '(missing)',
    message: specOk
      ? `Grade ${listing.material_specification} matches.`
      : !lstSpecKnown
        ? `Listing specification "${listing.material_specification || 'missing'}" is not a recognised standard; compatibility cannot be assumed.`
        : !reqSpecKnown
          ? `Required specification "${requirement.material_specification || 'missing'}" is not a recognised standard.`
          : `Grade ${listing.material_specification} does not satisfy required ${requirement.material_specification}.`,
  });

  // 5. Length × width: exact, orientation-independent (a 1200×2400 sheet is a 2400×1200 sheet).
  const dimsValid = [listing.length_mm, listing.width_mm, requirement.length_mm, requirement.width_mm].every(isPositive);
  const direct = dimsValid && sameMm(listing.length_mm, requirement.length_mm) && sameMm(listing.width_mm, requirement.width_mm);
  const rotated =
    dimsValid && !direct && sameMm(listing.length_mm, requirement.width_mm) && sameMm(listing.width_mm, requirement.length_mm);
  const dimsOk = direct || rotated;
  push({
    rule: 'DIMENSIONS',
    passed: dimsOk,
    expected: formatSize(requirement.length_mm, requirement.width_mm),
    actual: formatSize(listing.length_mm, listing.width_mm),
    message: !dimsValid
      ? 'Dimensions are missing or invalid; compatibility cannot be assumed.'
      : direct
        ? 'Length and width match exactly.'
        : rotated
          ? 'Length and width match when the sheet is rotated 90°.'
          : `Size ${formatSize(listing.length_mm, listing.width_mm)} does not match required ${formatSize(requirement.length_mm, requirement.width_mm)} (sheets are not cut down).`,
  });

  // 6. Thickness: exact.
  const thickValid = isPositive(listing.thickness_mm) && isPositive(requirement.thickness_mm);
  const thickOk = thickValid && sameMm(listing.thickness_mm, requirement.thickness_mm);
  push({
    rule: 'THICKNESS',
    passed: thickOk,
    expected: `${fmt(requirement.thickness_mm)} mm`,
    actual: `${fmt(listing.thickness_mm)} mm`,
    message: !thickValid
      ? 'Thickness is missing or invalid; compatibility cannot be assumed.'
      : thickOk
        ? 'Thickness matches.'
        : `Thickness ${fmt(listing.thickness_mm)} mm does not match required ${fmt(requirement.thickness_mm)} mm.`,
  });

  // 7. Condition: ANY accepts every recognised condition; otherwise exact.
  const condKnown = (MATERIAL_CONDITIONS as readonly string[]).includes(listing.condition);
  const condOk =
    condKnown && (requirement.condition_requirement === 'ANY' || requirement.condition_requirement === listing.condition);
  push({
    rule: 'CONDITION',
    passed: condOk,
    expected: requirement.condition_requirement,
    actual: listing.condition || '(missing)',
    message: !condKnown
      ? 'Listing condition is unknown; compatibility cannot be assumed.'
      : condOk
        ? requirement.condition_requirement === 'ANY'
          ? `Any condition accepted (listing is ${listing.condition.toLowerCase()}).`
          : `Condition ${listing.condition.toLowerCase()} matches.`
        : `Condition ${listing.condition.toLowerCase()} does not satisfy required ${requirement.condition_requirement.toLowerCase()}.`,
  });

  // 8. Availability: uses total − reserved, never total.
  const available = availableQuantity(listing);
  push({
    rule: 'AVAILABILITY',
    passed: available > 0,
    expected: '> 0 pieces',
    actual: `${available} available (${listing.total_quantity} total, ${listing.reserved_quantity} reserved)`,
    message:
      available > 0
        ? `${available} pieces available.`
        : `No unreserved stock (${listing.reserved_quantity} of ${listing.total_quantity} reserved).`,
  });

  const firstFailure = checks.find((c) => !c.passed);
  const compatible = !firstFailure;

  return {
    listing_id: listing.id,
    supplier_organization_id: listing.organization_id,
    supplier_name: listing.organization?.name ?? 'Unknown supplier',
    city: listing.city,
    material_specification: listing.material_specification,
    dimensions: `${formatSize(listing.length_mm, listing.width_mm)} × ${fmt(listing.thickness_mm)} mm`,
    condition: listing.condition,
    available_quantity: available,
    unit_price_bdt: Number(listing.unit_price_bdt),
    compatible,
    rotated,
    checks,
    reason: compatible
      ? `Compatible: grade, size${rotated ? ' (rotated)' : ''}, thickness and condition match; ${available} available.`
      : firstFailure!.message,
    allocated_quantity: 0,
  };
}
