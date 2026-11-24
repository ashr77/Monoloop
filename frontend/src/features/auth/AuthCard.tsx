'use client';

// Shared frame and fields for the sign-in / sign-up / pending pages.
// lg+: editorial split — form on cream, brand panel on graphite. Mobile: just the form.

import { motion, useReducedMotion } from 'framer-motion';
import { AlertTriangle } from 'lucide-react';
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { useT } from '@/lib/i18n/I18nProvider';
import { cn } from '@/lib/utils';

export function AuthCard({ title, subtitle, children, footer }: {
  title: string;
  subtitle: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const a = useT().auth;
  return (
    <div className="grid min-h-[calc(100vh-var(--header-h))] lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="flex flex-col px-4 py-10 sm:px-6 sm:py-16 lg:justify-center lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <p className="t-eyebrow">{a.eyebrow}</p>
          <h1 className="mt-3 text-heading-lg font-medium">{title}</h1>
          <p className="mt-3 text-[15px] leading-relaxed text-slate-600">{subtitle}</p>
          <div className="mt-8">{children}</div>
          {footer && <div className="mt-10 border-t rule pt-6 text-sm text-slate-600">{footer}</div>}
        </div>
      </div>
      <BrandPanel />
    </div>
  );
}

function BrandPanel() {
  const a = useT().auth;
  return (
    <aside className="relative hidden overflow-hidden bg-graphite text-cream lg:flex lg:flex-col lg:justify-center lg:px-14 lg:py-14 xl:px-20">
      <div className="bg-grid-dark pointer-events-none absolute inset-0" aria-hidden />
      <div className="relative space-y-12">
        <BrandMark />
        <LoopPath />
        <p className="max-w-lg text-display-md font-medium text-cream">
          <span className="block">{a.tagline[0]}</span>
          <span className="block text-copper-300">{a.tagline[1]}</span>
        </p>
      </div>
    </aside>
  );
}

const BREATH = { duration: 7, repeat: Infinity, ease: 'easeInOut' } as const;

/**
 * The large MEGURI mark: letters rise in once, then the two loops slowly breathe toward each
 * other under a soft copper glow. Static when the user prefers reduced motion.
 */
function BrandMark() {
  const reduce = useReducedMotion();
  return (
    <p className="flex items-center gap-5">
      <span className="sr-only">Meguri</span>
      <svg viewBox="0 0 64 40" className="h-12 w-[4.8rem] overflow-visible" fill="none" aria-hidden>
        {!reduce && (
          <motion.circle
            cx="32"
            cy="20"
            r="16"
            fill="#C66B3D"
            style={{ filter: 'blur(10px)', transformOrigin: '32px 20px' }}
            initial={{ opacity: 0.06, scale: 0.9 }}
            animate={{ opacity: [0.06, 0.22, 0.06], scale: [0.9, 1.15, 0.9] }}
            transition={BREATH}
          />
        )}
        <motion.circle cx="20" cy="20" r="17" stroke="#F8F5ED" strokeWidth="4" animate={reduce ? undefined : { x: [0, 3, 0] }} transition={BREATH} />
        <motion.circle cx="44" cy="20" r="17" stroke="#C66B3D" strokeWidth="4" animate={reduce ? undefined : { x: [0, -3, 0] }} transition={BREATH} />
      </svg>
      <span className="flex text-display-lg font-semibold tracking-[0.1em] text-cream" aria-hidden>
        {'MEGURI'.split('').map((letter, i) => (
          <motion.span
            key={i}
            initial={reduce ? false : { opacity: 0, y: 14, filter: 'blur(6px)' }}
            animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
            transition={{ delay: 0.2 + i * 0.09, duration: 1, ease: [0.22, 1, 0.36, 1] }}
          >
            {letter}
          </motion.span>
        ))}
      </span>
    </p>
  );
}

/** Two nodes (surplus, demand) joined by a copper path. A slow dash drifts along it unless reduced motion is on. */
function LoopPath() {
  const reduce = useReducedMotion();
  const h = useT().home;
  const d = 'M 40 96 C 140 96, 150 28, 260 28 S 380 96, 440 96';
  return (
    <svg viewBox="0 0 480 124" className="h-auto w-full max-w-lg" fill="none" aria-hidden>
      <path d={d} stroke="#C66B3D" strokeOpacity="0.35" strokeWidth="1.5" />
      {!reduce && (
        <motion.path
          d={d}
          stroke="#DF9D74"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="28 412"
          initial={{ strokeDashoffset: 440 }}
          animate={{ strokeDashoffset: 0 }}
          transition={{ duration: 14, ease: 'linear', repeat: Infinity }}
        />
      )}
      <g>
        <circle cx="40" cy="96" r="14" stroke="#F8F5ED" strokeOpacity="0.85" strokeWidth="1.5" />
        <circle cx="40" cy="96" r="3" fill="#F8F5ED" />
        <text x="40" y="122" textAnchor="middle" fill="#F8F5ED" fillOpacity="0.6" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="1">
          {h.surplus}
        </text>
      </g>
      <g>
        <circle cx="440" cy="96" r="14" stroke="#C66B3D" strokeWidth="1.5" />
        <circle cx="440" cy="96" r="3" fill="#C66B3D" />
        <text x="440" y="122" textAnchor="middle" fill="#F8F5ED" fillOpacity="0.6" fontSize="9" fontFamily="var(--font-mono)" letterSpacing="1">
          {h.demand}
        </text>
      </g>
    </svg>
  );
}

export function Field({ label, hint, error, id, className, ...input }: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const autoId = useId();
  const inputId = id ?? autoId;
  const noteId = `${inputId}-note`;
  const note = error ?? hint;
  const describedBy = [input['aria-describedby'], note ? noteId : undefined].filter(Boolean).join(' ') || undefined;
  return (
    <div className={cn('min-w-0', className)}>
      <label htmlFor={inputId} className="field-label">
        {label}
        {input.required && <span className="sr-only"> (required)</span>}
      </label>
      <input
        {...input}
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn('field mt-1.5', error && 'field-invalid')}
      />
      {error ? (
        <span id={noteId} className="field-error">
          {error}
        </span>
      ) : hint ? (
        <span id={noteId} className="field-hint">
          {hint}
        </span>
      ) : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="flex items-start gap-2 border-l-2 border-brick-600 bg-brick-50/60 px-4 py-2.5 text-sm text-brick-700">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{message}</span>
    </p>
  );
}
