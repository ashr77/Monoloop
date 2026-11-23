'use client';

// ============================================================================
// MONOLOOP - Voice input for the AI listing assistant (hybrid)
//
//   'browser'  Web Speech API (Chrome, Edge, Safari): live transcript, no upload
//   'server'   MediaRecorder → POST /api/ai/transcribe (Firefox, or when the
//              browser recogniser fails, e.g. Brave's network error)
//
// Either way the caller only receives text through onTranscript(); the normal
// "Extract with AI" step stays the single path from text to form fields.
// ============================================================================

import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechLanguage } from '@/lib/ai/schemas';
import { errorMessage } from '@/lib/api/client';
import { useTranscribeAudio } from './useTranscribeAudio';

export type VoiceInputMode = 'browser' | 'server' | 'unsupported';
export type VoiceInputStatus = 'idle' | 'listening' | 'recording' | 'transcribing';

/** Server fallback: stop automatically so the upload stays small (~240 KB of Opus). */
export const MAX_RECORDING_SECONDS = 60;

// The Web Speech recogniser is not in TypeScript's DOM lib; declare the part we use.
interface RecognitionAlternative { transcript: string }
interface RecognitionResult { readonly isFinal: boolean; readonly length: number; [i: number]: RecognitionAlternative }
interface RecognitionEvent { readonly resultIndex: number; readonly results: { readonly length: number; [i: number]: RecognitionResult } }
interface RecognitionErrorEvent { readonly error: string }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

function canRecord(): boolean {
  return typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

function detectMode(): VoiceInputMode {
  if (recognitionCtor()) return 'browser';
  return canRecord() ? 'server' : 'unsupported';
}

const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];

function pickRecordingType(): string | undefined {
  return RECORDING_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

const RECOGNITION_ERRORS: Record<string, string> = {
  'not-allowed': 'Microphone access was blocked. Allow the microphone for this site and try again.',
  'service-not-allowed': 'Microphone access was blocked. Allow the microphone for this site and try again.',
  'audio-capture': 'No microphone was found.',
  'no-speech': 'No speech was detected. Try again and speak after the tone.',
};

/** Recogniser failures that mean "this browser's speech service can't do it": switch to the server. */
const FALLBACK_ERRORS = new Set(['network', 'language-not-supported']);

interface Options {
  language: SpeechLanguage;
  /** Called with each finished piece of transcript, to append to the prompt. */
  onTranscript: (text: string) => void;
}

export function useVoiceInput({ language, onTranscript }: Options) {
  const transcribe = useTranscribeAudio();
  const [mode, setMode] = useState<VoiceInputMode>('unsupported');
  const [status, setStatus] = useState<VoiceInputStatus>('idle');
  const [interim, setInterim] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [seconds, setSeconds] = useState(0);

  const recognitionRef = useRef<Recognition | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const onTranscriptRef = useRef(onTranscript);
  onTranscriptRef.current = onTranscript;

  // Detect after mount: the server render has no window.
  useEffect(() => setMode(detectMode()), []);

  const clearTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const releaseMic = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // ---------------------------------------------------------------- server mode
  const startRecording = useCallback(async () => {
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError(RECOGNITION_ERRORS['not-allowed']);
      return;
    }
    streamRef.current = stream;
    const mimeType = pickRecordingType();
    const recorder = new MediaRecorder(stream, { ...(mimeType ? { mimeType } : {}), audioBitsPerSecond: 32_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data);
    recorder.onstop = async () => {
      clearTimer();
      releaseMic();
      recorderRef.current = null;
      const type = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) {
        setStatus('idle');
        return;
      }
      setStatus('transcribing');
      try {
        const result = await transcribe.mutateAsync({
          audio_base64: await blobToBase64(blob),
          mime_type: type,
          language,
        });
        onTranscriptRef.current(result.transcript);
      } catch (e) {
        setError(errorMessage(e, 'Transcription failed. Please type the description instead.'));
      } finally {
        setStatus('idle');
      }
    };
    recorderRef.current = recorder;
    recorder.start();
    setSeconds(0);
    setStatus('recording');
    timerRef.current = setInterval(() => {
      setSeconds((s) => {
        if (s + 1 >= MAX_RECORDING_SECONDS && recorder.state === 'recording') recorder.stop();
        return s + 1;
      });
    }, 1000);
  }, [language, transcribe]);

  // --------------------------------------------------------------- browser mode
  const startListening = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    const rec = new Ctor();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let pending = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) {
          if (text.trim()) onTranscriptRef.current(text.trim());
        } else {
          pending += text;
        }
      }
      setInterim(pending);
    };
    rec.onerror = (e) => {
      if (e.error === 'aborted') return;
      if (FALLBACK_ERRORS.has(e.error) && canRecord()) {
        setMode('server');
        setError('In-browser speech recognition is unavailable here, so recordings will be transcribed by the server. Tap the mic again.');
        return;
      }
      setError(RECOGNITION_ERRORS[e.error] ?? `Speech recognition error (${e.error}).`);
    };
    rec.onend = () => {
      recognitionRef.current = null;
      setInterim('');
      setStatus('idle');
    };

    recognitionRef.current = rec;
    try {
      rec.start();
      setStatus('listening');
    } catch {
      recognitionRef.current = null;
      setError('Speech recognition could not start. Please try again.');
    }
  }, [language]);

  // ------------------------------------------------------------------- controls
  const start = useCallback(() => {
    setError(null);
    setInterim('');
    if (mode === 'browser') startListening();
    else if (mode === 'server') void startRecording();
  }, [mode, startListening, startRecording]);

  const stop = useCallback(() => {
    recognitionRef.current?.stop(); // final results still arrive before onend
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop();
  }, []);

  // Release the microphone if the form closes mid-recording.
  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      if (recorderRef.current) {
        recorderRef.current.onstop = null;
        if (recorderRef.current.state === 'recording') recorderRef.current.stop();
      }
      clearTimer();
      releaseMic();
    },
    []
  );

  return {
    mode,
    status,
    isActive: status === 'listening' || status === 'recording',
    interim,
    error,
    clearError: () => setError(null),
    seconds,
    start,
    stop,
  };
}
