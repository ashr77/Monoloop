'use client';

// ============================================================================
// "Request exchange" action used on the match results page (Member 4).
// The server recomputes the allocation; this button only names the requirement.
// ============================================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';

interface Props {
  requirementId: string;
  buyerOrganizationId: string;
  className?: string;
}

export function RequestExchangeButton({ requirementId, buyerOrganizationId, className }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function submit() {
    setPending(true);
    setError(null);
    try {
      const res = await fetch('/api/exchanges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-organization-id': buyerOrganizationId },
        body: JSON.stringify({ requirement_id: requirementId, buyer_organization_id: buyerOrganizationId }),
      });
      const body = await res.json();
      if (!res.ok || !body.success) {
        setError(body.error ?? { code: 'ERROR', message: 'Could not create the exchange request.' });
        return;
      }
      router.push(`/exchanges?as=${buyerOrganizationId}&highlight=${body.data.id}`);
    } catch {
      setError({ code: 'NETWORK', message: 'Network error. Please try again.' });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button type="button" onClick={submit} disabled={pending} className={className} aria-busy={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" /> : null}
        {pending ? 'Sending request…' : 'Request exchange'}
        {!pending && <ArrowRight className="size-4" />}
      </button>
      {error && (
        <p role="alert" className="max-w-xs text-sm text-red-700">
          {error.message}{' '}
          {error.code === 'DUPLICATE_EXCHANGE' && (
            <Link href={`/exchanges?as=${buyerOrganizationId}`} className="font-semibold underline">
              View it
            </Link>
          )}
        </p>
      )}
    </div>
  );
}
