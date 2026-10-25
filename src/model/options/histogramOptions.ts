import { bool, clamp, numberOrNull, oneOf, record } from '../sanitize';
import type { HistogramOptions } from '../types';

/** Settings of histograms and cumulative distributions (spec 11). */

export const HISTOGRAM_LIMITS = { gapPct: { min: 0, max: 90 }, binWidth: { min: 1e-12, max: 1e12 } } as const;

export const FREQUENCIES: ReadonlyArray<{ value: HistogramOptions['frequency']; label: string }> = [
  { value: 'count', label: 'Count' },
  { value: 'fraction', label: 'Fraction' },
  { value: 'percent', label: 'Percent' },
  { value: 'density', label: 'Probability density' },
];

const FREQUENCY_VALUES = FREQUENCIES.map((f) => f.value);
const BINNINGS: ReadonlyArray<HistogramOptions['binning']> = ['auto', 'width'];
const CUMULATIVES: ReadonlyArray<HistogramOptions['cumulative']> = ['off', 'ascending', 'descending'];
const ARRANGEMENTS: ReadonlyArray<HistogramOptions['arrangement']> = ['overlay', 'side'];
const DIRECTIONS: ReadonlyArray<HistogramOptions['ecdfDirection']> = ['atOrBelow', 'above'];
const UNITS: ReadonlyArray<HistogramOptions['ecdfUnits']> = ['fraction', 'percent', 'count'];

/** Histogram settings from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeHistogram(raw: unknown, base: HistogramOptions): HistogramOptions {
  const h = record(raw);
  const { gapPct, binWidth } = HISTOGRAM_LIMITS;
  return {
    binning: oneOf(BINNINGS, h.binning, base.binning),
    // A bin width is positive (null = none set yet).
    binWidth: h.binWidth === null ? null : typeof h.binWidth === 'number' && h.binWidth > 0 ? clamp(h.binWidth, binWidth.min, binWidth.max, 1) : base.binWidth,
    firstEdge: numberOrNull(h.firstEdge, base.firstEdge),
    frequency: oneOf(FREQUENCY_VALUES, h.frequency, base.frequency),
    cumulative: oneOf(CUMULATIVES, h.cumulative, base.cumulative),
    arrangement: oneOf(ARRANGEMENTS, h.arrangement, base.arrangement),
    gapPct: clamp(h.gapPct, gapPct.min, gapPct.max, base.gapPct),
    ecdfDirection: oneOf(DIRECTIONS, h.ecdfDirection, base.ecdfDirection),
    ecdfUnits: oneOf(UNITS, h.ecdfUnits, base.ecdfUnits),
    ecdfSymbols: bool(h.ecdfSymbols, base.ecdfSymbols),
    ecdfExtend: bool(h.ecdfExtend, base.ecdfExtend),
  };
}


/** The title the Y axis has until the user writes one: what the height of the bars or the curve is. */
export function defaultYTitle(type: 'histogram' | 'ecdf', o: HistogramOptions): string {
  if (type === 'ecdf') {
    const unit = o.ecdfUnits === 'percent' ? 'Percent' : o.ecdfUnits === 'count' ? 'Count' : 'Fraction';
    return o.ecdfDirection === 'above' ? `${unit} above` : `Cumulative ${unit.toLowerCase()}`;
  }
  // A cumulative density is the cumulative fraction.
  const what = o.frequency === 'density' ? (o.cumulative === 'off' ? 'Probability density' : 'Fraction') : o.frequency === 'fraction' ? 'Fraction' : o.frequency === 'percent' ? 'Percent' : 'Count';
  return o.cumulative === 'off' ? what : `Cumulative ${what.toLowerCase()}`;
}
