import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import type { ChartType, DataTable, Project } from '../../model/types';
import { patchAxis, patchLook, patchStyle, patchSummary } from '../../state/commands';
import { axisGaps, axisPieces } from '../shared/axes/axisScale';
import { buildColumnModel } from './columnModel';

/** One data set per column; values given per column. */
const setup = (columns: Array<Array<number | null>>, type: ChartType) => {
  const table: DataTable = createColumnTable('Data', false);
  table.groups.forEach((g, i) => g.observations.forEach((o, r) => (o.value = columns[i]?.[r] ?? null)));
  const chart = createChart(table.id, undefined, type);
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const id = (p: Project) => p.charts[0].id;
const onLog = (p: Project) => patchAxis(id(p), 'yAxis', { scale: 'log10' })(p).charts[0];
const broken = (p: Project, extra: Parameters<typeof patchAxis>[2] = {}) => patchAxis(id(p), 'yAxis', { breaks: [{ from: 20, to: 80 }], min: 0, max: 100, ...extra })(p).charts[0];
/** The y of every point of a path made of M and L commands. */
const ys = (d: string): number[] => [...d.matchAll(/[ML]-?[\d.]+,(-?[\d.]+)/g)].map((x) => Number(x[1]));
const runs = (d: string): string[] => d.split(/(?=M)/).filter(Boolean);

const sample = [-1, 1, 2, 3, 4];

describe('statistics do not depend on a log axis', () => {
  for (const type of ['box', 'floating', 'violin'] as const) {
    it(`${type}: the summary and n are those of the whole sample`, () => {
      const { p, table } = setup([sample], type);
      const lin = buildColumnModel(p.charts[0], table).groups[0];
      const log = buildColumnModel(onLog(p), table).groups[0];
      expect(log.summary).toEqual(lin.summary);
      expect(log.stats).toEqual(lin.stats);
      expect(log.summary.n).toBe(5);
    });
  }
  it('a box whose quartile has no place on a log axis is not drawn, and the warning names it and the full n', () => {
    const { p, table } = setup([sample], 'box');
    const lin = buildColumnModel(p.charts[0], table);
    expect(lin.groups[0].dist).not.toBeNull();
    const log = buildColumnModel(onLog(p), table);
    expect(log.groups[0].dist).toBeNull();
    expect(log.warnings).toContain(`Box of ${log.groups[0].label} is not drawn: its lower quartile is 0 or below, which a log axis cannot show. The statistics include all 5 values.`);
  });
  it('a box that the axis can show is the same box as on a linear axis', () => {
    const { p, table } = setup([[0.5, 1, 2, 3, 4, 8], [1, 2, 3, 4, 8]], 'box');
    const log = buildColumnModel(onLog(p), table).groups[0];
    const lin = buildColumnModel(p.charts[0], table).groups[0];
    expect(log.dist).not.toBeNull();
    expect(log.summary).toEqual(lin.summary);
  });
  it('a sample with a 0 keeps its whole-sample numbers; a box that would need the 0 is not drawn', () => {
    const { p, table } = setup([[0, 3, 4, 5, 9, 12]], 'box');
    const m = buildColumnModel(onLog(p), table);
    expect(m.groups[0].dist).toBeNull();
    expect(m.warnings.join(' ')).toContain('include all 6 values');
  });
  it('a floating bar whose end has no place is not drawn, with the warning', () => {
    const { p, table } = setup([sample], 'floating');
    const m = buildColumnModel(onLog(p), table);
    expect(m.groups[0].dist).toBeNull();
    expect(m.warnings.join(' ')).toMatch(/Floating bar of .* is not drawn: its lowest value is 0 or below.*all 5 values/);
  });
  it('a mean and SD bar keeps its numbers on a log axis', () => {
    const { p, table } = setup([sample], 'bar');
    const lin = buildColumnModel(p.charts[0], table).groups[0];
    const log = buildColumnModel(onLog(p), table).groups[0];
    expect(log.stats).toEqual(lin.stats);
    expect(log.centreValue).toBe(lin.centreValue);
    expect(log.stats.n).toBe(5);
  });
  it('the median is 2 on a linear and on a log axis', () => {
    const { p, table } = setup([sample], 'bar');
    const med = patchSummary(id(p), 'all', { centre: 'median' })(p);
    expect(buildColumnModel(med.charts[0], table).groups[0].centreValue).toBe(2);
    expect(buildColumnModel(onLog(med), table).groups[0].centreValue).toBe(2);
  });
  it('individual values of 0 or less are not drawn as points, and the others are', () => {
    const { p, table } = setup([sample], 'scatter');
    const m = buildColumnModel(onLog(p), table);
    expect(m.groups[0].points.map((q) => q.value)).toEqual([1, 2, 3, 4]);
    expect(m.warnings.join(' ')).toMatch(/1 value is 0 or less on a log axis/);
    expect(m.groups[0].summary.n).toBe(5);
  });
});

describe('a broken axis: marks and lines are cut in data space', () => {
  const [lowEdge, highEdge] = [20, 80];
  it('does not draw a point or a bar whose value is inside the gap, and says so', () => {
    const { p, table } = setup([[10], [50], [90]], 'scatter');
    const m = buildColumnModel(broken(p), table);
    expect(m.groups[0].points).toHaveLength(1);
    expect(m.groups[1].points).toHaveLength(0);
    expect(m.groups[2].points).toHaveLength(1);
    expect(m.warnings.join(' ')).toMatch(/1 value lies inside an omitted range of the axis and is not drawn/);
    const bars = setup([[10], [50], [90]], 'bar');
    const b = buildColumnModel(broken(bars.p), bars.table);
    expect(b.groups[0].bar).not.toBeNull();
    expect(b.groups[1].bar).toBeNull();
    expect(b.groups[2].bar).not.toBeNull();
    expect(b.warnings.join(' ')).toMatch(/Bar of .* is not drawn: its centre value lies in an omitted range/);
  });
  it('a bar that spans the gap has the gap cut out of what is drawn', () => {
    const { p, table } = setup([[10], [90]], 'bar');
    const m = buildColumnModel(broken(p), table);
    const bar = m.groups[1].bar!;
    const bottom = m.layout.plot.y + m.layout.plot.height;
    const pieces = axisPieces(m.y, bottom, -m.layout.plot.height)!;
    const [gap] = axisGaps(m.y, bottom, -m.layout.plot.height);
    expect(bar.y).toBeCloseTo(m.yScale(90), 6);
    expect(bar.y + bar.height).toBeCloseTo(bottom, 6);
    // What the clip leaves of the bar: the part above the gap and the part below it, nothing between.
    const visible = pieces.map(([a, b]) => Math.max(0, Math.min(b, bar.y + bar.height) - Math.max(a, bar.y)));
    expect(visible).toHaveLength(2);
    expect(visible[0] + visible[1]).toBeCloseTo(bar.height - (gap[1] - gap[0]), 6);
    expect(m.yScale(highEdge)).toBeCloseTo(gap[0], 6);
    expect(m.yScale(lowEdge)).toBeCloseTo(gap[1], 6);
  });
  it('a paired line from below to above the gap is two runs that end on the edges of the gap', () => {
    const { p, table } = setup([[10], [90]], 'paired');
    const m = buildColumnModel(broken(p), table);
    expect(m.pairLines).toHaveLength(1);
    const parts = runs(m.pairLines[0].d);
    expect(parts).toHaveLength(2);
    const [a, b] = parts.map(ys);
    expect(a[0]).toBeCloseTo(m.yScale(10), 1);
    expect(a[1]).toBeCloseTo(m.yScale(lowEdge), 1);
    expect(b[0]).toBeCloseTo(m.yScale(highEdge), 1);
    expect(b[1]).toBeCloseTo(m.yScale(90), 1);
  });
  it('a paired line to a value inside the gap stops at the edge, and the point is not drawn', () => {
    const { p, table } = setup([[10], [50]], 'paired');
    const m = buildColumnModel(broken(p), table);
    expect(m.groups[1].points).toHaveLength(0);
    const parts = runs(m.pairLines[0].d);
    expect(parts).toHaveLength(1);
    expect(ys(parts[0])[1]).toBeCloseTo(m.yScale(lowEdge), 1);
  });
  it('the mean connector is cut at the gap, not drawn through it', () => {
    const { p, table } = setup([[10], [90]], 'mean');
    const c = patchStyle(id(p), 'all', { showLines: true })({ ...p, charts: [broken(p)] }).charts[0];
    const m = buildColumnModel(c, table);
    const parts = runs(m.groups[0].connector!.d);
    expect(parts).toHaveLength(2);
    const [a, b] = parts.map(ys);
    expect(a[0]).toBeCloseTo(m.yScale(10), 6);
    expect(a[1]).toBeCloseTo(m.yScale(lowEdge), 6);
    expect(b[0]).toBeCloseTo(m.yScale(highEdge), 6);
    expect(b[1]).toBeCloseTo(m.yScale(90), 6);
  });
  it('a box with a value in the gap is not drawn, and the warning says so', () => {
    const { p, table } = setup([[10, 12, 50, 52, 90]], 'box');
    const m = buildColumnModel(broken(p), table);
    expect(m.groups[0].dist).toBeNull();
    expect(m.warnings.join(' ')).toMatch(/Box of .* is not drawn: its .* lies in an omitted range of the axis.*all 5 values/);
    expect(m.groups[0].summary.n).toBe(5);
  });
  it('an error bar with an end inside the gap is not drawn', () => {
    // Mean 85, SD about 20: the lower end is near 64, inside the gap; the bar itself is above it.
    const { p, table } = setup([[60, 70, 85, 100, 110]], 'bar');
    const sd = patchSummary(id(p), 'all', { spread: 'sd' })(p);
    const lin = buildColumnModel(patchAxis(id(sd), 'yAxis', { min: 0, max: 120 })(sd).charts[0], table);
    expect(lin.groups[0].errorBar).not.toBeNull();
    const m = buildColumnModel(broken(sd, { max: 120 }), table);
    expect(m.groups[0].bar).not.toBeNull();
    expect(m.groups[0].errorBar).toBeNull();
    expect(m.warnings.join(' ')).toMatch(/1 error bar has an end inside an omitted range of the axis and is not drawn/);
  });
  it('a reversed axis has no gap: nothing is dropped and a line is one run', () => {
    const { p, table } = setup([[10], [90]], 'paired');
    const m = buildColumnModel(broken(p, { reverse: true }), table);
    expect(m.y.segments).toBeUndefined();
    expect(m.groups[0].points).toHaveLength(1);
    expect(runs(m.pairLines[0].d)).toHaveLength(1);
  });
  it('a log axis has no gap: nothing is dropped and a line is one run', () => {
    const { p, table } = setup([[10], [50]], 'paired');
    const m = buildColumnModel(broken(p, { scale: 'log10', min: null, max: null }), table);
    expect(m.y.segments).toBeUndefined();
    expect(m.groups[1].points).toHaveLength(1);
    expect(runs(m.pairLines[0].d)).toHaveLength(1);
  });
  it('keeps joining across a missing value when asked to, still cut at the gap', () => {
    const { p, table } = setup([[10], [null], [90]], 'paired');
    const c = patchLook(id(p), { pairs: { bridge: true } })({ ...p, charts: [broken(p)] }).charts[0];
    expect(runs(buildColumnModel(c, table).pairLines[0].d)).toHaveLength(2);
  });
});
