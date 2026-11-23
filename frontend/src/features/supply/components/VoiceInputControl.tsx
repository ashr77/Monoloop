'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, Loader2, AlertCircle, Languages, ChevronDown, Check } from 'lucide-react';
import { useVoiceInput } from '@/hooks';
import { SPEECH_LANGUAGES, type SpeechLanguage } from '@/lib/ai/schemas';
import { MAX_RECORDING_SECONDS } from '@/hooks/useVoiceInput';

const LANGUAGE_KEY = 'monoloop.voiceLanguage';

function storedLanguage(): SpeechLanguage {
  try {
    const value = window.localStorage.getItem(LANGUAGE_KEY);
    if (SPEECH_LANGUAGES.some((l) => l.code === value)) return value as SpeechLanguage;
  } catch {
    // Storage blocked (private mode): fall through to the default.
  }
  return 'en-US';
}

interface Props {
  /** Receives each finished piece of transcript. */
  onTranscript: (text: string) => void;
  disabled?: boolean;
}

/** Mic button + language picker for the AI listing assistant (English, Bangla, Japanese). */
export function VoiceInputControl({ onTranscript, disabled }: Props) {
  const [language, setLanguage] = useState<SpeechLanguage>('en-US');
  useEffect(() => setLanguage(storedLanguage()), []);

  const voice = useVoiceInput({ language, onTranscript });
  const busy = voice.isActive || voice.status === 'transcribing';

  const chooseLanguage = (code: SpeechLanguage) => {
    setLanguage(code);
    try {
      window.localStorage.setItem(LANGUAGE_KEY, code);
    } catch {
      // Not persisted; the choice still applies to this session.
    }
  };

  if (voice.mode === 'unsupported') {
    return (
      <p className="text-sm text-slate-500">
        Voice input isn&apos;t available in this browser. Type the description instead.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <LanguageMenu value={language} onChange={chooseLanguage} disabled={busy} />

        {voice.isActive ? (
          <button
            type="button"
            onClick={voice.stop}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-lg shadow-sm transition"
          >
            <Square className="w-3 h-3 fill-current" />
            <span>Stop</span>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
            </span>
            {voice.status === 'recording' && (
              <span className="tabular-nums">
                {voice.seconds}s / {MAX_RECORDING_SECONDS}s
              </span>
            )}
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || voice.status === 'transcribing'}
            onClick={voice.start}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-blue-300 hover:bg-blue-50 disabled:opacity-50 text-blue-800 text-sm font-semibold rounded-lg shadow-sm transition"
          >
            {voice.status === 'transcribing' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Mic className="w-4 h-4" />
            )}
            <span>{voice.status === 'transcribing' ? 'Transcribing…' : 'Speak'}</span>
          </button>
        )}

        <span className="text-sm text-slate-500">
          {voice.status === 'listening' && 'Listening… speak naturally, then press Stop.'}
          {voice.status === 'recording' && 'Recording… press Stop when you finish.'}
          {voice.status === 'idle' &&
            (voice.mode === 'browser' ? 'Live speech-to-text in your browser.' : 'Recorded and transcribed by the server.')}
        </span>
      </div>

      {voice.interim && (
        <p className="text-sm italic text-slate-500 px-1" aria-live="polite">
          {voice.interim}
        </p>
      )}

      {voice.error && (
        <p className="text-sm text-red-700 flex items-start gap-1" role="alert">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>{voice.error}</span>
        </p>
      )}
    </div>
  );
}

interface LanguageMenuProps {
  value: SpeechLanguage;
  onChange: (code: SpeechLanguage) => void;
  disabled?: boolean;
}

/** Shows the current language; hover (desktop) or click/tap (touch, keyboard) reveals the others. */
function LanguageMenu({ value, onChange, disabled }: LanguageMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = SPEECH_LANGUAGES.find((l) => l.code === value) ?? SPEECH_LANGUAGES[0];
  const show = open && !disabled;

  // Close on outside tap and on Escape.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div
      ref={rootRef}
      className="relative"
      onPointerEnter={(e) => e.pointerType === 'mouse' && setOpen(true)}
      onPointerLeave={(e) => e.pointerType === 'mouse' && setOpen(false)}
    >
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={show}
        aria-label={`Spoken language: ${current.name}`}
        // Opens only: on desktop hover already opened it, so a toggle would snap it shut.
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-blue-300 hover:bg-blue-50 disabled:opacity-50 disabled:cursor-not-allowed text-blue-800 text-sm font-semibold rounded-lg shadow-sm transition"
      >
        <Languages className="w-4 h-4" />
        <span>{current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${show ? 'rotate-180' : ''}`} />
      </button>

      {show && (
        // pt-1 instead of a margin keeps the hover area continuous between button and menu.
        <div className="absolute left-0 top-full z-20 pt-1">
          <ul
            role="listbox"
            aria-label="Spoken language"
            className="min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          >
            {SPEECH_LANGUAGES.map((l) => (
              <li key={l.code} role="option" aria-selected={l.code === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(l.code);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-sm text-left hover:bg-blue-50 ${
                    l.code === value ? 'font-semibold text-blue-700' : 'text-slate-700'
                  }`}
                >
                  <span>
                    {l.label}
                    {l.label !== l.name && <span className="ml-1.5 text-slate-400 font-normal">{l.name}</span>}
                  </span>
                  {l.code === value && <Check className="w-4 h-4" />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
