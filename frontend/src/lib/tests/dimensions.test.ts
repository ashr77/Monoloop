import { describe, expect, it } from 'vitest';
import { requirementSize } from '@/lib/dimensions';

const exact = { length_mm: 2400, width_mm: 1200, thickness_mm: 2 };

describe('requirementSize', () => {
  it('formats exact sizes as before', () => {
    expect(requirementSize(exact)).toBe('2,400 × 1,200 × 2 mm');
    expect(requirementSize(exact, '×')).toBe('2,400×1,200×2 mm');
  });

  it('formats ranges, minimum-only and unspecified axes without crashing on null', () => {
    const range = {
      length_mm: null as unknown as number, width_mm: null as unknown as number, thickness_mm: 12,
      length_min_mm: 5, length_max_mm: 1200, width_min_mm: 600, width_max_mm: null,
    };
    expect(requirementSize(range)).toBe('5–1,200 × ≥ 600 × 12 mm');
    expect(requirementSize({ length_mm: null as unknown as number, width_mm: null as unknown as number,
      thickness_mm: null as unknown as number })).toBe('any × any × any mm');
  });
});
