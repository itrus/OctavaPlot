import { bool, clamp, clampOrNull, hex, numberOrNull, oneOf, optionalHex, record, text, valuesOf } from '../sanitize';
import type { HeatCustomColours, HeatMark, HeatPalette, HeatmapOptions } from '../types';
import { HEAT_GRADIENTS, LEGACY_HEAT_PALETTES } from './heatGradients';

/** Settings of heat maps (spec 13). */

/** The palette list as the inspector shows it: one group per origin (in the order of HEAT_GRADIENTS), then the user's own colours. */
export const HEAT_PALETTE_GROUPS: ReadonlyArray<{ label: string; options: ReadonlyArray<{ value: HeatPalette; label: string }> }> = [
  ...(['GSEA', 'Bootstrap 5', 'Material Design'] as const).map((family) => ({
    label: family,
    options: HEAT_GRADIENTS.filter((p) => p.family === family).map((p) => ({ value: p.value as HeatPalette, label: p.diverging ? `${p.name} (diverging)` : p.name })),
  })),
  { label: 'Custom', options: [{ value: 'custom', label: 'Custom' }] },
];

export const HEAT_PALETTES: ReadonlyArray<{ value: HeatPalette; label: string }> = HEAT_PALETTE_GROUPS.flatMap((g) => g.options);

/** The own scale until the user picks colours: white to black, no middle. */
export const DEFAULT_CUSTOM_COLOURS: HeatCustomColours = { low: '#ffffff', mid: null, high: '#000000' };

/** Whether the scale has a middle at the centre value: GSEA, or an own scale with a middle colour. */
export function isDiverging(o: Pick<HeatmapOptions, 'palette' | 'customColours'>): boolean {
  return o.palette === 'custom' ? o.customColours.mid !== null : (HEAT_GRADIENTS.find((p) => p.value === o.palette)?.diverging ?? false);
}

/** The own colours from a file or a patch, slot by slot: a low or high that is not a colour falls back to `base`, a middle that is not a colour is none. */
function sanitizeCustomColours(raw: unknown, base: HeatCustomColours): HeatCustomColours {
  const c = record(raw);
  return { low: hex(c.low, base.low), mid: typeof c.mid === 'string' ? hex(c.mid, '') || null : null, high: hex(c.high, base.high) };
}

export const HEAT_LIMITS = {
  cellGapPt: { min: 0, max: 40 },
  decimals: { min: 0, max: 8 },
  steps: { min: 2, max: 12 },
  cellPt: { min: 2, max: 400 },
  groupSize: { min: 1, max: 1000 },
  groupGapPt: { min: 0, max: 80 },
  labelEvery: { min: 1, max: 1000 },
  barWidthPt: { min: 4, max: 80 },
  barLengthPct: { min: 20, max: 100 },
  barTicks: { min: 2, max: 12 },
} as const;

/** The marks of special cells, as the inspector lists them. */
export const HEAT_MARKS: ReadonlyArray<{ value: HeatMark; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'slash', label: 'A slash' },
  { value: 'cross', label: 'A cross' },
  { value: 'outline', label: 'An outline' },
];

/** What a cell can show: its label in the inspector and its name in the colour bar title and the tooltip (`lower` after "of"). */
export const HEAT_STATISTICS: ReadonlyArray<{ value: HeatmapOptions['summary']; label: string; name: string; lower: string }> = [
  { value: 'mean', label: 'The mean', name: 'Mean', lower: 'mean' },
  { value: 'median', label: 'The median', name: 'Median', lower: 'median' },
  { value: 'geomean', label: 'The geometric mean', name: 'Geometric mean', lower: 'geometric mean' },
  { value: 'sd', label: 'The SD (n - 1)', name: 'SD', lower: 'SD' },
  { value: 'sem', label: 'The SEM', name: 'SEM', lower: 'SEM' },
  { value: 'cv', label: 'The %CV', name: '%CV', lower: '%CV' },
  { value: 'n', label: 'The number of values (n)', name: 'n', lower: 'n' },
];

const PALETTES = valuesOf(HEAT_PALETTES);
const BYS: ReadonlyArray<HeatmapOptions['normalise']> = ['none', 'row', 'column'];
const METHODS: ReadonlyArray<HeatmapOptions['method']> = ['zscore', 'minmax', 'centre'];
const SUMMARIES = valuesOf(HEAT_STATISTICS);
const MARKS = valuesOf(HEAT_MARKS);

/** A whole number within the limits, or null when it is not a number (null stays null). */
const wholeOrNull = (v: unknown, lim: { min: number; max: number }, fallback: number | null): number | null => (v === null ? null : typeof v === 'number' && Number.isFinite(v) ? Math.round(clamp(v, lim.min, lim.max, lim.min)) : fallback);

/** Edges set by hand: finite numbers, ascending, without repeats, at most one fewer than the most steps. */
const sanitizeBreaks = (v: unknown, base: number[]): number[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)))].sort((a, b) => a - b).slice(0, HEAT_LIMITS.steps.max - 1) : base);

/** Heat map settings from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeHeatmap(raw: unknown, base: HeatmapOptions): HeatmapOptions {
  const h = record(raw);
  const { cellGapPt, decimals, cellPt, groupSize, groupGapPt, labelEvery, steps, barWidthPt, barLengthPct, barTicks } = HEAT_LIMITS;
  const lo = numberOrNull(h.min, base.min);
  const hi = numberOrNull(h.max, base.max);
  // A range that is not a range (lowest not below highest) is dropped: the colours then cover the values.
  const range = lo !== null && hi !== null && !(lo < hi) ? { min: null, max: null } : { min: lo, max: hi };
  return {
    palette: oneOf(PALETTES, typeof h.palette === 'string' ? LEGACY_HEAT_PALETTES[h.palette] ?? h.palette : h.palette, base.palette),
    reverse: bool(h.reverse, base.reverse),
    ...range,
    centre: numberOrNull(h.centre, base.centre),
    normalise: oneOf(BYS, h.normalise, base.normalise),
    method: oneOf(METHODS, h.method, base.method),
    summary: oneOf(SUMMARIES, h.summary, base.summary),
    showValues: bool(h.showValues, base.showValues),
    decimals: h.decimals === null ? null : typeof h.decimals === 'number' && Number.isFinite(h.decimals) ? Math.round(clamp(h.decimals, decimals.min, decimals.max, 0)) : base.decimals,
    cellGapPt: clamp(h.cellGapPt, cellGapPt.min, cellGapPt.max, base.cellGapPt),
    transpose: bool(h.transpose, base.transpose),
    colourbar: bool(h.colourbar, base.colourbar),
    missingColour: hex(h.missingColour, base.missingColour),
    steps: wholeOrNull(h.steps, steps, base.steps),
    breaks: sanitizeBreaks(h.breaks, base.breaks),
    missingMark: oneOf(MARKS, h.missingMark, base.missingMark),
    excludedColour: optionalHex(h.excludedColour, base.excludedColour),
    excludedMark: oneOf(MARKS, h.excludedMark, base.excludedMark),
    outsideColour: optionalHex(h.outsideColour, base.outsideColour),
    outsideMark: oneOf(MARKS, h.outsideMark, base.outsideMark),
    cellWidthPt: clampOrNull(h.cellWidthPt, cellPt.min, cellPt.max, base.cellWidthPt),
    cellHeightPt: clampOrNull(h.cellHeightPt, cellPt.min, cellPt.max, base.cellHeightPt),
    rowGroupSize: wholeOrNull(h.rowGroupSize, groupSize, base.rowGroupSize),
    colGroupSize: wholeOrNull(h.colGroupSize, groupSize, base.colGroupSize),
    groupGapPt: clamp(h.groupGapPt, groupGapPt.min, groupGapPt.max, base.groupGapPt),
    rowLabelEvery: Math.round(clamp(h.rowLabelEvery, labelEvery.min, labelEvery.max, base.rowLabelEvery)),
    colLabelEvery: Math.round(clamp(h.colLabelEvery, labelEvery.min, labelEvery.max, base.colLabelEvery)),
    barWidthPt: clamp(h.barWidthPt, barWidthPt.min, barWidthPt.max, base.barWidthPt),
    barLengthPct: clamp(h.barLengthPct, barLengthPct.min, barLengthPct.max, base.barLengthPct),
    barTicks: Math.round(clamp(h.barTicks, barTicks.min, barTicks.max, base.barTicks)),
    barTitle: h.barTitle === null ? null : typeof h.barTitle === 'string' ? text(h.barTitle, 80, '') : base.barTitle,
    customColours: sanitizeCustomColours(h.customColours, base.customColours),
  };
}
