import type { Metadata, Viewport } from 'next';
import './globals.css';
import { Navbar } from '@/components/shared/Navbar';
import { SiteFooter } from '@/components/shared/SiteFooter';
import { fontMono, fontSans } from '@/lib/fonts';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Meguri | Industrial Surplus Matching & Resource Exchange',
  description:
    'One Industry’s Surplus. Another’s Opportunity. Explainable industrial surplus matching and resource recovery for the TSUNAGU Hackathon 2026.',
};

export const viewport: Viewport = {
  themeColor: '#F8F5ED',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${fontSans.variable} ${fontMono.variable}`}>
      <body className="flex min-h-screen flex-col bg-cream font-sans text-graphite antialiased">
        <a
          href="#main"
          className="sr-only z-[100] rounded-sm bg-graphite px-4 py-2 text-sm text-cream focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
        >
          Skip to content
        </a>
        <Providers>
          <Navbar />
          <main id="main" className="flex-1">
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
