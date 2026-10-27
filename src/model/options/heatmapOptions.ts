import { bool, clamp, hex, numberOrNull, oneOf, record, valuesOf } from '../sanitize';
import type { HeatCustomColours, HeatPalette, HeatmapOptions } from '../types';
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

export const HEAT_LIMITS = { cellGapPt: { min: 0, max: 40 }, decimals: { min: 0, max: 8 } } as const;

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

/** Heat map settings from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeHeatmap(raw: unknown, base: HeatmapOptions): HeatmapOptions {
  const h = record(raw);
  const { cellGapPt, decimals } = HEAT_LIMITS;
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
    customColours: sanitizeCustomColours(h.customColours, base.customColours),
  };
}
