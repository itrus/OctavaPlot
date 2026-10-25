import { bool, clamp, clampOrNull, numberOrNull, oneOf, optionalHex, record, text, valuesOf } from '../sanitize';
import type { BarLabelMode, BarLabels, BarLayout, Id } from '../types';

/** Settings of the columns of a column chart: the space between them, their baseline and the labels above them. */

export const BAR_LIMITS = { spacingPct: { min: 0, max: 500 } } as const;

/** The automatic spacing in percent of a column's width: gap between columns 3/7 and the outer margins 2/7 (the old band padding 0.3 and 0.2). */
export const AUTO_BAR_GAP_PCT = 300 / 7;
export const AUTO_BAR_OUTER_PCT = 200 / 7;

/** Column spacing and baseline from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeBars(raw: unknown, base: BarLayout): BarLayout {
  const b = record(raw);
  const { min, max } = BAR_LIMITS.spacingPct;
  return {
    gapPct: clampOrNull(b.gapPct, min, max, base.gapPct),
    beforePct: clampOrNull(b.beforePct, min, max, base.beforePct),
    afterPct: clampOrNull(b.afterPct, min, max, base.afterPct),
    baseline: numberOrNull(b.baseline, base.baseline),
  };
}

/**
 * The d3 band padding that gives these spacings (percent of a column's width): the share of a step between two columns,
 * the outer padding on each side, and how it is shared between the left and the right. All automatic = the old look exactly.
 */
export function bandPadding(bars: BarLayout): { inner: number; outer: number; align: number } {
  if (bars.gapPct === null && bars.beforePct === null && bars.afterPct === null) return { inner: 0.3, outer: 0.2, align: 0.5 };
  const g = bars.gapPct ?? AUTO_BAR_GAP_PCT;
  const before = bars.beforePct ?? AUTO_BAR_OUTER_PCT;
  const after = bars.afterPct ?? AUTO_BAR_OUTER_PCT;
  const round = (v: number) => Number(v.toPrecision(12));
  return {
    inner: round(g / (100 + g)),
    outer: round((before + after) / (2 * (100 + g))),
    align: before + after > 0 ? round(before / (before + after)) : 0.5,
  };
}

export const BAR_LABEL_MODES: ReadonlyArray<{ value: BarLabelMode; label: string }> = [
  { value: 'none', label: 'Nothing' },
  { value: 'value', label: 'Plotted value' },
  { value: 'n', label: 'Sample size' },
];

const LABEL_MODES = valuesOf(BAR_LABEL_MODES);

/** Labels on bars from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeBarLabels(raw: unknown, base: BarLabels): BarLabels {
  const b = record(raw);
  return {
    show: oneOf(LABEL_MODES, b.show, base.show),
    decimals: b.decimals === null ? null : typeof b.decimals === 'number' && Number.isFinite(b.decimals) ? Math.round(clamp(b.decimals, 0, 10, 0)) : base.decimals,
    thousands: bool(b.thousands, base.thousands),
    prefix: text(b.prefix, 24, base.prefix),
    suffix: text(b.suffix, 24, base.suffix),
    sizePt: clamp(b.sizePt, 4, 48, base.sizePt),
    color: optionalHex(b.color, base.color),
  };
}

/**
 * Older files gave each data set its own space before it (a percentage of the normal space between columns). That is now
 * one setting, Space between columns. When every data set after the first had the same space, it is folded into that
 * setting; when they differed, they are dropped and the note says so. `ids` are the data sets in the order drawn.
 */
export function foldGroupGaps(raw: unknown, ids: readonly Id[], bars: BarLayout): { bars: BarLayout; note: string | null } {
  if (typeof raw !== 'object' || raw === null || ids.length < 2) return { bars, note: null };
  const gaps = raw as Record<string, unknown>;
  const pct = (id: Id): number => (typeof gaps[id] === 'number' && Number.isFinite(gaps[id] as number) ? (gaps[id] as number) : 100);
  const first = pct(ids[1]);
  const same = ids.slice(1).every((id) => pct(id) === first);
  if (same && first === 100) return { bars, note: null };
  if (!same) return { bars, note: 'The spaces before single data sets are no longer a setting; they were dropped. Use Space between columns.' };
  const { min, max } = BAR_LIMITS.spacingPct;
  const gapPct = Math.min(max, Math.max(min, Math.round((bars.gapPct ?? AUTO_BAR_GAP_PCT) * first) / 100));
  return { bars: { ...bars, gapPct }, note: 'The space before each data set was added to Space between columns.' };
}
