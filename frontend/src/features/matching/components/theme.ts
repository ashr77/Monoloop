// ============================================================================
// Matching page tokens (Member 3) — mapped onto the Industrial Copper system.
// Fonts come from the root layout (`@/lib/fonts` → `font-sans` / `font-mono`);
// the exports below keep their original names so existing call sites keep working.
// See docs/DESIGN_SYSTEM.md.
// ============================================================================

/** Kept for compatibility: the root layout already loads Geist as `font-sans` / `font-mono`. */
export const matchSans = { className: 'font-sans', variable: '' } as const;
export const matchMono = { className: 'font-mono', variable: '' } as const;

/** Raw palette (also used for inline SVG / style values). Mirrors tailwind.config.ts tokens. */
export const PALETTE = {
  paper: '#F8F5ED', // cream
  paperStrong: '#F2EADD', // sand-100
  surface: '#FCFBF7', // cream-paper
  ink: '#20252A', // graphite
  line: 'rgba(32, 37, 42, 0.12)', // graphite/12 hairline
  accent: '#C66B3D', // copper
  accentStrong: '#8F4522', // copper-700 (small copper text)
  warn: '#7C5110', // ochre-700
  danger: '#8E2E24', // brick-700
  note: '#F2EADD', // sand-100
  noteInk: '#20252A',
} as const;

/**
 * Distinct, on-brand series colours for allocation segments:
 * graphite · copper-600 · slate · sand-400 · copper-800 · slate-300.
 */
export const SUPPLIER_COLORS = ['#20252A', '#B35A2E', '#657580', '#BFA37C', '#6E351C', '#A9B3B9'];

/** Light series colours need graphite labels; the rest carry white (all ≥ 4.5:1). */
const LIGHT_SERIES = new Set(['#BFA37C', '#A9B3B9']);
export const supplierInk = (color: string | undefined) => (color && LIGHT_SERIES.has(color) ? PALETTE.ink : '#FFFFFF');

/** Tailwind class tokens (literal strings so the JIT compiler picks them up). */
export const t = {
  page: 'bg-cream text-graphite',
  surface: 'bg-cream-paper',
  line: 'rule',
  muted: 'text-slate-600',
  faint: 'text-slate-600',
  accentText: 'text-copper-700',
  eyebrow: 't-eyebrow',
  mono: 'font-mono',
  heading: 'font-medium tracking-[-0.02em]',
  display: 'font-medium tracking-[-0.04em]',
  btnPrimary:
    'inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-copper-600 px-4 text-sm font-medium text-white transition-colors duration-fast ease-out hover:bg-copper-700 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper disabled:pointer-events-none disabled:opacity-50',
  btnInk:
    'inline-flex h-10 items-center justify-center gap-2 rounded-sm bg-graphite px-4 text-sm font-medium text-cream transition-colors duration-fast ease-out hover:bg-graphite-700 active:translate-y-px focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper disabled:pointer-events-none disabled:opacity-50',
  btnSecondary:
    'inline-flex h-10 items-center justify-center gap-2 rounded-sm border border-graphite/20 px-4 text-sm font-medium text-graphite transition-colors duration-fast ease-out hover:border-graphite/45 hover:bg-graphite/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper',
  btnDisabled:
    'inline-flex h-10 cursor-not-allowed items-center justify-center gap-2 rounded-sm border border-dashed border-graphite/20 px-4 text-sm font-medium text-slate-500',
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
