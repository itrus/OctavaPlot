import { bool, clamp, oneOf, record, text, valuesOf } from '../sanitize';
import type { PieLabelMode, PieOptions } from '../types';

/** Settings of pies and doughnuts (spec 14). */

export const PIE_LIMITS = { startAngle: { min: -360, max: 360 }, hole: { min: 0, max: 0.9 }, percentDigits: { min: 0, max: 4 } } as const;

export const PIE_LABEL_MODES: ReadonlyArray<{ value: PieLabelMode; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'name', label: 'Name' },
  { value: 'value', label: 'Count' },
  { value: 'percent', label: 'Percent' },
  { value: 'name-percent', label: 'Name and percent' },
  { value: 'value-percent', label: 'Count and percent' },
];

const MODES = valuesOf(PIE_LABEL_MODES);
const DIRECTIONS: ReadonlyArray<PieOptions['direction']> = ['clockwise', 'counterclockwise'];

/** Pie settings from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizePie(raw: unknown, base: PieOptions): PieOptions {
  const p = record(raw);
  const { startAngle, hole, percentDigits } = PIE_LIMITS;
  return {
    startAngle: clamp(p.startAngle, startAngle.min, startAngle.max, base.startAngle),
    direction: oneOf(DIRECTIONS, p.direction, base.direction),
    hole: clamp(p.hole, hole.min, hole.max, base.hole),
    labels: oneOf(MODES, p.labels, base.labels),
    percentDigits: Math.round(clamp(p.percentDigits, percentDigits.min, percentDigits.max, base.percentDigits)),
    showTotal: bool(p.showTotal, base.showTotal),
    totalPrefix: text(p.totalPrefix, 24, base.totalPrefix),
  };
}
