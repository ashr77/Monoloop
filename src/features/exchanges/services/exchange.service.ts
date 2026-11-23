// ============================================================================
// MONOLOOP - Exchange service (Member 4)
// Turns Member 3's match proposal into an exchange request.
//
// The allocation is recomputed on the server from live inventory instead of
// being accepted from the browser, so a client cannot request stock the
// matching engine would not have proposed (wrong grade, over budget, …).
// ============================================================================

import { matchRequirement } from '@/features/matching/services/matching.service';
import type { MatchProposal } from '@/lib/types';
import { ExchangeError, ExchangeView } from '../types';
import { exchangeRepository } from './exchangeRepository';

export async function requestExchangeFromMatch(input: {
  requirement_id: string;
  buyer_organization_id: string;
}): Promise<{ exchange: ExchangeView; proposal: MatchProposal }> {
  const outcome = await matchRequirement(input.requirement_id);

  if (outcome.kind === 'NOT_FOUND') {
    throw new ExchangeError('NOT_FOUND', `Requirement ${input.requirement_id} was not found.`);
  }
  if (outcome.kind === 'NOT_OPEN') {
    throw new ExchangeError(
      'REQUIREMENT_NOT_OPEN',
      `Requirement is ${outcome.requirement.status}; only OPEN requirements can start an exchange.`
    );
  }
  if (outcome.requirement.organization_id !== input.buyer_organization_id) {
    throw new ExchangeError(
      'FORBIDDEN_ORGANIZATION',
      'Only the organization that published this requirement can request an exchange for it.'
    );
  }

  const proposal = outcome.result;
  if (proposal.allocations.length === 0) {
    throw new ExchangeError(
      'NO_ALLOCATION',
      'The matching engine found no compatible, budget-feasible allocation for this requirement.',
      { matching_status: proposal.matching_status, budget: outcome.result.budget }
    );
  }

  const exchange = await exchangeRepository.create({
    requirement_id: input.requirement_id,
    buyer_organization_id: input.buyer_organization_id,
    items: proposal.allocations.map((a) => ({ listing_id: a.listing_id, quantity: a.allocated_quantity })),
  });

  return { exchange, proposal };
}
