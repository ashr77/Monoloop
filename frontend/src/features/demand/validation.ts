import { z } from 'zod';
import {
  MATERIAL_FAMILIES,
  MATERIAL_SPECIFICATIONS,
  ALL_SPECIFICATIONS,
} from '@/lib/constants';

export function isDemandSpecificationValid(
  family: (typeof MATERIAL_FAMILIES)[number],
  specification: string
): boolean {
  return (MATERIAL_SPECIFICATIONS[family] as readonly string[]).includes(specification);
}

export const createRequirementSchema = z
  .object({
    organization_id: z.string().min(1, 'Buyer organization is required'),
    material_family: z.enum(MATERIAL_FAMILIES, {
      errorMap: () => ({
        message: 'Material family must be STAINLESS_STEEL_SHEET or PLYWOOD_PANEL',
      }),
    }),
    material_specification: z.enum(ALL_SPECIFICATIONS, {
      errorMap: () => ({
        message: 'Material specification must be a supported supplier specification',
      }),
    }),
    length_mm: z
      .number({ invalid_type_error: 'Length must be a number' })
      .positive('Length must be greater than 0 mm')
      .nullable()
      .optional(),
    width_mm: z
      .number({ invalid_type_error: 'Width must be a number' })
      .positive('Width must be greater than 0 mm')
      .nullable()
      .optional(),
    thickness_mm: z
      .number({ invalid_type_error: 'Thickness must be a number' })
      .positive('Thickness must be greater than 0 mm')
      .nullable()
      .optional(),
    length_min_mm: z.number().positive().nullable().optional(),
    length_max_mm: z.number().positive().nullable().optional(),
    width_min_mm: z.number().positive().nullable().optional(),
    width_max_mm: z.number().positive().nullable().optional(),
    thickness_min_mm: z.number().positive().nullable().optional(),
    thickness_max_mm: z.number().positive().nullable().optional(),
    required_quantity: z
      .number({ invalid_type_error: 'Required quantity must be an integer' })
      .int('Quantity must be a whole number of pieces')
      .positive('Required quantity must be greater than 0'),
    quantity_unit: z.literal('PIECE').default('PIECE'),
    maximum_budget_bdt: z
      .number({ invalid_type_error: 'Budget must be a number' })
      .nonnegative('Maximum budget cannot be negative')
      .nullable()
      .optional(),
    allow_split_suppliers: z.boolean().default(true),
    condition_requirement: z.enum(['ANY', 'UNUSED', 'LEFTOVER', 'OFFCUT']).default('ANY'),
    status: z.enum(['OPEN', 'FULFILLED', 'CANCELLED']).default('OPEN'),
  })
  .refine(
    (data) => isDemandSpecificationValid(data.material_family, data.material_specification),
    {
      message: 'Invalid specification for selected material family',
      path: ['material_specification'],
    }
  );

export type CreateRequirementInput = z.infer<typeof createRequirementSchema>;

export const updateRequirementSchema = z
  .object({
    material_family: z.enum(MATERIAL_FAMILIES).optional(),
    material_specification: z.enum(ALL_SPECIFICATIONS).optional(),
    length_mm: z.number().positive('Length must be greater than 0 mm').optional(),
    width_mm: z.number().positive('Width must be greater than 0 mm').optional(),
    thickness_mm: z.number().positive('Thickness must be greater than 0 mm').optional(),
    required_quantity: z
      .number()
      .int('Quantity must be a whole number')
      .positive('Required quantity must be greater than 0')
      .optional(),
    maximum_budget_bdt: z
      .number()
      .nonnegative('Maximum budget cannot be negative')
      .nullable()
      .optional(),
    allow_split_suppliers: z.boolean().optional(),
    condition_requirement: z.enum(['ANY', 'UNUSED', 'LEFTOVER', 'OFFCUT']).optional(),
    status: z.enum(['OPEN', 'FULFILLED', 'CANCELLED']).optional(),
  })
  .refine(
    (data) => {
      if (data.material_family && data.material_specification) {
        return isDemandSpecificationValid(data.material_family, data.material_specification);
      }
      return true;
    },
    {
      message: 'Invalid specification for selected material family',
      path: ['material_specification'],
    }
  );

export type UpdateRequirementInput = z.infer<typeof updateRequirementSchema>;
