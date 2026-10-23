/**
 * Curve fitting for plotted data (spec 17): least squares for straight lines and polynomials, Levenberg-Marquardt for
 * the other models, with the uncertainty of the curve from the parameter covariance. Pure and independent of drawing.
 */

import { studentTQuantileUpper } from './special';

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
  /** Bounds of each parameter (a rate cannot be negative), for the nonlinear models. */
  lower?: (n: number) => number[];
  upper?: (n: number) => number[];
  /** X must be above 0 (the formula has x in a denominator or a power). */
  positiveX?: boolean;
  /** Fewest points that can fix the parameters. */
  minPoints: (degree: number) => number;
}

const mean = (a: readonly number[]) => a.reduce((s, v) => s + v, 0) / a.length;
const range = (a: readonly number[]): [number, number] => [Math.min(...a), Math.max(...a)];
const trendSign = (xs: readonly number[], ys: readonly number[]) => {
  const mx = mean(xs);
  const my = mean(ys);
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += (xs[i] - mx) * (ys[i] - my);
  return s >= 0 ? 1 : -1;
};
const geoMid = (xs: readonly number[]) => {
  const pos = xs.filter((x) => x > 0);
  return pos.length ? Math.exp(mean(pos.map(Math.log))) : 1;
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
      const base = Math.min(...ys);
      const top = Math.max(...ys);
      const at = xs[ys.indexOf(top)];
      const [x0, x1] = range(xs);
      return [base, top - base, at, Math.max((x1 - x0) / 6, 1e-12)];
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
      const top = Math.max(...ys);
      return [0, top, Math.max(mean(xs), 1e-12)];
    },
    lower: () => [-INF, -INF, 1e-12],
    positiveX: true,
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

// ---------------------------------------------------------------------------------------------------------------
// Small dense linear algebra: matrices as arrays of rows.

type Mat = number[][];

/** Solve A x = b (A square) by Gaussian elimination with partial pivoting; null when A is singular. */
function solve(a: Mat, b: readonly number[]): number[] | null {
  const n = a.length;
  const m = a.map((row, i) => [...row, b[i]]);
  let scale = 0;
  for (const row of a) for (const v of row) scale = Math.max(scale, Math.abs(v));
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r][c]) > Math.abs(m[p][c])) p = r;
    if (!(Math.abs(m[p][c]) > 1e-13 * Math.max(scale, 1e-300))) return null;
    [m[c], m[p]] = [m[p], m[c]];
    for (let r = c + 1; r < n; r++) {
      const f = m[r][c] / m[c][c];
      for (let k = c; k <= n; k++) m[r][k] -= f * m[c][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = m[r][n];
    for (let k = r + 1; k < n; k++) s -= m[r][k] * x[k];
    x[r] = s / m[r][r];
  }
  return x;
}

/** The inverse of a square matrix; null when it is singular. */
function invert(a: Mat): Mat | null {
  const n = a.length;
  const cols: number[][] = [];
  for (let j = 0; j < n; j++) {
    const e = new Array<number>(n).fill(0);
    e[j] = 1;
    const col = solve(a, e);
    if (!col) return null;
    cols.push(col);
  }
  return a.map((_, i) => cols.map((c) => c[i]));
}

const jtj = (j: Mat): Mat => {
  const p = j[0]?.length ?? 0;
  const out: Mat = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  for (const row of j) for (let a = 0; a < p; a++) for (let b = a; b < p; b++) out[a][b] += row[a] * row[b];
  for (let a = 0; a < p; a++) for (let b = 0; b < a; b++) out[a][b] = out[b][a];
  return out;
};

// ---------------------------------------------------------------------------------------------------------------

export interface FitParam {
  name: string;
  value: number;
  /** Standard error; null when it cannot be had (no residual degrees of freedom, singular covariance). */
  se: number | null;
  lower: number | null;
  upper: number | null;
}

export interface FitResult {
  model: FitModelId;
  degree: number;
  params: FitParam[];
  n: number;
  /** Residual degrees of freedom, n - parameters. */
  df: number;
  rss: number;
  /** 1 - RSS / total sum of squares about the mean; null when the values do not vary. */
  rSquared: number | null;
  /** Residual standard error sqrt(RSS / df); null without degrees of freedom. */
  sigma: number | null;
  converged: boolean;
  /** Why there is no curve or no band, or what is doubtful; null when all is well. */
  message: string | null;
  /** The curve at x. */
  predict: (x: number) => number;
  /** The half-width of the pointwise interval of the curve at x (confidence of the mean, or prediction of a new value); null when unavailable. */
  halfWidth: (x: number, kind: 'confidence' | 'prediction', level: number) => number | null;
}

export interface FitOptions {
  model: FitModelId;
  degree?: number;
  maxIterations?: number;
  relativeTolerance?: number;
}

/** One failed fit: no curve at all, with the reason. */
export interface FitFailure {
  failed: true;
  message: string;
}

const MAX_ITERATIONS = 1000;
const REL_TOL = 1e-8;

/** The Jacobian of the model at the data, by central differences. */
function numericJacobian(model: FitModel, xs: readonly number[], p: readonly number[]): Mat {
  const rows: Mat = xs.map(() => new Array<number>(p.length).fill(0));
  for (let k = 0; k < p.length; k++) {
    const h = Math.max(Math.abs(p[k]) * 1e-6, 1e-9);
    const up = [...p];
    const down = [...p];
    up[k] += h;
    down[k] -= h;
    xs.forEach((x, i) => (rows[i][k] = (model.fn(x, up) - model.fn(x, down)) / (2 * h)));
  }
  return rows;
}

const cost = (model: FitModel, xs: readonly number[], ys: readonly number[], p: readonly number[]) => {
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    const r = ys[i] - model.fn(xs[i], p);
    s += r * r;
  }
  return Number.isFinite(s) ? s : Infinity;
};

/** Levenberg-Marquardt from `p0`, with the parameters held within their bounds. Returns where it stopped and whether it settled. */
function levenbergMarquardt(model: FitModel, xs: readonly number[], ys: readonly number[], p0: number[], lower: number[], upper: number[], maxIterations: number, relTol: number): { p: number[]; converged: boolean } {
  const clampP = (p: number[]) => p.map((v, i) => Math.min(upper[i], Math.max(lower[i], v)));
  let p = clampP(p0);
  let c = cost(model, xs, ys, p);
  let lambda = 1e-3;
  for (let it = 0; it < maxIterations; it++) {
    const j = numericJacobian(model, xs, p);
    const r = xs.map((x, i) => ys[i] - model.fn(x, p));
    const a = jtj(j);
    const g = p.map((_, k) => j.reduce((s, row, i) => s + row[k] * r[i], 0));
    const gradNorm = Math.sqrt(g.reduce((s, v) => s + v * v, 0));
    if (gradNorm <= 1e-12 * Math.max(1, Math.sqrt(c))) return { p, converged: true };
    let improved = false;
    for (let tries = 0; tries < 40; tries++) {
      const damped = a.map((row, i) => row.map((v, k) => (i === k ? v + lambda * Math.max(v, 1e-12) : v)));
      const step = solve(damped, g);
      if (step) {
        const trial = clampP(p.map((v, i) => v + step[i]));
        const tc = cost(model, xs, ys, trial);
        if (tc < c) {
          const rel = (c - tc) / Math.max(c, 1e-300);
          const move = Math.sqrt(trial.reduce((s, v, i) => s + (v - p[i]) ** 2, 0)) / Math.max(1e-12, Math.sqrt(p.reduce((s, v) => s + v * v, 0)));
          p = trial;
          c = tc;
          lambda = Math.max(lambda / 10, 1e-12);
          improved = true;
          if (rel < relTol || move < 1e-12 || c <= 1e-30) return { p, converged: true };
          break;
        }
      }
      lambda *= 10;
      if (lambda > 1e15) break;
    }
    if (!improved) {
      // No step lowers the cost: at a minimum when the gradient is small against the cost, else it is stuck.
      return { p, converged: gradNorm <= 1e-6 * Math.max(1, Math.sqrt(c)) || c <= 1e-30 };
    }
  }
  return { p, converged: false };
}

/** Least squares for a model that is linear in its parameters (a line or a polynomial), by normal equations on scaled columns. */
function linearLeastSquares(xs: readonly number[], ys: readonly number[], degree: number): { p: number[]; design: Mat } | null {
  const cols = degree + 1;
  const design: Mat = xs.map((x) => Array.from({ length: cols }, (_, k) => x ** k));
  // Scale each column to unit size so the normal equations are not ill-conditioned by x^k.
  const scale = Array.from({ length: cols }, (_, k) => Math.max(1e-300, ...design.map((row) => Math.abs(row[k]))));
  const scaled = design.map((row) => row.map((v, k) => v / scale[k]));
  const a = jtj(scaled);
  const b = Array.from({ length: cols }, (_, k) => scaled.reduce((s, row, i) => s + row[k] * ys[i], 0));
  const sol = solve(a, b);
  if (!sol) return null;
  return { p: sol.map((v, k) => v / scale[k]), design };
}

/**
 * Fit a model to points (x, y) (spec 17.3). A fit that cannot be made, or did not settle, is reported and not drawn as
 * if it had succeeded; the uncertainty of the curve is the local (Jacobian) approximation for the nonlinear models and the
 * classical one for a line or a polynomial (spec 17.3), pointwise, never simultaneous.
 */
export function fitCurve(points: ReadonlyArray<{ x: number; y: number }>, options: FitOptions): FitResult | FitFailure {
  const model = fitModelById(options.model);
  const degree = model.id === 'polynomial' ? Math.min(6, Math.max(2, Math.round(options.degree ?? 2))) : model.id === 'linear' ? 1 : 0;
  const pts = points.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && (!model.positiveX || q.x > 0));
  const dropped = points.length - pts.length;
  const names = model.paramNames(degree);
  const p = names.length;
  const needed = model.minPoints(degree);
  if (pts.length < needed) return { failed: true, message: `${model.label} needs at least ${needed} points with ${model.positiveX ? 'X above 0 and ' : ''}a value; there ${pts.length === 1 ? 'is' : 'are'} ${pts.length}.` };
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  if (new Set(xs).size < Math.min(needed, 2)) return { failed: true, message: 'The points have the same X: no curve can be fitted.' };

  let params: number[];
  let converged = true;
  let jac: Mat;
  if (model.linear) {
    const ls = linearLeastSquares(xs, ys, degree);
    if (!ls) return { failed: true, message: 'The fit is singular: the points do not fix the parameters.' };
    params = ls.p;
    jac = ls.design;
  } else {
    const start = model.init(xs, ys, degree);
    const lo = model.lower ? model.lower(p) : new Array<number>(p).fill(-Infinity);
    const hi = model.upper ? model.upper(p) : new Array<number>(p).fill(Infinity);
    const r = levenbergMarquardt(model, xs, ys, start, lo, hi, options.maxIterations ?? MAX_ITERATIONS, options.relativeTolerance ?? REL_TOL);
    params = r.p;
    converged = r.converged;
    jac = numericJacobian(model, xs, params);
  }
  const rss = cost(model, xs, ys, params);
  if (!Number.isFinite(rss)) return { failed: true, message: 'The fit did not give a curve (the values overflowed).' };
  const n = xs.length;
  const df = n - p;
  const sigma = df > 0 ? Math.sqrt(rss / df) : null;
  const my = mean(ys);
  const tss = ys.reduce((s, v) => s + (v - my) ** 2, 0);
  const rSquared = tss > 0 ? 1 - rss / tss : null;

  // Covariance of the parameters: sigma^2 (J'J)^-1; unavailable without degrees of freedom or when J'J is singular.
  const inv = df > 0 ? invert(jtj(jac)) : null;
  const cov = inv && sigma !== null ? inv.map((row) => row.map((v) => v * sigma * sigma)) : null;
  const se = (k: number): number | null => (cov && cov[k][k] >= 0 ? Math.sqrt(cov[k][k]) : null);
  const tcrit = (level: number) => studentTQuantileUpper((1 - level) / 2, df);
  const out: FitParam[] = names.map((name, k) => {
    const s = se(k);
    const t = tcrit(0.95);
    return { name, value: params[k], se: s, lower: s !== null && Number.isFinite(t) ? params[k] - t * s : null, upper: s !== null && Number.isFinite(t) ? params[k] + t * s : null };
  });

  const predict = (x: number) => model.fn(x, params);
  const gradient = (x: number): number[] => {
    if (model.linear) return Array.from({ length: p }, (_, k) => x ** k);
    return numericJacobian(model, [x], params)[0];
  };
  const halfWidth = (x: number, kind: 'confidence' | 'prediction', level: number): number | null => {
    if (!cov || sigma === null || !(level > 0 && level < 1)) return null;
    const g = gradient(x);
    let v = 0;
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) v += g[a] * cov[a][b] * g[b];
    if (!(v >= 0)) return null;
    const t = tcrit(level);
    if (!Number.isFinite(t)) return null;
    return t * Math.sqrt(kind === 'prediction' ? v + sigma * sigma : v);
  };

  let message: string | null = null;
  if (!converged) message = 'The fit did not settle within the iterations allowed: the curve is shown, but it may not be the best one.';
  else if (df <= 0) message = 'There are no degrees of freedom left (as many parameters as points): no error or band can be given.';
  else if (!cov) message = 'The parameters are not fixed independently by the data (singular covariance): no error or band can be given.';
  if (dropped > 0) message = `${message ? `${message} ` : ''}${dropped} point${dropped === 1 ? ' was' : 's were'} left out (missing, or X not above 0).`;
  return { model: model.id, degree, params: out, n, df, rss, rSquared, sigma, converged, message, predict, halfWidth };
}

export const isFailure = (r: FitResult | FitFailure): r is FitFailure => 'failed' in r;
