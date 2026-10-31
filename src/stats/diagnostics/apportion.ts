/**
 * The dot grid of the calculation contracts (section 7): N dots shared among parts in proportion to their weights, by the
 * largest-remainder method. Each part first gets the floor of its exact share N * w / total; the dots left over then go one each
 * to the parts with the largest fractional remainders, ties in the order of the parts. The counts always add up to N, and a part
 * with weight 0 keeps its place with no dots.
 */

export type Apportionment = { ok: true; counts: number[] } | { ok: false; message: string };

/** Shares and remainders that differ by less than this (a rounding error of a sum of weights) are equal. */
const EPSILON = 1e-9;

/** The number of dots of each part, or why they cannot be shared. Weights are finite and not negative with a positive total; N is a whole number from 0. */
export function apportionDots(weights: ReadonlyArray<number>, dots: number): Apportionment {
  if (!Number.isInteger(dots) || dots < 0) return { ok: false, message: 'The number of dots must be a whole number, 0 or more.' };
  if (weights.some((w) => !Number.isFinite(w) || w < 0)) return { ok: false, message: 'Weights must be finite and not negative.' };
  const total = weights.reduce((a, w) => a + w, 0);
  if (!(total > 0) || !Number.isFinite(total)) return { ok: false, message: 'The weights need a positive total.' };

  const shares = weights.map((w) => (dots * w) / total);
  const counts = shares.map((q) => Math.floor(q + EPSILON));
  const remainders = shares.map((q, i) => Math.max(0, q - counts[i]));
  let left = dots - counts.reduce((a, c) => a + c, 0);
  // Largest remainder first; equal remainders (within the tolerance) keep the order of the parts. A part without weight never takes a dot.
  const order = weights
    .map((_, i) => i)
    .filter((i) => weights[i] > 0)
    .sort((a, b) => (Math.abs(remainders[a] - remainders[b]) < EPSILON ? a - b : remainders[b] - remainders[a]));
  for (let k = 0; left > 0 && order.length > 0; k = (k + 1) % order.length, left--) counts[order[k]]++;
  return { ok: true, counts };
}
