// ============================================================================
// MONOLOOP - Listing Detail & Modification API
// GET /api/listings/[id] - Retrieve single listing
// PATCH /api/listings/[id] - Update or archive listing
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { listingRepository } from '@/lib/supabase/repository';
import { updateListingSchema } from '@/features/supply/schemas/listing.schema';
import { ApiResponse, MaterialListing } from '@/lib/types';

interface RouteParams {
  params: {
    id: string;
  };
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const listing = await listingRepository.getListingById(id);

    if (!listing) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Listing with ID '${id}' was not found.`,
        },
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<MaterialListing> = {
      success: true,
      data: listing,
    };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error(`[API /api/listings/${params.id} GET] Error:`, error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve listing details.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = params;
    const existing = await listingRepository.getListingById(id);

    if (!existing) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Listing with ID '${id}' was not found.`,
        },
      };
      return NextResponse.json(response, { status: 404 });
    }

    const body = await request.json();

    // Prevent direct tampering with reserved_quantity or organization_id
    if ('reserved_quantity' in body) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN_FIELD',
          message: 'Direct modification of reserved_quantity is strictly forbidden.',
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    if ('organization_id' in body && body.organization_id !== existing.organization_id) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'FORBIDDEN_FIELD',
          message: 'Reassigning listing ownership across organizations is not permitted.',
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    // Validate update fields with Zod
    const parseResult = updateListingSchema.safeParse(body);
    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid update attributes.',
          details: parseResult.error.format(),
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    const validUpdates = parseResult.data;

    // Enforce business invariant: total_quantity cannot be reduced below reserved_quantity
    if (
      validUpdates.total_quantity !== undefined &&
      validUpdates.total_quantity < existing.reserved_quantity
    ) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'INVALID_QUANTITY',
          message: `Cannot reduce total quantity (${validUpdates.total_quantity}) below active reserved quantity (${existing.reserved_quantity}).`,
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    const updated = await listingRepository.updateListing(id, validUpdates);

    const response: ApiResponse<MaterialListing> = {
      success: true,
      data: updated!,
    };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error(`[API /api/listings/${params.id} PATCH] Error:`, error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to update listing.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
