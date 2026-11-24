// One type family for the whole product: Geist (sans) + Geist Mono for technical labels and data.
// Served locally (no network at build time).
import localFont from 'next/font/local';

export const fontSans = localFont({
  src: '../app/fonts/GeistVF.woff',
  variable: '--font-sans',
  weight: '100 900',
  display: 'swap',
});

export const fontMono = localFont({
  src: '../app/fonts/GeistMonoVF.woff',
  variable: '--font-mono',
  weight: '100 900',
  display: 'swap',
});
