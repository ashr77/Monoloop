import type { Metadata } from 'next';
import './globals.css';
import { Navbar } from '@/components/shared/Navbar';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'MONOLOOP | Industrial Surplus Matching & Resource Exchange',
  description:
    'One Industry’s Surplus. Another’s Opportunity. Explainable industrial surplus matching and resource recovery for the TSUNAGU Hackathon 2026.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased flex flex-col font-sans">
        <Providers>
          <Navbar />
          <main className="flex-1">{children}</main>
        </Providers>
        <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs text-slate-500">
          <p>
            MONOLOOP &copy; 2026 &mdash; Built for TSUNAGU Hackathon (Theme: Update the Way We Connect).
          </p>
          <p className="mt-1 text-slate-400">
            All registered organizations and listings displayed are synthetic demo data.
          </p>
        </footer>
      </body>
    </html>
  );
}
