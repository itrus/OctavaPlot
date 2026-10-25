import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createXyTable } from '../model/defaults';
import { sanitizeAxis } from '../model/axis';
import type { AxisConfig } from '../model/types';
import { axisMapper, linearMinorTicks, logMinorTicks, makeFormatter, onAxis, resolveAxis } from './axisScale';
import { buildChartModel } from './model';
import { buildXyModel } from './xyModel';
import { chartToSvgString } from './export';

const base = createChart('t').yAxis;
const cfg = (patch: Partial<AxisConfig> = {}): AxisConfig => ({ ...base, ...patch });
const input = (values: number[], patch = {}) => ({ values, includeZero: false, min: null, max: null, majorInterval: null, tickCountHint: 6, ...patch });

describe('log axes', () => {
  it('put the limits at whole powers and the ticks on them', () => {
    const s = resolveAxis(input([3, 420]), cfg({ scale: 'log10' }));
    expect(s.domain).toEqual([1, 1000]);
    expect(s.ticks).toEqual([1, 10, 100, 1000]);
    expect(s.log).toBe(10);
    expect(s.tickLabel(0.01)).toBe('0.01');
    expect(s.tickLabel(1e7)).toBe('1e+7');
  });
  it('use the base 2 and the natural base for their powers', () => {
    expect(resolveAxis(input([3, 20]), cfg({ scale: 'log2' })).ticks).toEqual([2, 4, 8, 16, 32]);
    const ln = resolveAxis(input([2, 9]), cfg({ scale: 'ln' }));
    expect(ln.ticks.map((t) => Math.round(Math.log(t)))).toEqual([0, 1, 2, 3]);
  });
  it('ignore values at or below 0 and say when none is left', () => {
    expect(resolveAxis(input([-5, 0, 50]), cfg({ scale: 'log10' })).domain).toEqual([10, 100]);
    const none = resolveAxis(input([-1, 0]), cfg({ scale: 'log10' }));
    expect(none.domain).toEqual([1, 10]);
    expect(none.warnings.join(' ')).toMatch(/above 0/);
  });
  it('reject a manual limit that is not positive', () => {
    const s = resolveAxis(input([3, 420], { min: 0 }), cfg({ scale: 'log10' }));
    expect(s.domain[0]).toBe(1);
    expect(s.warnings.join(' ')).toMatch(/minimum above 0/);
  });
  it('take the major interval as a whole number of powers', () => {
    expect(resolveAxis(input([1, 1e6], { majorInterval: 2 }), cfg({ scale: 'log10' })).ticks).toEqual([1, 100, 10000, 1000000]);
    const bad = resolveAxis(input([1, 1e6], { majorInterval: 1.5 }), cfg({ scale: 'log10' }));
    expect(bad.warnings.join(' ')).toMatch(/whole number of powers/);
  });
  it('draw 2 to 9 times each power as minor ticks, on base 10 only', () => {
    expect(logMinorTicks([1, 100])).toHaveLength(16);
    expect(resolveAxis(input([1, 100]), cfg({ scale: 'log10', minorTicks: 1 })).minorTicks).toHaveLength(16);
    expect(resolveAxis(input([1, 100]), cfg({ scale: 'log2', minorTicks: 1 })).minorTicks).toEqual([]);
  });
});

describe('axis mapping', () => {
  it('maps linear values, and reverses them', () => {
    const scale = { domain: [0, 10] as [number, number], log: null, reverse: false };
    expect(axisMapper(scale, 100, -50)(0)).toBe(100);
    expect(axisMapper(scale, 100, -50)(10)).toBe(50);
    expect(axisMapper({ ...scale, reverse: true }, 100, -50)(0)).toBe(50);
    expect(axisMapper({ ...scale, reverse: true }, 100, -50)(10)).toBe(100);
  });
  it('maps a log axis by the logarithm and gives NaN where there is no position', () => {
    const f = axisMapper({ domain: [1, 100], log: 10, reverse: false }, 0, 200);
    expect(f(10)).toBeCloseTo(100);
    expect(f(0)).toBeNaN();
    expect(f(-3)).toBeNaN();
    expect(onAxis({ log: 10 }, 0)).toBe(false);
    expect(onAxis({ log: null }, 0)).toBe(true);
  });
});

describe('minor ticks and number formats', () => {
  it('put equal steps between the major ticks of a linear axis', () => {
    expect(linearMinorTicks([0, 20], [0, 10, 20], 1)).toEqual([5, 15]);
    expect(linearMinorTicks([0, 20], [0, 10, 20], 4)).toEqual([2, 4, 6, 8, 12, 14, 16, 18]);
    expect(linearMinorTicks([0, 20], [0, 10, 20], 0)).toEqual([]);
  });
  it('write numbers by the format settings', () => {
    expect(makeFormatter(cfg(), 0.5)(1.5)).toBe('1.5');
    expect(makeFormatter(cfg({ numberFormat: 'fixed', decimals: 2 }), 1)(3)).toBe('3.00');
    expect(makeFormatter(cfg({ numberFormat: 'scientific', decimals: 1 }), 1)(12345)).toBe('1.2e+4');
    expect(makeFormatter(cfg({ thousands: true }), 1)(100000)).toBe('100,000');
    expect(makeFormatter(cfg({ prefix: '$', suffix: ' mg' }), 1)(5)).toBe('$5 mg');
    expect(makeFormatter(cfg({ prefix: '$' }), 1)(-5)).toBe('$-5');
  });
});

describe('the settings of a stored axis', () => {
  it('fall back to the defaults when they are not valid', () => {
    const a = sanitizeAxis({ ...base, scale: 'cube', tickLengthPt: -4, minorTicks: 99, decimals: 2.4, prefix: 7 } as unknown as AxisConfig, base);
    expect(a.scale).toBe('linear');
    expect(a.tickLengthPt).toBe(0);
    expect(a.minorTicks).toBe(9);
    expect(a.decimals).toBe(2);
    expect(a.prefix).toBe('');
  });
});

describe('charts on a log axis', () => {
  it('leave out the values at or below 0 and count them', () => {
    const table = createXyTable('XY 1', false);
    const chart = createChart(table.id, undefined, 'xyScatter');
    table.groups[0].observations.slice(0, 3).forEach((o, i) => (o.value = [1, 10, 100][i]));
    table.groups[1].observations.slice(0, 3).forEach((o, i) => (o.value = [5, 0, 50][i]));
    table.groups[2].observations.slice(0, 3).forEach((o, i) => (o.value = [7, 70, 700][i]));
    chart.yAxis = { ...chart.yAxis, scale: 'log10' };
    const m = buildXyModel(chart, table);
    expect(m.y.log).toBe(10);
    expect(m.series[0].points).toHaveLength(2);
    expect(m.series[1].points).toHaveLength(3);
    expect(m.warnings.join(' ')).toMatch(/1 point has a value of 0 or less on a log axis/);
    for (const s of m.series) for (const p of s.points) expect(Number.isFinite(p.py)).toBe(true);
  });
  it('start bars at the lowest power and never draw NaN', () => {
    const table = createColumnTable('Data', false);
    table.groups[0].observations.slice(0, 3).forEach((o, i) => (o.value = [2, 20, 200][i]));
    table.groups[1].observations.slice(0, 2).forEach((o, i) => (o.value = [0, 5][i]));
    const chart = createChart(table.id, undefined, 'bar');
    chart.yAxis = { ...chart.yAxis, scale: 'log10' };
    const m = buildChartModel(chart, table);
    expect(m.y.domain[0]).toBeGreaterThan(0);
    expect(chartToSvgString(chart, table)).not.toContain('NaN');
    expect(m.warnings.join(' ')).toMatch(/log axis/);
  });
  it('draw a reversed axis with the large values at the bottom', () => {
    const table = createXyTable('XY 1', true);
    const chart = createChart(table.id, undefined, 'xyScatter');
    const normal = buildXyModel(chart, table);
    chart.yAxis = { ...chart.yAxis, reverse: true };
    const flipped = buildXyModel(chart, table);
    const top = (m: typeof normal) => m.layout.plot.y;
    expect(normal.yScale(normal.y.domain[1])).toBeCloseTo(top(normal));
    expect(flipped.yScale(flipped.y.domain[1])).toBeCloseTo(flipped.layout.plot.y + flipped.layout.plot.height);
  });
});
