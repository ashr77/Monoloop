'use client';

import { useMutation } from '@tanstack/react-query';
import { api } from '@/lib/api/endpoints';

export function useExtractRequirement() {
  return useMutation({
    mutationFn: (v: { prompt: string; mock?: boolean }) =>
      api.ai.extractRequirement(v.prompt, v.mock),
  });
}
