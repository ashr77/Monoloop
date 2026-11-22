// ============================================================================
// Real Gemini API Extraction Verification Suite
// TSUNAGU Hackathon 2026 - Member 1
// Tests real hosted LLM extraction (no mock) with the specified sample prompt.
// ============================================================================

import { describe, it, expect } from 'vitest';
import { extractMaterialFromText } from '@/lib/ai/adapter';
import { materialExtractionSchema } from '@/lib/ai/schemas';

describe('Real Hosted Gemini API Integration Verification', () => {
  it('extracts structured attributes using real Gemini model without mock', async () => {
    const prompt =
      'We have 40 unused stainless steel sheets, grade SS304, 2mm thick, each measuring 1000 by 500mm. Price is 450 taka per sheet. Available in Gazipur.';

    const result = await extractMaterialFromText(prompt, { mock: false });

    console.log('Real Gemini extraction output:', JSON.stringify(result.data, null, 2));

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();

    const data = result.data!;
    expect(data.material_family).toBe('STAINLESS_STEEL_SHEET');
    expect(data.material_specification).toBe('SS304');
    expect(data.length_mm).toBe(1000);
    expect(data.width_mm).toBe(500);
    expect(data.thickness_mm).toBe(2);
    expect(data.total_quantity).toBe(40);
    expect(data.condition).toBe('UNUSED');
    expect(data.unit_price_bdt).toBe(450);
    expect(data.city).toBe('Gazipur');

    // Schema validation
    const schemaValidation = materialExtractionSchema.safeParse(data);
    expect(schemaValidation.success).toBe(true);
  }, 15000); // 15s timeout for network LLM call

  it('does NOT invent missing specifications when prompt is ambiguous', async () => {
    const vaguePrompt = 'We have some metal sheets available in Dhaka.';

    const result = await extractMaterialFromText(vaguePrompt, { mock: false });

    expect(result.success).toBe(true);
    const data = result.data!;

    // Should return null for unstated technical properties
    expect(data.material_specification).toBeNull();
    expect(data.length_mm).toBeNull();
    expect(data.width_mm).toBeNull();
    expect(data.thickness_mm).toBeNull();
    expect(data.total_quantity).toBeNull();
    expect(data.unit_price_bdt).toBeNull();
    expect(data.city).toBe('Dhaka');
    expect(data.missing_fields.length).toBeGreaterThan(0);
  }, 15000);
});
