/**
 * Box plots and violins (spec 10): quartiles, whiskers and outliers, and a smoothed density. Pure and independent
 * of how anything is drawn.
 */

import type { SmoothingLevel, WhiskerRuleKind } from '../model/types';
import { meanOf, sdOf } from './moments';


/** The whisker rules: the label and, for the percentile rules, the two probabilities. */
export const WHISKER_RULES: ReadonlyArray<{ value: WhiskerRuleKind; label: string; p?: readonly [number, number] }> = [
  { value: 'minmax', label: 'Minimum to maximum' },
  { value: 'tukey', label: 'Tukey (1.5 × IQR)' },
  { value: 'p10_90', label: '10th to 90th percentile', p: [0.1, 0.9] },
  { value: 'p5_95', label: '5th to 95th percentile', p: [0.05, 0.95] },
  { value: 'p2_5_97_5', label: '2.5th to 97.5th percentile', p: [0.025, 0.975] },
  { value: 'p1_99', label: '1st to 99th percentile', p: [0.01, 0.99] },
];

/** Observations that count: finite numbers, sorted ascending. */
export function sortedFinite(values: ReadonlyArray<number | null | undefined>): number[] {
  const out: number[] = [];
  for (const v of values) if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  // A typed array sorts numerically without calling a comparison function for each pair.
  return Array.from(Float64Array.from(out).sort());
}

/**
 * Quantile by the type 6 rule (spec 10.1): the rank is (n+1)p, interpolated linearly between the neighbouring
 * values and held at the first and the last value outside ranks 1 to n. `sorted` must be ascending.
 */
export function quantile6(sorted: readonly number[], p: number): number {
  const n = sorted.length;
  if (n === 0) return NaN;
  const r = (n + 1) * p;
  if (r <= 1) return sorted[0];
  if (r >= n) return sorted[n - 1];
  const lo = Math.floor(r);
  return sorted[lo - 1] + (r - lo) * (sorted[lo] - sorted[lo - 1]);
}

export interface BoxSummary {
  n: number;
  min: number;
  max: number;
  q1: number;
  median: number;
  q3: number;
  mean: number;
  /** Ends of the whiskers: the lowest and the highest value the rule keeps. */
  whiskerLow: number;
  whiskerHigh: number;
  /** Observations beyond the whiskers: a classification of the display, never an exclusion. */
  outliers: number[];
  /** 'box' from 4 values; with fewer only the median and the range are drawn (spec 10.1 smallN). */
  shape: 'box' | 'range' | 'none';
}

/** The numbers of one box. `tukeyK` is the multiplier of the Tukey rule. */
export function boxSummary(values: ReadonlyArray<number | null | undefined>, rule: WhiskerRuleKind, tukeyK = 1.5): BoxSummary | null {
  const s = sortedFinite(values);
  const n = s.length;
  if (n === 0) return null;
  const q1 = quantile6(s, 0.25);
  const median = quantile6(s, 0.5);
  const q3 = quantile6(s, 0.75);
  const mean = meanOf(s);
  let low = s[0];
  let high = s[n - 1];
  const pct = WHISKER_RULES.find((r) => r.value === rule)?.p;
  if (rule === 'tukey') {
    // The whiskers end at the most extreme observed values inside the fences, not at the fences.
    const iqr = q3 - q1;
    const fenceLow = q1 - tukeyK * iqr;
    const fenceHigh = q3 + tukeyK * iqr;
    low = s.find((v) => v >= fenceLow) ?? s[0];
    high = [...s].reverse().find((v) => v <= fenceHigh) ?? s[n - 1];
  } else if (pct) {
    low = quantile6(s, pct[0]);
    high = quantile6(s, pct[1]);
  }
  const outliers = s.filter((v) => v < low || v > high);
  return { n, min: s[0], max: s[n - 1], q1, median, q3, mean, whiskerLow: low, whiskerHigh: high, outliers, shape: n >= 4 ? 'box' : 'range' };
}

/** Bandwidth multiplier of the three named smoothing levels (spec 10.2 P). */
export const SMOOTHING_FACTOR: Record<SmoothingLevel, number> = { light: 0.5, medium: 1, heavy: 2 };

/**
 * Gaussian kernel bandwidth h0 = 0.9 a n^(-1/5) with a = min(SD, IQR/1.34) (the positive one when only one is positive),
 * times the factor of the smoothing level. NaN when the values have no spread: constant data has no density.
 */
export function densityBandwidth(sorted: readonly number[], smoothing: SmoothingLevel): number {
  const n = sorted.length;
  if (n < 2) return NaN;
  const sd = sdOf(sorted, meanOf(sorted));
  const iqr = (quantile6(sorted, 0.75) - quantile6(sorted, 0.25)) / 1.34;
  const a = sd > 0 && iqr > 0 ? Math.min(sd, iqr) : Math.max(sd, iqr);
  if (!(a > 0)) return NaN;
  return 0.9 * a * n ** -0.2 * SMOOTHING_FACTOR[smoothing];
}

const VIOLIN_GRID = 256;
/** Bandwidths beyond which the Gaussian kernel is taken as zero (exp(-0.5 * 8.5^2) = 2e-16). */
const KERNEL_REACH = 8.5;

export interface DensityProfile {
  /** Positions along the value axis, ascending, and the density at each. */
  v: number[];
  f: number[];
  maxF: number;
  bandwidth: number;
  n: number;
}

interface DensityOptions {
  smoothing: SmoothingLevel;
  /** A bandwidth set by hand (data units); null = the automatic one of the smoothing level. */
  bandwidth: number | null;
  /** 'sample': the ends are the smallest and largest value; 'tails': the kernel is followed three bandwidths further. */
  trim: 'sample' | 'tails';
}

/** The smoothed density of the values, or null when it cannot be made (fewer than 3 values, or all equal). */
export function densityProfile(values: ReadonlyArray<number | null | undefined>, opts: DensityOptions): DensityProfile | null {
  const s = sortedFinite(values);
  const n = s.length;
  if (n < 3) return null;
  // All values equal: no density can be drawn, whatever bandwidth is set by hand.
  if (s[0] === s[n - 1]) return null;
  const h = opts.bandwidth !== null && opts.bandwidth > 0 ? opts.bandwidth : densityBandwidth(s, opts.smoothing);
  if (!(h > 0) || !Number.isFinite(h)) return null;
  const grid = VIOLIN_GRID;
  const lo = opts.trim === 'tails' ? s[0] - 3 * h : s[0];
  const hi = opts.trim === 'tails' ? s[n - 1] + 3 * h : s[n - 1];
  const norm = 1 / (n * h * Math.sqrt(2 * Math.PI));
  const v: number[] = [];
  const f: number[] = [];
  let maxF = 0;
  // A value more than KERNEL_REACH bandwidths away adds less than 2e-16 of the kernel peak: only the values in that window are summed.
  // The grid ascends, so both ends of the window only move forward.
  const reach = KERNEL_REACH * h;
  let first = 0;
  let past = 0;
  for (let i = 0; i < grid; i++) {
    const x = lo + ((hi - lo) * i) / (grid - 1);
    while (first < n && s[first] < x - reach) first++;
    while (past < n && s[past] <= x + reach) past++;
    let sum = 0;
    for (let k = first; k < past; k++) sum += Math.exp(-0.5 * ((x - s[k]) / h) ** 2);
    const d = sum * norm;
    v.push(x);
    f.push(d);
    if (d > maxF) maxF = d;
  }
  return { v, f, maxF, bandwidth: h, n };
}

type ViolinNormalisation = 'width' | 'area' | 'count';

/**
 * Half-widths (0 to 1 of the full half-width) of every violin on a common footing (spec 10.2): equal maximum width gives
 * each violin its own maximum of 1; equal area uses one density-to-width factor for all; sample count multiplies the
 * density by n before using one factor. A profile that is null stays null.
 */
export function normaliseProfiles(profiles: ReadonlyArray<DensityProfile | null>, mode: ViolinNormalisation): Array<number[] | null> {
  const scaled = (p: DensityProfile) => (mode === 'count' ? p.f.map((d) => d * p.n) : p.f);
  const common = Math.max(0, ...profiles.map((p) => (p ? Math.max(...scaled(p)) : 0)));
  return profiles.map((p) => {
    if (!p) return null;
    const top = mode === 'width' ? p.maxF : common;
    return top > 0 ? scaled(p).map((d) => d / top) : scaled(p).map(() => 0);
  });
}
