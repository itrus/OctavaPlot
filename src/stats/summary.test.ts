import { describe, expect, it } from 'vitest';
import type { Observation, SummarySpec } from '../model/types';
import {
  SPREADS_BY_CENTRE,
  SUMMARY_ALGORITHM_VERSION,
  computeGroupStats,
  effectiveSpreadOf,
  errorValue,
  formatPercent,
  quantileType6,
  statsFor,
  summarize,
  undefinedStatWarning,
} from './summary';

describe('summarize', () => {
  it('computes n, mean, sample SD (n-1) and SEM for 1..5', () => {
    const s = summarize([1, 2, 3, 4, 5]);
    expect(s.n).toBe(5);
    expect(s.mean).toBe(3);
    expect(s.sd).toBeCloseTo(Math.sqrt(2.5), 12);
    expect(s.sem).toBeCloseTo(Math.sqrt(0.5), 12);
  });

  it('matches the example Group A values', () => {
    const s = summarize([1.1, 1.2, 1.3, 1.2, 1.4]);
    expect(s.mean).toBeCloseTo(1.24, 12);
    expect(s.sd).toBeCloseTo(0.114017542509914, 10);
    expect(s.sem).toBeCloseTo(0.114017542509914 / Math.sqrt(5), 10);
  });

  it('excludes missing values rather than treating them as zero', () => {
    const withGaps = summarize([2, null, 4, undefined, 6]);
    expect(withGaps).toEqual(summarize([2, 4, 6]));
    expect(withGaps.n).toBe(3);
    expect(withGaps.mean).toBe(4);
  });

  it('does not count NaN or infinities as observations', () => {
    expect(summarize([1, NaN, Infinity, 3]).n).toBe(2);
  });

  it('gives a mean but no SD/SEM when n = 1', () => {
    const s = summarize([7.5, null]);
    expect(s.n).toBe(1);
    expect(s.mean).toBe(7.5);
    expect(s.sd).toBeNull();
    expect(s.sem).toBeNull();
    expect(errorValue(s, 'sd')).toBeNull();
    expect(errorValue(s, 'sem')).toBeNull();
  });

  it('has nothing drawable when n = 0', () => {
    for (const input of [[], [null, null]]) {
      expect(summarize(input)).toEqual({ n: 0, mean: null, sd: null, sem: null });
    }
  });

  it('gives SD = 0 (not undefined) for identical values with n >= 2', () => {
    const s = summarize([2, 2, 2]);
    expect(s.sd).toBe(0);
    expect(s.sem).toBe(0);
  });
});

describe('undefinedStatWarning', () => {
  it('warns for n = 0 and for n = 1 with an error type, and otherwise not', () => {
    expect(undefinedStatWarning('A', summarize([]), 'sd')).toMatch(/no valid observations/);
    expect(undefinedStatWarning('A', summarize([1]), 'sem')).toMatch(/SEM is undefined for n = 1/);
    expect(undefinedStatWarning('A', summarize([1]), 'none')).toBeNull();
    expect(undefinedStatWarning('A', summarize([1, 2]), 'sd')).toBeNull();
  });
});

const spec = (over: Partial<SummarySpec> = {}): SummarySpec => ({
  centre: 'mean',
  spread: 'none',
  confidenceLevel: 0.95,
  smallSamplePolicy: 'drawCentre',
  invalidPolicy: 'omit',
  ...over,
});
const rel = (a: number, b: number): number => Math.abs(a - b) / Math.abs(b);
const upTo = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1);

describe('SPREADS_BY_CENTRE', () => {
  it('offers only the spreads of spec 4.2', () => {
    expect(SPREADS_BY_CENTRE.mean).toEqual(['none', 'sd', 'sem', 'ci', 'range']);
    expect(SPREADS_BY_CENTRE.geometricMean).toEqual(['none', 'gsd', 'ci']);
    expect(SPREADS_BY_CENTRE.median).toEqual(['none', 'iqr', 'range', 'ci']);
  });

  it('maps a spread that is not allowed to none without rewriting it', () => {
    expect(effectiveSpreadOf('median', 'sd')).toBe('none');
    expect(effectiveSpreadOf('mean', 'iqr')).toBe('none');
    expect(effectiveSpreadOf('geometricMean', 'sem')).toBe('none');
    expect(effectiveSpreadOf('mean', 'sd')).toBe('sd');
  });
});

describe('computeGroupStats mean', () => {
  it('gives SD and SEM intervals for 1..5', () => {
    const sd = computeGroupStats(upTo(5), spec({ spread: 'sd' }));
    expect(sd.centre).toBe(3);
    expect(sd.interval.lower).toBeCloseTo(3 - Math.sqrt(2.5), 12);
    expect(sd.interval.upper).toBeCloseTo(3 + Math.sqrt(2.5), 12);
    const sem = computeGroupStats(upTo(5), spec({ spread: 'sem' }));
    expect(sem.interval.upper).toBeCloseTo(3 + Math.sqrt(0.5), 12);
  });

  it('uses the t multiplier for the mean CI (spec 22.1 L1473)', () => {
    const ci = computeGroupStats(upTo(5), spec({ spread: 'ci' }));
    expect(ci.interval.status).toBe('ok');
    expect(ci.interval.lower).toBeCloseTo(1.03675684, 7);
    expect(ci.interval.upper).toBeCloseTo(4.96324316, 7);
    // t(0.975, 4) = 2.7764451051978 (reference value), not 1.96.
    const h = 2.7764451051978 * Math.sqrt(0.5);
    expect(rel(ci.interval.upper!, 3 + h)).toBeLessThanOrEqual(1e-10);
    expect(rel(ci.interval.lower!, 3 - h)).toBeLessThanOrEqual(1e-10);
  });

  it('handles the two-point case [0, 10] with one degree of freedom', () => {
    const ci = computeGroupStats([0, 10], spec({ spread: 'ci' }));
    const h = 12.706204736174694 * 5;
    expect(rel(ci.interval.upper!, 5 + h)).toBeLessThanOrEqual(1e-10);
    expect(rel(ci.interval.lower!, 5 - h)).toBeLessThanOrEqual(1e-10);
  });

  it('draws the range as min-max', () => {
    const r = computeGroupStats([4, 1, 9, 2], spec({ spread: 'range' }));
    expect([r.interval.lower, r.interval.upper]).toEqual([1, 9]);
  });
});

describe('quantileType6 and the IQR', () => {
  it('gives Q1 = 2.25, median = 4.5, Q3 = 6.75 for 1..8 (spec 22.1)', () => {
    const xs = upTo(8);
    expect(quantileType6(xs, 0.25)).toBe(2.25);
    expect(quantileType6(xs, 0.5)).toBe(4.5);
    expect(quantileType6(xs, 0.75)).toBe(6.75);
    const s = computeGroupStats(xs, spec({ centre: 'median', spread: 'iqr' }));
    expect([s.interval.lower, s.centre, s.interval.upper]).toEqual([2.25, 4.5, 6.75]);
  });

  it('clamps quantiles for small n and needs n >= 4 for an IQR', () => {
    expect(quantileType6([5], 0.25)).toBe(5);
    expect(quantileType6([1, 2, 3], 0.25)).toBe(1);
    expect(quantileType6([1, 2, 3], 0.75)).toBe(3);
    const three = computeGroupStats([1, 2, 3], spec({ centre: 'median', spread: 'iqr' }));
    expect(three.interval.code).toBe('n-too-small');
    expect(computeGroupStats([1, 2, 3, 4], spec({ centre: 'median', spread: 'iqr' })).interval.status).toBe('ok');
  });

  it('only requires ordered endpoints for range and IQR (no centre containment)', () => {
    const iqr = computeGroupStats([1, 1, 1, 100], spec({ centre: 'median', spread: 'iqr' }));
    expect(iqr.interval.status).toBe('ok');
    expect(iqr.interval.lower!).toBeLessThanOrEqual(iqr.interval.upper!);
    expect(iqr.notices).toEqual([]);
  });
});

describe('geometric mean', () => {
  it('gives centre 10 and GSD limits [1, 100] for 1, 10, 100 (spec 22.1)', () => {
    const s = computeGroupStats([1, 10, 100], spec({ centre: 'geometricMean', spread: 'gsd' }));
    expect(s.centre!).toBeCloseTo(10, 12);
    expect(s.interval.lower!).toBeCloseTo(1, 12);
    expect(s.interval.upper!).toBeCloseTo(100, 10);
  });

  it('exponentiates the t interval of the logs: asymmetric on a linear axis', () => {
    const s = computeGroupStats([1, 10, 100], spec({ centre: 'geometricMean', spread: 'ci' }));
    const h = (4.302652729749464 * Math.LN10) / Math.sqrt(3);
    expect(rel(s.interval.upper!, Math.exp(Math.LN10 + h))).toBeLessThanOrEqual(1e-10);
    expect(rel(s.interval.lower!, Math.exp(Math.LN10 - h))).toBeLessThanOrEqual(1e-10);
    expect(s.interval.upper! - s.centre!).toBeGreaterThan(s.centre! - s.interval.lower!);
  });

  it('treats non-positive values as invalid: omit with a notice, or reject the group', () => {
    const omit = computeGroupStats([1, -1, 100, 0], spec({ centre: 'geometricMean' }));
    expect(omit.n).toBe(2);
    expect(omit.invalid).toBe(2);
    expect(omit.centre!).toBeCloseTo(10, 12);
    expect(omit.notices.map((n) => n.code)).toEqual(['invalid-omitted']);
    const rej = computeGroupStats([1, -1, 100], spec({ centre: 'geometricMean', invalidPolicy: 'rejectGroup' }));
    expect(rej.centre).toBeNull();
    expect(rej.rejected).toBe(true);
    expect(rej.notices).toHaveLength(1);
  });

  it('reports a GSD overflow as unavailable', () => {
    const s = computeGroupStats([1e-300, 1e300], spec({ centre: 'geometricMean', spread: 'gsd' }));
    expect(s.interval.status).toBe('unavailable');
    expect(s.interval.code).toBe('nonfinite');
    expect(s.centre).not.toBeNull();
  });
});

describe('median CI', () => {
  it('is unavailable for n = 5 at 95% and names the coverage (spec 22.1)', () => {
    const s = computeGroupStats(upTo(5), spec({ centre: 'median', spread: 'ci' }));
    expect(s.interval.status).toBe('unavailable');
    expect(s.interval.code).toBe('coverage');
    expect(s.centre).toBe(3);
    expect(s.notices[0].message).toContain('widest finite interval (min-max) covers only 93.75%');
  });

  it('is min-max with 96.875% coverage for n = 6', () => {
    const s = computeGroupStats(upTo(6), spec({ centre: 'median', spread: 'ci' }));
    expect([s.interval.lower, s.interval.upper]).toEqual([1, 6]);
    expect(s.interval.coverage).toBe(0.96875);
  });

  it('uses rank k = 2 for n = 10', () => {
    const s = computeGroupStats(upTo(10), spec({ centre: 'median', spread: 'ci' }));
    expect([s.interval.lower, s.interval.upper]).toEqual([2, 9]);
    expect(s.interval.coverage).toBe(0.978515625);
  });

  it('adds a ties notice and sorts unsorted input', () => {
    const s = computeGroupStats([6, 2, 2, 3, 4, 5], spec({ centre: 'median', spread: 'ci' }));
    expect(s.interval.status).toBe('ok');
    expect(s.notices.map((n) => n.code)).toEqual(['ties']);
    expect(s.notices[0].severity).toBe('informational');
  });

  it('refuses very large n and keeps the centre', () => {
    const s = computeGroupStats(upTo(20001), spec({ centre: 'median', spread: 'ci' }));
    expect(s.interval.code).toBe('too-large');
    expect(s.centre).toBe(10001);
  });

  it('is undefined for n = 1', () => {
    const s = computeGroupStats([4], spec({ centre: 'median', spread: 'ci' }));
    expect(s.interval.code).toBe('n-too-small');
    expect(s.centre).toBe(4);
  });
});

describe('small samples and empty groups', () => {
  it('draws the centre without a zero-width bar for n = 1 (default policy)', () => {
    const s = computeGroupStats([7], spec({ spread: 'sd' }));
    expect(s.centre).toBe(7);
    expect(s.interval).toMatchObject({ status: 'unavailable', lower: null, upper: null, code: 'n-too-small' });
    expect(s.notices.map((n) => n.message)).toEqual(['SD is undefined for n = 1; no error bar is drawn.']);
    expect(s.rejected).toBe(false);
  });

  it('hides the summary under the reject policy with a single notice', () => {
    const s = computeGroupStats([7], spec({ spread: 'sd', smallSamplePolicy: 'reject' }));
    expect(s.centre).toBeNull();
    expect(s.rejected).toBe(true);
    expect(s.notices).toHaveLength(1);
    const cov = computeGroupStats(upTo(5), spec({ centre: 'median', spread: 'ci', smallSamplePolicy: 'reject' }));
    expect(cov.centre).toBeNull();
    expect(cov.notices).toHaveLength(1);
  });

  it('has nothing to draw for n = 0 and does not count missing values as zero', () => {
    const s = computeGroupStats([null, undefined], spec({ spread: 'sd' }));
    expect(s.n).toBe(0);
    expect(s.missing).toBe(2);
    expect(s.centre).toBeNull();
    expect(s.interval.status).toBe('none');
    expect(computeGroupStats([2, null, 4], spec()).centre).toBe(3);
  });

  it('omits non-finite values with a notice, or rejects the group', () => {
    const omit = computeGroupStats([1, NaN, Infinity, 3], spec());
    expect(omit.n).toBe(2);
    expect(omit.notices.map((n) => n.code)).toEqual(['invalid-omitted']);
    expect(computeGroupStats([1, NaN], spec({ invalidPolicy: 'rejectGroup' })).centre).toBeNull();
  });
});

describe('stored spread that is not allowed for the centre', () => {
  it('keeps the stored spread, draws nothing and says why', () => {
    const s = computeGroupStats(upTo(5), spec({ centre: 'median', spread: 'sd' }));
    expect(s.spread).toBe('sd');
    expect(s.effectiveSpread).toBe('none');
    expect(s.centre).toBe(3);
    expect(s.interval).toMatchObject({ status: 'unavailable', code: 'not-allowed' });
    expect(s.notices.map((n) => n.message)).toEqual(['SD is not available for the median; no error bar is drawn.']);
  });
});

describe('numerical robustness', () => {
  it('computes a stable SD for large offsets (1e9) and tiny scales (1e-200)', () => {
    const big = computeGroupStats([1e9 + 1, 1e9 + 2, 1e9 + 3], spec({ spread: 'sd' }));
    expect(big.interval.upper! - big.centre!).toBeCloseTo(1, 6);
    const tiny = computeGroupStats([1e-200, 2e-200, 3e-200], spec({ spread: 'sd' }));
    expect(rel(tiny.interval.upper! - tiny.centre!, 1e-200)).toBeLessThanOrEqual(1e-10);
  });

  it('survives a sum overflow and reports an interval overflow as unavailable', () => {
    const big = computeGroupStats([1.7e308, 1.7e308], spec());
    expect(big.centre).toBe(1.7e308);
    const wide = computeGroupStats([1.7e308, -1.7e308], spec({ spread: 'sd' }));
    expect(wide.centre).toBe(0);
    expect(wide.interval).toMatchObject({ status: 'unavailable', code: 'nonfinite' });
  });

  it('rejects confidence levels outside 0 < C < 1 and unresolvable ones like 1e-17', () => {
    for (const c of [0, 1, -0.5, 1.5, NaN, 1e-17]) {
      const s = computeGroupStats(upTo(5), spec({ spread: 'ci', confidenceLevel: c }));
      expect(s.interval.code).toBe('level-range');
      expect(s.centre).toBe(3);
    }
    const med = computeGroupStats(upTo(6), spec({ centre: 'median', spread: 'ci', confidenceLevel: 0 }));
    expect(med.interval.code).toBe('level-range');
  });

  it('formats percentages without trailing zeros', () => {
    expect(formatPercent(0.95)).toBe('95%');
    expect(formatPercent(0.96875)).toBe('96.875%');
  });
});

describe('statsFor', () => {
  const obs = (values: number[]): Observation[] => values.map((value, i) => ({ id: `o${i}`, value }));

  it('returns the identical object for the same values and settings, whichever array holds them', () => {
    const o = obs([1, 2, 3, 4]);
    expect(statsFor(o, spec({ spread: 'sd' }))).toBe(statsFor(o, spec({ spread: 'sd' })));
    expect(statsFor(o, spec({ spread: 'sd' }))).toEqual(computeGroupStats([1, 2, 3, 4], spec({ spread: 'sd' })));
    expect(statsFor(obs([1, 2, 3, 4]), spec({ spread: 'sd' }))).toBe(statsFor(o, spec({ spread: 'sd' })));
    expect(statsFor(obs([1, 2, 3, 5]), spec({ spread: 'sd' }))).not.toBe(statsFor(o, spec({ spread: 'sd' })));
  });

  it('keys only on settings that matter', () => {
    const o = obs([1, 2, 3, 4]);
    const a = statsFor(o, spec({ spread: 'sd', confidenceLevel: 0.9 }));
    expect(statsFor(o, spec({ spread: 'sd', confidenceLevel: 0.8 }))).toBe(a);
    const none = statsFor(o, spec({ spread: 'none' }));
    expect(statsFor(o, spec({ spread: 'none', smallSamplePolicy: 'reject' }))).toBe(none);
    expect(statsFor(o, spec({ spread: 'sd', smallSamplePolicy: 'reject' }))).not.toBe(a);
    const ci = statsFor(o, spec({ spread: 'ci', confidenceLevel: 0.9 }));
    expect(statsFor(o, spec({ spread: 'ci', confidenceLevel: 0.8 }))).not.toBe(ci);
    expect(statsFor(o, spec({ centre: 'median', spread: 'sd' }))).not.toBe(a);
    expect(statsFor(o, spec({ spread: 'sd', invalidPolicy: 'rejectGroup' }))).not.toBe(a);
  });

  it('keeps a bounded number of results, the least recently used going first', () => {
    const o = obs([1, 2, 3, 4]);
    const first = statsFor(o, spec({ spread: 'sd' }));
    for (let i = 1; i <= 20001; i++) statsFor(obs([i]), spec({ spread: 'sd' }));
    expect(statsFor(o, spec({ spread: 'sd' }))).not.toBe(first);
    expect(SUMMARY_ALGORITHM_VERSION).toBe(1);
  });
});
