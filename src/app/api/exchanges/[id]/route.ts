// ============================================================================
// MONOLOOP - Exchange detail API (Member 4)
// GET /api/exchanges/[id]
// ============================================================================

import { NextRequest } from 'next/server';
import { exchangeRepository } from '@/features/exchanges/services/exchangeRepository';
import { errorResponse, ok } from '@/features/exchanges/services/http';
import { ExchangeError } from '@/features/exchanges/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const exchange = await exchangeRepository.getById(params.id);
    if (!exchange) throw new ExchangeError('NOT_FOUND', `Exchange ${params.id} was not found.`);
    return ok(exchange);
  } catch (error) {
    return errorResponse(error, `/api/exchanges/${params.id} GET`);
  }
}
