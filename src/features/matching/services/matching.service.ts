// ============================================================================
// MONOLOOP - Matching service (Member 3)
// Loads the requirement (Member 2's repository) and candidate listings
// (Member 1's repository), then runs the pure engine.
// Used by both the API route and the /matches page (server component).
// ============================================================================

import { listingRepository } from '@/lib/supabase/repository';
import { requirementRepository } from '@/features/demand/services/requirementRepository';
import type { MaterialRequirement } from '@/lib/types';
import { runMatching } from '../engine';
import type { MatchResult } from '../types';

export type MatchOutcome =
  | { kind: 'NOT_FOUND' }
  | { kind: 'NOT_OPEN'; requirement: MaterialRequirement }
  | { kind: 'OK'; requirement: MaterialRequirement; result: MatchResult };

/**
 * Postgres NUMERIC columns can arrive as strings through PostgREST.
 * The engine compares numbers exactly, so coerce defensively.
 */
function normalizeRequirement(r: MaterialRequirement): MaterialRequirement {
  const n = (v: unknown) => (v === null || v === undefined ? v : Number(v));
  return {
    ...r,
    length_mm: n(r.length_mm) as number,
    width_mm: n(r.width_mm) as number,
    thickness_mm: n(r.thickness_mm) as number,
    required_quantity: n(r.required_quantity) as number,
    maximum_budget_bdt: n(r.maximum_budget_bdt) as number | null,
  };
}

export async function matchRequirement(requirementId: string): Promise<MatchOutcome> {
  const found = await requirementRepository.getRequirementById(requirementId);
  if (!found) return { kind: 'NOT_FOUND' };
  const requirement = normalizeRequirement(found);
  if (requirement.status !== 'OPEN') return { kind: 'NOT_OPEN', requirement };

  // Same-family listings of every status, so the explanation can also show
  // why reserved / archived stock was not offered.
  const listings = await listingRepository.getListings({ materialFamily: requirement.material_family });

  const buyerOrganization =
    requirement.organization ?? (await requirementRepository.getOrganizationById(requirement.organization_id));

  const result = runMatching({ requirement, listings, buyerOrganization });
  return { kind: 'OK', requirement, result };
}
