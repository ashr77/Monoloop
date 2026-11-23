import type { QueryClient } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

/** Stock moved (listing edited, exchange requested/accepted/completed): refresh everything derived from it. */
export function invalidateInventory(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: queryKeys.listings.all }),
    qc.invalidateQueries({ queryKey: queryKeys.requirements.all }),
    qc.invalidateQueries({ queryKey: queryKeys.matches.all }),
    qc.invalidateQueries({ queryKey: queryKeys.exchanges.all }),
    qc.invalidateQueries({ queryKey: ['impact'] }),
  ]);
}
