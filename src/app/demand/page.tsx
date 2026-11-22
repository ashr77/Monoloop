import Link from 'next/link';
import { FileText, ArrowRight } from 'lucide-react';

export default function DemandPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mx-auto">
          <FileText className="w-6 h-6" />
        </div>
        <div className="inline-block px-3 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded-full">
          Reserved for Member 2
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Buyer Demand Management</h1>
        <p className="text-slate-600 max-w-lg mx-auto text-sm leading-relaxed">
          This module is assigned to <strong>Member 2</strong>. The database schema (<code>requirements</code> table)
          and shared TypeScript contracts (<code>MaterialRequirement</code>) have been established by Member 1.
        </p>
        <div className="pt-4">
          <Link
            href="/supply"
            className="inline-flex items-center gap-2 text-sm text-emerald-600 hover:text-emerald-700 font-medium"
          >
            <span>Explore Member 1&apos;s Supply Management</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </div>
  );
}
