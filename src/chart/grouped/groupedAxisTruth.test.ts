import { describe, expect, it } from 'vitest';
import { createChart, createGroupedTable } from '../../model/defaults';
import type { ChartType, DataTable, Project } from '../../model/types';
import { xySeries } from '../../model/table/tableLayout';
import { patchAxis } from '../../state/commands';
import { axisGaps, axisPieces } from '../shared/axes/axisScale';
import { buildGroupedModel } from './groupedModel';

/** Replicates of the cell (series, row): `cells[series][row]`. */
const replicates = (cells: number[][][], type: ChartType) => {
  const table: DataTable = createGroupedTable('G', false, { kind: 'replicates', n: 5 });
  xySeries(table).forEach((s, si) => cells[si]?.forEach((values, r) => values.forEach((v, k) => (s.columns[k].observations[r].value = v))));
  const chart = createChart(table.id, undefined, type);
  return { p: { id: 'p', name: 'p', dataTables: [table], charts: [chart] } as Project, table };
};
/** One value per cell: `cells[series][row]`. */
const singles = (cells: number[][], type: ChartType) => {
  const table: DataTable = createGroupedTable('G', false);
  xySeries(table).forEach((s, si) => cells[si]?.forEach((v, r) => (s.columns[0].observations[r].value = v)));
  const chart = createChart(table.id, undefined, type);
  return { p: { id: 'p', name: 'p', dataTables: [table], charts: [chart] } as Project, table };
};
const id = (p: Project) => p.charts[0].id;
const onLog = (p: Project) => patchAxis(id(p), 'yAxis', { scale: 'log10' })(p).charts[0];
const broken = (p: Project, extra: Parameters<typeof patchAxis>[2] = {}) => patchAxis(id(p), 'yAxis', { breaks: [{ from: 20, to: 80 }], min: 0, max: 100, ...extra })(p).charts[0];
const ys = (d: string): number[] => [...d.matchAll(/[ML]-?[\d.]+,(-?[\d.]+)/g)].map((x) => Number(x[1]));
const runs = (d: string): string[] => d.split(/(?=M)/).filter(Boolean);

describe('grouped box plots and violins: statistics do not depend on a log axis', () => {
  it('the median is 2 on a linear and on a log axis; the box that cannot be shown is not drawn and is explained', () => {
    const { p, table } = replicates([[[-1, 1, 2, 3, 4]]], 'groupedBox');
    const lin = buildGroupedModel(p.charts[0], table).series[0].bars[0];
    const log = buildGroupedModel(onLog(p), table);
    expect(lin.value).toBe(2);
    expect(lin.dist).not.toBeNull();
    expect(log.series[0].bars[0].value).toBe(2);
    expect(log.series[0].bars[0].dist).toBeNull();
    expect(log.warnings.join(' ')).toMatch(/Box of .* is not drawn: its lower quartile is 0 or below, which a log axis cannot show\. The statistics include all 5 values\./);
  });
  it('the violin of the whole sample keeps its median on a log axis', () => {
    const { p, table } = replicates([[[-1, 1, 2, 3, 4]]], 'groupedViolin');
    const log = buildGroupedModel(onLog(p), table);
    expect(log.series[0].bars[0].value).toBe(2);
  });
  it('a box that the axis can show is the same as on a linear axis', () => {
    const { p, table } = replicates([[[1, 2, 3, 4, 8]]], 'groupedBox');
    const lin = buildGroupedModel(p.charts[0], table).series[0].bars[0];
    const log = buildGroupedModel(onLog(p), table).series[0].bars[0];
    expect(log.dist).not.toBeNull();
    expect(log.value).toBe(lin.value);
  });
  it('a box with a value in the gap is not drawn, and the warning says so', () => {
    const { p, table } = replicates([[[10, 12, 50, 52, 90]]], 'groupedBox');
    const m = buildGroupedModel(broken(p), table);
    // The median (50) is in the gap too: no box, and no mark standing for one.
    expect(m.series[0].bars.filter((b) => b.dist)).toHaveLength(0);
    expect(m.warnings.join(' ')).toMatch(/Box of .* is not drawn: its .* lies in an omitted range of the axis.*all 5 values/);
  });
});

describe('grouped charts on a broken axis: marks and lines are cut in data space', () => {
  it('a bar whose value is inside the gap is not drawn; a bar that spans the gap has the gap cut out', () => {
    const { p, table } = singles([[10, 50, 90]], 'groupedBar');
    const m = buildGroupedModel(broken(p), table);
    const bars = m.series[0].bars;
    expect(bars.map((b) => b.row)).toEqual([0, 2]);
    expect(m.warnings.join(' ')).toMatch(/1 value lies inside an omitted range of the axis and is not drawn/);
    const bar = bars[1];
    const bottom = m.layout.plot.y + m.layout.plot.height;
    const pieces = axisPieces(m.y, bottom, -m.layout.plot.height)!;
    const [gap] = axisGaps(m.y, bottom, -m.layout.plot.height);
    const visible = pieces.map(([a, b]) => Math.max(0, Math.min(b, bar.y + bar.height) - Math.max(a, bar.y)));
    expect(visible[0] + visible[1]).toBeCloseTo(bar.height - (gap[1] - gap[0]), 6);
  });
  it('a line over the categories is cut at the gap, not drawn through it', () => {
    const { p, table } = singles([[10, 90]], 'groupedLine');
    const m = buildGroupedModel(broken(p), table);
    const parts = runs(m.series[0].linePath);
    expect(parts).toHaveLength(2);
    const [a, b] = parts.map(ys);
    expect(a[0]).toBeCloseTo(m.yScale(10), 1);
    expect(a[1]).toBeCloseTo(m.yScale(20), 1);
    expect(b[0]).toBeCloseTo(m.yScale(80), 1);
    expect(b[1]).toBeCloseTo(m.yScale(90), 1);
  });
  it('a line to a value inside the gap stops at its edge, and the point is not drawn', () => {
    const { p, table } = singles([[10, 50]], 'groupedLine');
    const m = buildGroupedModel(broken(p), table);
    expect(m.series[0].points.map((q) => q.row)).toEqual([0]);
    const parts = runs(m.series[0].linePath);
    expect(parts).toHaveLength(1);
    expect(ys(parts[0])[1]).toBeCloseTo(m.yScale(20), 1);
  });
  it('a floating bar with an end inside the gap is not drawn', () => {
    const { p, table } = replicates([[[10, 20, 50, 15, 12], [10, 90, 85, 15, 12]]], 'groupedFloating');
    const m = buildGroupedModel(broken(p), table);
    expect(m.series[0].bars.map((b) => b.row)).toEqual([1]);
  });
  it('a stacked part that ends inside the gap is not drawn, and the pile is not shifted', () => {
    const { p, table } = singles([[10], [50]], 'groupedStacked');
    const m = buildGroupedModel(broken(p, { scale: 'linear' }), table);
    expect(m.series[0].bars).toHaveLength(1);
    expect(m.series[1].bars).toHaveLength(0);
  });
  it('a reversed axis has no gap: nothing is dropped and a line is one run', () => {
    const { p, table } = singles([[10, 90]], 'groupedLine');
    const m = buildGroupedModel(broken(p, { reverse: true }), table);
    expect(m.y.segments).toBeUndefined();
    expect(m.series[0].points).toHaveLength(2);
    expect(runs(m.series[0].linePath)).toHaveLength(1);
  });
  it('a log axis has no gap: nothing is dropped and a line is one run', () => {
    const { p, table } = singles([[10, 50]], 'groupedLine');
    const m = buildGroupedModel(broken(p, { scale: 'log10', min: null, max: null }), table);
    expect(m.y.segments).toBeUndefined();
    expect(m.series[0].points).toHaveLength(2);
    expect(runs(m.series[0].linePath)).toHaveLength(1);
  });
});
