// Instant loading state while the engine evaluates listings (Member 3).
export default function Loading() {
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
        <p className="font-mono text-xs uppercase tracking-[0.08em] text-[#1d1d1d]/50">Checking every listing against your specification…</p>
      </div>
    </div>
  );
}
