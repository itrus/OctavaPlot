import { describe, expect, it } from 'vitest';
import type { SummarySpec } from '../model/types';
import { describeValues } from './descriptive';
import { computeGroupStats, summarize } from './summary';

const spec: SummarySpec = { centre: 'mean', spread: 'sd', confidenceLevel: 0.95, smallSamplePolicy: 'drawCentre', invalidPolicy: 'omit' };
const rel = (a: number, b: number) => Math.abs(a - b) / Math.abs(b);

describe('one SD for Results and chart summaries', () => {
  const cases: Array<[string, number[], number]> = [
    ['tiny', [1e-200, 2e-200, 3e-200], 1e-200],
    ['huge', [1e200, 2e200, 3e200], 1e200],
    ['translated', [1e9 + 1, 1e9 + 2, 1e9 + 3], 1],
    ['ordinary', [1, 2, 3, 4, 5], Math.sqrt(2.5)],
  ];
  for (const [name, xs, sd] of cases) {
    it(`agree for ${name} data`, () => {
      const d = describeValues(xs);
      const c = computeGroupStats(xs, spec);
      expect(rel(d.sd!, sd)).toBeLessThan(1e-6);
      expect(rel((c.interval.upper! - c.interval.lower!) / 2, sd)).toBeLessThan(1e-6);
      expect(rel(summarize(xs).sd!, sd)).toBeLessThan(1e-6);
      expect(rel(d.sem!, sd / Math.sqrt(xs.length))).toBeLessThan(1e-6);
    });
  }
  it('keeps skewness and kurtosis of tiny and huge data equal to those of the same shape at unit scale', () => {
    const base = describeValues([1, 2, 3, 4, 10]);
    for (const k of [1e-200, 1e200]) {
      const d = describeValues([1, 2, 3, 4, 10].map((x) => x * k));
      expect(d.skewness).toBeCloseTo(base.skewness!, 9);
      expect(d.kurtosis).toBeCloseTo(base.kurtosis!, 9);
    }
  });
  it('gives a finite mean for values whose plain sum overflows', () => {
    expect(rel(describeValues([1.5e308, 1.5e308, 1.5e308]).mean!, 1.5e308)).toBeLessThan(1e-12);
  });
});
