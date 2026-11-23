// ============================================================================
// Matching page visual language (Member 3)
// Reference: usealia.com — warm paper canvas, near-black ink, warm brown accent (adapted from the lavender original),
// square buttons, uppercase mono labels. Scoped to the /matches page only so
// the shared app theme (Members 1 & 2) is untouched.
// ============================================================================

import localFont from 'next/font/local';

export const matchSans = localFont({
  src: '../../../app/fonts/GeistVF.woff',
  variable: '--font-match-sans',
  weight: '100 900',
  display: 'swap',
});

export const matchMono = localFont({
  src: '../../../app/fonts/GeistMonoVF.woff',
  variable: '--font-match-mono',
  weight: '100 900',
  display: 'swap',
});

/** Raw palette (also used for inline SVG / style values). */
export const PALETTE = {
  paper: '#f3f1e5',
  paperStrong: '#e7e3cc',
  surface: '#ffffff',
  ink: '#1d1d1d',
  line: '#d8d4bb',
  accent: '#d4b48c',
  accentStrong: '#8b5e34',
  warn: '#a15c07',
  danger: '#b42318',
  note: '#e9e4cf',
  noteInk: '#2f2e2a',
} as const;

/** Distinct, accessible series colours for allocation segments. */
export const SUPPLIER_COLORS = ['#8b5e34', '#d4b48c', '#1d1d1d', '#6b4a2b', '#e8d5b9', '#6e6a55'];

/** Tailwind class tokens (literal strings so the JIT compiler picks them up). */
export const t = {
  page: 'bg-[#f3f1e5] text-[#1d1d1d]',
  surface: 'bg-white',
  line: 'border-[#d8d4bb]',
  muted: 'text-[#1d1d1d]/60',
  faint: 'text-[#1d1d1d]/45',
  accentText: 'text-[#8b5e34]',
  eyebrow: `${matchMono.className} text-[11px] font-medium uppercase tracking-[0.08em]`,
  mono: matchMono.className,
  heading: 'font-medium tracking-[-0.02em]',
  display: 'font-medium tracking-[-0.04em]',
  btnPrimary:
    'inline-flex h-11 items-center justify-center gap-2 rounded-none bg-[#d4b48c] px-6 text-sm font-medium text-[#1d1d1d] transition-colors duration-300 hover:bg-[#8b5e34] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e34]',
  btnInk:
    'inline-flex h-11 items-center justify-center gap-2 rounded-none bg-[#1d1d1d] px-6 text-sm font-medium text-white transition-colors duration-300 hover:bg-[#8b5e34] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e34]',
  btnSecondary:
    'inline-flex h-11 items-center justify-center gap-2 rounded-none border border-[#d8d4bb] px-6 text-sm font-medium text-[#1d1d1d] transition-colors duration-300 hover:bg-[#d8d4bb]/60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8b5e34]',
  btnDisabled:
    'inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-none border border-dashed border-[#d8d4bb] px-6 text-sm font-medium text-[#1d1d1d]/45',
} as const;

export const SPEC_LABEL: Record<string, string> = {
  SS304: 'SS 304',
  SS201: 'SS 201',
  SS316: 'SS 316',
  PLYWOOD_STANDARD: 'Standard plywood',
  PLYWOOD_MARINE: 'Marine plywood',
  PLYWOOD_COMMERCIAL: 'Commercial plywood',
};

export const unitNoun = (family: string) => (family === 'PLYWOOD_PANEL' ? 'panels' : 'sheets');

export const bdt = (n: number) => `৳${Math.round(n).toLocaleString('en-US')}`;
export const num = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: 2 });
