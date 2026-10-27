import { describe, expect, it } from 'vitest';
import { fitCurve, fitModelById, FIT_MODELS, isFailure, type FitResult } from './fit';

const pts = (xs: number[], f: (x: number) => number) => xs.map((x) => ({ x, y: f(x) }));
const ok = (r: ReturnType<typeof fitCurve>): FitResult => {
  if (isFailure(r)) throw new Error(r.message);
  return r;
};
const value = (r: FitResult, i: number) => r.params[i].value;

describe('straight line', () => {
  it('fits X = 0, 1, 2 and Y = 1, 3, 5 exactly (spec 22.1)', () => {
    const r = ok(fitCurve([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 5 }], { model: 'linear' }));
    expect(value(r, 0)).toBeCloseTo(1, 10);
    expect(value(r, 1)).toBeCloseTo(2, 10);
    expect(r.rss).toBeLessThan(1e-20);
    expect(r.df).toBe(1);
    expect(r.rSquared).toBeCloseTo(1, 12);
    expect(r.predict(10)).toBeCloseTo(21, 9);
  });
  it('gives the classical standard errors and pointwise intervals (spec 17.3)', () => {
    const xs = [1, 2, 3, 4, 5];
    const ys = [2.1, 3.9, 6.2, 7.8, 10.1];
    const r = ok(fitCurve(xs.map((x, i) => ({ x, y: ys[i] })), { model: 'linear' }));
    const n = 5;
    const mx = 3;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    const sxx = xs.reduce((s, x) => s + (x - mx) ** 2, 0);
    const sxy = xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0);
    const b = sxy / sxx;
    const a = my - b * mx;
    const rss = xs.reduce((s, x, i) => s + (ys[i] - a - b * x) ** 2, 0);
    const s2 = rss / (n - 2);
    expect(value(r, 1)).toBeCloseTo(b, 10);
    expect(value(r, 0)).toBeCloseTo(a, 10);
    expect(r.sigma).toBeCloseTo(Math.sqrt(s2), 10);
    expect(r.params[1].se).toBeCloseTo(Math.sqrt(s2 / sxx), 10);
    expect(r.params[0].se).toBeCloseTo(Math.sqrt(s2 * (1 / n + (mx * mx) / sxx)), 10);
    // t(0.975) for 3 degrees of freedom, from tables: 3.182446305 (not from the code under test).
    const t = 3.182446305;
    for (const x0 of [1, 3, 4.5, 7]) {
      const lev = 1 / n + (x0 - mx) ** 2 / sxx;
      expect(r.halfWidth(x0, 'confidence', 0.95)!).toBeCloseTo(t * Math.sqrt(s2 * lev), 9);
      expect(r.halfWidth(x0, 'prediction', 0.95)!).toBeCloseTo(t * Math.sqrt(s2 * (1 + lev)), 9);
    }
    // A prediction interval is wider than the interval of the curve, and both widen away from the middle.
    expect(r.halfWidth(3, 'prediction', 0.95)!).toBeGreaterThan(r.halfWidth(3, 'confidence', 0.95)!);
    expect(r.halfWidth(9, 'confidence', 0.95)!).toBeGreaterThan(r.halfWidth(3, 'confidence', 0.95)!);
    expect(r.halfWidth(3, 'confidence', 0.99)!).toBeGreaterThan(r.halfWidth(3, 'confidence', 0.9)!);
    expect(r.halfWidth(3, 'confidence', 1.5)).toBeNull();
  });
  it('is not fitted to X that does not vary, or to too few points', () => {
    expect(isFailure(fitCurve([{ x: 2, y: 1 }, { x: 2, y: 3 }, { x: 2, y: 5 }], { model: 'linear' }))).toBe(true);
    const few = fitCurve([{ x: 1, y: 1 }], { model: 'linear' });
    expect(isFailure(few) && few.message).toMatch(/needs at least 2 points/);
  });
  it('gives a line through two points, with no error or band to give', () => {
    const r = ok(fitCurve([{ x: 0, y: 1 }, { x: 2, y: 5 }], { model: 'linear' }));
    expect(r.df).toBe(0);
    expect(r.params.every((p) => p.se === null)).toBe(true);
    expect(r.halfWidth(1, 'confidence', 0.95)).toBeNull();
    expect(r.message).toMatch(/no degrees of freedom/);
  });
});

describe('polynomial', () => {
  it('recovers a quadratic exactly', () => {
    const r = ok(fitCurve(pts([0, 1, 2, 3, 4, 5, 6], (x) => 1 - 2 * x + 0.5 * x * x), { model: 'polynomial', degree: 2 }));
    expect([value(r, 0), value(r, 1), value(r, 2)].map((v) => Number(v.toFixed(8)))).toEqual([1, -2, 0.5]);
    expect(r.params.map((p) => p.name)).toEqual(['a0', 'a1', 'a2']);
  });
  it('recovers a cubic with a large X range', () => {
    const r = ok(fitCurve(pts([0, 10, 20, 30, 40, 50, 60, 70], (x) => 3 + 0.1 * x - 0.002 * x ** 2 + 1e-5 * x ** 3), { model: 'polynomial', degree: 3 }));
    expect(value(r, 0)).toBeCloseTo(3, 6);
    expect(value(r, 3)).toBeCloseTo(1e-5, 10);
  });
  it('keeps the degree between 2 and 6, and needs more points than its degree', () => {
    expect(ok(fitCurve(pts([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], (x) => x), { model: 'polynomial', degree: 99 })).degree).toBe(6);
    expect(ok(fitCurve(pts([0, 1, 2, 3, 4], (x) => x), { model: 'polynomial', degree: 1 })).degree).toBe(2);
    expect(isFailure(fitCurve(pts([0, 1, 2], (x) => x), { model: 'polynomial', degree: 3 }))).toBe(true);
  });
});

describe('nonlinear models', () => {
  const dose = [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000];
  it('finds the four parameters of a rising logistic curve (Hill)', () => {
    const f = (x: number) => 10 + 90 / (1 + (50 / x) ** 1.2);
    const r = ok(fitCurve(pts(dose, f), { model: 'hill_4pl' }));
    expect(r.converged).toBe(true);
    expect(value(r, 0)).toBeCloseTo(10, 3);
    expect(value(r, 1)).toBeCloseTo(100, 3);
    expect(value(r, 2)).toBeCloseTo(50, 2);
    expect(value(r, 3)).toBeCloseTo(1.2, 4);
    expect(r.predict(50)).toBeCloseTo(55, 4);
  });
  it('finds a falling one (a negative slope), the case of a dose that kills', () => {
    const f = (x: number) => 5 + 95 / (1 + (2 / x) ** -1.5);
    const r = ok(fitCurve(pts(dose, f), { model: 'hill_4pl' }));
    expect(r.converged).toBe(true);
    expect(value(r, 2)).toBeCloseTo(2, 3);
    expect(value(r, 3)).toBeCloseTo(-1.5, 3);
  });
  it('fits noisy data and gives errors, with a prediction interval wider than the interval of the curve', () => {
    const noise = [0.8, -1.1, 0.6, -0.4, 1.3, -0.9, 0.5, -0.7, 0.2];
    const f = (x: number) => 8 + 92 / (1 + (30 / x) ** 1.0);
    const r = ok(fitCurve(dose.map((x, i) => ({ x, y: f(x) + noise[i] * 2 })), { model: 'hill_4pl' }));
    expect(r.converged).toBe(true);
    expect(value(r, 2)).toBeGreaterThan(20);
    expect(value(r, 2)).toBeLessThan(45);
    expect(r.params.every((p) => p.se !== null && p.lower! < p.value && p.upper! > p.value)).toBe(true);
    const ci = r.halfWidth(30, 'confidence', 0.95)!;
    const pi = r.halfWidth(30, 'prediction', 0.95)!;
    expect(ci).toBeGreaterThan(0);
    expect(pi).toBeGreaterThan(ci);
    expect(r.df).toBe(5);
  });
  it('leaves out points whose X is not above 0, and says so', () => {
    const r = ok(fitCurve([{ x: 0, y: 1 }, { x: -1, y: 2 }, ...pts(dose, (x) => 10 + 90 / (1 + (50 / x) ** 1.2))], { model: 'hill_4pl' }));
    expect(r.n).toBe(9);
    expect(r.message).toMatch(/2 points were left out/);
  });
  it('recovers the other models', () => {
    const xs = [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10];
    const decay = ok(fitCurve(pts(xs, (x) => 2 + 8 * Math.exp(-0.4 * x)), { model: 'exp_decay' }));
    expect([value(decay, 0), value(decay, 1), value(decay, 2)].map((v) => Number(v.toFixed(5)))).toEqual([2, 8, 0.4]);
    const assoc = ok(fitCurve(pts(xs, (x) => 1 + 6 * (1 - Math.exp(-0.5 * x))), { model: 'exp_association' }));
    expect([value(assoc, 0), value(assoc, 1), value(assoc, 2)].map((v) => Number(v.toFixed(5)))).toEqual([1, 6, 0.5]);
    const peak = ok(fitCurve(pts([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6], (x) => 1 + 9 * Math.exp(-0.5 * ((x - 1) / 1.5) ** 2)), { model: 'gaussian_peak' }));
    expect([value(peak, 0), value(peak, 1), value(peak, 2), value(peak, 3)].map((v) => Number(v.toFixed(4)))).toEqual([1, 9, 1, 1.5]);
    const mm = ok(fitCurve(pts([0.5, 1, 2, 4, 8, 16, 32, 64], (x) => (12 * x) / (5 + x)), { model: 'hyperbola' }));
    expect(value(mm, 1)).toBeCloseTo(12, 4);
    expect(value(mm, 2)).toBeCloseTo(5, 4);
  });
  it('fits two phases of decay with separated rates', () => {
    const xs = Array.from({ length: 24 }, (_, i) => i * 0.5);
    const r = ok(fitCurve(pts(xs, (x) => 1 + 6 * Math.exp(-2.5 * x) + 4 * Math.exp(-0.15 * x)), { model: 'exp_two_phase' }));
    expect(r.converged).toBe(true);
    expect(r.rss).toBeLessThan(1e-6);
    expect(r.params.map((p) => p.name)).toHaveLength(5);
  });
  it('names the fast phase k1 and the slow one k2 whichever phase the data lists first', () => {
    const xs = Array.from({ length: 30 }, (_, i) => (i * 12) / 29);
    for (const [k1, a1, k2, a2] of [[2.5, 6, 0.15, 4], [0.15, 4, 2.5, 6], [0.05, 1, 3, 9], [20, 5, 0.1, 2]] as const) {
      const r = ok(fitCurve(pts(xs, (x) => 1 + a1 * Math.exp(-k1 * x) + a2 * Math.exp(-k2 * x)), { model: 'exp_two_phase' }));
      expect(r.converged).toBe(true);
      expect(value(r, 2)).toBeGreaterThan(value(r, 4));
      expect(value(r, 2)).toBeCloseTo(Math.max(k1, k2), 3);
      expect(value(r, 4)).toBeCloseTo(Math.min(k1, k2), 3);
    }
  });
  it('finds both rates of a curve whose first start used to end with the two rates equal', () => {
    const xs = Array.from({ length: 30 }, (_, i) => (i * 6) / 29);
    const r = ok(fitCurve(pts(xs, (x) => 1 + 2 * Math.exp(-5 * x) + 8 * Math.exp(-0.5 * x)), { model: 'exp_two_phase' }));
    expect(r.converged).toBe(true);
    expect(value(r, 2)).toBeCloseTo(5, 4);
    expect(value(r, 4)).toBeCloseTo(0.5, 4);
    expect(value(r, 1)).toBeCloseTo(2, 4);
    expect(value(r, 3)).toBeCloseTo(8, 4);
  });
  it('never shows uncertainty for a fit that did not settle (one exponential fitted by two phases)', () => {
    const xs = Array.from({ length: 30 }, (_, i) => i / 3);
    const r = ok(fitCurve(pts(xs, (x) => 1 + 4 * Math.exp(-0.7 * x)), { model: 'exp_two_phase' }));
    // Two phases are not fixed by one: either it does not settle, or the parameters cannot be told apart.
    if (!r.converged) expect(r.params.every((q) => q.se === null)).toBe(true);
  });
  it('keeps a rate from going negative', () => {
    const r = ok(fitCurve(pts([0, 1, 2, 3, 4, 5], (x) => 3 + 2 * x), { model: 'exp_decay' }));
    expect(value(r, 2)).toBeGreaterThanOrEqual(0);
  });
  it('is reproducible', () => {
    const data = pts([0.1, 1, 10, 100, 1000], (x) => 4 + 60 / (1 + (20 / x) ** 0.9) + Math.sin(x));
    const a = ok(fitCurve(data, { model: 'hill_4pl' }));
    const b = ok(fitCurve(data, { model: 'hill_4pl' }));
    expect(a.params.map((p) => p.value)).toEqual(b.params.map((p) => p.value));
  });
  it('says so when the points do not fix the parameters, and never invents a band', () => {
    // As many points as parameters: nothing left to estimate the error from.
    const r = fitCurve(pts([1, 10, 100, 1000], (x) => 10 + 90 / (1 + (50 / x) ** 1.2)), { model: 'hill_4pl' });
    const fit = ok(r);
    expect(fit.df).toBe(0);
    expect(fit.halfWidth(50, 'confidence', 0.95)).toBeNull();
    expect(fit.params.every((p) => p.se === null)).toBe(true);
  });
  it('gives nothing wrong for flat data: either a curve with no NaN, or a reason', () => {
    const r = fitCurve(pts(dose, () => 5), { model: 'hill_4pl' });
    if (isFailure(r)) expect(r.message.length).toBeGreaterThan(0);
    else for (const x of [1, 10, 100]) expect(Number.isFinite(r.predict(x))).toBe(true);
  });
});

describe('the models', () => {
  it('each has a name, a formula, and parameter names that match its function', () => {
    for (const m of FIT_MODELS) {
      const d = m.id === 'polynomial' ? 3 : m.id === 'linear' ? 1 : 0;
      const names = m.paramNames(d);
      expect(m.label.length).toBeGreaterThan(3);
      expect(m.formula.length).toBeGreaterThan(3);
      const p = m.linear ? names.map(() => 1) : m.init([1, 2, 3, 4, 5, 6], [1, 2, 3, 3, 2, 1], d);
      expect(p).toHaveLength(names.length);
      expect(Number.isFinite(m.fn(2, p))).toBe(true);
    }
    expect(fitModelById('hill_4pl').positiveX).toBe(true);
    expect(fitModelById('linear').positiveX).toBeUndefined();
  });
  it('evaluate the formulas of the spec', () => {
    expect(fitModelById('exp_decay').fn(0, [2, 8, 0.4])).toBe(10);
    expect(fitModelById('hill_4pl').fn(50, [10, 100, 50, 2])).toBeCloseTo(55, 12);
    expect(fitModelById('asymmetric_5pl').fn(50, [10, 100, 50, 1, 2])).toBeCloseTo(10 + 90 / 4, 12);
    expect(fitModelById('hyperbola').fn(5, [0, 12, 5])).toBe(6);
    expect(fitModelById('gaussian_peak').fn(1, [1, 9, 1, 1.5])).toBe(10);
    expect(fitModelById('polynomial').fn(2, [1, 2, 3])).toBe(17);
  });
});

describe('reviewed regressions (confidence level, convergence, invariance)', () => {
  const X = [1, 2, 3, 4, 5];
  const Y = [2.1, 3.9, 6.2, 7.8, 10.1];
  const data = X.map((x, i) => ({ x, y: Y[i] }));

  it('widens parameter intervals with the confidence level', () => {
    const s = (level: number) => ok(fitCurve(data, { model: 'linear', level })).params[1];
    expect(s(0.95).lower).toBeCloseTo(1.799939, 5);
    expect(s(0.95).upper).toBeCloseTo(2.180061, 5);
    expect(s(0.99).lower).toBeCloseTo(1.641172, 5);
    expect(s(0.99).upper).toBeCloseTo(2.338828, 5);
    expect(s(0.9).upper! - s(0.9).lower!).toBeLessThan(s(0.95).upper! - s(0.95).lower!);
  });

  it('gives no errors or bands when a nonlinear fit did not converge', () => {
    const xs = Array.from({ length: 12 }, (_, i) => i);
    const noisy = xs.map((x, i) => ({ x, y: 5 + 3 * Math.exp(-0.5 * x) + 2 * Math.exp(-0.05 * x) + (i % 2 ? 0.3 : -0.3) }));
    const r = ok(fitCurve(noisy, { model: 'exp_two_phase', maxIterations: 2 }));
    expect(r.converged).toBe(false);
    expect(r.halfWidth(3, 'confidence', 0.95)).toBeNull();
    expect(r.params.every((p) => p.se === null && p.lower === null)).toBe(true);
    expect(Number.isFinite(r.predict(3))).toBe(true);
  });

  it('is unchanged by shifting X by 1e8', () => {
    const base = ok(fitCurve([0, 1, 2, 3, 4].map((x) => ({ x, y: 2 * x + 1 })), { model: 'linear' }));
    const shifted = ok(fitCurve([0, 1, 2, 3, 4].map((x) => ({ x: x + 1e8, y: 2 * x + 1 })), { model: 'linear' }));
    expect(base.params[1].value).toBeCloseTo(2, 10);
    expect(shifted.params[1].value).toBeCloseTo(2, 6);
    expect(shifted.predict(1e8 + 2.5)).toBeCloseTo(6, 8);
    expect(shifted.rSquared).toBeCloseTo(1, 10);
  });

  it('reports polynomial coefficients in the original X after centring', () => {
    const r = ok(fitCurve([-2, -1, 0, 1, 2, 3].map((x) => ({ x: x + 10, y: 1 + 2 * (x + 10) + 0.5 * (x + 10) ** 2 })), { model: 'polynomial', degree: 2 }));
    expect(r.params[0].value).toBeCloseTo(1, 6);
    expect(r.params[1].value).toBeCloseTo(2, 6);
    expect(r.params[2].value).toBeCloseTo(0.5, 8);
  });

  it('fits a four-parameter logistic whatever the unit of X', () => {
    const f = (x: number) => 1 + 9 / (1 + (5 / x) ** 1.5);
    const xs = [0.5, 1, 2, 3, 5, 8, 12, 20, 40];
    for (const k of [1, 1e-9, 1e6]) {
      const r = ok(fitCurve(xs.map((x) => ({ x: x * k, y: f(x) + (x % 2 ? 0.01 : -0.01) })), { model: 'hill_4pl' }));
      expect(r.converged, `unit ${k}`).toBe(true);
      expect(r.rss, `unit ${k}`).toBeLessThan(0.01);
    }
  });
});

describe('the domain of X', () => {
  it('a hyperbola keeps the point at X = 0, which its formula defines', () => {
    const r = ok(fitCurve([{ x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 4 }], { model: 'hyperbola' }));
    expect(r.n).toBe(3);
  });
  it('a hyperbola still drops negative X, where its denominator can vanish', () => {
    const r = fitCurve([{ x: -1, y: 0 }, { x: 0, y: 1 }, { x: 1, y: 3 }, { x: 2, y: 4 }], { model: 'hyperbola' });
    expect(isFailure(r) ? -1 : r.n).toBe(3);
  });
  it('a model with x in a denominator or power still drops X <= 0 and says what it needs', () => {
    const r = fitCurve([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 4 }, { x: 4, y: 6 }], { model: 'hill_4pl' });
    expect(isFailure(r)).toBe(true);
    if (isFailure(r)) expect(r.message).toContain('X above 0');
    const h = fitCurve([{ x: 0, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 4 }, { x: 4, y: 6 }, { x: 8, y: 7 }, { x: 16, y: 7.5 }], { model: 'hill_4pl' });
    expect(isFailure(h) ? -1 : h.n).toBe(5);
  });
  it('the failure of a hyperbola says X must be 0 or above', () => {
    const r = fitCurve([{ x: -1, y: 1 }, { x: -2, y: 3 }, { x: 0, y: 4 }], { model: 'hyperbola' });
    expect(isFailure(r)).toBe(true);
    if (isFailure(r)) expect(r.message).toContain('X of 0 or above');
  });
});

/**
 * NIST Statistical Reference Datasets, nonlinear regression, MGH17 ("higher difficulty"): y = b1 + b2 exp(-b4 x) + b3 exp(-b5 x).
 * The data and the certified values are NIST's (https://www.itl.nist.gov/div898/strd/nls/data/mgh17.shtml), not the output of this code.
 * Here the parameters are c = b1, A1 = b3 with the faster rate k1 = b5, A2 = b2 with the slower rate k2 = b4.
 */
describe('two-phase decay against the NIST certified values (MGH17)', () => {
  const y = [0.844, 0.908, 0.932, 0.936, 0.925, 0.908, 0.881, 0.85, 0.818, 0.784, 0.751, 0.718, 0.685, 0.658, 0.628, 0.603, 0.58, 0.558, 0.538, 0.522, 0.506, 0.49, 0.478, 0.467, 0.457, 0.448, 0.438, 0.431, 0.424, 0.42, 0.414, 0.411, 0.406];
  const data = y.map((v, i) => ({ x: 10 * i, y: v }));
  const certified = {
    values: [0.37541005211, -1.4646871366, 0.022122699662, 1.9358469127, 0.012867534640],
    sds: [2.0723153551e-3, 2.2175707739e-1, 8.9471996575e-4, 2.2031669222e-1, 4.4861374664e-4],
    residualSd: 1.3970497866e-3,
    rss: 5.4648946975e-5,
  };
  const close = (got: number, want: number, rel: number) => expect(Math.abs(got - want) / Math.abs(want)).toBeLessThan(rel);
  const r = ok(fitCurve(data, { model: 'exp_two_phase' }));

  it('finds the certified minimum from the automatic start, and calls it settled', () => {
    expect(r.converged).toBe(true);
    expect(r.message).toBeNull();
    expect(r.df).toBe(28);
    close(r.rss, certified.rss, 1e-7);
    close(r.sigma!, certified.residualSd, 1e-7);
    certified.values.forEach((want, i) => close(value(r, i), want, 1e-6));
  });
  it('gives the certified standard errors', () => {
    certified.sds.forEach((want, i) => close(r.params[i].se!, want, 1e-6));
  });
  it('gives intervals of the parameters from the t quantile of 28 degrees of freedom (2.048407142)', () => {
    const t = 2.048407142;
    r.params.forEach((p) => {
      expect(p.lower).toBeCloseTo(p.value - t * p.se!, 9);
      expect(p.upper).toBeCloseTo(p.value + t * p.se!, 9);
    });
  });
  it('gives bands that agree with the delta method worked out here from the certified values, by a separate small solver', () => {
    const [c, a1, k1, a2, k2] = certified.values;
    const gradient = (x: number) => [1, Math.exp(-k1 * x), -a1 * x * Math.exp(-k1 * x), Math.exp(-k2 * x), -a2 * x * Math.exp(-k2 * x)];
    // The gradient is of c, A1, k1, A2, k2 in the order of the parameters here; J'J by hand, inverted by Gauss-Jordan.
    const rows = data.map((q) => [1, Math.exp(-k1 * q.x), -a1 * q.x * Math.exp(-k1 * q.x), Math.exp(-k2 * q.x), -a2 * q.x * Math.exp(-k2 * q.x)]);
    const n = 5;
    const m = Array.from({ length: n }, (_, i) => [...Array.from({ length: n }, (_, j) => rows.reduce((s, row) => s + row[i] * row[j], 0)), ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
    for (let i = 0; i < n; i++) {
      let p = i;
      for (let k = i + 1; k < n; k++) if (Math.abs(m[k][i]) > Math.abs(m[p][i])) p = k;
      [m[i], m[p]] = [m[p], m[i]];
      const d = m[i][i];
      for (let j = 0; j < 2 * n; j++) m[i][j] /= d;
      for (let k = 0; k < n; k++) {
        if (k === i) continue;
        const f = m[k][i];
        for (let j = 0; j < 2 * n; j++) m[k][j] -= f * m[i][j];
      }
    }
    const inv = m.map((row) => row.slice(n));
    // The same covariance gives the certified standard errors: the check that this solver is right.
    inv.forEach((row, i) => close(certified.residualSd * Math.sqrt(row[i]), certified.sds[i], 1e-6));
    const t = 2.048407142;
    for (const x of [0, 60, 150, 320, 400]) {
      const g = gradient(x);
      let v = 0;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) v += g[i] * inv[i][j] * g[j];
      const s2 = certified.residualSd ** 2;
      close(r.halfWidth(x, 'confidence', 0.95)!, t * certified.residualSd * Math.sqrt(v), 1e-4);
      close(r.halfWidth(x, 'prediction', 0.95)!, t * Math.sqrt(s2 * v + s2), 1e-4);
    }
    // And the curve itself is the certified one.
    expect(r.predict(100)).toBeCloseTo(c + a1 * Math.exp(-k1 * 100) + a2 * Math.exp(-k2 * 100), 7);
  });
  it('widens the bands with the level, by the ratio of the t quantiles', () => {
    const t95 = 2.048407142;
    const t99 = 2.763262455;
    close(r.halfWidth(150, 'confidence', 0.99)! / r.halfWidth(150, 'confidence', 0.95)!, t99 / t95, 1e-6);
  });
});
