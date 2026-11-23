/**
 * Curve fitting for plotted data (spec 17): least squares for straight lines and polynomials, Levenberg-Marquardt for
 * the other models, with the uncertainty of the curve from the parameter covariance. Pure and independent of drawing.
 */

import { meanOf } from './moments';
import { studentTQuantileUpper } from './special';
import { fitModelById, geoMid, range, type FitModel, type FitModelId, invert, jtj, solve, type Mat } from './fitModels';

/** Raise when the numbers a fit gives change, so that no cached result of the old algorithm is shown. */
export const FIT_ALGORITHM_VERSION = 4;

// ---------------------------------------------------------------------------------------------------------------

// ---------------------------------------------------------------------------------------------------------------

export interface FitParam {
  name: string;
  value: number;
  /** Standard error; null when it cannot be had (no residual degrees of freedom, singular covariance). */
  se: number | null;
  lower: number | null;
  upper: number | null;
}

/** The level a fit is solved at when the level is not the caller's concern (the limits of a parameter are derived from se and df at any level, see confidenceLimits). */
export const FIT_SOLVE_LEVEL = 0.95;

/** The limits of the interval of a parameter at `level`, from its standard error and the residual degrees of freedom; null when it has none. */
export function confidenceLimits(param: Pick<FitParam, 'value' | 'se'>, df: number, level: number): { lower: number; upper: number } | null {
  if (param.se === null || !(level > 0 && level < 1)) return null;
  const t = studentTQuantileUpper((1 - level) / 2, df);
  return Number.isFinite(t) ? { lower: param.value - t * param.se, upper: param.value + t * param.se } : null;
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

interface FitOptions {
  model: FitModelId;
  degree?: number;
  /** Confidence level of the parameter intervals and of the bands (default 0.95). */
  level?: number;
  /** Iterations allowed (the default is MAX_ITERATIONS); a test asks for few, to see a fit that does not settle. */
  maxIterations?: number;
}

/** One failed fit: no curve at all, with the reason. */
export interface FitFailure {
  failed: true;
  message: string;
}

const MAX_ITERATIONS = 1000;
const REL_TOL = 1e-8;
/** The fit works on data scaled to about unit range, so these are relative to the problem and not to its units. */
const COST_FLOOR = 1e-28;
const MAX_CONDITION = 1e10;

/** The Jacobian of the model at the data, by central differences; the step is relative to the parameter (parameters are scaled to about 1, which is the floor). */
function numericJacobian(model: FitModel, xs: readonly number[], p: readonly number[]): Mat {
  const rows: Mat = xs.map(() => new Array<number>(p.length).fill(0));
  for (let k = 0; k < p.length; k++) {
    const h = Math.max(Math.abs(p[k]), 1) * 1e-6;
    const up = [...p];
    const down = [...p];
    up[k] += h;
    down[k] -= h;
    // All points for one parameter vector, then all for the other (the same arithmetic): the model sees one vector for a long run of calls.
    for (let i = 0; i < xs.length; i++) rows[i][k] = model.fn(xs[i], up);
    for (let i = 0; i < xs.length; i++) rows[i][k] = (rows[i][k] - model.fn(xs[i], down)) / (2 * h);
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

/** The largest cosine between the residual and a column of the Jacobian (the scaled gradient), ignoring parameters pressed against a bound. */
function scaledGradient(j: Mat, r: readonly number[], g: readonly number[], p: readonly number[], lower: readonly number[], upper: readonly number[]): number {
  const rn = Math.sqrt(r.reduce((s, v) => s + v * v, 0));
  if (!(rn > 0)) return 0;
  let worst = 0;
  for (let k = 0; k < p.length; k++) {
    if ((p[k] <= lower[k] && g[k] < 0) || (p[k] >= upper[k] && g[k] > 0)) continue;
    const cn = Math.sqrt(j.reduce((s, row) => s + row[k] * row[k], 0));
    if (cn > 0) worst = Math.max(worst, Math.abs(g[k]) / (cn * rn));
  }
  return worst;
}

/**
 * Levenberg-Marquardt from `p0`, with the parameters held within their bounds. The data and parameters are expected to be of
 * order 1, so every stopping test is relative: the step against the parameters, the fall of the cost against the cost, and the
 * scaled gradient. Returns where it stopped and whether it settled.
 */
function levenbergMarquardt(model: FitModel, xs: readonly number[], ys: readonly number[], p0: number[], lower: number[], upper: number[], maxIterations: number, relTol: number): { p: number[]; converged: boolean } {
  const clampP = (p: number[]) => p.map((v, i) => Math.min(upper[i], Math.max(lower[i], v)));
  let p = clampP(p0);
  let c = cost(model, xs, ys, p);
  let lambda = 1e-3;
  for (let it = 0; it < maxIterations; it++) {
    if (c <= COST_FLOOR) return { p, converged: true };
    const j = numericJacobian(model, xs, p);
    const r = xs.map((x, i) => ys[i] - model.fn(x, p));
    const a = jtj(j);
    const g = p.map((_, k) => j.reduce((s, row, i) => s + row[k] * r[i], 0));
    const sg = scaledGradient(j, r, g, p, lower, upper);
    if (sg <= 1e-8) return { p, converged: true };
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
          if (move < 1e-10 || c <= COST_FLOOR || (rel < relTol && move < 1e-5)) return { p, converged: true };
          break;
        }
      }
      lambda *= 10;
      if (lambda > 1e15) break;
    }
    if (!improved) {
      // No step lowers the cost: at a minimum when the scaled gradient is small, else it is stuck.
      return { p, converged: sg <= 1e-6 || c <= COST_FLOOR };
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
  const centre = meanOf(xs);
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
 * What a parameter is in, which says how it moves when X or Y is shifted or rescaled: a level of Y (shifts and scales with Y),
 * an amplitude of Y (scales only), a position in X (shifts and scales), a width in X (scales), a rate (scales with 1 / X), or
 * a pure number.
 */
type Dim = 'yloc' | 'yamp' | 'xloc' | 'x' | 'rate' | 'one';

const PARAM_DIMS: Partial<Record<FitModelId, Dim[]>> = {
  exp_decay: ['yloc', 'yamp', 'rate'],
  exp_association: ['yloc', 'yamp', 'rate'],
  exp_two_phase: ['yloc', 'yamp', 'rate', 'yamp', 'rate'],
  gaussian_peak: ['yloc', 'yamp', 'xloc', 'x'],
  hyperbola: ['yloc', 'yamp', 'x'],
  hill_4pl: ['yloc', 'yloc', 'x', 'one'],
  asymmetric_5pl: ['yloc', 'yloc', 'x', 'one', 'one'],
};

interface Normalisation {
  xShift: number;
  xScale: number;
  yShift: number;
  yScale: number;
}

/**
 * The shift and scale that bring X and Y to order 1. A model with a ratio of X (hyperbola, logistics) is only scaled, since a
 * shift would change what it says; a peak is centred on the middle of X; an exponential starts at the smallest X (its
 * amplitude is taken back to X = 0 afterwards). Y is centred on its mean and scaled by its range.
 */
function normalisation(id: FitModelId, xs: readonly number[], ys: readonly number[]): Normalisation {
  const [x0, x1] = range(xs);
  const [y0, y1] = range(ys);
  const ratio = id === 'hyperbola' || id === 'hill_4pl' || id === 'asymmetric_5pl';
  // Values that are all equal are centred on themselves exactly, so that rounding in the mean cannot make a signal of them.
  const yShift = y0 === y1 ? y0 : meanOf(ys);
  return {
    xShift: ratio ? 0 : id === 'gaussian_peak' ? (x0 + x1) / 2 : x0,
    xScale: ratio ? geoMid(xs) : x1 - x0 || 1,
    yShift,
    yScale: y1 - y0 || Math.abs(yShift) || 1,
  };
}

/** The parameters of the fit in normalised units (`w`, already multiplied back by their start sizes) in the units of the data. */
function reportedParams(id: FitModelId, w: readonly number[], nm: Normalisation): number[] {
  const dims = PARAM_DIMS[id] ?? [];
  const out = w.map((v, i) => {
    switch (dims[i]) {
      case 'yloc': return nm.yShift + nm.yScale * v;
      case 'yamp': return nm.yScale * v;
      case 'xloc': return nm.xShift + nm.xScale * v;
      case 'x': return nm.xScale * v;
      case 'rate': return v / nm.xScale;
      default: return v;
    }
  });
  // An exponential in the shifted X is the same exponential in X with its amplitude multiplied by exp(rate * shift).
  const pairs: Array<[number, number]> = id === 'exp_two_phase' ? [[1, 2], [3, 4]] : id === 'exp_decay' || id === 'exp_association' ? [[1, 2]] : [];
  for (const [a, k] of pairs) {
    const was = out[a];
    out[a] = was * Math.exp(out[k] * nm.xShift);
    // c + A (1 - exp(-k x)) has its constant moved too, since the term A is part of the level at the shifted origin.
    if (id === 'exp_association') out[0] += was - out[a];
  }
  return out;
}

/** The inverse of a symmetric matrix J'J, or null when it is too close to singular (columns equalised to unit length first). */
function conditioned(a: Mat): { inverse: Mat | null } {
  const d = a.map((row, i) => Math.sqrt(row[i]));
  if (d.some((v) => !(v > 0) || !Number.isFinite(v))) return { inverse: null };
  const eq = a.map((row, i) => row.map((v, j) => v / (d[i] * d[j])));
  const inv = invert(eq);
  if (!inv) return { inverse: null };
  const norm = (m: Mat) => m.reduce((mx, row) => Math.max(mx, row.reduce((s, v) => s + Math.abs(v), 0)), 0);
  if (!(norm(eq) * norm(inv) < MAX_CONDITION)) return { inverse: null };
  return { inverse: inv.map((row, i) => row.map((v, j) => v / (d[i] * d[j]))) };
}

/**
 * Fit a model to points (x, y) (spec 17.3). A fit that cannot be made, or did not settle, is reported and not drawn as
 * if it had succeeded; the uncertainty of the curve is the local (Jacobian) approximation for the nonlinear models and the
 * classical one for a line or a polynomial (spec 17.3), pointwise, never simultaneous.
 */
export function fitCurve(points: ReadonlyArray<{ x: number; y: number }>, options: FitOptions): FitResult | FitFailure {
  const solved = solveFit(points, options);
  return isFailure(solved) ? solved : fitFromSolution(solved);
}

/**
 * A fit as plain data: numbers, arrays and strings only, so it can cross a worker boundary (a `FitResult` holds functions and cannot).
 * `fitFromSolution` makes the `FitResult` from it; `fitCurve` is `solveFit` followed by it, so there is one way a result is made.
 */
export interface FitSolution {
  model: FitModelId;
  degree: number;
  params: FitParam[];
  n: number;
  df: number;
  rss: number;
  rSquared: number | null;
  sigma: number | null;
  converged: boolean;
  message: string | null;
  /** The parameters the curve is evaluated with: in the centred X for a linear model, in normalised units for the others. */
  working: number[];
  /** The coordinates `working` lives in. */
  frame: { kind: 'linear'; centre: number; scale: number } | { kind: 'nonlinear'; scales: number[]; normalisation: Normalisation };
  /** The covariance of `working` (in the units of Y given by `unitScale`); null when no error or band can be given. */
  cov: number[][] | null;
  unitScale: number;
}

/** The numerical part of a fit: everything that takes time, and nothing that is a function. */
export function solveFit(points: ReadonlyArray<{ x: number; y: number }>, options: FitOptions): FitSolution | FitFailure {
  const model = fitModelById(options.model);
  const degree = model.id === 'polynomial' ? Math.min(6, Math.max(2, Math.round(options.degree ?? 2))) : model.id === 'linear' ? 1 : 0;
  const pts = points.filter((q) => Number.isFinite(q.x) && Number.isFinite(q.y) && (!model.positiveX || q.x > 0) && (!model.nonNegativeX || q.x >= 0));
  const dropped = points.length - pts.length;
  const names = model.paramNames(degree);
  const p = names.length;
  const needed = model.minPoints(degree);
  if (pts.length < needed) return { failed: true, message: `${model.label} needs at least ${needed} points with ${model.positiveX ? 'X above 0 and ' : model.nonNegativeX ? 'X of 0 or above and ' : ''}a value; there ${pts.length === 1 ? 'is' : 'are'} ${pts.length}.` };
  const xs = pts.map((q) => q.x);
  const ys = pts.map((q) => q.y);
  if (new Set(xs).size < Math.min(needed, 2)) return { failed: true, message: 'The points have the same X: no curve can be fitted.' };

  const level = options.level !== undefined && options.level > 0 && options.level < 1 ? options.level : 0.95;
  let params: number[];
  let converged = true;
  /** Evaluates the curve, the gradient with respect to the working parameters, and their covariance (unit sigma). */
  let evalAt: (x: number, q: readonly number[]) => number;
  /** The unit of Y in which the working covariance is expressed (1 when the working parameters are already in the units of the data). */
  let unitScale = 1;
  /** J'J is too close to singular for the parameters to be told apart. */
  let illConditioned = false;
  let unscaledCov: Mat | null;
  /** Takes the covariance of the working parameters to that of the reported ones. */
  let toReported: (c: Mat) => Mat;
  let working: number[];
  let frame: FitSolution['frame'];
  if (model.linear) {
    const ls = linearLeastSquares(xs, ys, degree);
    if (!ls) return { failed: true, message: 'The fit is singular: the points do not fix the parameters.' };
    params = ls.p;
    working = ls.b;
    frame = { kind: 'linear', centre: ls.centre, scale: ls.scale };
    evalAt = (x, q) => model.fn((x - ls.centre) / ls.scale, q);
    unscaledCov = ls.unscaledCov;
    toReported = (c) => ls.transform.map((ti) => ls.transform.map((tj) => ti.reduce((s, a, k) => s + a * tj.reduce((t, bb, l) => t + c[k][l] * bb, 0), 0)));
  } else {
    // Fit in units where X and Y are of order 1 (shifted and scaled by the data), then take every parameter back with its own
    // dimension. Parameters are further divided by their starting size, so none is small against the finite-difference step.
    const nm = normalisation(model.id, xs, ys);
    const xn = xs.map((x) => (x - nm.xShift) / nm.xScale);
    const yn = ys.map((y) => (y - nm.yShift) / nm.yScale);
    const dims = PARAM_DIMS[model.id] ?? [];
    /** One search from one start: its own scales, bounds and result, and the residual it ends with. */
    const attempt = (start: number[]) => {
      const scales = start.map((v) => (Math.abs(v) > 1e-6 && Number.isFinite(v) ? Math.abs(v) : 1));
      // The parameters are multiplied by their scales once for each parameter vector, not once for each data point.
      let lastT: readonly number[] | null = null;
      let lastP: number[] = [];
      const scaledModel: FitModel = {
        ...model,
        fn: (x, t) => {
          if (t !== lastT) {
            lastT = t;
            lastP = t.map((v, i) => v * scales[i]);
          }
          return model.fn(x, lastP);
        },
      };
      const bound = (raw: number[] | undefined, fallback: number) => (raw ?? new Array<number>(p).fill(fallback)).map((v, i) => (v > 0 && Number.isFinite(v) && dims[i] === 'x' ? 1e-9 : v) / scales[i]);
      const lo = bound(model.lower?.(p), -Infinity);
      const hi = bound(undefined, Infinity);
      const r = levenbergMarquardt(scaledModel, xn, yn, start.map((v, i) => v / scales[i]), lo, hi, options.maxIterations ?? MAX_ITERATIONS, REL_TOL);
      let rssN = 0;
      for (let i = 0; i < xn.length; i++) rssN += (yn[i] - scaledModel.fn(xn[i], r.p)) ** 2;
      return { scales, scaledModel, r, rssN: Number.isFinite(rssN) ? rssN : Infinity };
    };
    // The usual start first; a model that has others tries them too, and the best result stands (the usual one on a tie).
    let best = attempt(model.init(xn, yn, degree));
    for (const other of model.starts?.(xn, yn) ?? []) {
      const next = attempt(other);
      const better = next.r.converged === best.r.converged ? next.rssN < best.rssN * (1 - 1e-9) : next.r.converged;
      if (better) best = next;
    }
    const { scales, scaledModel, r } = best;
    working = r.p;
    const report = (t: readonly number[]) => reportedParams(model.id, t.map((v, i) => v * scales[i]), nm);
    params = report(working);
    if (!params.every(Number.isFinite)) return { failed: true, message: 'The fit did not give a curve (the parameters cannot be expressed in the units of the data).' };
    converged = r.converged;
    unitScale = nm.yScale;
    evalAt = (x, q) => nm.yShift + nm.yScale * scaledModel.fn((x - nm.xShift) / nm.xScale, q);
    frame = { kind: 'nonlinear', scales, normalisation: nm };
    const jac = numericJacobian(scaledModel, xn, working);
    const cond = conditioned(jtj(jac));
    unscaledCov = cond.inverse;
    illConditioned = cond.inverse === null;
    toReported = (c) => {
      // The covariance of the reported parameters from that of the working ones, by the Jacobian of the mapping between them.
      const d: Mat = Array.from({ length: p }, () => new Array<number>(p).fill(0));
      for (let k = 0; k < p; k++) {
        const h = Math.max(Math.abs(working[k]), 1) * 1e-6;
        const up = report(working.map((v, i) => (i === k ? v + h : v)));
        const down = report(working.map((v, i) => (i === k ? v - h : v)));
        for (let i = 0; i < p; i++) d[i][k] = (up[i] - down[i]) / (2 * h);
      }
      return d.map((di) => d.map((dj) => di.reduce((s, a, k) => s + a * dj.reduce((t, b, l) => t + c[k][l] * b, 0), 0)));
    };
  }
  /** Whether the search itself settled; a settled fit whose parameters cannot be told apart is still not reported as converged. */
  const settled = converged;
  if (illConditioned) converged = false;
  const predict = (x: number) => evalAt(x, working);
  let rss = 0;
  for (let i = 0; i < xs.length; i++) rss += (ys[i] - predict(xs[i])) ** 2;
  if (!Number.isFinite(rss)) rss = Infinity;
  if (!Number.isFinite(rss)) return { failed: true, message: 'The fit did not give a curve (the values overflowed).' };
  const n = xs.length;
  const df = n - p;
  const sigma = df > 0 ? Math.sqrt(rss / df) : null;
  // The exact mean (see meanOf): Y all equal gives a total sum of squares of 0, so no R², not a rounding residue of 1.
  const my = meanOf(ys);
  const tss = ys.reduce((s, v) => s + (v - my) ** 2, 0);
  const rSquared = tss > 0 ? 1 - rss / tss : null;

  // Covariance of the parameters: sigma^2 (J'J)^-1. Unavailable without degrees of freedom, when J'J is singular, and
  // when the fit did not settle (a local approximation about a point that is not the minimum says nothing true).
  const cov = converged && df > 0 && unscaledCov && sigma !== null ? unscaledCov.map((row) => row.map((v) => v * (sigma / unitScale) ** 2)) : null;
  const reportedCov = cov ? toReported(cov) : null;
  const se = (k: number): number | null => (reportedCov && reportedCov[k][k] >= 0 ? Math.sqrt(reportedCov[k][k]) : null);
  const tcrit = (lv: number) => studentTQuantileUpper((1 - lv) / 2, df);
  const t0 = tcrit(level);
  const out: FitParam[] = names.map((name, k) => {
    const s = se(k);
    return { name, value: params[k], se: s, lower: s !== null && Number.isFinite(t0) ? params[k] - t0 * s : null, upper: s !== null && Number.isFinite(t0) ? params[k] + t0 * s : null };
  });

  let message: string | null = null;
  if (!settled) message = 'The fit did not settle within the iterations allowed: a provisional curve is shown, with no errors or bands, because they would not be valid.';
  else if (illConditioned) message = 'The parameters are not fixed independently by the data (the fit is ill-conditioned: a change in one is made up by the others): no error or band can be given.';
  else if (df <= 0) message = 'There are no degrees of freedom left (as many parameters as points): no error or band can be given.';
  else if (!cov) message = 'The parameters are not fixed independently by the data (singular covariance): no error or band can be given.';
  if (dropped > 0) message = `${message ? `${message} ` : ''}${dropped} point${dropped === 1 ? ' was' : 's were'} left out (missing${model.positiveX ? ', or X not above 0' : model.nonNegativeX ? ', or X below 0' : ''}).`;
  return { model: model.id, degree, params: out, n, df, rss, rSquared, sigma, converged, message, working, frame, cov, unitScale };
}

/** The curve and its band from the numbers of a solution: the same code whether the solution was made here or in a worker. */
export function fitFromSolution(sol: FitSolution): FitResult {
  const model = fitModelById(sol.model);
  const { working, cov, sigma, unitScale, df, frame: f } = sol;
  const p = working.length;
  let predict: (x: number) => number;
  let gradientAt: (x: number) => number[];
  if (f.kind === 'linear') {
    predict = (x) => model.fn((x - f.centre) / f.scale, working);
    gradientAt = (x) => Array.from({ length: p }, (_, k) => ((x - f.centre) / f.scale) ** k);
  } else {
    const nm = f.normalisation;
    const scaledModel: FitModel = { ...model, fn: (x, t) => model.fn(x, t.map((v, i) => v * f.scales[i])) };
    predict = (x) => nm.yShift + nm.yScale * scaledModel.fn((x - nm.xShift) / nm.xScale, working);
    gradientAt = (x) => numericJacobian(scaledModel, [(x - nm.xShift) / nm.xScale], working)[0];
  }
  // The t quantile depends on the level only: one value for every X of a band.
  let tLevel = NaN;
  let tValue = NaN;
  const quantile = (lv: number): number => {
    if (lv !== tLevel) {
      tLevel = lv;
      tValue = studentTQuantileUpper((1 - lv) / 2, df);
    }
    return tValue;
  };
  const halfWidth = (x: number, kind: 'confidence' | 'prediction', lv: number): number | null => {
    if (!cov || sigma === null || !(lv > 0 && lv < 1)) return null;
    const g = gradientAt(x);
    let v = 0;
    for (let a = 0; a < p; a++) for (let b = 0; b < p; b++) v += g[a] * cov[a][b] * g[b];
    if (!(v >= 0)) return null;
    const t = quantile(lv);
    if (!Number.isFinite(t)) return null;
    return t * unitScale * Math.sqrt(kind === 'prediction' ? v + (sigma / unitScale) ** 2 : v);
  };
  return { model: sol.model, degree: sol.degree, params: sol.params, n: sol.n, df, rss: sol.rss, rSquared: sol.rSquared, sigma, converged: sol.converged, message: sol.message, predict, halfWidth };
}

export const isFailure = <T extends object>(r: T | FitFailure): r is FitFailure => 'failed' in r;

/**
 * What travels between the main thread and the fit worker, and what the worker does with it: a request (flat numbers), a reply (plain data) and the
 * numerical part both engines share. The worker file imports this and nothing of the engines, so the worker carries no code it does not run.
 */

export interface FitRequest {
  /** The points as x0, y0, x1, y1 ... */
  data: Float64Array;
  model: FitModelId;
  degree?: number;
  level: number;
}

/** Where and how a result was made: kept beside it so a number can be traced (the algorithm version is part of its identity). */
export interface FitProvenance {
  algorithm: number;
  engine: 'main' | 'worker';
  model: FitModelId;
  /** Points handed over (before the fit leaves out those it cannot use). */
  points: number;
  level: number;
  /** Time taken by the numerical part, in ms, where it ran. */
  ms: number;
}

export interface FitReply {
  outcome: FitSolution | FitFailure;
  provenance: FitProvenance;
  /** What the fit says about itself (did not settle, ill-conditioned, points left out); empty when all is well. */
  diagnostics: string[];
}

/** The numerical part, shared by every engine and by the worker's message handler. */
export function runFitRequest(request: FitRequest, engine: FitProvenance['engine']): FitReply {
  const t0 = performance.now();
  const points = Array.from({ length: request.data.length >> 1 }, (_, i) => ({ x: request.data[2 * i], y: request.data[2 * i + 1] }));
  const outcome = solveFit(points, { model: request.model, degree: request.degree, level: request.level });
  const diagnostics = isFailure(outcome) ? [outcome.message] : outcome.message ? [outcome.message] : [];
  return { outcome, diagnostics, provenance: { algorithm: FIT_ALGORITHM_VERSION, engine, model: request.model, points: points.length, level: request.level, ms: performance.now() - t0 } };
}

export interface FitMessage {
  id: number;
  request: FitRequest;
}
export interface FitAnswer {
  id: number;
  reply: FitReply;
}

/** What the worker does with one message. The worker file only calls this, so tests run exactly the worker's code in-process. */
export const handleFitMessage = (m: FitMessage): FitAnswer => ({ id: m.id, reply: runFitRequest(m.request, 'worker') });
