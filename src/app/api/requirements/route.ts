import { NextRequest, NextResponse } from 'next/server';
import { requirementRepository } from '@/features/demand/services/requirementRepository';
import { createRequirementSchema } from '@/features/demand/validation';
import { ApiResponse, MaterialRequirement } from '@/lib/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const organizationId = searchParams.get('organization_id') || undefined;
    const materialFamily = searchParams.get('material_family') || undefined;
    const status = searchParams.get('status') || undefined;

    const requirements = await requirementRepository.getRequirements({
      organizationId,
      materialFamily,
      status,
    });
    const exchangeStats = await requirementRepository.getExchangeStatistics(
      requirements.map((requirement) => requirement.id)
    );
    const response: ApiResponse<MaterialRequirement[]> = {
      success: true,
      data: requirements,
      meta: {
        total: requirements.length,
        pending_match_requirement_ids: exchangeStats.pendingMatchRequirementIds,
        fulfilled_quantities_by_requirement: exchangeStats.fulfilledQuantities,
      },
    };
    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to retrieve requirements.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parseResult = createRequirementSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid requirement attributes.',
            details: parseResult.error.format(),
          },
        } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const data = parseResult.data;
    const organization = await requirementRepository.getOrganizationById(data.organization_id);
    if (!organization) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'NOT_FOUND',
            message: `Buyer organization '${data.organization_id}' not found.`,
          },
        } satisfies ApiResponse,
        { status: 404 }
      );
    }
    if (organization.organization_type !== 'BUYER' && organization.organization_type !== 'HYBRID') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_ROLE',
            message: `Organization '${organization.name}' is registered as ${organization.organization_type}. Only BUYER organizations may publish requirements.`,
          },
        } satisfies ApiResponse,
        { status: 403 }
      );
    }

    const requirement = await requirementRepository.createRequirement({
      organization_id: data.organization_id,
      material_family: data.material_family,
      material_specification: data.material_specification,
      length_mm: data.length_mm,
      width_mm: data.width_mm,
      thickness_mm: data.thickness_mm,
      required_quantity: data.required_quantity,
      quantity_unit: data.quantity_unit,
      maximum_budget_bdt: data.maximum_budget_bdt ?? null,
      allow_split_suppliers: data.allow_split_suppliers,
      condition_requirement: data.condition_requirement,
      status: data.status,
    });

    return NextResponse.json(
      { success: true, data: requirement } satisfies ApiResponse<MaterialRequirement>,
      { status: 201 }
    );
  } catch (error) {
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Failed to create requirement.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
