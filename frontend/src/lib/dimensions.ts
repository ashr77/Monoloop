// Requirement size for display. Since migration 00005 each axis is an exact value, a range
// (min, optional max) or unspecified, so length_mm etc. can be null. Same wording as the
// matching engine (backend/app/services/matching/rules.py AxisSpec.describe).

import type { MaterialRequirement } from '@/lib/types';

type Axis = 'length' | 'width' | 'thickness';
type SizedRequirement = Pick<MaterialRequirement, 'length_mm' | 'width_mm' | 'thickness_mm'> &
  Partial<Pick<MaterialRequirement,
    'length_min_mm' | 'length_max_mm' | 'width_min_mm' | 'width_max_mm' | 'thickness_min_mm' | 'thickness_max_mm'>>;

const n = (v: number) => Number(v).toLocaleString('en-US', { maximumFractionDigits: 2 });
const given = (v: number | null | undefined): v is number => typeof v === 'number' && Number.isFinite(v);

export function axisLabel(r: SizedRequirement, axis: Axis): string {
  const exact = r[`${axis}_mm`] as number | null | undefined;
  const min = r[`${axis}_min_mm`];
  const max = r[`${axis}_max_mm`];
  if (given(exact)) return n(exact);
  if (given(min) && given(max)) return `${n(min)}–${n(max)}`;
  if (given(min)) return `≥ ${n(min)}`;
  return 'any';
}

/** "2,400 × 1,200 × 2 mm", "2,000–2,500 × ≥ 1,000 × 2 mm", "any × any × 12 mm". */
export function requirementSize(r: SizedRequirement, separator = ' × '): string {
  return `${axisLabel(r, 'length')}${separator}${axisLabel(r, 'width')}${separator}${axisLabel(r, 'thickness')} mm`;
}
