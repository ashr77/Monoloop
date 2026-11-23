// ============================================================================
// MONOLOOP - Impact service (Member 4)
// Loads exchanges (this module) and listings (Member 1) and computes the report.
// ============================================================================

import { listingRepository } from '@/lib/supabase/repository';
import { exchangeRepository } from '@/features/exchanges/services/exchangeRepository';
import { computeImpact, ImpactReport } from '../impact';

export async function getImpactReport(organizationId?: string | null): Promise<ImpactReport> {
  const [exchanges, listings] = await Promise.all([
    exchangeRepository.list(organizationId ? { organizationId } : {}),
    listingRepository.getListings(organizationId ? { organizationId } : {}),
  ]);
  return computeImpact(exchanges, listings, organizationId ?? null);
}
