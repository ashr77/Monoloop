// ============================================================================
// MONOLOOP - Organizations API Route
// GET /api/organizations
// Returns registered demo supplier and buyer organizations.
// ============================================================================

import { NextResponse } from 'next/server';
import { listingRepository } from '@/lib/supabase/repository';
import { ApiResponse, Organization } from '@/lib/types';

export async function GET() {
  try {
    const orgs = await listingRepository.getOrganizations();
    const response: ApiResponse<Organization[]> = {
      success: true,
      data: orgs,
    };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve organizations',
        details: error instanceof Error ? error.message : undefined,
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
