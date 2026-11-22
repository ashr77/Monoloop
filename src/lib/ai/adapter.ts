// ============================================================================
// MONOLOOP - AI Material Extractor Adapter
// TSUNAGU Hackathon 2026 - Member 1
// Extracts structured industrial surplus attributes from natural-language text.
// ============================================================================

import { MaterialExtractionResult, materialExtractionSchema } from './schemas';

export interface ExtractionOptions {
  mock?: boolean;
}

const SYSTEM_PROMPT = `You are MONOLOOP's Industrial Surplus Extraction Engine.
Your task is to extract structured material specifications from a supplier's natural-language description into strict JSON.

CONSTRAINTS & RULES:
1. Material Family: Exactly 'STAINLESS_STEEL_SHEET' or 'PLYWOOD_PANEL'. If neither, return null.
2. Material Specification:
   - For STAINLESS_STEEL_SHEET: One of ['SS304', 'SS201', 'SS316']. If not stated or unclear, return null.
   - For PLYWOOD_PANEL: One of ['PLYWOOD_STANDARD', 'PLYWOOD_MARINE', 'PLYWOOD_COMMERCIAL']. If unclear, return null.
3. Dimensions: ALL must be normalized to INTEGER MILLIMETERS (mm):
   - length_mm (e.g., 2.4 meters -> 2400)
   - width_mm (e.g., 1.2 meters -> 1200)
   - thickness_mm (e.g., 2mm -> 2, 1.5mm -> 1.5)
   - If not stated, return null.
4. Total Quantity: Positive integer of PIECES. If not stated, return null.
5. Quantity Unit: Strictly 'PIECE'.
6. Condition: Exactly one of ['UNUSED', 'LEFTOVER', 'OFFCUT']. Default to 'UNUSED' if pristine, 'LEFTOVER' if excess production, 'OFFCUT' if scraps/cutoffs. If completely unspecified, return null.
7. Unit Price: In Bangladeshi Taka (BDT) per piece. If not stated, return null.
8. City: Location in Bangladesh (e.g., Gazipur, Dhaka, Narayanganj, Chattogram). If not stated, return null.
9. missing_fields: Array of string names of required fields that are null (from: ['material_family', 'material_specification', 'length_mm', 'width_mm', 'thickness_mm', 'total_quantity', 'unit_price_bdt', 'city']).
10. confidence_scores: Object mapping each extracted attribute to 'HIGH', 'MEDIUM', 'LOW', or 'NONE'.
11. CRITICAL: NEVER hallucinate or invent unstated specifications. Do not certify material properties. If something was not stated, set it to null.

Output ONLY valid JSON matching this schema:
{
  "material_family": "STAINLESS_STEEL_SHEET" | "PLYWOOD_PANEL" | null,
  "material_specification": string | null,
  "length_mm": number | null,
  "width_mm": number | null,
  "thickness_mm": number | null,
  "total_quantity": number | null,
  "quantity_unit": "PIECE",
  "condition": "UNUSED" | "LEFTOVER" | "OFFCUT" | null,
  "unit_price_bdt": number | null,
  "city": string | null,
  "raw_notes": string | null,
  "missing_fields": string[],
  "confidence_scores": Record<string, "HIGH" | "MEDIUM" | "LOW" | "NONE">
}`;

// Deterministic heuristic rule extractor used as an ultra-fast local fallback / mock
export function extractWithHeuristics(prompt: string): MaterialExtractionResult {
  const p = prompt.toLowerCase();

  // Family & Spec
  let material_family: 'STAINLESS_STEEL_SHEET' | 'PLYWOOD_PANEL' | null = null;
  let material_specification: string | null = null;

  if (p.includes('stainless') || p.includes('steel') || p.includes('ss304') || p.includes('ss201') || p.includes('ss316')) {
    material_family = 'STAINLESS_STEEL_SHEET';
    if (p.includes('ss304') || p.includes('304')) material_specification = 'SS304';
    else if (p.includes('ss201') || p.includes('201')) material_specification = 'SS201';
    else if (p.includes('ss316') || p.includes('316')) material_specification = 'SS316';
  } else if (p.includes('plywood') || p.includes('board') || p.includes('wood')) {
    material_family = 'PLYWOOD_PANEL';
    if (p.includes('marine')) material_specification = 'PLYWOOD_MARINE';
    else if (p.includes('commercial')) material_specification = 'PLYWOOD_COMMERCIAL';
    else if (p.includes('standard') || p.includes('plywood')) material_specification = 'PLYWOOD_STANDARD';
  }

  // Dimensions (length x width)
  let length_mm: number | null = null;
  let width_mm: number | null = null;
  const dimMatch = p.match(/(\d+)\s*(?:by|x|\*)\s*(\d+)\s*(?:mm|millimeters)?/);
  if (dimMatch) {
    const dim1 = parseInt(dimMatch[1], 10);
    const dim2 = parseInt(dimMatch[2], 10);
    length_mm = Math.max(dim1, dim2);
    width_mm = Math.min(dim1, dim2);
  }

  // Thickness
  let thickness_mm: number | null = null;
  const explicitThick = p.match(/(\d+(?:\.\d+)?)\s*(?:mm|millimeter)?\s*(?:thick|thickness|gauge)/) ||
                        p.match(/(?:thick|thickness|gauge)\s*(?:of|is|:)?\s*(\d+(?:\.\d+)?)\s*(?:mm)?/);
  if (explicitThick) {
    thickness_mm = parseFloat(explicitThick[1]);
  } else {
    // Look for any remaining mm number not equal to length or width
    const allMmMatches = Array.from(p.matchAll(/(\d+(?:\.\d+)?)\s*(?:mm|millimeter)/g));
    for (const m of allMmMatches) {
      const val = parseFloat(m[1]);
      if (val !== length_mm && val !== width_mm) {
        thickness_mm = val;
        break;
      }
    }
  }

  // Quantity
  let total_quantity: number | null = null;
  const qtyMatch = p.match(/(\d+)\s*(?:pieces|piece|sheets|sheet|units|nos|items)/);
  if (qtyMatch) {
    total_quantity = parseInt(qtyMatch[1], 10);
  } else {
    // Check leading number e.g. "40 unused ..."
    const leadMatch = p.match(/^(?:we have|available|got)?\s*(\d+)\s+/);
    if (leadMatch) total_quantity = parseInt(leadMatch[1], 10);
  }

  // Price
  let unit_price_bdt: number | null = null;
  const priceMatch = p.match(/(\d+(?:,\d+)?)\s*(?:taka|bdt|tk|\/\s*sheet|\/\s*piece|per\s*piece|per\s*sheet)/);
  if (priceMatch) {
    unit_price_bdt = parseFloat(priceMatch[1].replace(/,/g, ''));
  }

  // Condition
  let condition: 'UNUSED' | 'LEFTOVER' | 'OFFCUT' | null = null;
  if (p.includes('unused') || p.includes('brand new') || p.includes('prime')) condition = 'UNUSED';
  else if (p.includes('leftover') || p.includes('excess') || p.includes('surplus')) condition = 'LEFTOVER';
  else if (p.includes('offcut') || p.includes('scrap') || p.includes('cut piece')) condition = 'OFFCUT';

  // City
  let city: string | null = null;
  const cities = ['Gazipur', 'Dhaka', 'Narayanganj', 'Chattogram', 'Khulna', 'Bogura', 'Cumilla'];
  for (const c of cities) {
    if (p.includes(c.toLowerCase())) {
      city = c;
      break;
    }
  }

  const confidence: Record<string, 'HIGH' | 'MEDIUM' | 'LOW' | 'NONE'> = {};
  const missing: string[] = [];

  const fieldsToCheck: Array<[string, unknown]> = [
    ['material_family', material_family],
    ['material_specification', material_specification],
    ['length_mm', length_mm],
    ['width_mm', width_mm],
    ['thickness_mm', thickness_mm],
    ['total_quantity', total_quantity],
    ['condition', condition],
    ['unit_price_bdt', unit_price_bdt],
    ['city', city],
  ];

  for (const [key, val] of fieldsToCheck) {
    if (val === null || val === undefined) {
      confidence[key] = 'NONE';
      missing.push(key);
    } else {
      confidence[key] = 'HIGH';
    }
  }

  return {
    material_family,
    material_specification,
    length_mm,
    width_mm,
    thickness_mm,
    total_quantity,
    quantity_unit: 'PIECE',
    condition,
    unit_price_bdt,
    city,
    raw_notes: 'Extracted using deterministic rule parser (Mock/Fallback mode). Please review all fields.',
    missing_fields: missing,
    confidence_scores: confidence,
  };
}

export async function extractMaterialFromText(
  prompt: string,
  options: ExtractionOptions = {}
): Promise<{ success: boolean; data?: MaterialExtractionResult; error?: string }> {
  // 1. Explicit mock mode for tests or development
  if (options.mock) {
    const mockResult = extractWithHeuristics(prompt);
    return { success: true, data: mockResult };
  }

  const apiKey = process.env.AI_API_KEY || process.env.GEMINI_API_KEY || process.env.OPENAI_API_KEY;
  const provider = (process.env.AI_PROVIDER || 'gemini').toLowerCase();

  // 2. If no API key configured, report unavailable gracefully
  if (!apiKey || apiKey.includes('your-llm-api-key')) {
    return {
      success: false,
      error:
        'AI extraction service is not configured. Please enter listing details manually or configure AI_API_KEY in .env.local.',
    };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000); // 12s timeout

    let rawJsonText = '';

    if (provider === 'gemini') {
      const model = process.env.AI_MODEL || 'gemini-1.5-flash';
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${SYSTEM_PROMPT}\n\nSUPPLIER TEXT:\n"${prompt}"` }],
            },
          ],
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        console.error('[AI Adapter] Gemini API error:', res.status, errText);
        return {
          success: false,
          error: `AI provider returned error (${res.status}). Falling back to manual entry.`,
        };
      }

      const resJson = await res.json();
      rawJsonText = resJson?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      // OpenAI / Compatible provider
      const model = process.env.AI_MODEL || 'gpt-4o-mini';
      const endpoint = process.env.AI_ENDPOINT || 'https://api.openai.com/v1/chat/completions';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        signal: controller.signal,
        body: JSON.stringify({
          model,
          temperature: 0.1,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: prompt },
          ],
        }),
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        console.error('[AI Adapter] OpenAI API error:', res.status, errText);
        return {
          success: false,
          error: `AI provider returned error (${res.status}). Falling back to manual entry.`,
        };
      }

      const resJson = await res.json();
      rawJsonText = resJson?.choices?.[0]?.message?.content || '';
    }

    if (!rawJsonText) {
      return {
        success: false,
        error: 'No content received from AI provider.',
      };
    }

    // Clean JSON text if wrapped in markdown code blocks
    const cleanedJson = rawJsonText.replace(/```json\n?|\n?```/g, '').trim();
    const parsed = JSON.parse(cleanedJson);

    // Validate strictly with Zod
    const validation = materialExtractionSchema.safeParse(parsed);
    if (!validation.success) {
      console.warn('[AI Adapter] Model output failed Zod schema:', validation.error.format());
      return {
        success: false,
        error: 'AI extracted attributes did not conform to required specification schema.',
      };
    }

    return {
      success: true,
      data: validation.data,
    };
  } catch (err: unknown) {
    console.error('[AI Adapter] Extraction error:', err);
    if (err instanceof Error && err.name === 'AbortError') {
      return {
        success: false,
        error: 'AI extraction timed out. Please enter details manually.',
      };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown AI extraction error occurred.',
    };
  }
}
