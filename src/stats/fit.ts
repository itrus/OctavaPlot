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
const minOf = (a: readonly number[]) => a.reduce((m, v) => (v < m ? v : m), Infinity);
const maxOf = (a: readonly number[]) => a.reduce((m, v) => (v > m ? v : m), -Infinity);
const range = (a: readonly number[]): [number, number] => [minOf(a), maxOf(a)];
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
      const base = minOf(ys);
      const top = maxOf(ys);
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
      const top = maxOf(ys);
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
  /** Confidence level of the parameter intervals and of the bands (default 0.95). */
  level?: number;
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

/** Inverse of an upper-triangular matrix. */
function invertUpper(r: Mat): Mat {
  const n = r.length;
  const inv: Mat = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (let j = 0; j < n; j++) {
    inv[j][j] = 1 / r[j][j];
    for (let i = j - 1; i >= 0; i--) {
      let s = 0;
      for (let k = i + 1; k <= j; k++) s += r[i][k] * inv[k][j];
      inv[i][j] = -s / r[i][i];
    }
  }
  return inv;
}

/** Least squares of y on the columns of `design` by Householder QR; null when the columns are (numerically) dependent. */
function qrLeastSquares(design: Mat, y: readonly number[]): { b: number[]; unscaledCov: Mat } | null {
  const n = design.length;
  const m = design[0].length;
  const a = design.map((row) => [...row]);
  const q = [...y];
  const colNorm = Array.from({ length: m }, (_, k) => Math.sqrt(a.reduce((s, row) => s + row[k] * row[k], 0)));
  for (let k = 0; k < m; k++) {
    let norm = 0;
    for (let i = k; i < n; i++) norm += a[i][k] * a[i][k];
    norm = Math.sqrt(norm);
    if (!(norm > 1e-12 * Math.max(colNorm[k], 1e-300))) return null;
    const alpha = a[k][k] > 0 ? -norm : norm;
    const v = new Array<number>(n).fill(0);
    for (let i = k; i < n; i++) v[i] = a[i][k];
    v[k] -= alpha;
    let vv = 0;
    for (let i = k; i < n; i++) vv += v[i] * v[i];
    if (vv === 0) continue;
    for (let c = k; c < m; c++) {
      let dot = 0;
      for (let i = k; i < n; i++) dot += v[i] * a[i][c];
      const f = (2 * dot) / vv;
      for (let i = k; i < n; i++) a[i][c] -= f * v[i];
    }
    let dot = 0;
    for (let i = k; i < n; i++) dot += v[i] * q[i];
    const f = (2 * dot) / vv;
    for (let i = k; i < n; i++) q[i] -= f * v[i];
  }
  const r: Mat = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => (j >= i ? a[i][j] : 0)));
  for (let k = 0; k < m; k++) if (!(Math.abs(r[k][k]) > 1e-12 * Math.max(colNorm[k], 1e-300))) return null;
  const b = new Array<number>(m).fill(0);
  for (let i = m - 1; i >= 0; i--) {
    let s = q[i];
    for (let k = i + 1; k < m; k++) s -= r[i][k] * b[k];
    b[i] = s / r[i][i];
  }
  const rInv = invertUpper(r);
  const unscaledCov: Mat = Array.from({ length: m }, (_, i) => Array.from({ length: m }, (_, j) => rInv[i].reduce((s, v, k) => s + v * rInv[j][k], 0)));
  return { b, unscaledCov };
}

const binomial = (n: number, k: number) => {
  let c = 1;
  for (let i = 1; i <= k; i++) c = (c * (n - k + i)) / i;
  return c;
};

/** The linear fit in the centred, scaled variable u = (x - centre) / scale; `transform` takes its coefficients to those in x. */
interface LinearFit {
  p: number[];
  transform: Mat;
  b: number[];
  unscaledCov: Mat;
  centre: number;
  scale: number;
}

/**
 * Least squares for a model that is linear in its parameters. X is centred and scaled first so that a shifted origin or other
 * units do not matter; the fit is by QR, and the coefficients are returned in the original X.
 */
function linearLeastSquares(xs: readonly number[], ys: readonly number[], degree: number): LinearFit | null {
  const cols = degree + 1;
  const centre = mean(xs);
  const scale = xs.reduce((m, x) => Math.max(m, Math.abs(x - centre)), 0) || 1;
  const design: Mat = xs.map((x) => Array.from({ length: cols }, (_, k) => ((x - centre) / scale) ** k));
  const ls = qrLeastSquares(design, ys);
  if (!ls) return null;
  // Values that are all equal have the constant as their exact fit: rounding noise must not make a sloped curve of it.
  if (ys.every((v) => v === ys[0])) ls.b = ls.b.map((_, k) => (k === 0 ? ys[0] : 0));
  // a_i = sum_j b_j scale^-j C(j,i) (-centre)^(j-i)
  const transform: Mat = Array.from({ length: cols }, (_, i) => Array.from({ length: cols }, (_, j) => (j >= i ? (binomial(j, i) * (-centre) ** (j - i)) / scale ** j : 0)));
  const p = transform.map((row) => row.reduce((s, t, j) => s + t * ls.b[j], 0));
  return { p, transform, b: ls.b, unscaledCov: ls.unscaledCov, centre, scale };
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

  const level = options.level !== undefined && options.level > 0 && options.level < 1 ? options.level : 0.95;
  let params: number[];
  let converged = true;
  /** Evaluates the curve, the gradient with respect to the working parameters, and their covariance (unit sigma). */
  let evalAt: (x: number, q: readonly number[]) => number;
  let gradientAt: (x: number) => number[];
  let unscaledCov: Mat | null;
  /** Takes the covariance of the working parameters to that of the reported ones. */
  let toReported: (c: Mat) => Mat;
  let working: number[];
  if (model.linear) {
    const ls = linearLeastSquares(xs, ys, degree);
    if (!ls) return { failed: true, message: 'The fit is singular: the points do not fix the parameters.' };
    params = ls.p;
    working = ls.b;
    evalAt = (x, q) => model.fn((x - ls.centre) / ls.scale, q);
    gradientAt = (x) => Array.from({ length: p }, (_, k) => ((x - ls.centre) / ls.scale) ** k);
    unscaledCov = ls.unscaledCov;
    toReported = (c) => ls.transform.map((ti) => ls.transform.map((tj) => ti.reduce((s, a, k) => s + a * tj.reduce((t, bb, l) => t + c[k][l] * bb, 0), 0)));
  } else {
    // Work in parameters divided by their starting size, so that no parameter is small against the finite-difference step.
    const start = model.init(xs, ys, degree);
    const yScale = Math.max(maxOf(ys.map(Math.abs)), 1e-300);
    const scales = start.map((v) => (Math.abs(v) > 0 && Number.isFinite(v) ? Math.abs(v) : yScale));
    const scaledModel: FitModel = { ...model, fn: (x, t) => model.fn(x, t.map((v, i) => v * scales[i])) };
    const lo = (model.lower ? model.lower(p) : new Array<number>(p).fill(-Infinity)).map((v, i) => v / scales[i]);
    const hi = (model.upper ? model.upper(p) : new Array<number>(p).fill(Infinity)).map((v, i) => v / scales[i]);
    const r = levenbergMarquardt(scaledModel, xs, ys, start.map((v, i) => v / scales[i]), lo, hi, options.maxIterations ?? MAX_ITERATIONS, options.relativeTolerance ?? REL_TOL);
    working = r.p;
    params = r.p.map((v, i) => v * scales[i]);
    converged = r.converged;
    evalAt = (x, q) => scaledModel.fn(x, q);
    gradientAt = (x) => numericJacobian(scaledModel, [x], working)[0];
    const inv0 = invert(jtj(numericJacobian(scaledModel, xs, working)));
    unscaledCov = inv0;
    toReported = (c) => c.map((row, i) => row.map((v, j) => v * scales[i] * scales[j]));
  }
  const predict = (x: number) => evalAt(x, working);
  let rss = 0;
  for (let i = 0; i < xs.length; i++) rss += (ys[i] - predict(xs[i])) ** 2;
  if (!Number.isFinite(rss)) rss = Infinity;
  if (!Number.isFinite(rss)) return { failed: true, message: 'The fit did not give a curve (the values overflowed).' };
  const n = xs.length;
  const df = n - p;
  const sigma = df > 0 ? Math.sqrt(rss / df) : null;
  const my = mean(ys);
  const tss = ys.reduce((s, v) => s + (v - my) ** 2, 0);
  const rSquared = tss > 0 ? 1 - rss / tss : null;

  // Covariance of the parameters: sigma^2 (J'J)^-1. Unavailable without degrees of freedom, when J'J is singular, and
  // when the fit did not settle (a local approximation about a point that is not the minimum says nothing true).
  const cov = converged && df > 0 && unscaledCov && sigma !== null ? unscaledCov.map((row) => row.map((v) => v * sigma * sigma)) : null;
  const reportedCov = cov ? toReported(cov) : null;
  const se = (k: number): number | null => (reportedCov && reportedCov[k][k] >= 0 ? Math.sqrt(reportedCov[k][k]) : null);
  const tcrit = (lv: number) => studentTQuantileUpper((1 - lv) / 2, df);
  const t0 = tcrit(level);
  const out: FitParam[] = names.map((name, k) => {
    const s = se(k);
    return { name, value: params[k], se: s, lower: s !== null && Number.isFinite(t0) ? params[k] - t0 * s : null, upper: s !== null && Number.isFinite(t0) ? params[k] + t0 * s : null };
  });

  const halfWidth = (x: number, kind: 'confidence' | 'prediction', lv: number): number | null => {
    if (!cov || sigma === null || !(lv > 0 && lv < 1)) return null;
    const g = gradientAt(x);
    let v = 0;
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) v += g[a] * cov[a][b] * g[b];
    if (!(v >= 0)) return null;
    const t = tcrit(lv);
    if (!Number.isFinite(t)) return null;
    return t * Math.sqrt(kind === 'prediction' ? v + sigma * sigma : v);
  };

  let message: string | null = null;
  if (!converged) message = 'The fit did not settle within the iterations allowed: a provisional curve is shown, with no errors or bands, because they would not be valid.';
  else if (df <= 0) message = 'There are no degrees of freedom left (as many parameters as points): no error or band can be given.';
  else if (!cov) message = 'The parameters are not fixed independently by the data (singular covariance): no error or band can be given.';
  if (dropped > 0) message = `${message ? `${message} ` : ''}${dropped} point${dropped === 1 ? ' was' : 's were'} left out (missing, or X not above 0).`;
  return { model: model.id, degree, params: out, n, df, rss, rSquared, sigma, converged, message, predict, halfWidth };
}

export const isFailure = (r: FitResult | FitFailure): r is FitFailure => 'failed' in r;
