// ============================================================================
// MONOLOOP - Exchanges API (Member 4)
// GET  /api/exchanges?organization_id=&status=  List exchanges (buyer or supplier view)
// POST /api/exchanges                            Request an exchange for a requirement
//   body: { requirement_id, buyer_organization_id }
//   The allocation is recomputed server-side by the matching engine.
//   201 created · 404 requirement · 403 not the buyer · 409 duplicate / not open · 422 no allocation
// ============================================================================

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { exchangeRepository } from '@/features/exchanges/services/exchangeRepository';
import { requestExchangeFromMatch } from '@/features/exchanges/services/exchange.service';
import { errorResponse, ok, readJson } from '@/features/exchanges/services/http';
import { EXCHANGE_STATUSES } from '@/lib/constants';
import { ExchangeError } from '@/features/exchanges/types';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  requirement_id: z.string().uuid(),
  buyer_organization_id: z.string().uuid(),
});

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id') || undefined;
    const status = searchParams.get('status') || undefined;
    if (status && !(EXCHANGE_STATUSES as readonly string[]).includes(status)) {
      throw new ExchangeError('VALIDATION_ERROR', `Unknown status '${status}'.`);
    }
    const exchanges = await exchangeRepository.list({ organizationId, status });
    return ok(exchanges, 200, { total: exchanges.length });
  } catch (error) {
    return errorResponse(error, '/api/exchanges GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await readJson(request);
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      throw new ExchangeError('VALIDATION_ERROR', 'Invalid exchange request.', parsed.error.format());
    }
    const headerActor = request.headers.get('x-organization-id');
    if (headerActor && headerActor !== parsed.data.buyer_organization_id) {
      throw new ExchangeError('FORBIDDEN_ORGANIZATION', 'You can only request exchanges for your own organization.');
    }

    const { exchange, proposal } = await requestExchangeFromMatch(parsed.data);
    return ok(exchange, 201, {
      matching_status: proposal.matching_status,
      unfulfilled_quantity: proposal.unfulfilled_quantity,
    });
  } catch (error) {
    return errorResponse(error, '/api/exchanges POST');
  }
}
