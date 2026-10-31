import { describe, expect, it } from 'vitest';
import { apportionDots } from './apportion';

const counts = (weights: number[], n: number) => {
  const r = apportionDots(weights, n);
  if (!r.ok) throw new Error(r.message);
  return r.counts;
};

// The expected counts are worked out by hand from the rule of the contract (floor of N w / total, then the largest remainders, ties in part order).
describe('dot apportionment (contract section 7)', () => {
  it('gives 34, 33, 33 for weights 1, 1, 1 and 100 dots (the fixture of section 15)', () => {
    expect(counts([1, 1, 1], 100)).toEqual([34, 33, 33]);
  });

  it('gives the left-over dots to the largest remainders', () => {
    // 10 dots by 1:2:3 -> 1.667, 3.333, 5: floors 1, 3, 5; the one left over goes to .667.
    expect(counts([1, 2, 3], 10)).toEqual([2, 3, 5]);
    // 7 dots by 0.5, 0.3, 0.2 -> 3.5, 2.1, 1.4: floors 3, 2, 1; the one left over goes to .5.
    expect(counts([0.5, 0.3, 0.2], 7)).toEqual([4, 2, 1]);
  });

  it('breaks a tie in the order of the parts', () => {
    expect(counts([1, 1], 3)).toEqual([2, 1]);
    expect(counts([1, 1, 1], 1)).toEqual([1, 0, 0]);
    expect(counts([1, 1, 1], 2)).toEqual([1, 1, 0]);
  });

  it('is not moved by the rounding error of a sum of weights', () => {
    // 0.1 + 0.2 + 0.7 is not exactly 1, and 10 * 0.7 / total can fall just under 7.
    expect(counts([0.1, 0.2, 0.7], 10)).toEqual([1, 2, 7]);
    expect(counts([0.1, 0.1, 0.1], 3)).toEqual([1, 1, 1]);
  });

  it('keeps a part of weight 0 with no dots, and never gives it one', () => {
    expect(counts([0, 1, 1], 3)).toEqual([0, 2, 1]);
    expect(counts([1, 0, 0], 5)).toEqual([5, 0, 0]);
  });

  it('adds up to N for every N and a spread of weights', () => {
    for (const weights of [[1, 2, 3], [0.3, 0.3, 0.4], [5, 1, 1, 1], [1e-6, 1, 1e6], [0, 7, 0, 2]]) {
      for (let n = 0; n <= 120; n++) {
        const c = counts(weights, n);
        expect(c.reduce((a, v) => a + v, 0), `${weights} / ${n}`).toBe(n);
        // Each part is within one dot of its exact share.
        const total = weights.reduce((a, w) => a + w, 0);
        c.forEach((v, i) => expect(Math.abs(v - (n * weights[i]) / total), `${weights} / ${n} / ${i}`).toBeLessThan(1 + 1e-9));
      }
    }
  });

  it('gives no dots at all for N = 0', () => {
    expect(counts([1, 2], 0)).toEqual([0, 0]);
  });

  it('refuses what cannot be shared, and says why', () => {
    for (const [weights, n] of [[[1, -1], 5], [[1, NaN], 5], [[Infinity, 1], 5], [[0, 0], 5], [[], 5], [[1, 1], 2.5], [[1, 1], -1]] as Array<[number[], number]>) {
      const r = apportionDots(weights, n);
      expect(r.ok, `${weights} / ${n}`).toBe(false);
      if (!r.ok) expect(r.message.length).toBeGreaterThan(0);
    }
  });
});
