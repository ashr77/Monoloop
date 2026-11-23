'use client';

// ============================================================================
// "Request exchange" action used on the match results page (Member 4).
// The server recomputes the allocation; this button only names the requirement.
// ============================================================================

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ArrowRight, Loader2 } from 'lucide-react';
import { useRequestExchange } from '@/hooks';
import { ApiError } from '@/lib/api/client';

interface Props {
  requirementId: string;
  buyerOrganizationId: string;
  className?: string;
}

export function RequestExchangeButton({ requirementId, buyerOrganizationId, className }: Props) {
  const router = useRouter();
  const requestExchange = useRequestExchange();
  const pending = requestExchange.isPending;
  const [error, setError] = useState<{ code: string; message: string } | null>(null);

  async function submit() {
    setError(null);
    try {
      const exchange = await requestExchange.mutateAsync({ requirementId, buyerOrganizationId });
      router.push(`/exchanges?as=${buyerOrganizationId}&highlight=${exchange.id}`);
    } catch (e) {
      setError(
        e instanceof ApiError
          ? { code: e.code, message: e.message }
          : { code: 'ERROR', message: 'Could not create the exchange request.' }
      );
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
