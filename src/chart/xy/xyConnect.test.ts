import { describe, expect, it } from 'vitest';
import { createChart, createXyTable } from '../../model/defaults';
import { capabilitiesOf } from '../../model/graph/capabilities';
import { chartTypeInfo } from '../../model/graph/chartTypes';
import type { ChartType, DataTable, Project } from '../../model/types';
import { patchLook, setCells } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { buildXyModel } from './xyModel';

/** An XY table whose first series holds exactly these rows (null = empty); the other series and rows are cleared. */
const tableOf = (xs: Array<number | null>, ys: Array<number | null>): DataTable => {
  const t = createXyTable('XY 1', true);
  const edits = Array.from({ length: t.rowCount }, (_, row) => [
    { row, col: 0, value: xs[row] ?? null },
    { row, col: 1, value: ys[row] ?? null },
    { row, col: 2, value: null },
  ]).flat();
  return setCells(t.id, edits)({ id: 'p', name: 'p', dataTables: [t], charts: [] }).dataTables[0];
};

const coords = (d: string): Array<[number, number]> => [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);
/** The path of the first series as the data values it visits, one list per run (a run starts at M). */
const runs = (xs: Array<number | null>, ys: Array<number | null>, lineConnect: 'table' | 'x', type: ChartType = 'xyLine') => {
  const table = tableOf(xs, ys);
  const chart = { ...createChart(table.id, undefined, type), lineConnect };
  const m = buildXyModel(chart, table);
  const px = m.series[0].points.map((p) => [Number(m.xScale(p.x).toFixed(2)), Number(m.yScale(p.y).toFixed(2))]);
  const back = (c: [number, number]) => {
    const i = px.findIndex((q) => Math.abs(q[0] - c[0]) < 0.02 && Math.abs(q[1] - c[1]) < 0.02);
    return `${m.series[0].points[i].x},${m.series[0].points[i].y}`;
  };
  return m.series[0].linePath.split('M').filter(Boolean).map((part) => coords(`M${part}`).map(back));
};

describe('XY line connection order', () => {
  it('joins the points in table order by default and in ascending X on request', () => {
    expect(runs([0, 2, 1], [0, 2, 3], 'table')).toEqual([['0,0', '2,2', '1,3']]);
    expect(runs([0, 2, 1], [0, 2, 3], 'x')).toEqual([['0,0', '1,3', '2,2']]);
  });
  it('keeps table order for equal X', () => {
    expect(runs([1, 0, 1, 1], [5, 1, 3, 4], 'x')).toEqual([['0,1', '1,5', '1,3', '1,4']]);
  });
  it('breaks at a missing Y in both modes, and never bridges it', () => {
    expect(runs([0, 2, 1, 3], [0, null, 3, 4], 'table')).toEqual([['0,0'], ['1,3', '3,4']]);
    // The empty row sits at X = 2: it cuts the sorted line between X = 1 and X = 3.
    expect(runs([0, 2, 1, 3], [0, null, 3, 4], 'x')).toEqual([['0,0', '1,3'], ['3,4']]);
  });
  it('does not break at a row with no X, which is not drawn', () => {
    expect(runs([0, null, 1], [0, 5, 3], 'table')).toEqual([['0,0'], ['1,3']]);
    expect(runs([0, null, 1], [0, 5, 3], 'x')).toEqual([['0,0', '1,3']]);
  });
  it('changes only the line: points, symbols and ids stay in table order', () => {
    const table = tableOf([0, 2, 1], [0, 2, 3]);
    const a = buildXyModel({ ...createChart(table.id, undefined, 'xyLineSymbols'), lineConnect: 'table' }, table).series[0];
    const b = buildXyModel({ ...createChart(table.id, undefined, 'xyLineSymbols'), lineConnect: 'x' }, table).series[0];
    expect(a.linePath).not.toBe(b.linePath);
    expect(b.points).toEqual(a.points);
    expect(b.points.map((p) => p.x)).toEqual([0, 2, 1]);
    expect(b.errorPath).toBe(a.errorPath);
    expect(b.fit).toEqual(a.fit);
  });
  it('is table order for a chart that has not set it', () => {
    const table = tableOf([0, 2, 1], [0, 2, 3]);
    const chart = createChart(table.id, undefined, 'xyLine');
    expect(chart.lineConnect).toBe('table');
    expect(buildXyModel(chart, table).series[0].linePath).toBe(buildXyModel({ ...chart, lineConnect: 'table' }, table).series[0].linePath);
  });
  it('orders the outline of an area too, and leaves spikes alone', () => {
    expect(runs([0, 2, 1], [0, 2, 3], 'x', 'xyArea')).toEqual([['0,0', '1,3', '2,2']]);
    const table = tableOf([0, 2, 1], [0, 2, 3]);
    const spikes = (c: 'table' | 'x') => buildXyModel({ ...createChart(table.id, undefined, 'xySpikes'), lineConnect: c }, table).series[0].linePath;
    expect(spikes('x')).toBe(spikes('table'));
  });
  it('is offered where it is drawn and nowhere else', () => {
    for (const t of ['xyLine', 'xyLineSymbols', 'xyArea', 'xyScatter'] as const) expect(capabilitiesOf(t).lineConnect).toBe(true);
    for (const t of ['xySpikes', 'bar', 'survival', 'histogram', 'pie'] as const) expect(capabilitiesOf(t).lineConnect).toBe(false);
  });
  it('is described as row order in the gallery', () => {
    expect(chartTypeInfo('xyLine')?.description).toMatch(/table order/i);
    expect(chartTypeInfo('xyLineSymbols')?.description).toMatch(/table order/i);
  });
  it('survives a file, and a bad or missing value in a file means table order', () => {
    const table = tableOf([0, 2, 1], [0, 2, 3]);
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [createChart(table.id, undefined, 'xyLine')] };
    const set = patchLook(p.charts[0].id, { lineConnect: 'x' })(p);
    expect(parseProject(stringifyProject(set)).charts[0].lineConnect).toBe('x');
    const raw = JSON.parse(stringifyProject(set));
    raw.project.charts[0].lineConnect = 'sideways';
    expect(parseProject(JSON.stringify(raw)).charts[0].lineConnect).toBe('table');
    delete raw.project.charts[0].lineConnect;
    expect(parseProject(JSON.stringify(raw)).charts[0].lineConnect).toBe('table');
  });
});
