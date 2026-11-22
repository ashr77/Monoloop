import { ArrowLeftRight } from 'lucide-react';

export default function ExchangesPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto">
          <ArrowLeftRight className="w-6 h-6" />
        </div>
        <div className="inline-block px-3 py-1 bg-amber-100 text-amber-800 text-xs font-semibold rounded-full">
          Reserved for Member 4
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Exchange Transactions & Reservations</h1>
        <p className="text-slate-600 max-w-lg mx-auto text-sm leading-relaxed">
          This module is assigned to <strong>Member 4</strong>. Database tables (<code>exchanges</code>, <code>exchange_items</code>, <code>activity_logs</code>)
          and atomic reservation stored procedures have been initialized by Member 1.
        </p>
      </div>
    </div>
  );
}
