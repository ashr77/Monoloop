// ============================================================================
// MONOLOOP - Matching API (Member 3)
// GET /api/matches/[requirementId]
//   200 -> ApiResponse<MatchResult>  (MatchResult ⊇ MatchProposal contract)
//   404 -> requirement not found
//   409 -> requirement is not OPEN (cancelled / fulfilled)
// A proposal is not a reservation; stock is re-checked when suppliers accept.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { matchRequirement } from '@/features/matching/services/matching.service';
import type { ApiResponse } from '@/lib/types';
import type { MatchResult } from '@/features/matching/types';

export const dynamic = 'force-dynamic';

interface RouteParams {
  params: { requirementId: string };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { requirementId } = params;
  try {
    const outcome = await matchRequirement(requirementId);

    if (outcome.kind === 'NOT_FOUND') {
      const body: ApiResponse = {
        success: false,
        error: { code: 'NOT_FOUND', message: `Requirement with ID '${requirementId}' was not found.` },
      };
      return NextResponse.json(body, { status: 404 });
    }

    if (outcome.kind === 'NOT_OPEN') {
      const body: ApiResponse = {
        success: false,
        error: {
          code: 'REQUIREMENT_NOT_OPEN',
          message: `Requirement is ${outcome.requirement.status}; only OPEN requirements can be matched.`,
          details: { requirement_status: outcome.requirement.status },
        },
      };
      return NextResponse.json(body, { status: 409 });
    }

    const body: ApiResponse<MatchResult> = {
      success: true,
      data: outcome.result,
      meta: {
        compatible_listings: outcome.result.evaluations.filter((e) => e.compatible).length,
        evaluated_listings: outcome.result.evaluations.length,
      },
    };
    return NextResponse.json(body, { status: 200 });
  } catch (error) {
    console.error(`[API /api/matches/${requirementId} GET] Error:`, error);
    const body: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to compute matches.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
