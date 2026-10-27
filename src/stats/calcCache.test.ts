import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SUMMARY } from '../model/defaults';
import { buildXyModel } from '../chart/xy/xyModel';
import { createChart, createXyTable } from '../model/defaults';
import { NO_FIT_SETTINGS } from '../model/options/fitOptions';
import { cachedCalc, calcKey, calcStats, clearCalcCache, type CalcIdentity } from './calcCache';
import { summaryOf } from './summary';

const id = (patch: Partial<CalcIdentity> = {}): CalcIdentity => ({ kind: 'k', algorithm: 1, data: [1, 2, null, 4], method: 'm', ...patch });

describe('calculation identity', () => {
  beforeEach(clearCalcCache);

  it('finds a result again only for the same identity', () => {
    let n = 0;
    const calc = (i: CalcIdentity) => cachedCalc(i, () => ++n);
    expect(calc(id())).toBe(1);
    expect(calc(id())).toBe(1);
    // Each part of the identity matters: data, method, parameters, level, seed and algorithm version.
    for (const patch of [{ data: [1, 2, null, 5] }, { data: [1, 2, 4] }, { method: 'n' }, { params: [3] }, { level: 0.9 }, { seed: 7 }, { algorithm: 2 }, { kind: 'j' }]) {
      const before = n;
      calc(id(patch));
      expect(n).toBe(before + 1);
    }
  });
  it('tells a missing value from a number and from no value', () => {
    expect(calcKey(id({ data: [1, null] }))).not.toBe(calcKey(id({ data: [1, 0] })));
    expect(calcKey(id({ data: [1, null] }))).not.toBe(calcKey(id({ data: [1] })));
    expect(calcKey(id({ data: [12] }))).not.toBe(calcKey(id({ data: [1, 2] })));
  });
  it('counts what it calculated and what it found', () => {
    const c0 = calcStats.computed;
    const h0 = calcStats.hits;
    cachedCalc(id(), () => 0);
    cachedCalc(id(), () => 0);
    expect([calcStats.computed - c0, calcStats.hits - h0]).toEqual([1, 1]);
  });
});

describe('a style or axis edit does not calculate again (metamorphic)', () => {
  beforeEach(clearCalcCache);

  const table = createXyTable('XY', true);
  const chart = createChart(table.id, undefined, 'xyScatter');
  const fit = { ...NO_FIT_SETTINGS, model: 'linear' as const, level: 0.95 };

  it('rebuilding an XY chart after style, size, title, axis and legend edits finds every result', () => {
    buildXyModel(chart, table, fit);
    const before = calcStats.computed;
    const edits = [
      { ...chart, title: 'Another title', widthPx: chart.widthPx + 10 },
      { ...chart, layers: chart.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, symbolSizePt: 11, lineWidthPt: 4, errorColor: '#ff0000' } } : l)) },
      { ...chart, yAxis: { ...chart.yAxis, min: 0, max: 100 } },
      { ...chart, lineOrder: 'onTop' as const },
    ];
    for (const e of edits) buildXyModel(e, table, fit);
    expect(calcStats.computed).toBe(before);
  });
  it('a change to the data, the method or the level calculates again', () => {
    buildXyModel(chart, table, fit);
    let before = calcStats.computed;
    buildXyModel(chart, table, { ...fit, level: 0.9 });
    expect(calcStats.computed).toBeGreaterThan(before);
    before = calcStats.computed;
    buildXyModel(chart, table, { ...fit, model: 'polynomial', degree: 2 });
    expect(calcStats.computed).toBeGreaterThan(before);
  });
  it('a change of the summary calculation (spread) calculates the summaries again', () => {
    const values = [1, 2, 3, 4];
    const a = summaryOf(values, { ...DEFAULT_SUMMARY, spread: 'sd' });
    expect(summaryOf(values, { ...DEFAULT_SUMMARY, spread: 'sem' })).not.toBe(a);
    expect(summaryOf(values, { ...DEFAULT_SUMMARY, spread: 'sd' })).toBe(a);
  });
});

describe('the cost of a key and the size of the cache', () => {
  beforeEach(clearCalcCache);

  it('a fresh array with the same numbers finds the result, a changed number does not', () => {
    let n = 0;
    const calc = (data: number[]) => cachedCalc(id({ data }), () => ++n);
    calc([1, 2, 3]);
    calc([1, 2, 3]);
    expect(n).toBe(1);
    calc([1, 2, 3.0000000001]);
    expect(n).toBe(2);
  });
  it('the second lookup of a large array does not walk it again', () => {
    const data = Array.from({ length: 1_000_000 }, (_, i) => i * 0.5);
    const t0 = performance.now();
    calcKey(id({ data }));
    const first = performance.now() - t0;
    const t1 = performance.now();
    for (let i = 0; i < 100; i++) calcKey(id({ data }));
    const hundred = performance.now() - t1;
    // A hundred repeats cost less than one walk of the data would.
    expect(hundred).toBeLessThan(first);
    expect(calcKey(id({ data }))).toBe(calcKey(id({ data: data.slice() })));
  });
  it('keeps results by the size of their input, dropping the least recently used first', () => {
    let n = 0;
    const big = (k: number) => Array.from({ length: 1_000_000 }, (_, i) => i + k);
    const calc = (k: number) => cachedCalc(id({ data: big(k) }), () => ++n);
    calc(0);
    calc(1);
    calc(2);
    calc(0); // 0 is now the most recent of three
    expect(n).toBe(3);
    calc(3);
    calc(4); // five million of input: the oldest (1, then 2) are dropped
    const before = n;
    calc(0);
    expect(n).toBe(before);
    calc(1);
    expect(n).toBe(before + 1);
  });
  it('does not keep an input larger than the whole budget, and does not keep a throw', () => {
    let n = 0;
    const huge = Array.from({ length: 4_100_000 }, () => 1);
    cachedCalc(id({ data: huge }), () => ++n);
    cachedCalc(id({ data: huge }), () => ++n);
    expect(n).toBe(2);
    expect(() => cachedCalc(id(), () => { throw new Error('x'); })).toThrow();
    expect(cachedCalc(id(), () => 'ok')).toBe('ok');
  });
});
