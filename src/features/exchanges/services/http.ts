// ============================================================================
// MONOLOOP - Exchange API helpers (Member 4)
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import type { ApiResponse } from '@/lib/types';
import { ExchangeAction, ExchangeError, ExchangeView } from '../types';
import { exchangeRepository } from './exchangeRepository';

export function errorResponse(error: unknown, context: string) {
  if (error instanceof ExchangeError) {
    const body: ApiResponse = {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
    };
    return NextResponse.json(body, { status: error.status });
  }
  console.error(`[API ${context}] Error:`, error);
  const body: ApiResponse = {
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Unexpected error while processing the exchange.',
      details: error instanceof Error ? error.message : undefined,
    },
  };
  return NextResponse.json(body, { status: 500 });
}

export function ok<T>(data: T, status = 200, meta?: ApiResponse['meta']) {
  const body: ApiResponse<T> = { success: true, data, ...(meta ? { meta } : {}) };
  return NextResponse.json(body, { status });
}

const uuid = z.string().uuid();

/** Demo identity: the acting organization comes from the x-organization-id header (or body fallback). */
export function resolveActor(request: NextRequest, body: Record<string, unknown>): string {
  const actor = request.headers.get('x-organization-id') || (body.actor_organization_id as string | undefined);
  if (!actor) {
    throw new ExchangeError(
      'ACTOR_REQUIRED',
      'Acting organization is required (x-organization-id header or actor_organization_id).'
    );
  }
  if (!uuid.safeParse(actor).success) {
    throw new ExchangeError('VALIDATION_ERROR', 'Acting organization id must be a UUID.');
  }
  return actor;
}

async function readJson(request: NextRequest): Promise<Record<string, unknown>> {
  const text = await request.text();
  if (!text.trim()) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    throw new ExchangeError('VALIDATION_ERROR', 'Request body must be valid JSON.');
  }
}

/** Shared POST handler for /api/exchanges/[id]/{accept,reject,complete,cancel}. */
export function exchangeActionHandler(action: ExchangeAction) {
  return async function POST(request: NextRequest, { params }: { params: { id: string } }) {
    try {
      const body = await readJson(request);
      const actor = resolveActor(request, body);
      let itemId: string | undefined;
      if (action === 'accept' || action === 'reject') {
        const parsed = uuid.safeParse(body.exchange_item_id);
        if (!parsed.success) {
          throw new ExchangeError('VALIDATION_ERROR', 'exchange_item_id (UUID) is required.');
        }
        itemId = parsed.data;
      }
      const view: ExchangeView = await exchangeRepository.act(action, params.id, actor, itemId);
      return ok(view);
    } catch (error) {
      return errorResponse(error, `/api/exchanges/${params.id}/${action}`);
    }
  };
}

export { readJson };
