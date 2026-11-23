'use client';

import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/endpoints';

export function useExtractMaterial() {
  return useMutation({
    mutationFn: (v: { prompt: string; mock?: boolean }) => api.ai.extractMaterial(v.prompt, v.mock),
  });
}
