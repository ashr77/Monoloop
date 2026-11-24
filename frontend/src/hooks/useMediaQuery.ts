'use client';

import { useEffect, useState } from 'react';

/** True while the media query matches. False on the server and before mount. */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const update = () => setMatches(mql.matches);
    update();
    mql.addEventListener('change', update);
    return () => mql.removeEventListener('change', update);
  }, [query]);
  return matches;
}

/** Wide enough for the dense data tables (Tailwind `lg`). */
export const WIDE_TABLES = '(min-width: 1024px)';
