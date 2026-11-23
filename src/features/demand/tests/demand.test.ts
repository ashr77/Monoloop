import { describe, expect, it } from 'vitest';
import {
  createRequirementSchema,
  updateRequirementSchema,
  isDemandSpecificationValid,
} from '@/features/demand/validation';
import { MATERIAL_FAMILIES, MATERIAL_SPECIFICATIONS } from '@/lib/constants';
import { MaterialRequirement } from '@/lib/types';
import { DEMO_BUYER_ORGANIZATIONS, DEMO_BUYER_REQUIREMENTS } from '@/features/demand/data/demoBuyers';
import { calculateBuyerStatistics } from '@/features/demand/components/BuyerStatsCards';
import { requirementRepository } from '@/features/demand/services/requirementRepository';
import { POST as createRequirement } from '@/app/api/requirements/route';
import { PATCH as updateRequirement } from '@/app/api/requirements/[id]/route';
import { NextRequest } from 'next/server';

const validRequirement = {
  organization_id: 'b1111111-1111-4111-b111-111111111111',
  material_family: 'STAINLESS_STEEL_SHEET' as const,
  material_specification: 'SS304' as const,
  length_mm: 2400,
  width_mm: 1200,
  thickness_mm: 2,
  required_quantity: 60,
  quantity_unit: 'PIECE' as const,
  maximum_budget_bdt: 270000,
  allow_split_suppliers: true,
  condition_requirement: 'UNUSED' as const,
};

describe('Demand requirement validation', () => {
  it('accepts valid stainless steel and plywood requirements', () => {
    expect(createRequirementSchema.safeParse(validRequirement).success).toBe(true);
    expect(
      createRequirementSchema.safeParse({
        ...validRequirement,
        material_family: 'PLYWOOD_PANEL',
        material_specification: 'PLYWOOD_STANDARD',
        length_mm: 2440,
        width_mm: 1220,
        thickness_mm: 18,
        required_quantity: 40,
      }).success
    ).toBe(true);
  });

  it('rejects invalid family/specification combinations', () => {
    expect(isDemandSpecificationValid('STAINLESS_STEEL_SHEET', 'PLYWOOD_STANDARD')).toBe(false);
    expect(isDemandSpecificationValid('PLYWOOD_PANEL', 'SS304')).toBe(false);
    expect(
      createRequirementSchema.safeParse({
        ...validRequirement,
        material_family: 'PLYWOOD_PANEL',
        material_specification: 'SS304',
      }).success
    ).toBe(false);
  });

  it('rejects negative dimensions, zero quantity, and negative budget', () => {
    expect(
      createRequirementSchema.safeParse({
        ...validRequirement,
        length_mm: -2400,
        width_mm: 0,
        thickness_mm: -2,
        required_quantity: 0,
        maximum_budget_bdt: -1,
      }).success
    ).toBe(false);
  });

  it('rejects fractional quantity and validates partial updates', () => {
    expect(
      createRequirementSchema.safeParse({
        ...validRequirement,
        required_quantity: 1.5,
      }).success
    ).toBe(false);
    expect(updateRequirementSchema.safeParse({ required_quantity: 20 }).success).toBe(true);
    expect(updateRequirementSchema.safeParse({ required_quantity: -20 }).success).toBe(false);
  });

  it('uses the exact supplier material families and specifications', () => {
    expect(MATERIAL_FAMILIES).toEqual(['STAINLESS_STEEL_SHEET', 'PLYWOOD_PANEL']);
    for (const family of MATERIAL_FAMILIES) {
      for (const specification of MATERIAL_SPECIFICATIONS[family]) {
        expect(isDemandSpecificationValid(family, specification)).toBe(true);
      }
    }
    expect(isDemandSpecificationValid('PLYWOOD_PANEL', 'PLYWOOD')).toBe(false);
  });

  it('calculates buyer statistics from active requirements and exchange data', () => {
    const makeRequirement = (
      id: string,
      family: MaterialRequirement['material_family'],
      status: MaterialRequirement['status'],
      quantity: number
    ): MaterialRequirement => ({
      id,
      organization_id: 'b1111111-1111-4111-b111-111111111111',
      material_family: family,
      material_specification: family === 'STAINLESS_STEEL_SHEET' ? 'SS304' : 'PLYWOOD_STANDARD',
      length_mm: 2400,
      width_mm: 1200,
      thickness_mm: 2,
      required_quantity: quantity,
      quantity_unit: 'PIECE',
      maximum_budget_bdt: 100000,
      allow_split_suppliers: false,
      condition_requirement: 'ANY',
      status,
      created_at: '2026-03-01T00:00:00.000Z',
    });

    expect(
      calculateBuyerStatistics({
        requirements: [
          makeRequirement('open-1', 'STAINLESS_STEEL_SHEET', 'OPEN', 60),
          makeRequirement('open-2', 'PLYWOOD_PANEL', 'OPEN', 20),
          makeRequirement('fulfilled', 'PLYWOOD_PANEL', 'FULFILLED', 10),
        ],
        pendingMatchRequirementIds: ['open-1', 'fulfilled'],
        fulfilledQuantities: { 'open-1': 3, fulfilled: 6 },
      })
    ).toEqual({
      activeRequirements: 2,
      totalRequired: 80,
      fulfilledQuantity: 9,
      pendingMatches: 1,
      materialCategories: 2,
    });
  });

  it('loads the added buyer organizations and requirements in demo mode', async () => {
    requirementRepository.setMockMode(true);
    requirementRepository._resetStore();
    const organizations = await requirementRepository.getOrganizations();
    const requirements = await requirementRepository.getRequirements();

    expect(DEMO_BUYER_ORGANIZATIONS).toHaveLength(3);
    expect(DEMO_BUYER_REQUIREMENTS).toHaveLength(3);
    expect(organizations.map((organization) => organization.id)).toEqual(
      expect.arrayContaining(DEMO_BUYER_ORGANIZATIONS.map((organization) => organization.id))
    );
    expect(requirements.map((requirement) => requirement.id)).toEqual(
      expect.arrayContaining(DEMO_BUYER_REQUIREMENTS.map((requirement) => requirement.id))
    );
    for (const requirement of DEMO_BUYER_REQUIREMENTS) {
      expect(
        createRequirementSchema.safeParse({
          organization_id: requirement.organization_id,
          material_family: requirement.material_family,
          material_specification: requirement.material_specification,
          length_mm: requirement.length_mm,
          width_mm: requirement.width_mm,
          thickness_mm: requirement.thickness_mm,
          required_quantity: requirement.required_quantity,
          maximum_budget_bdt: requirement.maximum_budget_bdt,
          allow_split_suppliers: requirement.allow_split_suppliers,
          condition_requirement: requirement.condition_requirement,
        }).success
      ).toBe(true);
    }
  });

  it('creates and updates requirements through their API handlers', async () => {
    requirementRepository.setMockMode(true);
    requirementRepository._resetStore();

    const createResponse = await createRequirement(
      new NextRequest('http://localhost/api/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(validRequirement),
      })
    );
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const updateResponse = await updateRequirement(
      new NextRequest(`http://localhost/api/requirements/${created.data.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': validRequirement.organization_id,
        },
        body: JSON.stringify({ required_quantity: 72 }),
      }),
      { params: { id: created.data.id } }
    );
    expect(updateResponse.status).toBe(200);
    expect((await updateResponse.json()).data.required_quantity).toBe(72);
  });
});
