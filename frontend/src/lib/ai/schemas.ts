// ============================================================================
// MONOLOOP - AI Extraction Schema (Zod)
// TSUNAGU Hackathon 2026
// Structured information extraction from supplier natural-language input
// ============================================================================

import { z } from 'zod';
import { MATERIAL_FAMILIES, MATERIAL_CONDITIONS, QUANTITY_UNITS } from '@/lib/constants';

export const materialExtractionSchema = z.object({
  material_family: z.enum(MATERIAL_FAMILIES).nullable(),
  material_specification: z.string().nullable(),
  length_mm: z.number().positive().nullable(),
  width_mm: z.number().positive().nullable(),
  thickness_mm: z.number().positive().nullable(),
  total_quantity: z.number().int().positive().nullable(),
  quantity_unit: z.enum(QUANTITY_UNITS).default('PIECE'),
  condition: z.enum(MATERIAL_CONDITIONS).nullable(),
  unit_price_bdt: z.number().nonnegative().nullable(),
  city: z.string().nullable(),
  raw_notes: z.string().optional().nullable(),
  missing_fields: z.array(z.string()).default([]),
  confidence_scores: z.record(z.string(), z.enum(['HIGH', 'MEDIUM', 'LOW', 'NONE'])).default({}),
  /** 'ai' = hosted model; 'heuristic' = offline parser (mock mode or the AI service failed). */
  source: z.enum(['ai', 'heuristic']).default('ai'),
});

export type MaterialExtractionResult = z.infer<typeof materialExtractionSchema>;

export const extractMaterialRequestSchema = z.object({
  prompt: z.string().min(5, 'Description must be at least 5 characters long'),
  mock: z.boolean().optional(), // For development/test isolation
});

export type ExtractMaterialRequest = z.infer<typeof extractMaterialRequestSchema>;

/** Spoken languages for voice input (BCP-47), mirrored by the backend's TranscribeAudioRequest. */
export const SPEECH_LANGUAGES = [
  { code: 'en-US', label: 'English', name: 'English' },
  { code: 'bn-BD', label: 'বাংলা', name: 'Bangla' },
  { code: 'ja-JP', label: '日本語', name: 'Japanese' },
] as const;

export type SpeechLanguage = (typeof SPEECH_LANGUAGES)[number]['code'];
