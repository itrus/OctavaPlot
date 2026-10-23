import { describe, expect, it } from 'vitest';
import { matrixRange, normaliseMatrix, type Matrix } from './matrix';

const m: Matrix = [
  [1, 2, 3],
  [10, 20, 30],
  [5, 5, 5],
];

describe('normalising a matrix', () => {
  it('leaves it as it is when asked for nothing', () => {
    const r = normaliseMatrix(m, 'none', 'zscore');
    expect(r.values).toEqual(m);
    expect(r.values).not.toBe(m);
    expect(r.undefinedCount).toBe(0);
  });
  it('gives z-scores along rows: mean 0 and SD 1 (n - 1) in each', () => {
    const r = normaliseMatrix(m, 'row', 'zscore');
    expect(r.values[0]).toEqual([-1, 0, 1]);
    expect(r.values[1]).toEqual([-1, 0, 1]);
    // A row with no spread has no z-score: missing, and counted, never zero.
    expect(r.values[2]).toEqual([null, null, null]);
    expect(r.undefinedCount).toBe(3);
  });
  it('gives min-max values along columns', () => {
    const r = normaliseMatrix(m, 'column', 'minmax');
    expect(r.values.map((row) => row[0])).toEqual([0, 1, 4 / 9]);
    expect(r.values.map((row) => row[2])).toEqual([0, 1, 2 / 27]);
  });
  it('subtracts the mean when it centres', () => {
    const r = normaliseMatrix(m, 'row', 'centre');
    expect(r.values[0]).toEqual([-1, 0, 1]);
    expect(r.values[2]).toEqual([0, 0, 0]);
    expect(r.undefinedCount).toBe(0);
  });
  it('leaves a missing cell missing and does not count it', () => {
    const r = normaliseMatrix([[1, null, 3]], 'row', 'minmax');
    expect(r.values[0]).toEqual([0, null, 1]);
    expect(normaliseMatrix([[null, null]], 'row', 'zscore').values[0]).toEqual([null, null]);
  });
  it('finds the range of what is there', () => {
    expect(matrixRange(m)).toEqual([1, 30]);
    expect(matrixRange([[null, NaN]])).toBeNull();
    expect(matrixRange([])).toBeNull();
  });
});
