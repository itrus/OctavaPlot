import { WHISKER_RULES, SMOOTHING_FACTOR } from '../../stats/distribution';
import { bool, clamp, oneOf, record } from '../sanitize';
import type { DistributionOptions, DistributionPoints } from '../types';

/** Settings of box plots and violins that are shared by all data sets (spec 10). */

export const DISTRIBUTION_LIMITS = { tukeyK: { min: 0.5, max: 5 }, width: { min: 0.1, max: 1 }, bandwidth: { min: 1e-12, max: 1e12 } } as const;

const WHISKERS = WHISKER_RULES.map((r) => r.value);
const LEVELS = Object.keys(SMOOTHING_FACTOR) as Array<DistributionOptions['smoothing']>;
const POINTS: readonly DistributionPoints[] = ['none', 'outside', 'all'];
const TRIMS: ReadonlyArray<DistributionOptions['trim']> = ['sample', 'tails'];
const NORMALISATIONS: ReadonlyArray<DistributionOptions['normalisation']> = ['width', 'area', 'count'];

/** Box plot and violin settings from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeDistribution(raw: unknown, base: DistributionOptions): DistributionOptions {
  const d = record(raw);
  const { tukeyK, width, bandwidth } = DISTRIBUTION_LIMITS;
  return {
    whisker: oneOf(WHISKERS, d.whisker, base.whisker),
    tukeyK: clamp(d.tukeyK, tukeyK.min, tukeyK.max, base.tukeyK),
    boxWidth: clamp(d.boxWidth, width.min, width.max, base.boxWidth),
    violinWidth: clamp(d.violinWidth, width.min, width.max, base.violinWidth),
    showMedian: bool(d.showMedian, base.showMedian),
    showMean: bool(d.showMean, base.showMean),
    points: oneOf(POINTS, d.points, base.points),
    smoothing: oneOf(LEVELS, d.smoothing, base.smoothing),
    // A bandwidth is a positive number (null = the automatic one); anything else keeps the current value.
    bandwidth: d.bandwidth === null ? null : typeof d.bandwidth === 'number' && d.bandwidth > 0 ? clamp(d.bandwidth, bandwidth.min, bandwidth.max, 1) : base.bandwidth,
    trim: oneOf(TRIMS, d.trim, base.trim),
    normalisation: oneOf(NORMALISATIONS, d.normalisation, base.normalisation),
    showQuartiles: bool(d.showQuartiles, base.showQuartiles),
  };
}
