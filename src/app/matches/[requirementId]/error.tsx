'use client';

// Error boundary for the matches route (Member 3).
import { useEffect } from 'react';
import Link from 'next/link';

export default function MatchesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[Matches] Failed to compute matches:', error);
  }, [error]);

  return (
    <div className="min-h-[calc(100vh-9rem)] bg-[#f3f1e5] text-[#1d1d1d]">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-20 sm:px-6" role="alert">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-red-700">Matching failed</p>
        <h1 className="text-4xl font-medium tracking-[-0.04em]">We couldn&rsquo;t compute matches right now.</h1>
        <p className="text-base text-[#1d1d1d]/60">
          The listing or requirement data could not be loaded. Check the database connection and try again.
        </p>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => reset()}
            className="inline-flex h-11 items-center bg-[#1d1d1d] px-6 text-sm font-medium text-white transition-colors hover:bg-[#8b5e34]"
          >
            Try again
          </button>
          <Link href="/demand" className="inline-flex h-11 items-center border border-[#d8d4bb] px-6 text-sm font-medium hover:bg-[#d8d4bb]/60">
            Back to requirements
          </Link>
        </div>
      </div>
    </div>
  );
}
