import { describe, expect, it } from 'vitest';
import { benchSteps, meanSe, runBenchmark, timeRuns, type BenchResult } from './benchmark';

describe('timeRuns', () => {
  it('runs once to warm up, then the given number of times, and returns each timed run', async () => {
    let calls = 0;
    const clock = [0, 5, 10, 13, 20, 21];
    let i = 0;
    const times = await timeRuns(3, () => void calls++, () => clock[i++]);
    expect(calls).toBe(4);
    expect(times).toEqual([5, 3, 1]);
  });
});

describe('meanSe', () => {
  it('gives the mean and the sample standard deviation over the square root of n', () => {
    // 2, 4, 6: mean 4, sample variance 4, SD 2, SE 2 / sqrt(3)
    const r = meanSe([2, 4, 6]);
    expect(r.mean).toBe(4);
    expect(r.se).toBeCloseTo(2 / Math.sqrt(3), 12);
  });
  it('has no standard error for one run, and none for identical runs', () => {
    expect(meanSe([7])).toEqual({ mean: 7, se: 0 });
    expect(meanSe([3, 3, 3]).se).toBe(0);
  });
});

describe('runBenchmark', () => {
  const small = { values: 2000, dots: 200, repeats: { draw: 2, dom: 2, stats: 2 } };
  it('reports every step once, in order, with a mean, a standard error and the number of runs', async () => {
    const got: BenchResult[] = [];
    await runBenchmark((r) => got.push(r), () => false, small);
    expect(got.map((r) => r.id)).toEqual(benchSteps(small).map((s) => s.id));
    for (const r of got) {
      expect(r.mean).toBeGreaterThanOrEqual(0);
      expect(r.se).toBeGreaterThanOrEqual(0);
      expect(r.n).toBe(2);
    }
  });
  it('stops when cancelled', async () => {
    const got: BenchResult[] = [];
    await runBenchmark((r) => got.push(r), () => true, small);
    expect(got).toEqual([]);
  });
});
