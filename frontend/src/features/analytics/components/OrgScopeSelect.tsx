'use client';

import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import type { Organization } from '@/lib/types';
import { ToolbarSelect } from '@/components/ui';

export function OrgScopeSelect({ organizations, value }: { organizations: Organization[]; value: string | null }) {
  const router = useRouter();
  return (
    <ToolbarSelect
      label="Scope"
      icon={<Building2 className="size-4" />}
      value={value ?? 'ALL'}
      onChange={(e) => router.push(e.target.value === 'ALL' ? '/impact' : `/impact?org=${e.target.value}`)}
      className="max-w-[20rem]"
    >
      <option value="ALL">Whole platform</option>
      {organizations.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </ToolbarSelect>
  );
}
