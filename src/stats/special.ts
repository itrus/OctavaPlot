// Pure numerical kernel for the summary calculations (spec 9.1 L648-656, 21.3 L1442).
// No imports, no DOM, no React. Tails are computed directly, never as 1 - CDF.

const LANCZOS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
  -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6,
  1.5056327351493116e-7,
];

/** ln Gamma(x), Lanczos g = 7, n = 9. Intended for x > 0; reflection for x < 0.5; poles give Infinity; NaN gives NaN. */
export function lnGamma(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lnGamma(1 - x);
  const z = x - 1;
  let a = LANCZOS[0];
  const t = z + 7.5;
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (z + i);
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(a);
}

/** Modified Lentz continued fraction for the incomplete beta. NaN when it does not converge. */
function betaContinuedFraction(x: number, a: number, b: number): number {
  const MAX_ITER = 100000;
  const EPS = 1e-15;
  const FPMIN = 1e-300;
  const qab = a + b;
  const qap = a + 1;
  const qam = a - 1;
  let c = 1;
  let d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAX_ITER; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c;
    if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) return h;
  }
  return NaN;
}

/**
 * Regularised incomplete beta I_x(a, b). `y` must equal 1 - x; pass it explicitly when the caller can
 * compute it without cancellation (default 1 - x). x <= 0 gives 0, y <= 0 gives 1, bad a/b/NaN gives NaN.
 */
export function regIncBeta(x: number, a: number, b: number, y: number = 1 - x): number {
  if (Number.isNaN(x) || Number.isNaN(y) || !(a > 0) || !(b > 0)) return NaN;
  if (x <= 0) return 0;
  if (y <= 0) return 1;
  const front = Math.exp(lnGamma(a + b) - lnGamma(a) - lnGamma(b) + a * Math.log(x) + b * Math.log(y));
  if (x < (a + 1) / (a + b + 2)) return (front * betaContinuedFraction(x, a, b)) / a;
  return 1 - (front * betaContinuedFraction(y, b, a)) / b;
}

/** P(T > t) for Student t with df > 0 degrees of freedom (finite). Direct tail, no 1 - CDF for t > 0. */
export function studentTUpperTail(t: number, df: number): number {
  if (Number.isNaN(t) || !(df > 0) || !Number.isFinite(df)) return NaN;
  if (t === 0) return 0.5;
  if (t < 0) return 1 - studentTUpperTail(-t, df);
  const t2 = t * t;
  if (!Number.isFinite(t2)) return 0;
  return 0.5 * regIncBeta(df / (df + t2), df / 2, 0.5, t2 / (df + t2));
}

/**
 * The t > 0 with P(T > t) = q, for 0 < q < 0.5 and finite df > 0; NaN otherwise (including q that is
 * not representable below 0.5, e.g. q = (1 - 1e-17) / 2). The caller passes q = (1 - C) / 2.
 */
export function studentTQuantileUpper(q: number, df: number): number {
  if (!(q > 0 && q < 0.5) || !(df > 0) || !Number.isFinite(df)) return NaN;
  if (df === 1) return 1 / Math.tan(Math.PI * q);
  if (df === 2) return (1 - 2 * q) / Math.sqrt(2 * q * (1 - q));
  const lnq = Math.log(q);
  const lnC = lnGamma((df + 1) / 2) - lnGamma(df / 2) - 0.5 * Math.log(df * Math.PI);
  const pdf = (t: number): number => Math.exp(lnC - ((df + 1) / 2) * Math.log1p((t * t) / df));
  let lo = 0;
  let hi = 1;
  for (;;) {
    const tail = studentTUpperTail(hi, df);
    if (Number.isNaN(tail)) return NaN;
    if (Math.log(tail) - lnq <= 0) break;
    lo = hi;
    hi *= 2;
    if (hi > 1e300) return NaN;
  }
  let t = 0.5 * (lo + hi);
  for (let i = 0; i < 100; i++) {
    const tail = studentTUpperTail(t, df);
    if (Number.isNaN(tail)) return NaN;
    const f = Math.log(tail) - lnq;
    if (f > 0) lo = t;
    else hi = t;
    let next = t - f / (-pdf(t) / tail);
    if (!(next > lo && next < hi)) next = 0.5 * (lo + hi);
    if (Math.abs(next - t) <= 1e-14 * Math.abs(next)) return next;
    t = next;
  }
  return t;
}

/** P engineering limit for the exact BigInt median interval (not a spec value). */
export const MEDIAN_CI_EXACT_MAX_N = 20000;

export type MedianCiRank =
  | { available: true; k: number; coverage: number }
  | { available: false; reason: 'coverage' | 'too-large' | 'invalid-level'; widestCoverage: number | null };

/** num / 2^n as a double; integer arithmetic until this single division (spec 21.3 L1442). */
function dyadicRatio(num: bigint, n: number): number {
  if (n <= 1000) return Number(num) / 2 ** n;
  return Number(num >> BigInt(n - 1000)) / 2 ** 1000;
}

/**
 * Spec 9.1 L656: the largest k >= 1 with 1 - 2 P(Binomial(n, 1/2) <= k - 1) >= level; the interval is
 * [y_(k), y_(n-k+1)]. Exact BigInt sums. Equality is accepted. If k = 1 fails the result is unavailable
 * and reports the widest coverage 1 - 2^(1-n). n must be a positive integer (else unavailable, 'coverage').
 */
export function medianCiRank(n: number, level: number): MedianCiRank {
  if (!(level > 0 && level < 1)) return { available: false, reason: 'invalid-level', widestCoverage: null };
  if (n > MEDIAN_CI_EXACT_MAX_N) return { available: false, reason: 'too-large', widestCoverage: null };
  if (!Number.isInteger(n) || n < 1) return { available: false, reason: 'coverage', widestCoverage: null };
  const total = 1n << BigInt(n);
  let tail = 0n; // sum_{i <= k-1} C(n, i)
  let binom = 1n; // C(n, k-1)
  let best: { k: number; coverage: number } | null = null;
  for (let k = 1; k <= Math.floor((n + 1) / 2); k++) {
    if (k > 1) binom = (binom * BigInt(n - k + 2)) / BigInt(k - 1);
    tail += binom;
    const coverage = dyadicRatio(total - 2n * tail, n);
    if (coverage >= level) best = { k, coverage };
    else break;
  }
  if (best) return { available: true, k: best.k, coverage: best.coverage };
  return { available: false, reason: 'coverage', widestCoverage: dyadicRatio(total - 2n, n) };
}

/**
 * Standard normal quantile: the z with P(Z <= z) = p, for 0 < p < 1 (Acklam's rational approximation, relative error
 * below 1.2e-9).
 */
export function normalQuantile(p: number): number {
  if (!(p > 0 && p < 1)) return p <= 0 ? -Infinity : Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const low = 0.02425;
  let x: number;
  if (p < low) {
    const q = Math.sqrt(-2 * Math.log(p));
    x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else if (p > 1 - low) {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  } else {
    const q = p - 0.5;
    const r = q * q;
    x = ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  return x;
}
