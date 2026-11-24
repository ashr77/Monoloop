// Loading, empty and error states for the matches pages (Member 3).
import { ArrowLeft, RotateCw } from 'lucide-react';
import { Button, LinkButton, Skeleton } from '@/components/ui';

export function MatchSkeleton({ label = 'Checking every listing against your specification…' }: { label?: string }) {
  return (
    <div className="min-h-[calc(100vh-9rem)] bg-cream">
      <div className="page-shell space-y-10 py-10 lg:py-14" role="status" aria-busy="true" aria-label="Finding compatible surplus">
        <div className="space-y-4 border-b rule pb-10">
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-12 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <div className="grid grid-cols-2 divide-x divide-graphite/10 border-y rule lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 px-5 py-5">
              <Skeleton className="h-2.5 w-20" />
              <Skeleton className="h-7 w-28" />
              <Skeleton className="h-2.5 w-32" />
            </div>
          ))}
        </div>
        <Skeleton className="h-12 w-full" />
        <div className="divide-y divide-graphite/[0.08] border-y rule">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-6 py-5" style={{ opacity: 1 - i * 0.15 }}>
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="hidden h-3 flex-1 sm:block" />
              <Skeleton className="h-3 w-20" />
            </div>
          ))}
        </div>
        <p className="t-label">{label}</p>
      </div>
    </div>
  );
}

export function RequirementNotFound() {
  return (
    <div className="min-h-[calc(100vh-9rem)] bg-cream text-graphite">
      <div className="page-shell max-w-3xl space-y-6 py-20">
        <p className="t-eyebrow">404 · Requirement</p>
        <h1 className="text-heading-lg font-medium">This requirement doesn&rsquo;t exist.</h1>
        <p className="text-[15px] text-slate-600">It may have been removed, or the link is incomplete.</p>
        <LinkButton href="/demand" variant="ink" leading={<ArrowLeft className="size-4" aria-hidden />}>
          Back to requirements
        </LinkButton>
      </div>
    </div>
  );
}

export function RequirementNotOpen({ status }: { status: string }) {
  return (
    <div className="page-shell max-w-3xl space-y-6 py-20">
      <p className="t-eyebrow">Matching unavailable</p>
      <h1 className="text-heading-lg font-medium">This requirement is {status.toLowerCase()}.</h1>
      <p className="max-w-prose text-[15px] leading-relaxed text-slate-600">
        Only open requirements are matched against surplus stock. Reopen it from the demand dashboard to see compatible suppliers.
      </p>
      <LinkButton href="/demand" variant="ink" leading={<ArrowLeft className="size-4" aria-hidden />}>
        Back to requirements
      </LinkButton>
    </div>
  );
}

export function MatchLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="page-shell max-w-3xl space-y-6 py-20" role="alert">
      <p className="t-eyebrow text-brick-700">Matching failed</p>
      <h1 className="text-heading-lg font-medium">We couldn&rsquo;t compute this match.</h1>
      <p className="border-l-2 border-brick-600 pl-4 text-[15px] leading-relaxed text-slate-700">{message}</p>
      <Button variant="ink" onClick={onRetry} leading={<RotateCw className="size-4" aria-hidden />}>
        Try again
      </Button>
    </div>
  );
}
