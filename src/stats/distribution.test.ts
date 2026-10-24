import { describe, expect, it } from 'vitest';
import { boxSummary, densityBandwidth, densityProfile, normaliseProfiles, quantile6, sortedFinite } from './distribution';

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
