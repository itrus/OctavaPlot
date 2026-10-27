import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import type { ChartType, Project } from '../../model/types';
import { addChart, addDataTable, patchAxis, patchStyle, patchSummary, replaceTableData } from '../../state/commands';
import { buildXyModel } from './xyModel';

/** An XY project whose first Y series is `rows` (X, Y) or, with replicates, (X, Y1, Y2, Y3). */
const setup = (rows: number[][], type: ChartType = 'xyLineSymbols', replicates = false): Project => {
  const names = replicates ? ['X', 'Y1', 'Y2', 'Y3'] : ['X', 'Y'];
  let p = addDataTable('t', 'xy', { sample: true, ...(replicates ? { layout: { kind: 'replicates' as const, n: 3 } } : {}) })(createExampleProject());
  p = addChart('c', 't', undefined, type)(p);
  return replaceTableData('t', { names, titles: null, values: rows })(p);
};
const model = (p: Project) => buildXyModel(p.charts.find((c) => c.id === 'c')!, p.dataTables.find((t) => t.id === 't')!);
const broken = (p: Project, axis: 'xAxis' | 'yAxis', from: number, to: number, min: number, max: number) => patchAxis('c', axis, { min, max, breaks: [{ from, to }] })(p);
/** The Y of each vertex of a path of M and L commands, and the number of separate runs. */
const ys = (d: string): number[] => [...d.matchAll(/[ML]-?[\d.]+,(-?[\d.]+)/g)].map((x) => Number(x[1]));
const runs = (d: string): number => d.split(/(?=M)/).filter(Boolean).length;

const data = [[1, 10], [2, 50], [3, 90], [4, 15], [5, 85]];

describe('a broken Y axis on an XY chart: marks and lines are cut in data space', () => {
  const p = broken(setup(data), 'yAxis', 20, 80, 0, 100);

  it('does not draw a point whose value is inside the gap, and says so', () => {
    const m = model(p);
    expect(m.series[0].points.map((q) => q.y)).toEqual([10, 90, 15, 85]);
    expect(m.warnings).toContain('1 value lies inside an omitted range of the axis and is not drawn.');
  });
  it('draws the line only where there is axis: each run ends on an edge of the gap, never in it', () => {
    const m = model(p);
    const allowed = [10, 20, 80, 90, 15, 85].map((v) => Number(m.yScale(v).toFixed(2)));
    const found = ys(m.series[0].linePath);
    expect(found.length).toBeGreaterThan(0);
    for (const y of found) expect(allowed).toContain(Number(y.toFixed(2)));
    // The segments that cross the gap give separate runs: 10 to the edge, the edge to 90 ... not one line through the gap.
    expect(runs(m.series[0].linePath)).toBeGreaterThan(1);
  });
  it('says nothing, and draws everything, when no value is in the gap', () => {
    const none = broken(setup([[1, 10], [2, 15], [3, 90], [4, 95]]), 'yAxis', 20, 80, 0, 100);
    expect(model(none).series[0].points).toHaveLength(4);
    expect(model(none).warnings.join(' ')).not.toMatch(/omitted range/);
  });
  it('is the same with no gap: nothing is dropped', () => {
    const plain = patchAxis('c', 'yAxis', { min: 0, max: 100, breaks: [] })(setup(data));
    expect(model(plain).series[0].points).toHaveLength(5);
    expect(runs(model(plain).series[0].linePath)).toBe(1);
  });
});

describe('a broken X axis on an XY chart', () => {
  it('does not draw a point whose X is inside the gap, and says so', () => {
    const p = broken(setup([[1, 5], [2, 6], [3, 7], [7, 8], [8, 9]]), 'xAxis', 2.5, 6.5, 0, 10);
    const m = model(p);
    expect(m.series[0].points.map((q) => q.x)).toEqual([1, 2, 7, 8]);
    expect(m.warnings).toContain('1 value lies inside an omitted range of the axis and is not drawn.');
  });
  it('spikes are drawn only for the points that have a place', () => {
    const p = broken(setup([[1, 5], [3, 6], [7, 8]], 'xySpikes'), 'xAxis', 2.5, 6.5, 0, 10);
    const m = model(p);
    expect(m.series[0].points).toHaveLength(2);
    expect((m.series[0].linePath.match(/M/g) ?? []).length).toBe(2);
  });
});

describe('an error bar with an end inside the gap', () => {
  // Three replicates each: 10, 15, 25 has a mean of 16.7 and an SD of 7.6, so its bar reaches 24: into the gap 20 to 80.
  const rows = [[1, 10, 15, 25], [2, 90, 91, 92], [3, 11, 12, 13]];
  const withSd = (p: Project) => patchStyle('c', 'all', { showErrorBars: true })(patchSummary('c', 'all', { centre: 'mean', spread: 'sd' })(p));

  it('is not drawn, and the warning counts it: the end would be drawn at the edge as if that were its value', () => {
    const p = withSd(broken(setup(rows, 'xyLineSymbols', true), 'yAxis', 20, 80, 0, 100));
    const m = model(p);
    expect(m.series[0].points).toHaveLength(3);
    expect(m.warnings).toContain('1 error bar has an end inside an omitted range of the axis and is not drawn.');
    // The bars of the other two points are there.
    expect((m.series[0].errorPath.match(/M/g) ?? []).length).toBeGreaterThan(0);
  });
  it('is drawn in full on the same data without the gap', () => {
    const p = withSd(patchAxis('c', 'yAxis', { min: 0, max: 100, breaks: [] })(setup(rows, 'xyLineSymbols', true)));
    const m = model(p);
    expect(m.warnings.join(' ')).not.toMatch(/omitted range/);
    const whole = (m.series[0].errorPath.match(/M/g) ?? []).length;
    const cut = (model(withSd(broken(setup(rows, 'xyLineSymbols', true), 'yAxis', 20, 80, 0, 100))).series[0].errorPath.match(/M/g) ?? []).length;
    expect(whole).toBeGreaterThan(cut);
  });
});
