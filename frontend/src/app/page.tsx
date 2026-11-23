import Link from 'next/link';
import {
  Package,
  FileText,
  Cpu,
  ArrowLeftRight,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  CheckCircle2,
  Factory,
} from 'lucide-react';

export default function HomePage() {
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10 space-y-12">
      {/* Hero Section */}
      <section className="text-center max-w-3xl mx-auto space-y-5">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-semibold tracking-wide uppercase">
          <Factory className="w-4 h-4" /> TSUNAGU Hackathon 2026 Entry
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold text-slate-900 tracking-tight leading-tight">
          One Industry’s Surplus. <br />
          <span className="text-emerald-600">Another’s Opportunity.</span>
        </h1>
        <p className="text-lg text-slate-600 leading-relaxed">
          MONOLOOP is an explainable industrial surplus matching and resource exchange platform.
          We connect manufacturing offcuts, excess sheets, and industrial inventory with businesses
          seeking certified raw materials.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/supply"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium shadow-sm transition-all"
          >
            <Package className="w-5 h-5" />
            <span>Supplier Portal (Member 1)</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
          <Link
            href="/demand"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-medium shadow-sm transition-all"
          >
            <FileText className="w-5 h-5" />
            <span>Buyer Demand (Member 2)</span>
          </Link>
        </div>
      </section>

      {/* Core Highlights */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Sparkles className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">AI-Assisted Listing</h3>
          <p className="text-sm text-slate-600">
            Suppliers describe their offcuts in plain language. The AI extracts structured grades, dimensions,
            and quantities into an editable form requiring human review.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Cpu className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Explainable Matching</h3>
          <p className="text-sm text-slate-600">
            Rigorous technical verification: matches are not opaque AI guesses. Technical tolerances,
            dimensions, and material grades are verified with explainable score breakdowns.
          </p>
        </div>

        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-3">
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">Atomic Stock Invariant</h3>
          <p className="text-sm text-slate-600">
            Enforces available = total - reserved. Prevents double-booking across multi-supplier allocations
            using atomic PostgreSQL transactions.
          </p>
        </div>
      </section>

      {/* Architecture Modules Map */}
      <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm space-y-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Team Feature Architecture</h2>
          <p className="text-sm text-slate-500 mt-1">
            Feature-based ownership boundaries for TSUNAGU Hackathon 2026.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Member 1 */}
          <div className="border border-emerald-300 bg-emerald-50/40 p-5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-emerald-200 text-emerald-800">
                Member 1 (Active)
              </span>
              <Package className="w-5 h-5 text-emerald-600" />
            </div>
            <h4 className="font-bold text-slate-900">Supply Management & AI</h4>
            <p className="text-xs text-slate-600">
              Listing CRUD, inventory invariants, AI natural-language extraction, and shared DB foundation.
            </p>
            <div className="text-xs text-emerald-700 flex items-center gap-1 font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" /> Ready & Testable
            </div>
          </div>

          {/* Member 2 */}
          <div className="border border-slate-200 bg-slate-50 p-5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                Member 2
              </span>
              <FileText className="w-5 h-5 text-slate-500" />
            </div>
            <h4 className="font-bold text-slate-900">Demand Management</h4>
            <p className="text-xs text-slate-600">
              Buyer requirements, specifications input, tolerances, and shared navigation.
            </p>
            <div className="text-xs text-slate-500">Starts Today</div>
          </div>

          {/* Member 3 */}
          <div className="border border-slate-200 bg-slate-50 p-5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                Member 3
              </span>
              <Cpu className="w-5 h-5 text-slate-500" />
            </div>
            <h4 className="font-bold text-slate-900">Matching Engine</h4>
            <p className="text-xs text-slate-600">
              Explainable technical matching, multi-supplier allocation, economic feasibility ranking.
            </p>
            <div className="text-xs text-slate-500">Starts Tomorrow</div>
          </div>

          {/* Member 4 */}
          <div className="border border-slate-200 bg-slate-50 p-5 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase px-2 py-0.5 rounded bg-slate-200 text-slate-700">
                Member 4
              </span>
              <ArrowLeftRight className="w-5 h-5 text-slate-500" />
            </div>
            <h4 className="font-bold text-slate-900">Exchanges & Impact</h4>
            <p className="text-xs text-slate-600">
              Transaction completion, atomic reservation, and resource recovery analytics.
            </p>
            <div className="text-xs text-slate-500">Starts Tomorrow</div>
          </div>
        </div>
      </section>
    </div>
  );
}
