import { Activity } from 'lucide-react';

export default function ImpactPage() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto">
          <Activity className="w-6 h-6" />
        </div>
        <div className="inline-block px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-full">
          Reserved for Member 4
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Resource Recovery & Impact Analytics</h1>
        <p className="text-slate-600 max-w-lg mx-auto text-sm leading-relaxed">
          This dashboard is assigned to <strong>Member 4</strong> to display CO2 savings, material diversion statistics,
          and economic value recovered from completed exchanges.
        </p>
      </div>
    </div>
  );
}
