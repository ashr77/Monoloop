// ============================================================================
// MONOLOOP - AI Material Extraction API Route
// POST /api/ai/extract-material
// Extracts structured attributes from natural-language descriptions.
// ============================================================================

import { NextRequest, NextResponse } from 'next/server';
import { extractMaterialRequestSchema, MaterialExtractionResult } from '@/lib/ai/schemas';
import { extractMaterialFromText } from '@/lib/ai/adapter';
import { ApiResponse } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const parseResult = extractMaterialRequestSchema.safeParse(body);
    if (!parseResult.success) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload. A prompt of at least 5 characters is required.',
          details: parseResult.error.format(),
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    const { prompt, mock } = parseResult.data;

    const extraction = await extractMaterialFromText(prompt, { mock });

    if (!extraction.success || !extraction.data) {
      const response: ApiResponse = {
        success: false,
        error: {
          code: 'AI_UNAVAILABLE',
          message: extraction.error || 'Failed to extract material specifications.',
        },
      };
      // Return 200 with success: false or 503 so frontend handles graceful fallback cleanly
      return NextResponse.json(response, { status: 200 });
    }

    const response: ApiResponse<MaterialExtractionResult> = {
      success: true,
      data: extraction.data,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[API /api/ai/extract-material] Error:', error);
    const response: ApiResponse = {
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Unexpected server error while processing material description.',
        details: error instanceof Error ? error.message : undefined,
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
