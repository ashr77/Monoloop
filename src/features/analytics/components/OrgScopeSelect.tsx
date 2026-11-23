'use client';

import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import type { Organization } from '@/lib/types';

export function OrgScopeSelect({ organizations, value }: { organizations: Organization[]; value: string | null }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-2 bg-slate-100 p-1.5 rounded-xl border border-slate-200">
      <Building2 className="w-4 h-4 text-slate-500 ml-1.5" />
      <span className="sr-only">Scope</span>
      <select
        value={value ?? 'ALL'}
        onChange={(e) => router.push(e.target.value === 'ALL' ? '/impact' : `/impact?org=${e.target.value}`)}
        className="bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer pr-2 max-w-[18rem]"
      >
        <option value="ALL">Whole platform</option>
        {organizations.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </label>
  );
}
