'use client';

import { useMutation } from '@tanstack/react-query';
import { api, type TranscribeAudioInput } from '@/lib/api/endpoints';

export function useTranscribeAudio() {
  return useMutation({ mutationFn: (body: TranscribeAudioInput) => api.ai.transcribe(body) });
}
