/**
 * The one mean, SD and scaled central moments of the stats layer, so a graph and a results sheet agree for any magnitude.
 * Deviations are divided by the largest one before they are squared, cubed or raised to the fourth power, so
 * nothing overflows or underflows.
 */

/** Neumaier compensated sum. */
export function neumaierSum(xs: ReadonlyArray<number>): number {
  let sum = 0;
  let c = 0;
  for (const x of xs) {
    const t = sum + x;
    c += Math.abs(sum) >= Math.abs(x) ? sum - t + x : x - t + sum;
    sum = t;
  }
  return sum + c;
}

/** Arithmetic mean (xs not empty); scales the values when the plain sum would overflow. */
export function meanOf(xs: ReadonlyArray<number>): number {
  // Values all equal have that value as their mean exactly: a rounded sum can miss it by an ulp, and then a spread of about 1e-16 would show.
  const first = xs[0];
  if (xs.every((x) => x === first)) return first;
  const s = neumaierSum(xs);
  if (Number.isFinite(s)) return s / xs.length;
  return neumaierSum(xs.map((x) => x / xs.length));
}

/** The largest absolute deviation from `m`. */
function maxDeviation(xs: ReadonlyArray<number>, m: number): number {
  let scale = 0;
  for (const x of xs) scale = Math.max(scale, Math.abs(x - m));
  return scale;
}

/** Sample SD (n - 1), scaled by the largest deviation so squares neither overflow nor underflow. */
export function sdOf(xs: ReadonlyArray<number>, m: number): number {
  const s = scaledDeviations(xs, m);
  if (s === 0) return 0;
  if (s === null) return Infinity;
  const ss = neumaierSum(s.d.map((v) => v * v));
  // The factor `half` goes last: the scale times it can pass the largest number although the SD does not.
  return s.scale * Math.sqrt(ss / (xs.length - 1)) * s.half;
}

/**
 * The deviations from `m` in units of the largest one (`scale`). When a deviation itself passes the largest number (values of
 * opposite sign near it), the values are halved first and `half` is 2. 0: all values equal `m`. null: the spread cannot be shown.
 */
function scaledDeviations(xs: ReadonlyArray<number>, m: number): { d: number[]; scale: number; half: number } | 0 | null {
  let a = xs;
  let mm = m;
  let half = 1;
  let scale = maxDeviation(a, mm);
  if (!Number.isFinite(scale)) {
    a = xs.map((x) => x / 2);
    mm = m / 2;
    half = 2;
    scale = maxDeviation(a, mm);
  }
  if (scale === 0) return 0;
  if (!Number.isFinite(scale)) return null;
  const centre = mm;
  return { d: a.map((x) => (x - centre) / scale), scale, half };
}

/**
 * Central moments 2, 3 and 4 (divided by n) of the deviations from `m`, in units of the largest deviation, so
 * skewness m3 / m2^1.5 and kurtosis m4 / m2^2 are unchanged. Null when all values equal `m` or a deviation is not finite.
 */
export function scaledMoments(xs: ReadonlyArray<number>, m: number): { m2: number; m3: number; m4: number } | null {
  const s = scaledDeviations(xs, m);
  if (s === 0 || s === null) return null;
  const d = s.d;
  const n = xs.length;
  return {
    m2: neumaierSum(d.map((v) => v * v)) / n,
    m3: neumaierSum(d.map((v) => v * v * v)) / n,
    m4: neumaierSum(d.map((v) => v * v * v * v)) / n,
  };
}
