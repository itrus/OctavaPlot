/** The models a curve can be fitted with (spec 17): the formula, the starting values and the bounds of each. The numerical part is in fit.ts. */
import { invert, type Mat } from './linalg';
import { meanOf } from './moments';

export type FitModelId = 'linear' | 'polynomial' | 'exp_decay' | 'exp_association' | 'exp_two_phase' | 'gaussian_peak' | 'hyperbola' | 'hill_4pl' | 'asymmetric_5pl';

export interface FitModel {
  id: FitModelId;
  label: string;
  /** What the curve is, for the help text and the label of the curve. */
  formula: string;
  linear: boolean;
  /** Names of the parameters, in the order of `fn`. A polynomial has degree + 1. */
  paramNames: (degree: number) => string[];
  fn: (x: number, p: readonly number[]) => number;
  /** Starting values from the data. */
  init: (xs: readonly number[], ys: readonly number[], degree: number) => number[];
  /** Other starting values to try as well (the fit keeps the best result): for a model whose one start can end in a local minimum. */
  starts?: (xs: readonly number[], ys: readonly number[]) => number[][];
  /** Bounds of each parameter (a rate cannot be negative), for the nonlinear models. */
  lower?: (n: number) => number[];
  /** X must be above 0 (the formula has x in a denominator or a power). */
  positiveX?: boolean;
  /** X may be 0 but not negative (the formula is defined at 0, and a negative X can put a pole in the denominator). */
  nonNegativeX?: boolean;
  /** Fewest points that can fix the parameters. */
  minPoints: (degree: number) => number;
}

const minOf = (a: readonly number[]) => a.reduce((m, v) => (v < m ? v : m), Infinity);
const maxOf = (a: readonly number[]) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
export const range = (a: readonly number[]): [number, number] => [minOf(a), maxOf(a)];

/**
 * Starting values for c + A1 exp(-k1 x) + A2 exp(-k2 x) by variable projection: for each pair of rates on a grid (k1 above k2, in
 * units of 1 / the range of X), the offset and the two amplitudes that fit best are found by linear least squares, and the pairs with
 * the smallest residual are the starts. A single start from the ends of the data can end with the two rates equal; these cannot.
 */
function twoPhaseStarts(xs: readonly number[], ys: readonly number[]): number[][] {
  const [x0, x1] = [minOf(xs), maxOf(xs)];
  const span = Math.max(x1 - x0, 1e-12);
  const grid: number[] = [];
  for (let k = 0.1; k <= 100; k *= 1.5) grid.push(k / span);
  const found: Array<{ rss: number; start: number[] }> = [];
  for (let i = 0; i < grid.length; i++) {
    for (let j = 0; j < i; j++) {
      const k1 = grid[i];
      const k2 = grid[j];
      const cols = [xs.map(() => 1), xs.map((x) => Math.exp(-k1 * (x - x0))), xs.map((x) => Math.exp(-k2 * (x - x0)))];
      const a: Mat = cols.map((ci) => cols.map((cj) => ci.reduce((sum, v, r) => sum + v * cj[r], 0)));
      const inv = invert(a);
      if (!inv) continue;
      const b = cols.map((ci) => ci.reduce((sum, v, r) => sum + v * ys[r], 0));
      const [c, a1, a2] = inv.map((row) => row.reduce((sum, v, r) => sum + v * b[r], 0));
      let rss = 0;
      for (let r = 0; r < xs.length; r++) rss += (ys[r] - c - a1 * cols[1][r] - a2 * cols[2][r]) ** 2;
      // The amplitudes are those at X = x0 here; the model has them at X = 0, so they are taken back.
      if (Number.isFinite(rss)) found.push({ rss, start: [c, a1 * Math.exp(k1 * x0), k1, a2 * Math.exp(k2 * x0), k2] });
    }
  }
  return found.sort((u, v) => u.rss - v.rss).slice(0, 3).map((f) => f.start);
}
const trendSign = (xs: readonly number[], ys: readonly number[]) => {
  const mx = meanOf(xs);
  const my = meanOf(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s >= 0 ? 1 : -1;
};
export const geoMid = (xs: readonly number[]) => {
  const pos = xs.filter((x) => x > 0);
  return pos.length ? Math.exp(meanOf(pos.map(Math.log))) : 1;
};
const INF = Infinity;

export const FIT_MODELS: readonly FitModel[] = [
  {
    id: 'linear',
    label: 'Straight line',
    formula: 'a + b x',
    linear: true,
    paramNames: () => ['a (intercept)', 'b (slope)'],
    fn: (x, p) => p[0] + p[1] * x,
    init: () => [0, 0],
    minPoints: () => 2,
  },
  {
    id: 'polynomial',
    label: 'Polynomial',
    formula: 'a0 + a1 x + a2 x^2 + ...',
    linear: true,
    paramNames: (d) => Array.from({ length: d + 1 }, (_, i) => `a${i}`),
    fn: (x, p) => p.reduceRight((acc, c) => acc * x + c, 0),
    init: (_x, _y, d) => new Array<number>(d + 1).fill(0),
    minPoints: (d) => d + 1,
  },
  {
    id: 'exp_decay',
    label: 'One-phase decay',
    formula: 'c + A exp(-k x)',
    linear: false,
    paramNames: () => ['c (plateau)', 'A (span)', 'k (rate)'],
    fn: (x, p) => p[0] + p[1] * Math.exp(-p[2] * x),
    init: (xs, ys) => {
      const [x0, x1] = range(xs);
      const first = ys[xs.indexOf(x0)];
      const last = ys[xs.indexOf(x1)];
      return [last, first - last, 3 / Math.max(x1 - x0, 1e-12)];
    },
    lower: () => [-INF, -INF, 0],
    minPoints: () => 3,
  },
  {
    id: 'exp_association',
    label: 'One-phase association',
    formula: 'c + A (1 - exp(-k x))',
    linear: false,
    paramNames: () => ['c (start)', 'A (span)', 'k (rate)'],
    fn: (x, p) => p[0] + p[1] * (1 - Math.exp(-p[2] * x)),
    init: (xs, ys) => {
      const [x0, x1] = range(xs);
      const first = ys[xs.indexOf(x0)];
      const last = ys[xs.indexOf(x1)];
      return [first, last - first, 3 / Math.max(x1 - x0, 1e-12)];
    },
    lower: () => [-INF, -INF, 0],
    minPoints: () => 3,
  },
  {
    id: 'exp_two_phase',
    label: 'Two-phase decay',
    formula: 'c + A1 exp(-k1 x) + A2 exp(-k2 x)',
    linear: false,
    paramNames: () => ['c (plateau)', 'A1', 'k1 (fast rate)', 'A2', 'k2 (slow rate)'],
    fn: (x, p) => p[0] + p[1] * Math.exp(-p[2] * x) + p[3] * Math.exp(-p[4] * x),
    init: (xs, ys) => {
      const [x0, x1] = range(xs);
      const span = Math.max(x1 - x0, 1e-12);
      const first = ys[xs.indexOf(x0)];
      const last = ys[xs.indexOf(x1)];
      return [last, (first - last) * 0.6, 10 / span, (first - last) * 0.4, 1 / span];
    },
    starts: (xs, ys) => twoPhaseStarts(xs, ys),
    lower: () => [-INF, -INF, 0, -INF, 0],
    minPoints: () => 5,
  },
  {
    id: 'gaussian_peak',
    label: 'Gaussian peak',
    formula: 'c + A exp(-0.5 ((x - mu) / sigma)^2)',
    linear: false,
    paramNames: () => ['c (baseline)', 'A (height)', 'mu (centre)', 'sigma (width)'],
    fn: (x, p) => p[0] + p[1] * Math.exp(-0.5 * ((x - p[2]) / p[3]) ** 2),
    init: (xs, ys) => {
      const base = minOf(ys);
      const top = maxOf(ys);
      const at = xs[ys.indexOf(top)];
      const [x0, x1] = range(xs);
      return [base, top - base, at, Math.max((x1 - x0) / 6, 1e-12)];
    },
    // A second start for an inverted peak (a dip): the baseline at the largest Y, the centre at the smallest. The first start cannot reach it.
    starts: (xs, ys) => {
      const base = maxOf(ys);
      const bottom = minOf(ys);
      const [x0, x1] = range(xs);
      return [[base, bottom - base, xs[ys.indexOf(bottom)], Math.max((x1 - x0) / 6, 1e-12)]];
    },
    lower: () => [-INF, -INF, -INF, 1e-12],
    minPoints: () => 4,
  },
  {
    id: 'hyperbola',
    label: 'Hyperbola (Michaelis-Menten)',
    formula: 'c + V x / (K + x)',
    linear: false,
    paramNames: () => ['c (offset)', 'V (maximum)', 'K (half-saturation)'],
    fn: (x, p) => p[0] + (p[1] * x) / (p[2] + x),
    init: (xs, ys) => {
      const top = maxOf(ys);
      return [0, top, Math.max(meanOf(xs), 1e-12)];
    },
    lower: () => [-INF, -INF, 1e-12],
    nonNegativeX: true,
    minPoints: () => 3,
  },
  {
    id: 'hill_4pl',
    label: 'Four-parameter logistic (Hill)',
    formula: 'bottom + (top - bottom) / (1 + (c / x)^h)',
    linear: false,
    paramNames: () => ['bottom', 'top', 'c (EC50 or IC50)', 'h (Hill slope)'],
    fn: (x, p) => p[0] + (p[1] - p[0]) / (1 + (p[2] / x) ** p[3]),
    init: (xs, ys) => {
      // A rising curve has a positive slope, a falling one a negative slope (the formula's own convention).
      const [lo, hi] = range(ys);
      const rising = trendSign(xs.map(Math.log), ys) > 0;
      return [lo, hi, geoMid(xs), rising ? 1 : -1];
    },
    lower: () => [-INF, -INF, 1e-12, -INF],
    positiveX: true,
    minPoints: () => 4,
  },
  {
    id: 'asymmetric_5pl',
    label: 'Five-parameter logistic',
    formula: 'bottom + (top - bottom) / (1 + (c / x)^h)^s',
    linear: false,
    paramNames: () => ['bottom', 'top', 'c', 'h (slope)', 's (asymmetry)'],
    fn: (x, p) => p[0] + (p[1] - p[0]) / (1 + (p[2] / x) ** p[3]) ** p[4],
    init: (xs, ys) => {
      const [lo, hi] = range(ys);
      const rising = trendSign(xs.map(Math.log), ys) > 0;
      return [lo, hi, geoMid(xs), rising ? 1 : -1, 1];
    },
    lower: () => [-INF, -INF, 1e-12, -INF, 1e-6],
    positiveX: true,
    minPoints: () => 5,
  },
];

export const fitModelById = (id: FitModelId): FitModel => FIT_MODELS.find((m) => m.id === id) ?? FIT_MODELS[0];
