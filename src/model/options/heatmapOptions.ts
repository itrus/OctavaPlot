import { bool, clamp, hex, numberOrNull, oneOf, record, valuesOf } from '../sanitize';
import type { HeatPalette, HeatmapOptions } from '../types';

/** Settings of heat maps (spec 13). */

export const HEAT_PALETTES: ReadonlyArray<{ value: HeatPalette; label: string; diverging: boolean }> = [
  { value: 'viridis', label: 'Viridis (dark purple to yellow)', diverging: false },
  { value: 'magma', label: 'Magma (black to pale yellow)', diverging: false },
  { value: 'blue', label: 'Blue and white', diverging: false },
  { value: 'greenred', label: 'Green, black, red (diverging)', diverging: true },
  { value: 'grayscale', label: 'Grayscale', diverging: false },
];

export const HEAT_LIMITS = { cellGapPt: { min: 0, max: 40 }, decimals: { min: 0, max: 8 } } as const;

const PALETTES = valuesOf(HEAT_PALETTES);
const BYS: ReadonlyArray<HeatmapOptions['normalise']> = ['none', 'row', 'column'];
const METHODS: ReadonlyArray<HeatmapOptions['method']> = ['zscore', 'minmax', 'centre'];
const SUMMARIES: ReadonlyArray<HeatmapOptions['summary']> = ['mean', 'median'];

/** Heat map settings from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeHeatmap(raw: unknown, base: HeatmapOptions): HeatmapOptions {
  const h = record(raw);
  const { cellGapPt, decimals } = HEAT_LIMITS;
  const lo = numberOrNull(h.min, base.min);
  const hi = numberOrNull(h.max, base.max);
  // A range that is not a range (lowest not below highest) is dropped: the colours then cover the values.
  const range = lo !== null && hi !== null && !(lo < hi) ? { min: null, max: null } : { min: lo, max: hi };
  return {
    palette: oneOf(PALETTES, h.palette, base.palette),
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
  };
}
