'use client';

// Error boundary for the matches route (Member 3).
import { useEffect } from 'react';
import { ArrowLeft, RotateCw } from 'lucide-react';
import { Button, LinkButton } from '@/components/ui';

export default function MatchesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[Matches] Failed to compute matches:', error);
  }, [error]);

  return (
    <div className="min-h-[calc(100vh-9rem)] bg-cream text-graphite">
      <div className="page-shell max-w-3xl space-y-6 py-20" role="alert">
        <p className="t-eyebrow text-brick-700">Matching failed</p>
        <h1 className="text-heading-lg font-medium">We couldn&rsquo;t compute matches right now.</h1>
        <p className="border-l-2 border-brick-600 pl-4 text-[15px] leading-relaxed text-slate-700">
          The listing or requirement data could not be loaded. Check the database connection and try again.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button variant="ink" onClick={() => reset()} leading={<RotateCw className="size-4" aria-hidden />}>
            Try again
          </Button>
          <LinkButton href="/demand" variant="secondary" leading={<ArrowLeft className="size-4" aria-hidden />}>
            Back to requirements
          </LinkButton>
        </div>
      </div>
    </div>
  );
}
