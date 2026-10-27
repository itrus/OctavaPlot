import { describe, expect, it } from 'vitest';
import { fitCurve, fitModelById, isFailure, type FitModelId, type FitResult } from './fit';

/**
 * Metamorphic tests of the nonlinear fits: exact data from known parameters, then X shifted or rescaled and Y rescaled. The
 * parameters must come back by the dimension rule (levels and amplitudes with Y, positions and widths with X, rates with
 * 1 / X, pure numbers unchanged), whatever the units.
 */

type Dim = 'yloc' | 'yamp' | 'xloc' | 'x' | 'rate' | 'one';

interface Case {
  id: FitModelId;
  p: number[];
  dims: Dim[];
  xs: number[];
  /** Whether a shifted X (x + s) is a plain change of the parameters (an exponential or a peak, not a ratio of X). */
  shift: boolean;
}

const dose = [0.1, 0.3, 1, 3, 10, 30, 100, 300, 1000];
const lin = (n: number, step: number, from = 0) => Array.from({ length: n }, (_, i) => from + i * step);

const CASES: Case[] = [
  { id: 'exp_decay', p: [2, 8, 0.4], dims: ['yloc', 'yamp', 'rate'], xs: [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10], shift: true },
  { id: 'exp_association', p: [1, 6, 0.5], dims: ['yloc', 'yamp', 'rate'], xs: [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10], shift: true },
  { id: 'exp_two_phase', p: [1, 6, 2.5, 4, 0.15], dims: ['yloc', 'yamp', 'rate', 'yamp', 'rate'], xs: lin(24, 0.5), shift: false },
  { id: 'gaussian_peak', p: [1, 9, 1, 1.5], dims: ['yloc', 'yamp', 'xloc', 'x'], xs: lin(12, 1, -5), shift: true },
  { id: 'hyperbola', p: [1, 12, 5], dims: ['yloc', 'yamp', 'x'], xs: [0.5, 1, 2, 4, 8, 16, 32, 64], shift: false },
  { id: 'hill_4pl', p: [10, 100, 50, 1.2], dims: ['yloc', 'yloc', 'x', 'one'], xs: dose, shift: false },
  { id: 'asymmetric_5pl', p: [10, 100, 50, 1.2, 0.8], dims: ['yloc', 'yloc', 'x', 'one', 'one'], xs: dose, shift: false },
];

const ok = (r: ReturnType<typeof fitCurve>): FitResult => {
  if (isFailure(r)) throw new Error(r.message);
  return r;
};

/** The parameters of the same curve after x -> a x + s and y -> b y. */
function expected(c: Case, a: number, s: number, b: number): number[] {
  const q = c.p.map((v, i) => {
    switch (c.dims[i]) {
      case 'yloc':
      case 'yamp': return v * b;
      case 'xloc': return v * a + s;
      case 'x': return v * a;
      case 'rate': return v / a;
      default: return v;
    }
  });
  if (s !== 0) {
    // y = c + A exp(-k (x' - s)) = c + A e^{ks} exp(-k x'); and the association form moves its constant to keep the curve.
    const pairs: Array<[number, number]> = c.id === 'exp_association' || c.id === 'exp_decay' ? [[1, 2]] : [];
    for (const [i, k] of pairs) {
      const was = q[i];
      q[i] = was * Math.exp(q[k] * s);
      if (c.id === 'exp_association') q[0] += was - q[i];
    }
  }
  return q;
}

const curve = (c: Case, x: number) => fitModelById(c.id).fn(x, c.p);

function check(c: Case, a: number, s: number, b: number) {
  const label = `${c.id} x*${a} +${s} y*${b}`;
  const pts = c.xs.map((x) => ({ x: x * a + s, y: curve(c, x) * b }));
  const r = ok(fitCurve(pts, { model: c.id }));
  expect(r.converged, label).toBe(true);
  const want = expected(c, a, s, b);
  const yRange = Math.max(...pts.map((q) => q.y)) - Math.min(...pts.map((q) => q.y));
  want.forEach((w, i) => {
    const ref = c.dims[i] === 'yloc' ? Math.max(Math.abs(w), yRange) : Math.abs(w);
    expect(Math.abs(r.params[i].value - w) / ref, `${label} ${r.params[i].name}: ${r.params[i].value} vs ${w}`).toBeLessThan(1e-5);
  });
  for (const q of pts) expect(Math.abs(r.predict(q.x) - q.y) / yRange, `${label} predict`).toBeLessThan(1e-7);
  expect(r.rSquared!, label).toBeGreaterThan(1 - 1e-10);
  // Residual quantities come back in the units of Y.
  expect(r.rss, label).toBeLessThan(1e-12 * yRange * yRange);
}

describe('nonlinear fits are the same in any units', () => {
  for (const c of CASES) {
    describe(c.id, () => {
      it('is unchanged by rescaling X', () => {
        for (const a of [1e-6, 1e-3, 1, 1e3, 1e6]) check(c, a, 0, 1);
      });
      it('is unchanged by rescaling Y', () => {
        for (const b of [1e-9, 1e-3, 1, 1e3, 1e9]) check(c, 1, 0, b);
      });
      it('is unchanged by rescaling X and Y together', () => {
        check(c, 1e-6, 0, 1e9);
        check(c, 1e6, 0, 1e-9);
      });
      if (c.shift) {
        it('is unchanged by shifting X by 1000', () => {
          // A two-phase decay is left out of this: its amplitude would be exp(2500), beyond a double.
          check(c, 1, 1e3, 1);
          check(c, 1, 1e3, 1e-3);
        });
      }
    });
  }

  it('finds y = 2 + 8 exp(-0.4 x) with Y multiplied by 1e-9: rate 0.4, baseline 2e-9', () => {
    const xs = [0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 10];
    const r = ok(fitCurve(xs.map((x) => ({ x, y: (2 + 8 * Math.exp(-0.4 * x)) * 1e-9 })), { model: 'exp_decay' }));
    expect(r.converged).toBe(true);
    expect(r.params[2].value).toBeCloseTo(0.4, 6);
    expect(r.params[0].value / 2e-9).toBeCloseTo(1, 6);
    expect(r.params[1].value / 8e-9).toBeCloseTo(1, 6);
  });

  it('gives errors and bands in the units of the data, in proportion to the scale of Y and X', () => {
    const noise = [0.8, -1.1, 0.6, -0.4, 1.3, -0.9, 0.5, -0.7, 0.2];
    const f = (x: number) => 8 + 92 / (1 + (30 / x) ** 1.0);
    const base = ok(fitCurve(dose.map((x, i) => ({ x, y: f(x) + noise[i] * 2 })), { model: 'hill_4pl' }));
    const scaled = ok(fitCurve(dose.map((x, i) => ({ x: x * 1e-6, y: (f(x) + noise[i] * 2) * 1e6 })), { model: 'hill_4pl' }));
    expect(base.converged && scaled.converged).toBe(true);
    // Levels and the dose scale by their factors, the slope is a pure number.
    const factor = [1e6, 1e6, 1e-6, 1];
    base.params.forEach((q, i) => {
      expect(scaled.params[i].value / (q.value * factor[i])).toBeCloseTo(1, 4);
      expect(scaled.params[i].se! / (q.se! * factor[i])).toBeCloseTo(1, 3);
      expect(scaled.params[i].lower! / (q.lower! * factor[i])).toBeCloseTo(1, 4);
    });
    expect(scaled.rss / (base.rss * 1e12)).toBeCloseTo(1, 6);
    expect(scaled.sigma! / (base.sigma! * 1e6)).toBeCloseTo(1, 6);
    expect(scaled.halfWidth(30e-6, 'prediction', 0.95)! / (base.halfWidth(30, 'prediction', 0.95)! * 1e6)).toBeCloseTo(1, 4);
    expect(scaled.halfWidth(30e-6, 'confidence', 0.95)! / (base.halfWidth(30, 'confidence', 0.95)! * 1e6)).toBeCloseTo(1, 4);
  });
});

describe('degenerate data are not reported as a clean fit', () => {
  const clean = (r: FitResult) => r.converged && r.message === null;

  it('constant Y gives no errors and no clean convergence, in any model', () => {
    for (const c of CASES) {
      for (const level of [5, 5e-9, 5e9]) {
        const r = fitCurve(c.xs.map((x) => ({ x, y: level })), { model: c.id });
        if (isFailure(r)) continue;
        expect(clean(r), `${c.id} ${level}`).toBe(false);
        expect(r.params.every((q) => q.se === null && q.lower === null && q.upper === null), `${c.id} ${level}`).toBe(true);
        expect(r.halfWidth(c.xs[2], 'confidence', 0.95), c.id).toBeNull();
      }
    }
  });

  it('too few points for the parameters is a failure', () => {
    expect(isFailure(fitCurve([{ x: 0, y: 1 }, { x: 1, y: 0.5 }], { model: 'exp_decay' }))).toBe(true);
    expect(isFailure(fitCurve([{ x: 1, y: 1 }, { x: 2, y: 3 }, { x: 3, y: 4 }], { model: 'hill_4pl' }))).toBe(true);
  });

  it('collinear data, where the rate is not fixed, give no intervals and no clean convergence', () => {
    for (const id of ['exp_decay', 'exp_association'] as const) {
      for (const b of [1, 1e-9, 1e9]) {
        const r = ok(fitCurve([0, 1, 2, 3, 4, 5].map((x) => ({ x, y: (3 + 2 * x) * b })), { model: id }));
        expect(clean(r), `${id} ${b}`).toBe(false);
        expect(r.params.every((q) => q.se === null), `${id} ${b}`).toBe(true);
        expect(r.halfWidth(2, 'prediction', 0.95), id).toBeNull();
      }
    }
  });
});

describe('X far from zero', () => {
  it('a peak fitted with X shifted by 1e8 comes back with its position shifted and its height, width and level unchanged', () => {
    const shift = 1e8;
    const c = CASES.find((k) => k.id === 'gaussian_peak')!;
    const model = fitModelById('gaussian_peak');
    const pts = c.xs.map((x) => ({ x: x + shift, y: model.fn(x, c.p) }));
    const r = ok(fitCurve(pts, { model: 'gaussian_peak' }));
    expect(r.converged).toBe(true);
    const [level, height, centre, width] = r.params.map((q) => q.value);
    expect(level).toBeCloseTo(c.p[0], 5);
    expect(height).toBeCloseTo(c.p[1], 5);
    expect(centre - shift).toBeCloseTo(c.p[2], 3);
    expect(width).toBeCloseTo(c.p[3], 5);
  });
});
