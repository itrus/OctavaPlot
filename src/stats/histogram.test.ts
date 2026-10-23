import { describe, expect, it } from 'vitest';
import { autoBinWidth, binEdges, binHeights, countBins, ecdfSteps, niceWidth } from './histogram';

describe('automatic bins', () => {
  it('rounds a width up to 1, 2, 2.5, 5 or 10 times a power of ten', () => {
    expect(niceWidth(0.8)).toBe(1);
    expect(niceWidth(1.3)).toBe(2);
    expect(niceWidth(2.2)).toBe(2.5);
    expect(niceWidth(2.6)).toBe(5);
    expect(niceWidth(7)).toBe(10);
    expect(niceWidth(0.021)).toBe(0.025);
    expect(niceWidth(250)).toBe(250);
    expect(niceWidth(0)).toBe(1);
  });
  it('starts from about log2(n) + 1 bins over the range', () => {
    // 8 values over 0..7: ceil(log2(8) + 1) = 4 bins, width 7/4 = 1.75, rounded up to 2.
    expect(autoBinWidth([0, 1, 2, 3, 4, 5, 6, 7])).toBe(2);
    // 100 values over 0..99: 8 bins, width 12.4, rounded up to 20.
    expect(autoBinWidth(Array.from({ length: 100 }, (_, i) => i))).toBe(20);
  });
  it('gives constant data a width from the size of the value, never a zero range', () => {
    expect(autoBinWidth([5, 5, 5])).toBe(1);
    expect(autoBinWidth([250, 250])).toBe(100);
    expect(autoBinWidth([0, 0])).toBe(1);
    expect(autoBinWidth([])).toBe(1);
  });
  it('anchors the first edge at a multiple of the width and covers the largest value', () => {
    expect(binEdges([1.2, 4.9], 2)).toEqual([0, 2, 4, 6]);
    expect(binEdges([0, 1, 2, 3], 1)).toEqual([0, 1, 2, 3, 4]);
    expect(binEdges([3, 3], 1)).toEqual([3, 4]);
    expect(binEdges([-3.5, -0.2], 1)).toEqual([-4, -3, -2, -1, 0]);
    expect(binEdges([1, 9], 2, 1)).toEqual([1, 3, 5, 7, 9, 11]);
  });
});

describe('counting into bins (spec 22.1)', () => {
  it('counts 0, 1, 2, 3 into edges 0, 1, 2, 3 as 1, 1, 2 with the last edge included', () => {
    const r = countBins([0, 1, 2, 3], [0, 1, 2, 3]);
    expect(r.counts).toEqual([1, 1, 2]);
    expect(r.outside).toBe(0);
  });
  it('puts a value on an inner edge into the bin to its right', () => {
    expect(countBins([1, 1, 2], [0, 1, 2, 3]).counts).toEqual([0, 2, 1]);
  });
  it('leaves out and counts values outside the edges, instead of folding them into the end bins', () => {
    const r = countBins([-1, 0, 1, 5, 9], [0, 2, 4]);
    expect(r.counts).toEqual([2, 0]);
    expect(r.outside).toBe(3);
  });
  it('leaves out the last edge when it is not included', () => {
    expect(countBins([0, 1, 2, 3], [0, 1, 2, 3], false)).toEqual({ counts: [1, 1, 1], outside: 1 });
  });
});

describe('bar heights', () => {
  const counts = [1, 1, 2];
  const edges = [0, 1, 2, 3];
  it('are counts, fractions, percents or densities of all the values', () => {
    expect(binHeights(counts, edges, 4, 'count', 'off')).toEqual([1, 1, 2]);
    expect(binHeights(counts, edges, 4, 'fraction', 'off')).toEqual([0.25, 0.25, 0.5]);
    expect(binHeights(counts, edges, 4, 'percent', 'off')).toEqual([25, 25, 50]);
    // Unequal widths: the area under the density is the share of the values.
    const dens = binHeights([2, 2], [0, 1, 4], 4, 'density', 'off');
    expect(dens[0] * 1 + dens[1] * 3).toBeCloseTo(1, 12);
  });
  it('show the share of the whole sample even when the tails are left out', () => {
    expect(binHeights([1, 1], [0, 1, 2], 10, 'fraction', 'off')).toEqual([0.1, 0.1]);
  });
  it('add up for a cumulative histogram, upwards or downwards', () => {
    expect(binHeights(counts, edges, 4, 'count', 'ascending')).toEqual([1, 2, 4]);
    expect(binHeights(counts, edges, 4, 'count', 'descending')).toEqual([4, 3, 2]);
    expect(binHeights(counts, edges, 4, 'percent', 'ascending')).toEqual([25, 50, 100]);
    // A cumulative density is the cumulative fraction.
    expect(binHeights(counts, edges, 4, 'density', 'ascending')).toEqual([0.25, 0.5, 1]);
  });
});

describe('empirical cumulative distribution (spec 22.1)', () => {
  it('has one jump for tied values: F(1) = 0.5, F(2) = 0.75, F(3) = 1 for 1, 1, 2, 3', () => {
    const { steps, n } = ecdfSteps([1, 1, 2, 3], 'atOrBelow');
    expect(n).toBe(4);
    expect(steps).toEqual([
      { x: 1, f: 0.5, ties: 2 },
      { x: 2, f: 0.75, ties: 1 },
      { x: 3, f: 1, ties: 1 },
    ]);
  });
  it('is one minus that for the strictly-above direction', () => {
    expect(ecdfSteps([1, 1, 2, 3], 'above').steps.map((s) => s.f)).toEqual([0.5, 0.25, 0]);
  });
  it('ignores what is not a number, and has nothing for no values', () => {
    expect(ecdfSteps([null, NaN, 4], 'atOrBelow').steps).toEqual([{ x: 4, f: 1, ties: 1 }]);
    expect(ecdfSteps([], 'atOrBelow')).toEqual({ steps: [], n: 0 });
  });
});
