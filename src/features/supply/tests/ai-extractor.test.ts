// ============================================================================
// AI Smart Material Extractor - Unit & Integration Tests
// TSUNAGU Hackathon 2026 - Member 1
// ============================================================================

import { describe, it, expect } from 'vitest';
import { extractMaterialFromText, extractWithHeuristics } from '@/lib/ai/adapter';
import { materialExtractionSchema } from '@/lib/ai/schemas';

describe('AI Smart Material Extractor', () => {
  // Test 11: AI structured-output validation
  it('extracts complete structured attributes from an explicit description', async () => {
    const input =
      'We have 40 unused stainless steel sheets, grade SS304, 2mm thick, 1000 by 500 mm, leftover from production. Price is 450 taka per sheet, available in Gazipur.';

    const result = extractWithHeuristics(input);

    expect(result.material_family).toBe('STAINLESS_STEEL_SHEET');
    expect(result.material_specification).toBe('SS304');
    expect(result.length_mm).toBe(1000);
    expect(result.width_mm).toBe(500);
    expect(result.thickness_mm).toBe(2);
    expect(result.total_quantity).toBe(40);
    expect(result.quantity_unit).toBe('PIECE');
    expect(result.condition).toBe('UNUSED');
    expect(result.unit_price_bdt).toBe(450);
    expect(result.city).toBe('Gazipur');

    // Validates against official Zod schema
    const schemaValidation = materialExtractionSchema.safeParse(result);
    expect(schemaValidation.success).toBe(true);
  });

  // Test 12: AI handling missing or ambiguous values
  it('returns null and populates missing_fields when attributes are unstated', async () => {
    const vagueInput = 'We have some stainless steel sheets available in Dhaka.';

    const result = extractWithHeuristics(vagueInput);

    expect(result.material_family).toBe('STAINLESS_STEEL_SHEET');
    expect(result.material_specification).toBeNull(); // Not stated!
    expect(result.length_mm).toBeNull();
    expect(result.width_mm).toBeNull();
    expect(result.thickness_mm).toBeNull();
    expect(result.total_quantity).toBeNull();
    expect(result.unit_price_bdt).toBeNull();
    expect(result.city).toBe('Dhaka');

    expect(result.missing_fields).toContain('material_specification');
    expect(result.missing_fields).toContain('length_mm');
    expect(result.missing_fields).toContain('width_mm');
    expect(result.missing_fields).toContain('thickness_mm');
    expect(result.missing_fields).toContain('total_quantity');
    expect(result.missing_fields).toContain('unit_price_bdt');

    const schemaValidation = materialExtractionSchema.safeParse(result);
    expect(schemaValidation.success).toBe(true);
  });

  // Test 13: AI API failure behavior (no API key configured)
  it('gracefully reports unavailable without throwing when no LLM key is configured', async () => {
    // Preserve current env
    const origKey = process.env.AI_API_KEY;
    delete process.env.AI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENAI_API_KEY;

    const res = await extractMaterialFromText('40 sheets SS304 in Gazipur', { mock: false });

    expect(res.success).toBe(false);
    expect(res.error).toContain('AI extraction service is not configured');

    // Restore
    if (origKey) process.env.AI_API_KEY = origKey;
  });

  it('allows mock extraction when mock option is explicitly enabled', async () => {
    const res = await extractMaterialFromText(
      'Surplus 50 pieces plywood sheets, standard grade, 2440x1220 mm, 18mm thickness, 1850 taka each in Dhaka',
      { mock: true }
    );

    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
    expect(res.data!.material_family).toBe('PLYWOOD_PANEL');
    expect(res.data!.material_specification).toBe('PLYWOOD_STANDARD');
    expect(res.data!.length_mm).toBe(2440);
    expect(res.data!.width_mm).toBe(1220);
    expect(res.data!.thickness_mm).toBe(18);
    expect(res.data!.total_quantity).toBe(50);
  });
});
