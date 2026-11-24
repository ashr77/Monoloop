'use client';

import { useI18n, type Lang } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/utils';

const OPTIONS: { value: Lang; label: string; name: string }[] = [
  { value: 'en', label: 'EN', name: 'English' },
  { value: 'ja', label: '日本語', name: '日本語' },
];

/** EN | 日本語 switch. Remembered on this device. */
export function LanguageToggle({ className }: { className?: string }) {
  const { lang, setLang, t } = useI18n();
  return (
    <div role="group" aria-label={t.common.languageLabel} className={cn('inline-flex h-8 items-center rounded-sm border border-graphite/15 p-0.5', className)}>
      {OPTIONS.map((o) => {
        const active = o.value === lang;
        return (
          <button
            key={o.value}
            type="button"
            lang={o.value}
            aria-pressed={active}
            aria-label={o.name}
            onClick={() => setLang(o.value)}
            className={cn(
              'inline-flex h-full items-center rounded-xs px-2 text-xs font-medium transition-colors duration-fast',
              active ? 'bg-graphite text-cream' : 'text-slate-600 hover:text-graphite'
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
