import { Cpu } from 'lucide-react';

interface Props {
  params: {
    requirementId: string;
  };
}

export default function MatchesPage({ params }: Props) {
  return (
    <div className="max-w-4xl mx-auto px-4 py-12">
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-4 shadow-sm">
        <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mx-auto">
          <Cpu className="w-6 h-6" />
        </div>
        <div className="inline-block px-3 py-1 bg-purple-100 text-purple-800 text-xs font-semibold rounded-full">
          Reserved for Member 3
        </div>
        <h1 className="text-2xl font-bold text-slate-900">Technical Compatibility & Matching Engine</h1>
        <p className="text-slate-600 max-w-lg mx-auto text-sm leading-relaxed">
          Matching proposals for Requirement ID: <code className="bg-slate-100 px-2 py-0.5 rounded text-xs">{params.requirementId}</code>.
          This module is assigned to <strong>Member 3</strong> to implement explainable technical matching and multi-supplier allocation.
        </p>
      </div>
    </div>
  );
}
