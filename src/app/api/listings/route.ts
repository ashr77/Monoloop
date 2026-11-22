// ============================================================================
// MONOLOOP - Listings API Route Handlers
// GET /api/listings - Retrieve listings with optional filters
// POST /api/listings - Create a new material listing
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { listingRepository } from '@/lib/supabase/repository';
import { createListingSchema } from '@/features/supply/schemas/listing.schema';
import { ApiResponse, MaterialListing } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id') || undefined;
    const materialFamily = searchParams.get('material_family') || undefined;
    const status = searchParams.get('status') || undefined;
    const search = searchParams.get('search') || undefined;

    const listings = await listingRepository.getListings({
      organizationId,
      materialFamily,
      status,
      search,
    });

    const response: ApiResponse<MaterialListing[]> = {
      success: true,
      data: listings,
      meta: {
        total: listings.length,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[API /api/listings GET] Error:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve listings.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request body
    const parseResult = createListingSchema.safeParse(body);
    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid listing attributes.',
          details: parseResult.error.format(),
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    const validData = parseResult.data;

    // Verify organization exists
    const organization = await listingRepository.getOrganizationById(validData.organization_id);
    if (!organization) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: `Supplier organization '${validData.organization_id}' not found.`,
        },
      };
      return NextResponse.json(response, { status: 404 });
    }

    // Create listing (reserved_quantity strictly initialized to 0)
    const newListing = await listingRepository.createListing({
      organization_id: validData.organization_id,
      material_family: validData.material_family,
      material_specification: validData.material_specification,
      length_mm: validData.length_mm,
      width_mm: validData.width_mm,
      thickness_mm: validData.thickness_mm,
      total_quantity: validData.total_quantity,
      quantity_unit: validData.quantity_unit,
      condition: validData.condition,
      unit_price_bdt: validData.unit_price_bdt,
      description: validData.description,
      image_url: validData.image_url,
      city: validData.city,
      status: validData.status,
    });

    const response: ApiResponse<MaterialListing> = {
      success: true,
      data: newListing,
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('[API /api/listings POST] Error:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create listing.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
