import { describe, expect, it } from 'vitest';
import { navFold, navStep } from './navKeys';

describe('navStep', () => {
  it('Down and Up move one place and stop at the ends; none focused, Down goes to the first', () => {
    expect(navStep('ArrowDown', 2, 5)).toBe(3);
    expect(navStep('ArrowDown', 4, 5)).toBe(4);
    expect(navStep('ArrowDown', -1, 5)).toBe(0);
    expect(navStep('ArrowUp', 2, 5)).toBe(1);
    expect(navStep('ArrowUp', 0, 5)).toBe(0);
  });
  it('Home and End go to the first and last, and other keys, or an empty list, do nothing', () => {
    expect(navStep('Home', 3, 5)).toBe(0);
    expect(navStep('End', 1, 5)).toBe(4);
    expect(navStep('x', 1, 5)).toBeNull();
    expect(navStep('ArrowDown', -1, 0)).toBeNull();
  });
});

describe('navFold', () => {
  it('Left folds an open folder and Right unfolds a folded one; otherwise nothing changes', () => {
    expect(navFold('ArrowLeft', true)).toBe(false);
    expect(navFold('ArrowRight', false)).toBe(true);
    expect(navFold('ArrowLeft', false)).toBeNull();
    expect(navFold('ArrowRight', true)).toBeNull();
    expect(navFold('Enter', true)).toBeNull();
  });
});
