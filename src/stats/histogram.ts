/**
 * Histograms and empirical cumulative distributions (spec 11.1, 11.2). Pure and independent of how anything is drawn.
 */

import { sortedFinite } from './distribution';

/** A "nice" width: the next of 1, 2, 2.5, 5, 10 times a power of ten at or above `w` (spec 11.1 P). */
export function niceWidth(w: number): number {
  if (!(w > 0) || !Number.isFinite(w)) return 1;
  const pow = 10 ** Math.floor(Math.log10(w));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * pow >= w * (1 - 1e-12)) return m * pow;
  return 10 * pow;
}

/**
 * The bin width the automatic rule picks: about log2(n) + 1 bins over the range, rounded up to a nice width. A constant
 * sample (no range) gets a width from the size of the value, or 1 for zero.
 */
export function autoBinWidth(sorted: readonly number[]): number {
  const n = sorted.length;
  if (n === 0) return 1;
  const range = sorted[n - 1] - sorted[0];
  if (!(range > 0)) {
    const v = Math.abs(sorted[0]);
    return v > 0 ? 10 ** Math.floor(Math.log10(v)) : 1;
  }
  const bins = Math.max(1, Math.ceil(Math.log2(n) + 1));
  return niceWidth(range / bins);
}

const clean = (v: number): number => Number(v.toPrecision(12));

/**
 * Equal-width bin edges that cover the values: the first edge a multiple of the width (or of `anchor`, an edge that is
 * known to be one) not above the smallest value, the last far enough to include the largest. At most `maxBins` bins.
 */
export function binEdges(sorted: readonly number[], width: number, anchor: number | null = null, maxBins = 2000): number[] {
  if (sorted.length === 0 || !(width > 0)) return [0, 1];
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const origin = anchor ?? 0;
  let first = origin + Math.floor((lo - origin) / width + 1e-9) * width;
  if (first > lo) first -= width;
  const edges = [clean(first)];
  while (edges[edges.length - 1] <= hi + width * 1e-9 && edges.length <= maxBins) edges.push(clean(first + edges.length * width));
  // The last edge must lie above the largest value, unless the largest is exactly on it (the final bin includes its edge).
  if (edges.length < 2) edges.push(clean(first + width));
  return edges;
}

interface BinCounts {
  /** Count in each bin: edges.length - 1 of them. */
  counts: number[];
  /** Values outside the edges (left out and counted, never folded into the end bins). */
  outside: number;
}

/**
 * Count the values into bins [left, right), the last bin also taking its right edge when `finalInclusive` (spec 11.1).
 */
export function countBins(sorted: readonly number[], edges: readonly number[], finalInclusive = true): BinCounts {
  const bins = edges.length - 1;
  const counts = new Array<number>(Math.max(0, bins)).fill(0);
  let outside = 0;
  for (const v of sorted) {
    if (v < edges[0] || v > edges[bins] || (v === edges[bins] && !finalInclusive)) {
      outside++;
      continue;
    }
    // Binary search for the last edge not above v.
    let lo = 0;
    let hi = bins - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (edges[mid] <= v) lo = mid;
      else hi = mid - 1;
    }
    counts[lo]++;
  }
  return { counts, outside };
}

type Frequency = 'count' | 'fraction' | 'percent' | 'density';
type CumulativeMode = 'off' | 'ascending' | 'descending';

/**
 * Bar heights from counts: counts, fractions or percents of `total` (all the values, so a histogram that leaves out
 * its tails does not pretend to show the whole sample), or the probability density (count / (total x bin width)).
 * A cumulative histogram of a density is the cumulative fraction: densities integrate, they are not summed.
 */
export function binHeights(counts: readonly number[], edges: readonly number[], total: number, frequency: Frequency, cumulative: CumulativeMode): number[] {
  const f = total > 0 ? total : 1;
  const widths = counts.map((_, i) => edges[i + 1] - edges[i]);
  let heights: number[];
  if (cumulative !== 'off') {
    let run = 0;
    const order = cumulative === 'ascending' ? counts.map((_, i) => i) : counts.map((_, i) => counts.length - 1 - i);
    const cum = new Array<number>(counts.length).fill(0);
    for (const i of order) {
      run += counts[i];
      cum[i] = run;
    }
    heights = frequency === 'count' ? cum : frequency === 'percent' ? cum.map((c) => (100 * c) / f) : cum.map((c) => c / f);
  } else {
    heights = frequency === 'count' ? [...counts] : frequency === 'percent' ? counts.map((c) => (100 * c) / f) : frequency === 'fraction' ? counts.map((c) => c / f) : counts.map((c, i) => c / (f * widths[i]));
  }
  return heights;
}

type EcdfDirection = 'atOrBelow' | 'above';

interface EcdfStep {
  x: number;
  /** The share of the values at or below x (or above it, descending), as a fraction. */
  f: number;
  /** How many values are at x: ties are one jump of this many. */
  ties: number;
}

/**
 * The empirical cumulative distribution: one step at each distinct value, ties combined into one jump (spec 11.2).
 * At-or-below: F(x) = count(y <= x) / n; above: 1 - F(x) (strictly greater than x).
 */
export function ecdfSteps(values: ReadonlyArray<number | null | undefined>, direction: EcdfDirection): { steps: EcdfStep[]; n: number } {
  const s = sortedFinite(values);
  const n = s.length;
  const steps: EcdfStep[] = [];
  let i = 0;
  while (i < n) {
    let j = i;
    while (j < n && s[j] === s[i]) j++;
    const atOrBelow = j / n;
    steps.push({ x: s[i], f: direction === 'atOrBelow' ? atOrBelow : 1 - atOrBelow, ties: j - i });
    i = j;
  }
  return { steps, n };
}
