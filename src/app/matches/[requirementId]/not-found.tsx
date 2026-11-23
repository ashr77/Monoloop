import Link from 'next/link';

// Shown when notFound() is called for an unknown requirement id (Member 3).
export default function RequirementNotFound() {
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
