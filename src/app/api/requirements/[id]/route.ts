import { NextRequest, NextResponse } from 'next/server';
import { requirementRepository } from '@/features/demand/services/requirementRepository';
import { updateRequirementSchema } from '@/features/demand/validation';
import { ApiResponse, MaterialRequirement } from '@/lib/types';

interface RouteParams {
  params: { id: string };
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    const requirement = await requirementRepository.getRequirementById(params.id);
    if (!requirement) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Requirement '${params.id}' was not found.` },
        } satisfies ApiResponse,
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: true, data: requirement } satisfies ApiResponse<MaterialRequirement>,
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to retrieve requirement.',
          details: error instanceof Error ? error.message : undefined,
        },
      } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const existing = await requirementRepository.getRequirementById(params.id);
    if (!existing) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Requirement '${params.id}' was not found.` },
        } satisfies ApiResponse,
        { status: 404 }
      );
    }
    if (existing.status === 'FULFILLED' || existing.status === 'CANCELLED') {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'IMMUTABLE_STATUS',
            message: `A ${existing.status.toLowerCase()} requirement cannot be modified.`,
          },
        } satisfies ApiResponse,
        { status: 409 }
      );
    }

    const body = await request.json();
    const callerOrgId =
      request.headers.get('x-organization-id') ||
      (typeof body.caller_organization_id === 'string' ? body.caller_organization_id : null);
    if (callerOrgId && callerOrgId !== existing.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_ORGANIZATION',
            message: 'Access denied: You cannot modify a requirement owned by another organization.',
          },
        } satisfies ApiResponse,
        { status: 403 }
      );
    }
    if ('organization_id' in body && body.organization_id !== existing.organization_id) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'FORBIDDEN_FIELD',
            message: 'Reassigning requirement ownership is not permitted.',
          },
        } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const parseResult = updateRequirementSchema.safeParse(body);
    if (!parseResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid update attributes.',
            details: parseResult.error.format(),
          },
        } satisfies ApiResponse,
        { status: 400 }
      );
    }

    const updated = await requirementRepository.updateRequirement(params.id, parseResult.data);
    if (!updated) {
      return NextResponse.json(
        {
          success: false,
          error: { code: 'NOT_FOUND', message: `Requirement '${params.id}' was not found.` },
        } satisfies ApiResponse,
        { status: 404 }
      );
    }
    return NextResponse.json(
      { success: true, data: updated } satisfies ApiResponse<MaterialRequirement>,
      { status: 200 }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update requirement.',
          details: error instanceof Error ? error.message : undefined,
        },
      } satisfies ApiResponse,
      { status: 500 }
    );
  }
}
