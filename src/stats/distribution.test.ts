import { describe, expect, it } from 'vitest';
import { boxSummary, densityBandwidth, densityProfile, normaliseProfiles, quantile6, sortedFinite, autoBinWidth, binEdges, binHeights, countBins, ecdfSteps, niceWidth } from './distribution';
import { sanitizeHistogram } from '../model/options/histogramOptions';
import { createChart } from '../model/defaults';

describe('type 6 quantiles (spec 22.1)', () => {
  it('gives the quartiles of 1 to 8', () => {
    const s = [1, 2, 3, 4, 5, 6, 7, 8];
    expect(quantile6(s, 0.25)).toBe(2.25);
    expect(quantile6(s, 0.5)).toBe(4.5);
    expect(quantile6(s, 0.75)).toBe(6.75);
  });
  it('holds at the ends outside ranks 1 to n', () => {
    expect(quantile6([3, 4, 9], 0.01)).toBe(3);
    expect(quantile6([3, 4, 9], 0.99)).toBe(9);
    expect(quantile6([], 0.5)).toBeNaN();
  });
  it('leaves out what is not a number', () => {
    expect(sortedFinite([3, null, 1, undefined, NaN, Infinity, 2])).toEqual([1, 2, 3]);
  });
});

describe('box summaries', () => {
  const data = [1, 2, 3, 4, 5, 6, 7, 8, 30];
  it('ends Tukey whiskers at the observed values inside the fences', () => {
    const b = boxSummary(data, 'tukey')!;
    expect([b.q1, b.q3]).toEqual([2.5, 7.5]);
    expect(b.whiskerHigh).toBe(8);
    expect(b.whiskerLow).toBe(1);
    expect(b.outliers).toEqual([30]);
    expect(b.max).toBe(30);
  });
  it('puts the upper Tukey fence at Q3 + 1.5 IQR = 15: a value of 15 is inside it and the next value above is not', () => {
    // 1 to 8 and one more value: Q1 is 2.5 and Q3 is 7.5 whatever the ninth value is, so the fence is 7.5 + 1.5 * 5 = 15.
    const at = boxSummary([1, 2, 3, 4, 5, 6, 7, 8, 15], 'tukey')!;
    expect([at.q1, at.q3]).toEqual([2.5, 7.5]);
    expect(at.whiskerHigh).toBe(15);
    expect(at.outliers).toEqual([]);
    const over = boxSummary([1, 2, 3, 4, 5, 6, 7, 8, 15.000001], 'tukey')!;
    expect(over.whiskerHigh).toBe(8);
    expect(over.outliers).toEqual([15.000001]);
  });
  it('draws the whole range with the minimum to maximum rule, and no outliers', () => {
    const b = boxSummary(data, 'minmax')!;
    expect([b.whiskerLow, b.whiskerHigh, b.outliers.length]).toEqual([1, 30, 0]);
  });
  it('uses percentiles by the same quantile rule', () => {
    const b = boxSummary([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 'p10_90')!;
    // n = 10: rank 1.1 and 9.9 of 11 positions.
    expect(b.whiskerLow).toBeCloseTo(1.1, 10);
    expect(b.whiskerHigh).toBeCloseTo(9.9, 10);
    expect(b.outliers).toEqual([1, 10]);
  });
  it('draws only the median and the range below 4 values, and nothing without values', () => {
    expect(boxSummary([1, 5, 9], 'minmax')!.shape).toBe('range');
    expect(boxSummary([1, 5, 9, 10], 'minmax')!.shape).toBe('box');
    expect(boxSummary([], 'minmax')).toBeNull();
    expect(boxSummary([null, null], 'tukey')).toBeNull();
  });
  it('reports the mean and the count', () => {
    const b = boxSummary([2, 4, 6, 8], 'minmax')!;
    expect([b.n, b.mean, b.median]).toEqual([4, 5, 5]);
  });
});

describe('violin densities', () => {
  const values = [1, 2, 2, 3, 3, 3, 4, 4, 5, 9];
  it('uses 0.9 a n^-0.2 with the smaller of the SD and IQR/1.34, times the smoothing factor', () => {
    const s = sortedFinite(values);
    const mean = s.reduce((a, b) => a + b, 0) / s.length;
    const sd = Math.sqrt(s.reduce((a, b) => a + (b - mean) ** 2, 0) / (s.length - 1));
    const iqr = (quantile6(s, 0.75) - quantile6(s, 0.25)) / 1.34;
    const h0 = 0.9 * Math.min(sd, iqr) * s.length ** -0.2;
    expect(densityBandwidth(s, 'medium')).toBeCloseTo(h0, 12);
    expect(densityBandwidth(s, 'light')).toBeCloseTo(h0 / 2, 12);
    expect(densityBandwidth(s, 'heavy')).toBeCloseTo(h0 * 2, 12);
  });
  it('has a bandwidth for values of any magnitude (the squares of the deviations of values near 1e-200 underflow)', () => {
    const tiny = [1e-200, 2e-200, 3e-200, 4e-200, 5e-200];
    const h = densityBandwidth(tiny, 'medium');
    expect(h).toBeGreaterThan(0);
    expect(h / densityBandwidth(tiny.map((v) => v * 1e200), 'medium')).toBeCloseTo(1e-200, 0);
  });
  it('has no density for constant data or fewer than 3 values', () => {
    expect(densityProfile([4, 4, 4, 4], { smoothing: 'medium', bandwidth: null, trim: 'sample' })).toBeNull();
    expect(densityProfile([1, 2], { smoothing: 'medium', bandwidth: null, trim: 'sample' })).toBeNull();
  });
  it('ends at the sample minimum and maximum unless the tails are asked for', () => {
    const cut = densityProfile(values, { smoothing: 'medium', bandwidth: null, trim: 'sample' })!;
    expect([cut.v[0], cut.v[cut.v.length - 1]]).toEqual([1, 9]);
    const tails = densityProfile(values, { smoothing: 'medium', bandwidth: null, trim: 'tails' })!;
    expect(tails.v[0]).toBeCloseTo(1 - 3 * tails.bandwidth, 10);
    expect(tails.v[tails.v.length - 1]).toBeCloseTo(9 + 3 * tails.bandwidth, 10);
  });
  it('integrates to about 1 over the tails, and a manual bandwidth overrides the level', () => {
    const p = densityProfile(values, { smoothing: 'medium', bandwidth: null, trim: 'tails' })!;
    let area = 0;
    for (let i = 1; i < p.v.length; i++) area += ((p.f[i] + p.f[i - 1]) / 2) * (p.v[i] - p.v[i - 1]);
    expect(area).toBeGreaterThan(0.95);
    expect(area).toBeLessThan(1.001);
    expect(densityProfile(values, { smoothing: 'light', bandwidth: 0.7, trim: 'sample' })!.bandwidth).toBe(0.7);
  });
  it('smooths more with a higher level', () => {
    const peak = (s: 'light' | 'medium' | 'heavy') => densityProfile(values, { smoothing: s, bandwidth: null, trim: 'sample' })!.maxF;
    expect(peak('light')).toBeGreaterThan(peak('medium'));
    expect(peak('medium')).toBeGreaterThan(peak('heavy'));
  });
  it('makes widths on a common footing', () => {
    const wide = densityProfile(values, { smoothing: 'medium', bandwidth: null, trim: 'sample' })!;
    const narrow = densityProfile([4.8, 5, 5, 5.1, 5.2, 5.2], { smoothing: 'medium', bandwidth: null, trim: 'sample' })!;
    const eachMax = (w: number[] | null) => Math.max(...w!);
    const byWidth = normaliseProfiles([wide, narrow, null], 'width');
    expect([eachMax(byWidth[0]), eachMax(byWidth[1]), byWidth[2]]).toEqual([1, 1, null]);
    const byArea = normaliseProfiles([wide, narrow], 'area');
    expect(Math.max(eachMax(byArea[0]), eachMax(byArea[1]))).toBe(1);
    expect(eachMax(byArea[0])).toBeLessThan(1);
    const byCount = normaliseProfiles([wide, narrow], 'count');
    expect(Math.max(eachMax(byCount[0]), eachMax(byCount[1]))).toBe(1);
  });
});

describe('constant samples', () => {
  it('have no density whatever the bandwidth', () => {
    expect(densityProfile([4, 4, 4, 4], { smoothing: 'medium' as never, bandwidth: 1, trim: 'tails' })).toBeNull();
  });
});

describe('box mean', () => {
  it('is the stable mean', () => {
    expect(boxSummary([-1e16, 1, 1e16], 'tukey')?.mean).toBeCloseTo(1 / 3, 10);
    expect(boxSummary([1e308, 1e308, 1e308, 1e308], 'tukey')?.mean).toBe(1e308);
  });
});

describe('automatic bins', () => {
  it('rounds a width up to 1, 2, 2.5, 5 or 10 times a power of ten', () => {
    expect(niceWidth(0.8)).toBe(1);
    expect(niceWidth(1.3)).toBe(2);
    expect(niceWidth(2.2)).toBe(2.5);
    expect(niceWidth(2.6)).toBe(5);
    expect(niceWidth(7)).toBe(10);
    expect(niceWidth(0.021)).toBe(0.025);
    expect(niceWidth(250)).toBe(250);
    expect(niceWidth(0)).toBe(1);
  });
  it('starts from about log2(n) + 1 bins over the range', () => {
    // 8 values over 0..7: ceil(log2(8) + 1) = 4 bins, width 7/4 = 1.75, rounded up to 2.
    expect(autoBinWidth([0, 1, 2, 3, 4, 5, 6, 7])).toBe(2);
    // 100 values over 0..99: 8 bins, width 12.4, rounded up to 20.
    expect(autoBinWidth(Array.from({ length: 100 }, (_, i) => i))).toBe(20);
  });
  it('gives constant data a width from the size of the value, never a zero range', () => {
    expect(autoBinWidth([5, 5, 5])).toBe(1);
    expect(autoBinWidth([250, 250])).toBe(100);
    expect(autoBinWidth([0, 0])).toBe(1);
    expect(autoBinWidth([])).toBe(1);
  });
  it('anchors the first edge at a multiple of the width and covers the largest value', () => {
    expect(binEdges([1.2, 4.9], 2)).toEqual([0, 2, 4, 6]);
    expect(binEdges([0, 1, 2, 3], 1)).toEqual([0, 1, 2, 3, 4]);
    expect(binEdges([3, 3], 1)).toEqual([3, 4]);
    expect(binEdges([-3.5, -0.2], 1)).toEqual([-4, -3, -2, -1, 0]);
    expect(binEdges([1, 9], 2, 1)).toEqual([1, 3, 5, 7, 9, 11]);
  });
});

describe('counting into bins (spec 22.1)', () => {
  it('counts 0, 1, 2, 3 into edges 0, 1, 2, 3 as 1, 1, 2 with the last edge included', () => {
    const r = countBins([0, 1, 2, 3], [0, 1, 2, 3]);
    expect(r.counts).toEqual([1, 1, 2]);
    expect(r.outside).toBe(0);
  });
  it('puts a value on an inner edge into the bin to its right', () => {
    expect(countBins([1, 1, 2], [0, 1, 2, 3]).counts).toEqual([0, 2, 1]);
  });
  it('leaves out and counts values outside the edges, instead of folding them into the end bins', () => {
    const r = countBins([-1, 0, 1, 5, 9], [0, 2, 4]);
    expect(r.counts).toEqual([2, 0]);
    expect(r.outside).toBe(3);
  });
});

describe('bar heights', () => {
  const counts = [1, 1, 2];
  const edges = [0, 1, 2, 3];
  it('are counts, fractions, percents or densities of all the values', () => {
    expect(binHeights(counts, edges, 4, 'count', 'off')).toEqual([1, 1, 2]);
    expect(binHeights(counts, edges, 4, 'fraction', 'off')).toEqual([0.25, 0.25, 0.5]);
    expect(binHeights(counts, edges, 4, 'percent', 'off')).toEqual([25, 25, 50]);
    // Unequal widths: the area under the density is the share of the values.
    const dens = binHeights([2, 2], [0, 1, 4], 4, 'density', 'off');
    expect(dens[0] * 1 + dens[1] * 3).toBeCloseTo(1, 12);
  });
  it('show the share of the whole sample even when the tails are left out', () => {
    expect(binHeights([1, 1], [0, 1, 2], 10, 'fraction', 'off')).toEqual([0.1, 0.1]);
  });
  it('add up for a cumulative histogram, upwards or downwards', () => {
    expect(binHeights(counts, edges, 4, 'count', 'ascending')).toEqual([1, 2, 4]);
    expect(binHeights(counts, edges, 4, 'count', 'descending')).toEqual([4, 3, 2]);
    expect(binHeights(counts, edges, 4, 'percent', 'ascending')).toEqual([25, 50, 100]);
    // A cumulative density is the cumulative fraction.
    expect(binHeights(counts, edges, 4, 'density', 'ascending')).toEqual([0.25, 0.5, 1]);
  });
});

describe('empirical cumulative distribution (spec 22.1)', () => {
  it('has one jump for tied values: F(1) = 0.5, F(2) = 0.75, F(3) = 1 for 1, 1, 2, 3', () => {
    const { steps, n } = ecdfSteps([1, 1, 2, 3], 'atOrBelow');
    expect(n).toBe(4);
    expect(steps).toEqual([
      { x: 1, f: 0.5, ties: 2 },
      { x: 2, f: 0.75, ties: 1 },
      { x: 3, f: 1, ties: 1 },
    ]);
  });
  it('is one minus that for the strictly-above direction', () => {
    expect(ecdfSteps([1, 1, 2, 3], 'above').steps.map((s) => s.f)).toEqual([0.5, 0.25, 0]);
  });
  it('ignores what is not a number, and has nothing for no values', () => {
    expect(ecdfSteps([null, NaN, 4], 'atOrBelow').steps).toEqual([{ x: 4, f: 1, ties: 1 }]);
    expect(ecdfSteps([], 'atOrBelow')).toEqual({ steps: [], n: 0 });
  });
});

describe('bin edges of large values', () => {
  it('keeps distinct edges (no 12-digit rounding)', () => {
    const edges = binEdges([1e12, 1e12 + 1, 1e12 + 2], 1);
    expect(new Set(edges).size).toBe(edges.length);
    for (let i = 1; i < edges.length; i++) expect(edges[i]).toBeGreaterThan(edges[i - 1]);
    const { counts } = countBins([1e12, 1e12 + 1, 1e12 + 2], edges);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
    expect(binHeights(counts, edges, 3, 'density', 'off').every(Number.isFinite)).toBe(true);
  });
});

describe('every observation falls in exactly one bin', () => {
  const total = (v: number[]) => {
    const sorted = [...v].sort((a, b) => a - b);
    const edges = binEdges(sorted, autoBinWidth(sorted));
    const { counts, outside } = countBins(sorted, edges);
    return { sum: counts.reduce((a, b) => a + b, 0), outside, edges };
  };
  it.each([
    ['tiny gap', [1, 1 + 1e-15]],
    ['tiny gaps, several', [1, 1 + 1e-15, 1 + 2e-15, 1 + 4e-15]],
    ['huge magnitude', [1e300, 1.5e300, 2e300, 9.9e307]],
    ['large offset', [1e15, 1e15 + 1, 1e15 + 2, 1e15 + 3]],
    ['ties', [2, 2, 2, 5, 5, 9]],
    ['negative', [-7.3, -1e-9, -2.2, -100]],
    ['a single repeated value', [4, 4, 4, 4]],
    ['a single repeated tiny gap value', [0.1 + 0.2, 0.1 + 0.2]],
  ])('%s', (_name, v) => {
    const { sum, outside } = total(v);
    expect(outside).toBe(0);
    expect(sum).toBe(v.length);
  });
});


describe('a bin width that would make too many bins, or that is not a width', () => {
  it('a width far below the range stops at the cap of bins, and quickly', () => {
    const t0 = performance.now();
    const edges = binEdges([0, 1e9], 1e-6);
    expect(edges.length).toBeLessThanOrEqual(2001);
    expect(edges.length).toBeGreaterThan(100);
    expect(performance.now() - t0).toBeLessThan(500);
    for (let i = 1; i < edges.length; i++) expect(edges[i]).toBeGreaterThan(edges[i - 1]);
  });

  it('a width of 0, a negative one, or one that is not a number is not taken from a file or a patch: the setting stays as it was', () => {
    const base = { ...createChart('t').histogram, binning: 'width' as const, binWidth: 2.5 };
    for (const bad of [0, -3, NaN, Infinity, '2', null, undefined]) {
      const out = sanitizeHistogram({ binning: 'width', binWidth: bad }, base);
      if (bad === null) expect(out.binWidth).toBeNull();
      else if (bad === Infinity) expect(out.binWidth).toBeLessThanOrEqual(1e12);
      else expect(out.binWidth).toBe(2.5);
    }
  });

  it('a width is held within its limits', () => {
    const base = { ...createChart('t').histogram, binWidth: 1 };
    expect(sanitizeHistogram({ binWidth: 1e-30 }, base).binWidth).toBe(1e-12);
    expect(sanitizeHistogram({ binWidth: 1e30 }, base).binWidth).toBe(1e12);
  });
});
