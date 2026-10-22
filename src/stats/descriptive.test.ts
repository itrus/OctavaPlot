import { describe, expect, it } from 'vitest';
import { describeValues, descriptiveRows, formatResult } from './descriptive';

describe('descriptive statistics', () => {
  const d = describeValues([1, 2, 3, 4, 5]);

  it('counts, ranks and summarises the values', () => {
    expect(d.n).toBe(5);
    expect(d.min).toBe(1);
    expect(d.max).toBe(5);
    expect(d.range).toBe(4);
    expect(d.median).toBe(3);
    expect(d.q1).toBe(1.5);
    expect(d.q3).toBe(4.5);
    expect(d.sum).toBe(15);
  });

  it('mean, SD, SEM and the t interval of the mean', () => {
    expect(d.mean).toBe(3);
    expect(d.sd).toBeCloseTo(Math.sqrt(2.5), 12);
    expect(d.sem).toBeCloseTo(Math.sqrt(2.5) / Math.sqrt(5), 12);
    // t(0.975, 4) = 2.776445
    expect(d.meanCi!.upper - 3).toBeCloseTo(2.776445 * d.sem!, 5);
    expect(d.meanCi!.lower).toBeCloseTo(6 - d.meanCi!.upper, 12);
    expect(d.cv).toBeCloseTo((Math.sqrt(2.5) / 3) * 100, 10);
  });

  it('geometric mean', () => {
    expect(d.geoMean).toBeCloseTo(120 ** (1 / 5), 12);
    expect(d.geoSdFactor).toBeGreaterThan(1);
    expect(d.geoMeanCi!.lower).toBeLessThan(d.geoMean!);
    expect(d.geoMeanCi!.upper).toBeGreaterThan(d.geoMean!);
  });

  it('skewness and kurtosis use the sample corrections', () => {
    expect(d.skewness).toBeCloseTo(0, 12);
    expect(d.kurtosis).toBeCloseTo(-1.2, 12);
    expect(describeValues([1, 2, 10]).skewness).toBeGreaterThan(0);
  });

  it('the median interval is the exact one, or reports the widest coverage reachable', () => {
    // n = 5 cannot reach 95%: the widest interval covers 1 - 2/32.
    expect(d.medianCi).toBeNull();
    expect(d.medianCoverage).toBeCloseTo(0.9375, 12);
    const big = describeValues(Array.from({ length: 20 }, (_, i) => i + 1));
    expect(big.medianCi).toEqual({ lower: 6, upper: 15 });
    expect(big.medianCoverage!).toBeGreaterThanOrEqual(0.95);
  });

  it('leaves out what cannot be computed instead of inventing a number', () => {
    const one = describeValues([7]);
    expect(one.n).toBe(1);
    expect(one.mean).toBe(7);
    expect([one.sd, one.sem, one.meanCi, one.cv, one.skewness, one.kurtosis, one.geoSdFactor, one.geoMeanCi]).toEqual([null, null, null, null, null, null, null, null]);
    expect(describeValues([]).mean).toBeNull();
    const neg = describeValues([-1, 2, 3]);
    expect([neg.geoMean, neg.geoMeanCi, neg.geoSdFactor]).toEqual([null, null, null]);
    expect(neg.mean).toBeCloseTo(4 / 3, 12);
    const flat = describeValues([2, 2, 2, 2]);
    expect(flat.sd).toBe(0);
    expect(flat.skewness).toBeNull();
  });

  it('missing cells are counted apart and are not zero', () => {
    const m = describeValues([1, null, 3, undefined, NaN]);
    expect(m.n).toBe(2);
    expect(m.missing).toBe(2);
    expect(m.mean).toBe(2);
    expect(m.min).toBe(1);
  });

  it('a different confidence level changes the intervals', () => {
    const wide = describeValues([1, 2, 3, 4, 5], 0.99);
    expect(wide.meanCi!.upper).toBeGreaterThan(d.meanCi!.upper);
    expect(describeValues([1, 2, 3], 1.5).meanCi).toBeNull();
  });
});

describe('the results sheet', () => {
  it('lists the rows in order, naming the confidence level', () => {
    const rows = descriptiveRows(0.99).filter((r) => !r.blank);
    expect(rows[0].label).toBe('Number of values');
    expect(rows.map((r) => r.label)).toContain('Lower 99% CI of mean');
    expect(rows.map((r) => r.label)).toContain('99% CI of median');
    expect(rows.at(-1)!.label).toBe('Sum');
    expect(new Set(descriptiveRows(0.95).map((r) => r.key)).size).toBe(descriptiveRows(0.95).length);
  });

  it('every row reads its value from the statistics', () => {
    const d = describeValues([1, 2, 3, 4, 5]);
    const byKey = Object.fromEntries(descriptiveRows(0.95).filter((r) => r.value).map((r) => [r.key, r.value!(d)]));
    expect(byKey.n).toBe(5);
    expect(byKey.median).toBe(3);
    expect(byKey.sum).toBe(15);
    expect(byKey.medianLo).toBeNull();
  });

  it('writes numbers with five significant digits, and nothing for a value that is not available', () => {
    expect(formatResult(2.6051710846973517)).toBe('2.6052');
    expect(formatResult(23)).toBe('23');
    expect(formatResult(0.0625)).toBe('0.0625');
    expect(formatResult(52.704627, 'percent')).toBe('52.705%');
    expect(formatResult(7, 'count')).toBe('7');
    expect(formatResult(null)).toBe('');
    expect(formatResult(Infinity)).toBe('');
  });
});
