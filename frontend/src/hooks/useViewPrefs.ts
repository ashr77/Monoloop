'use client';

// ============================================================================
// User-controlled presentation preferences (view mode, density, columns, sort).
// Stored per browser in localStorage; storage failures fall back to memory.
// Purely presentational: never affects which data the API returns.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';

const PREFIX = 'monoloop.ui.';

function read<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/** useState persisted to localStorage. Hydrates after mount to avoid SSR mismatches. */
export function usePersistentState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setValue(read(key, initial));
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    try {
      window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
    } catch {
      // Storage blocked: keep the preference for this session only.
    }
  }, [key, value, hydrated]);

  return [value, setValue] as const;
}

/**
 * Progressive disclosure for long client-side lists: show `pageSize` rows,
 * grow by `pageSize` on demand, reset when the filter signature changes.
 */
export function useIncremental<T>(items: T[], pageSize = 12, resetKey = '') {
  const [limit, setLimit] = useState(pageSize);
  useEffect(() => setLimit(pageSize), [resetKey, pageSize]);
  const visible = useMemo(() => items.slice(0, limit), [items, limit]);
  const more = useCallback(() => setLimit((l) => l + pageSize), [pageSize]);
  return { visible, more, shown: visible.length, total: items.length };
}

export type SortDir = 'asc' | 'desc';

/** Generic stable sort helper for tables. */
export function sortBy<T>(items: T[], get: (item: T) => number | string, dir: SortDir): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...items].sort((a, b) => {
    const x = get(a);
    const y = get(b);
    if (x < y) return -1 * sign;
    if (x > y) return 1 * sign;
    return 0;
  });
}
