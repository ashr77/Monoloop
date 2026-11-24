import type { Config } from 'tailwindcss';

// ============================================================================
// MONOLOOP — Industrial Copper design tokens
// Brand palette: Graphite #20252A · Copper #C66B3D · Sand #E5D5BD · Cream #F8F5ED · Slate #657580
// See docs/DESIGN_SYSTEM.md for usage rules (contrast-safe shades are noted inline).
// ============================================================================

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/features/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    './src/lib/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        // Headings, primary navigation, dark editorial sections.
        graphite: {
          DEFAULT: '#20252A',
          950: '#15191C',
          900: '#20252A',
          800: '#2B3137',
          700: '#3A4148',
          600: '#4B535B',
        },
        // Brand accent. 500 is the brand value (accents, rules, large type, focus).
        // 600 carries white text at AA (4.7:1); 700 is AA copper text on cream (6.3:1).
        copper: {
          50: '#FBF1EA',
          100: '#F5DFD0',
          200: '#EBC0A3',
          300: '#DF9D74',
          400: '#D3824F',
          DEFAULT: '#C66B3D',
          500: '#C66B3D',
          600: '#B35A2E',
          700: '#8F4522',
          800: '#6E351C',
          900: '#4F2715',
        },
        // Warm secondary surfaces and section transitions.
        sand: {
          DEFAULT: '#E5D5BD',
          50: '#FAF6EF',
          100: '#F2EADD',
          200: '#E5D5BD',
          300: '#D6C09F',
          400: '#BFA37C',
        },
        // Dominant light background. `paper` is the slightly lighter working surface (tables, inputs).
        cream: {
          DEFAULT: '#F8F5ED',
          paper: '#FCFBF7',
        },
        // Brand slate replaces Tailwind's cool slate. 500 is the brand value (metadata, icons);
        // 600+ for small secondary text on cream (5.6:1).
        slate: {
          50: '#F2F3F3',
          100: '#E4E7E8',
          200: '#CBD1D4',
          300: '#A9B3B9',
          400: '#84929B',
          500: '#657580',
          600: '#56646E',
          700: '#47535B',
          800: '#353E44',
          900: '#20252A',
          950: '#15191C',
        },
        // Restrained semantic exceptions (status only, never decoration).
        moss: { 50: '#EEF2E8', 100: '#DCE5D1', 500: '#5F7F47', 600: '#4E6B3A', 700: '#3F5830' },
        ochre: { 50: '#FBF3E2', 100: '#F4E2BC', 500: '#B57F1F', 600: '#9A6512', 700: '#7C5110' },
        brick: { 50: '#FBECE9', 100: '#F4D2CC', 500: '#C2493B', 600: '#B03A2E', 700: '#8E2E24' },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', 'Yu Gothic UI', 'Meiryo', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontSize: {
        // Marketing display → application headings → technical labels.
        'display-xl': ['clamp(3rem, 7.2vw, 6.5rem)', { lineHeight: '0.95', letterSpacing: '-0.045em' }],
        'display-lg': ['clamp(2.5rem, 5vw, 4.5rem)', { lineHeight: '1', letterSpacing: '-0.04em' }],
        'display-md': ['clamp(2rem, 3.6vw, 3.25rem)', { lineHeight: '1.04', letterSpacing: '-0.035em' }],
        'heading-lg': ['clamp(1.75rem, 2.6vw, 2.25rem)', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
        'heading-md': ['1.375rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        label: ['0.75rem', { lineHeight: '1.1rem', letterSpacing: '0.08em' }],
        // Body sizes one step larger than Tailwind's defaults (12/14px read too small on phones).
        xs: ['0.8125rem', { lineHeight: '1.25rem' }],
        sm: ['0.9375rem', { lineHeight: '1.45rem' }],
      },
      maxWidth: {
        page: '80rem', // application + marketing content width
        prose: '42rem',
        narrow: '30rem',
      },
      borderRadius: {
        // Industrial precision: small radii only.
        none: '0',
        xs: '2px',
        sm: '3px',
        DEFAULT: '4px',
        md: '6px',
        lg: '8px',
      },
      boxShadow: {
        // Shadows are reserved for floating layers (menus, dialogs, toasts).
        float: '0 1px 2px rgba(32,37,42,0.06), 0 12px 32px -12px rgba(32,37,42,0.22)',
        dialog: '0 2px 4px rgba(32,37,42,0.08), 0 32px 64px -24px rgba(32,37,42,0.35)',
        hairline: 'inset 0 0 0 1px rgba(32,37,42,0.08)',
      },
      transitionTimingFunction: {
        out: 'cubic-bezier(0.22, 1, 0.36, 1)',
        'in-out': 'cubic-bezier(0.65, 0, 0.35, 1)',
      },
      transitionDuration: {
        fast: '150ms',
        base: '240ms',
        slow: '400ms',
      },
      keyframes: {
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
        drift: {
          '0%, 100%': { transform: 'translate3d(0, 0, 0)' },
          '50%': { transform: 'translate3d(-2%, 1.5%, 0)' },
        },
      },
      animation: {
        shimmer: 'shimmer 1.6s cubic-bezier(0.65, 0, 0.35, 1) infinite',
        drift: 'drift 24s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};
export default config;
