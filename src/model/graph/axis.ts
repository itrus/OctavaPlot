import { bool, clamp, oneOf, record, text, valuesOf } from '../sanitize';
import type { AxisBreak, AxisConfig, AxisScaleKind, BreakMark, NumberFormatKind, TickDirection } from '../types';

/** Limits of the axis settings (P). */
export const AXIS_LIMITS = {
  tickLengthPt: { min: 0, max: 60 },
  minorTicks: { min: 0, max: 9 },
  decimals: { min: 0, max: 10 },
  affixLength: 24,
  offsetPt: { min: 0, max: 120 },
} as const;

export const BREAK_MARKS: ReadonlyArray<{ value: BreakMark; label: string }> = [
  { value: 'doubleSlash', label: 'Double slash' },
  { value: 'slash', label: 'Slash' },
  { value: 'none', label: 'None' },
];

/** Most breaks an axis can have (spec 6.6: up to two). */
export const MAX_BREAKS = 2;

export const AXIS_SCALES: ReadonlyArray<{ value: AxisScaleKind; label: string; base: number | null }> = [
  { value: 'linear', label: 'Linear', base: null },
  { value: 'log10', label: 'Log (base 10)', base: 10 },
  { value: 'log2', label: 'Log (base 2)', base: 2 },
  { value: 'ln', label: 'Natural log (base e)', base: Math.E },
];

export const TICK_DIRECTIONS: ReadonlyArray<{ value: TickDirection; label: string }> = [
  { value: 'out', label: 'Out' },
  { value: 'in', label: 'In' },
  { value: 'both', label: 'Both' },
  { value: 'none', label: 'None' },
];

export const NUMBER_FORMATS: ReadonlyArray<{ value: NumberFormatKind; label: string }> = [
  { value: 'auto', label: 'Automatic' },
  { value: 'fixed', label: 'Decimal' },
  { value: 'scientific', label: 'Scientific' },
];

const SCALES = valuesOf(AXIS_SCALES);
const DIRECTIONS = valuesOf(TICK_DIRECTIONS);
const FORMATS = valuesOf(NUMBER_FORMATS);
const MARKS = valuesOf(BREAK_MARKS);

/** Breaks as they can be used: finite, from below to, sorted, not touching each other; at most two. */
export function sanitizeBreaks(raw: unknown, fallback: AxisBreak[]): AxisBreak[] {
  if (!Array.isArray(raw)) return fallback;
  const good = raw
    .map((b) => record(b))
    .filter((b) => typeof b.from === 'number' && typeof b.to === 'number' && Number.isFinite(b.from) && Number.isFinite(b.to) && b.from < b.to)
    .map((b) => ({ from: b.from as number, to: b.to as number }))
    .sort((a, b) => a.from - b.from);
  const out: AxisBreak[] = [];
  for (const b of good) if (out.length < MAX_BREAKS && (out.length === 0 || b.from > out[out.length - 1].to)) out.push(b);
  return out;
}

/** The base of a log scale, or null for a linear one. */
export const logBaseOf = (scale: AxisScaleKind): number | null => AXIS_SCALES.find((s) => s.value === scale)?.base ?? null;

/** Axis settings from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeAxis(axis: AxisConfig, base: AxisConfig): AxisConfig {
  const a = record(axis);
  const { offsetPt, tickLengthPt, minorTicks, decimals } = AXIS_LIMITS;
  return {
    ...axis,
    scale: oneOf(SCALES, a.scale, base.scale),
    reverse: bool(a.reverse, base.reverse),
    titleVisible: bool(a.titleVisible, base.titleVisible),
    titleBold: bool(a.titleBold, base.titleBold),
    tickBold: bool(a.tickBold, base.tickBold),
    titleOffsetPt: clamp(a.titleOffsetPt, offsetPt.min, offsetPt.max, base.titleOffsetPt),
    tickLabelOffsetPt: clamp(a.tickLabelOffsetPt, offsetPt.min, offsetPt.max, base.tickLabelOffsetPt),
    showMinorGrid: bool(a.showMinorGrid, base.showMinorGrid),
    scaleBar: bool(a.scaleBar, base.scaleBar),
    breaks: sanitizeBreaks(a.breaks, base.breaks),
    breakMark: oneOf(MARKS, a.breakMark, base.breakMark),
    minorTicks: Math.round(clamp(a.minorTicks, minorTicks.min, minorTicks.max, base.minorTicks)),
    tickDirection: oneOf(DIRECTIONS, a.tickDirection, base.tickDirection),
    tickLengthPt: clamp(a.tickLengthPt, tickLengthPt.min, tickLengthPt.max, base.tickLengthPt),
    numberFormat: oneOf(FORMATS, a.numberFormat, base.numberFormat),
    decimals: a.decimals === null ? null : typeof a.decimals === 'number' ? Math.round(clamp(a.decimals, decimals.min, decimals.max, 0)) : base.decimals,
    thousands: bool(a.thousands, base.thousands),
    prefix: text(a.prefix, AXIS_LIMITS.affixLength, base.prefix),
    suffix: text(a.suffix, AXIS_LIMITS.affixLength, base.suffix),
  };
}

/** Distance from the axis line to the start of the tick numbers: the part of the tick outside the axis line plus the extra distance set for them. */
export const numberStartPt = (a: Pick<AxisConfig, 'tickDirection' | 'tickLengthPt' | 'tickLabelOffsetPt'>): number =>
  (a.tickDirection === 'out' || a.tickDirection === 'both' ? a.tickLengthPt : 0) + a.tickLabelOffsetPt;
