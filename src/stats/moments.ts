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
  const scale = maxDeviation(xs, m);
  if (scale === 0) return 0;
  if (!Number.isFinite(scale)) return Infinity;
  const ss = neumaierSum(xs.map((x) => ((x - m) / scale) ** 2));
  return scale * Math.sqrt(ss / (xs.length - 1));
}

/**
 * Central moments 2, 3 and 4 (divided by n) of the deviations from `m`, in units of the largest deviation, so
 * skewness m3 / m2^1.5 and kurtosis m4 / m2^2 are unchanged. Null when all values equal `m` or a deviation is not finite.
 */
export function scaledMoments(xs: ReadonlyArray<number>, m: number): { m2: number; m3: number; m4: number } | null {
  const scale = maxDeviation(xs, m);
  if (scale === 0 || !Number.isFinite(scale)) return null;
  const d = xs.map((x) => (x - m) / scale);
  const n = xs.length;
  return {
    m2: neumaierSum(d.map((v) => v * v)) / n,
    m3: neumaierSum(d.map((v) => v * v * v)) / n,
    m4: neumaierSum(d.map((v) => v * v * v * v)) / n,
  };
}
