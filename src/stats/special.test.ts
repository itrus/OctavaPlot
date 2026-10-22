import { describe, expect, it } from 'vitest';
import {
  MEDIAN_CI_EXACT_MAX_N,
  lnGamma,
  medianCiRank,
  regIncBeta,
  studentTQuantileUpper,
  studentTUpperTail,
} from './special';

// Closed-form upper tail P(T > t) from Abramowitz & Stegun 26.7.3 (even df) and 26.7.4 (odd df).
// Used only as an independent reference (absolute comparison: 1 - A cancels in the far tail).
function closedFormTail(t: number, df: number): number {
  const theta = Math.atan(t / Math.sqrt(df));
  const c2 = Math.cos(theta) ** 2;
  let a: number;
  if (df % 2 === 0) {
    let term = 1;
    let sum = 1;
    for (let j = 1; j <= (df - 2) / 2; j++) {
      term *= ((2 * j - 1) / (2 * j)) * c2;
      sum += term;
    }
    a = Math.sin(theta) * sum;
  } else if (df === 1) {
    a = (2 * theta) / Math.PI;
  } else {
    let term = 1;
    let sum = 1;
    for (let j = 1; j <= (df - 3) / 2; j++) {
      term *= ((2 * j) / (2 * j + 1)) * c2;
      sum += term;
    }
    a = (2 / Math.PI) * (theta + Math.sin(theta) * Math.cos(theta) * sum);
  }
  return (1 - a) / 2;
}

describe('lnGamma', () => {
  it('matches ln Gamma at known points', () => {
    expect(lnGamma(0.5)).toBeCloseTo(0.5723649429247001, 14);
    expect(lnGamma(10)).toBeCloseTo(12.801827480081469, 13);
    expect(Math.abs(lnGamma(1))).toBeLessThan(1e-14);
    expect(Math.abs(lnGamma(2))).toBeLessThan(1e-14);
    expect(lnGamma(5)).toBeCloseTo(Math.log(24), 13);
    expect(lnGamma(1.5)).toBeCloseTo(Math.log(Math.sqrt(Math.PI) / 2), 14);
  });

  it('uses the reflection formula below 0.5 and reports poles and NaN', () => {
    // |Gamma(-1/2)| = 2 sqrt(pi)
    expect(lnGamma(-0.5)).toBeCloseTo(Math.log(2 * Math.sqrt(Math.PI)), 13);
    expect(lnGamma(0)).toBe(Infinity);
    expect(lnGamma(NaN)).toBeNaN();
  });
});

describe('regIncBeta', () => {
  it('satisfies the closed forms and symmetry', () => {
    expect(regIncBeta(0.3, 1, 1)).toBeCloseTo(0.3, 13); // I_x(1,1) = x
    expect(regIncBeta(0.3, 2, 1)).toBeCloseTo(0.09, 13); // x^2
    expect(regIncBeta(0.3, 1, 2)).toBeCloseTo(0.51, 13); // 1 - (1-x)^2
    expect(regIncBeta(0.5, 3, 3)).toBeCloseTo(0.5, 13);
    expect(regIncBeta(0.3, 2.5, 4) + regIncBeta(0.7, 4, 2.5)).toBeCloseTo(1, 13);
  });

  it('handles the end points and invalid arguments', () => {
    expect(regIncBeta(0, 2, 3)).toBe(0);
    expect(regIncBeta(-1, 2, 3)).toBe(0);
    expect(regIncBeta(1, 2, 3)).toBe(1);
    expect(regIncBeta(2, 2, 3)).toBe(1);
    expect(regIncBeta(NaN, 2, 3)).toBeNaN();
    expect(regIncBeta(0.5, 0, 3)).toBeNaN();
    expect(regIncBeta(0.5, 2, -1)).toBeNaN();
  });
});

describe('studentTUpperTail', () => {
  it('matches the finite-sum closed forms for df 1..11', () => {
    for (let df = 1; df <= 11; df++) {
      for (const t of [0.1, 0.5, 1, 2, 3.5, 8]) {
        expect(Math.abs(studentTUpperTail(t, df) - closedFormTail(t, df))).toBeLessThan(1e-13);
      }
    }
  });

  it('is 0.5 at zero, antisymmetric, and 0 or 1 at the infinities', () => {
    expect(studentTUpperTail(0, 4)).toBe(0.5);
    expect(studentTUpperTail(-2, 5) + studentTUpperTail(2, 5)).toBeCloseTo(1, 14);
    expect(studentTUpperTail(Infinity, 4)).toBe(0);
    expect(studentTUpperTail(-Infinity, 4)).toBe(1);
    expect(studentTUpperTail(1e200, 4)).toBe(0); // t^2 overflows: defined as 0, not NaN
  });

  it('keeps relative accuracy in a far tail (no 1 - CDF)', () => {
    // df = 2: Q(t) = 0.5 - t / (2 sqrt(2 + t^2)) = 1 / (s (s + t)) with s = sqrt(2 + t^2).
    const t = 1e6;
    const s = Math.sqrt(2 + t * t);
    const exact = 1 / (s * (s + t));
    expect(Math.abs(studentTUpperTail(t, 2) - exact) / exact).toBeLessThan(1e-9);
  });

  it('rejects invalid df and NaN', () => {
    for (const df of [0, -1, NaN, Infinity]) expect(studentTUpperTail(1, df)).toBeNaN();
    expect(studentTUpperTail(NaN, 4)).toBeNaN();
  });
});

describe('studentTQuantileUpper', () => {
  it('matches the df = 1 and df = 2 closed forms', () => {
    expect(studentTQuantileUpper(0.25, 1)).toBeCloseTo(1, 12);
    expect(studentTQuantileUpper(0.025, 1) / 12.7062047361747).toBeCloseTo(1, 11);
    expect(studentTQuantileUpper(0.25, 2)).toBeCloseTo(Math.sqrt(2 / 3), 12);
    expect(studentTQuantileUpper(0.025, 2) / 4.302652729749464).toBeCloseTo(1, 11);
  });

  it('gives the spec 22.1 mean 95% CI for 1..5 (L1474)', () => {
    const t = studentTQuantileUpper(0.025, 4);
    expect(t / 2.776445105198).toBeCloseTo(1, 11);
    const half = t * Math.sqrt(0.5); // SEM of 1..5 = sqrt(2.5 / 5)
    expect(3 - half).toBeCloseTo(1.03675684, 7);
    expect(3 + half).toBeCloseTo(4.96324316, 7);
  });

  it('round-trips through the tail over a grid and decreases in q', () => {
    const qs = [1e-12, 1e-8, 1e-4, 0.025, 0.25, 0.4999];
    for (const df of [1, 2, 3, 5, 10, 30, 100, 1000]) {
      let prev = Infinity;
      for (const q of qs) {
        const t = studentTQuantileUpper(q, df);
        expect(t).toBeGreaterThan(0);
        expect(Math.abs(studentTUpperTail(t, df) - q) / q).toBeLessThanOrEqual(1e-12);
        // qs is increasing, so t must strictly decrease
        expect(t).toBeLessThan(prev);
        prev = t;
      }
    }
  });

  it('tends to the normal quantile for large df (Cornish-Fisher, A&S 26.7.5)', () => {
    const z = 1.959963984540054;
    const v = 1e4;
    const cf =
      z +
      (z ** 3 + z) / (4 * v) +
      (5 * z ** 5 + 16 * z ** 3 + 3 * z) / (96 * v ** 2) +
      (3 * z ** 7 + 19 * z ** 5 + 17 * z ** 3 - 15 * z) / (384 * v ** 3);
    expect(Math.abs(studentTQuantileUpper(0.025, v) - cf)).toBeLessThan(1e-9);
  });

  it('returns NaN outside 0 < q < 0.5 or for invalid df', () => {
    for (const q of [0, 0.5, 0.7, NaN, -0.1]) expect(studentTQuantileUpper(q, 4)).toBeNaN();
    for (const df of [0, -1, NaN, Infinity]) expect(studentTQuantileUpper(0.025, df)).toBeNaN();
    // (1 - 1e-17) / 2 rounds to exactly 0.5: not a usable tail probability
    expect(studentTQuantileUpper((1 - 1e-17) / 2, 4)).toBeNaN();
  });
});

describe('medianCiRank', () => {
  it('reproduces the spec 22.1 fixtures (L1478-1479)', () => {
    expect(medianCiRank(5, 0.95)).toEqual({ available: false, reason: 'coverage', widestCoverage: 0.9375 });
    expect(medianCiRank(6, 0.95)).toEqual({ available: true, k: 1, coverage: 0.96875 });
  });

  it('gives exact dyadic coverages for other n at 95%', () => {
    expect(medianCiRank(7, 0.95)).toEqual({ available: true, k: 1, coverage: 0.984375 });
    // n = 9, k = 2: 1 - 2 (1 + 9) / 512
    expect(medianCiRank(9, 0.95)).toEqual({ available: true, k: 2, coverage: 0.9609375 });
    // n = 10, k = 2: 1 - 2 (1 + 10) / 1024
    expect(medianCiRank(10, 0.95)).toEqual({ available: true, k: 2, coverage: 0.978515625 });
    // n = 20, k = 6: sum C(20, 0..5) = 21700, coverage = 1 - 43400 / 2^20
    expect(medianCiRank(20, 0.95)).toEqual({ available: true, k: 6, coverage: 1 - 43400 / 1048576 });
  });

  it('accepts equality and handles tiny n', () => {
    expect(medianCiRank(4, 0.875)).toEqual({ available: true, k: 1, coverage: 0.875 });
    expect(medianCiRank(4, 0.9)).toEqual({ available: false, reason: 'coverage', widestCoverage: 0.875 });
    expect(medianCiRank(1, 0.5)).toEqual({ available: false, reason: 'coverage', widestCoverage: 0 });
    expect(medianCiRank(2, 0.4)).toEqual({ available: true, k: 1, coverage: 0.5 });
  });

  it('rejects invalid levels, too-large n and non-positive or non-integer n', () => {
    for (const level of [0, 1, NaN, -0.5, 1.5]) {
      expect(medianCiRank(10, level)).toEqual({ available: false, reason: 'invalid-level', widestCoverage: null });
    }
    expect(MEDIAN_CI_EXACT_MAX_N).toBe(20000);
    expect(medianCiRank(MEDIAN_CI_EXACT_MAX_N + 1, 0.95)).toEqual({
      available: false,
      reason: 'too-large',
      widestCoverage: null,
    });
    for (const n of [0, -3, 2.5, NaN]) {
      expect(medianCiRank(n, 0.95)).toEqual({ available: false, reason: 'coverage', widestCoverage: null });
    }
  });

  it('needs n >= 21 for 99.9999% (k = 1 needs 1 - 2^(1-n) >= level)', () => {
    expect(medianCiRank(20, 0.999999).available).toBe(false);
    expect(medianCiRank(21, 0.999999).available).toBe(true);
  });

  it('agrees with the incomplete beta backend: P(X <= k-1) = I_0.5(n-k+1, k)', () => {
    for (const n of [30, 200, 1000, 1001, 2000]) {
      const r = medianCiRank(n, 0.95);
      expect(r.available).toBe(true);
      if (!r.available) continue;
      const viaBeta = 1 - 2 * regIncBeta(0.5, n - r.k + 1, r.k, 0.5);
      expect(Math.abs(r.coverage - viaBeta)).toBeLessThanOrEqual(1e-11);
      expect(r.coverage).toBeGreaterThanOrEqual(0.95);
      // k is the largest valid rank: k + 1 must fall below the level
      const next = 1 - 2 * regIncBeta(0.5, n - r.k, r.k + 1, 0.5);
      expect(next).toBeLessThan(0.95);
    }
  });

  it('completes at the n = 20000 cap with a valid rank', () => {
    const r = medianCiRank(MEDIAN_CI_EXACT_MAX_N, 0.95);
    expect(r.available).toBe(true);
    if (!r.available) return;
    expect(r.coverage).toBeGreaterThanOrEqual(0.95);
    expect(r.coverage).toBeLessThan(0.96);
    expect(r.k).toBeGreaterThan(1);
    expect(r.k).toBeLessThan(MEDIAN_CI_EXACT_MAX_N / 2);
  });
});
