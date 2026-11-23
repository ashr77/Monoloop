// Loading, empty and error states for the matches pages (Member 3).
import Link from 'next/link';
import { ArrowLeft, RotateCw } from 'lucide-react';
import { t } from './theme';

export function MatchSkeleton({ label = 'Checking every listing against your specification…' }: { label?: string }) {
  return (
    <div className="min-h-[calc(100vh-9rem)] bg-[#f3f1e5]">
      <div className="mx-auto max-w-7xl animate-pulse space-y-10 px-4 py-14 sm:px-6 lg:px-8" aria-busy="true" aria-label="Finding compatible surplus">
        <div className="space-y-4">
          <div className="h-3 w-48 bg-[#1d1d1d]/10" />
          <div className="h-14 w-2/3 bg-[#1d1d1d]/10" />
        </div>
        <div className="grid grid-cols-2 gap-px bg-[#d8d4bb] lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-white/70" />
          ))}
        </div>
        <div className="h-12 bg-[#1d1d1d]/10" />
        <div className="h-64 bg-white/70" />
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#1d1d1d]/50">{label}</p>
      </div>
    </div>
  );
}

export function RequirementNotFound() {
  return (
    <div className="min-h-[calc(100vh-9rem)] bg-[#f3f1e5] text-[#1d1d1d]">
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-20 sm:px-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#1d1d1d]/60">404 · Requirement</p>
        <h1 className="text-4xl font-medium tracking-[-0.04em]">This requirement doesn&rsquo;t exist.</h1>
        <p className="text-base text-[#1d1d1d]/60">It may have been removed, or the link is incomplete.</p>
        <Link href="/demand" className="inline-flex h-11 items-center bg-[#1d1d1d] px-6 text-sm font-medium text-white transition-colors hover:bg-[#8b5e34]">
          Back to requirements
        </Link>
      </div>
    </div>
  );
}

export function RequirementNotOpen({ status }: { status: string }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-20 sm:px-6">
      <p className={`${t.eyebrow} ${t.muted}`}>Matching unavailable</p>
      <h1 className={`text-4xl ${t.display}`}>This requirement is {status.toLowerCase()}.</h1>
      <p className={`text-base ${t.muted}`}>
        Only open requirements are matched against surplus stock. Reopen it from the demand dashboard to see compatible suppliers.
      </p>
      <Link href="/demand" className={t.btnInk}>
        <ArrowLeft className="size-4" /> Back to requirements
      </Link>
    </div>
  );
}

export function MatchLoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-20 sm:px-6" role="alert">
      <p className={`${t.eyebrow} text-[#b42318]`}>Matching failed</p>
      <h1 className={`text-4xl ${t.display}`}>We couldn&rsquo;t compute this match.</h1>
      <p className={`text-base ${t.muted}`}>{message}</p>
      <button type="button" onClick={onRetry} className={t.btnInk}>
        <RotateCw className="size-4" /> Try again
      </button>
    </div>
  );
}
