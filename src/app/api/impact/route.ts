// ============================================================================
// MONOLOOP - Impact API (Member 4)
// GET /api/impact?organization_id=   Resource recovery analytics
// Only COMPLETED exchanges count as reuse.
// ============================================================================

import { NextRequest } from 'next/server';
import { getImpactReport } from '@/features/analytics/services/impact.service';
import { errorResponse, ok } from '@/features/exchanges/services/http';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const organizationId = new URL(request.url).searchParams.get('organization_id');
    const report = await getImpactReport(organizationId);
    return ok(report);
  } catch (error) {
    return errorResponse(error, '/api/impact GET');
  }
}
