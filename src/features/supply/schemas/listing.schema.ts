// ============================================================================
// MONOLOOP - Listing Validation Schemas (Zod)
// TSUNAGU Hackathon 2026
// Strict schema validation for Supply Management
// ============================================================================

import { z } from 'zod';
import {
  MATERIAL_FAMILIES,
  MATERIAL_SPECIFICATIONS,
  MATERIAL_CONDITIONS,
  LISTING_STATUSES,
  QUANTITY_UNITS,
} from '@/lib/constants';

// Validation helper for material family + specification compatibility
export const isSpecificationValidForFamily = (
  family: (typeof MATERIAL_FAMILIES)[number],
  spec: string
): boolean => {
  const validSpecs = MATERIAL_SPECIFICATIONS[family] as readonly string[];
  return validSpecs.includes(spec);
};

export const createListingSchema = z
  .object({
    organization_id: z.string().min(1, 'Supplier organization is required'),
    material_family: z.enum(MATERIAL_FAMILIES, {
      errorMap: () => ({ message: 'Material family must be STAINLESS_STEEL_SHEET or PLYWOOD_PANEL' }),
    }),
    material_specification: z.string().min(1, 'Material specification is required'),
    length_mm: z
      .number({ invalid_type_error: 'Length must be a number' })
      .positive('Length must be greater than 0 mm'),
    width_mm: z
      .number({ invalid_type_error: 'Width must be a number' })
      .positive('Width must be greater than 0 mm'),
    thickness_mm: z
      .number({ invalid_type_error: 'Thickness must be a number' })
      .positive('Thickness must be greater than 0 mm'),
    total_quantity: z
      .number({ invalid_type_error: 'Total quantity must be an integer' })
      .int('Quantity must be a whole number of pieces')
      .positive('Total quantity must be greater than 0'),
    quantity_unit: z.enum(QUANTITY_UNITS).default('PIECE'),
    condition: z.enum(MATERIAL_CONDITIONS, {
      errorMap: () => ({ message: 'Condition must be UNUSED, LEFTOVER, or OFFCUT' }),
    }),
    unit_price_bdt: z
      .number({ invalid_type_error: 'Price must be a number' })
      .nonnegative('Price cannot be negative'),
    description: z.string().optional().nullable(),
    image_url: z.string().url('Must be a valid URL').optional().nullable().or(z.literal('')),
    city: z.string().min(1, 'City/Location is required'),
    status: z.enum(LISTING_STATUSES).default('ACTIVE'),
  })
  .refine(
    (data) => isSpecificationValidForFamily(data.material_family, data.material_specification),
    {
      message: 'Invalid specification for selected material family',
      path: ['material_specification'],
    }
  );

export type CreateListingInput = z.infer<typeof createListingSchema>;

export const updateListingSchema = z
  .object({
    material_family: z.enum(MATERIAL_FAMILIES).optional(),
    material_specification: z.string().min(1).optional(),
    length_mm: z.number().positive('Length must be greater than 0 mm').optional(),
    width_mm: z.number().positive('Width must be greater than 0 mm').optional(),
    thickness_mm: z.number().positive('Thickness must be greater than 0 mm').optional(),
    total_quantity: z
      .number()
      .int('Quantity must be an integer')
      .nonnegative('Total quantity cannot be negative')
      .optional(),
    condition: z.enum(MATERIAL_CONDITIONS).optional(),
    unit_price_bdt: z.number().nonnegative('Price cannot be negative').optional(),
    description: z.string().optional().nullable(),
    image_url: z.string().url().optional().nullable().or(z.literal('')),
    city: z.string().min(1).optional(),
    status: z.enum(LISTING_STATUSES).optional(),
  })
  .refine(
    (data) => {
      if (data.material_family && data.material_specification) {
        return isSpecificationValidForFamily(data.material_family, data.material_specification);
      }
      return true;
    },
    {
      message: 'Invalid specification for selected material family',
      path: ['material_specification'],
    }
  );

export type UpdateListingInput = z.infer<typeof updateListingSchema>;
