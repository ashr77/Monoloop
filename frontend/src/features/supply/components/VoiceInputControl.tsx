'use client';

import { useEffect, useRef, useState } from 'react';
import { Mic, Square, AlertCircle, Languages, ChevronDown, Check } from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui';
import { cn } from '@/lib/utils';
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
      <p className="text-sm text-slate-600">
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
            className="inline-flex h-8 items-center gap-2 rounded-sm border border-copper-600 bg-copper-50 px-3 text-[13px] font-medium text-copper-800 transition-colors duration-fast hover:bg-copper-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper"
          >
            {/* Recording indicator: the only continuous motion, shown only while capturing audio. */}
            <span className="relative flex size-2" aria-hidden>
              <span className="absolute inline-flex size-full rounded-full bg-copper-500 opacity-70 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-copper-600" />
            </span>
            <Square className="size-3 fill-current" aria-hidden />
            <span>Stop</span>
            {voice.status === 'recording' && (
              <span className="font-mono text-xs tabular-nums text-copper-700">
                {voice.seconds}s / {MAX_RECORDING_SECONDS}s
              </span>
            )}
          </button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            disabled={disabled}
            busy={voice.status === 'transcribing'}
            onClick={voice.start}
            leading={<Mic className="size-4" aria-hidden />}
          >
            {voice.status === 'transcribing' ? 'Transcribing…' : 'Speak'}
          </Button>
        )}

        <span className="text-xs text-slate-600" aria-live="polite">
          {voice.status === 'listening' && 'Listening… speak naturally, then press Stop.'}
          {voice.status === 'recording' && 'Recording… press Stop when you finish.'}
          {voice.status === 'idle' &&
            (voice.mode === 'browser' ? 'Live speech-to-text in your browser.' : 'Recorded and transcribed by the server.')}
        </span>
      </div>

      {voice.interim && (
        <p className="border-l-2 border-copper/40 pl-3 text-sm italic text-slate-600" aria-live="polite">
          {voice.interim}
        </p>
      )}

      {voice.error && (
        <p className="flex items-start gap-1.5 text-sm text-brick-700" role="alert">
          <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
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
      onKeyDown={(e) => {
        // Escape closes only this menu, not the dialog around it.
        if (e.key === 'Escape' && show) {
          e.nativeEvent.stopImmediatePropagation();
          setOpen(false);
        }
      }}
    >
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={show}
        aria-label={`Spoken language: ${current.name}`}
        // Opens only: on desktop hover already opened it, so a toggle would snap it shut.
        onClick={() => setOpen(true)}
        className={cn(buttonVariants({ variant: 'secondary', size: 'sm' }), 'gap-1.5 px-2.5')}
      >
        <Languages className="size-4 text-slate-600" aria-hidden />
        <span>{current.label}</span>
        <ChevronDown
          className={cn('size-3.5 text-slate-500 transition-transform duration-fast', show && 'rotate-180')}
          aria-hidden
        />
      </button>

      {show && (
        // pt-1 instead of a margin keeps the hover area continuous between button and menu.
        <div className="absolute left-0 top-full z-20 pt-1">
          <ul
            role="listbox"
            aria-label="Spoken language"
            className="min-w-[11rem] rounded-md border border-graphite/10 bg-cream-paper py-1 shadow-float"
          >
            {SPEECH_LANGUAGES.map((l) => (
              <li key={l.code} role="option" aria-selected={l.code === value}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(l.code);
                    setOpen(false);
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm transition-colors duration-fast hover:bg-sand-50 focus-visible:bg-sand-50 focus-visible:outline-none',
                    l.code === value ? 'font-medium text-copper-700' : 'text-slate-700'
                  )}
                >
                  <span>
                    {l.label}
                    {l.label !== l.name && <span className="ml-1.5 font-normal text-slate-600">{l.name}</span>}
                  </span>
                  {l.code === value && <Check className="size-4" aria-hidden />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
