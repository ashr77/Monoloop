'use client';

// ============================================================================
// English / Japanese UI language.
//   - Choice is stored per browser (localStorage); the first visit follows the
//     browser language (ja* → Japanese, anything else → English).
//   - The server always renders English; the saved language applies after mount.
//   - <html lang> follows the choice so fonts and screen readers switch too.
// ============================================================================

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { en, type Messages } from './en';
import { ja } from './ja';

export type Lang = 'en' | 'ja';

const DICTIONARIES: Record<Lang, Messages> = { en, ja };
const STORAGE_KEY = 'monoloop.lang';

interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Messages;
}

const I18nContext = createContext<I18nValue | null>(null);

function initialLang(): Lang {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === 'en' || saved === 'ja') return saved;
  } catch {
    // Storage blocked: fall back to the browser language.
  }
  return navigator.language?.toLowerCase().startsWith('ja') ? 'ja' : 'en';
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('en');

  useEffect(() => setLangState(initialLang()), []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Not persisted; the choice still applies to this tab.
    }
  }, []);

  const value = useMemo(() => ({ lang, setLang, t: DICTIONARIES[lang] }), [lang, setLang]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside <I18nProvider>');
  return ctx;
}

/** Shorthand for the current language's text. */
export function useT(): Messages {
  return useI18n().t;
}
