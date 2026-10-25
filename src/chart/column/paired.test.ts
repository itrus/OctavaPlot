import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../model/defaults';
import type { DataTable, Project } from '../model/types';
import { patchLook, patchStyle, setChartType } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { chartToSvgString } from './export';
import { buildChartModel } from './model';

/** Rows are subjects; columns are conditions. */
const setup = (columns: Array<Array<number | null>>, type: 'paired' | 'scatter' = 'paired') => {
  const table: DataTable = createColumnTable('Data', false);
  table.groups.forEach((g, i) => g.observations.forEach((o, r) => (o.value = columns[i]?.[r] ?? null)));
  const chart = createChart(table.id, undefined, type);
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const bridge = (p: Project, on: boolean) => patchLook(p.charts[0].id, { pairs: { bridge: on } })(p).charts[0];

describe('paired plot', () => {
  it('joins the values of each row across the columns, one line for each subject', () => {
    const { table, chart } = setup([[1, 2, 3], [2, 3, 5], [4, 4, 4]]);
    const m = buildChartModel(chart, table);
    expect(m.pairLines).toHaveLength(3);
    expect(m.pairLines.map((l) => l.row)).toEqual([0, 1, 2]);
    // Subject 0 goes through its dot in each of the three columns.
    const through = m.groups.slice(0, 3).map((g) => g.points.find((q) => q.row === 0)!);
    const numbers = [...m.pairLines[0].d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((x) => [Number(x[1]), Number(x[2])]);
    expect(numbers).toEqual(through.map((q) => [Math.round(q.cx * 100) / 100, Math.round(q.cy * 100) / 100]));
    expect(m.pairLines[0].d.startsWith('M')).toBe(true);
    expect(m.pairLines[0].d.match(/L/g)).toHaveLength(2);
  });
  it('keeps every dot on the line of its column, even with jitter on', () => {
    const { table, chart } = setup([[1, 2], [2, 3]]);
    expect(chart.jitter.enabled).toBe(true);
    const m = buildChartModel(chart, table);
    for (const g of m.groups) for (const p of g.points) expect(p.cx).toBeCloseTo(g.centerX, 9);
  });
  it('breaks a subject\'s line at a missing value, and joins across it only when asked', () => {
    const { p, table } = setup([[1, 2], [2, null], [4, 5]]);
    const broken = buildChartModel(p.charts[0], table);
    // Subject 1 has values in columns A and C but not B: no segment, so no line at all.
    expect(broken.pairLines.map((l) => l.row)).toEqual([0]);
    const joined = buildChartModel(bridge(p, true), table);
    expect(joined.pairLines.map((l) => l.row)).toEqual([0, 1]);
    const line = joined.pairLines.find((l) => l.row === 1)!;
    expect(line.d.match(/L/g)).toHaveLength(1);
    // The line spans A and C, so it passes the column with the gap and a value is never invented there.
    const [a, c] = [...line.d.matchAll(/(-?[\d.]+),/g)].map((x) => Number(x[1]));
    expect(c).toBeGreaterThan(a + 10);
    expect(joined.groups[1].points.find((q) => q.row === 1)).toBeUndefined();
  });
  it('has no line for a subject that has one value only', () => {
    const { table, chart } = setup([[1, 2], [3, null]]);
    expect(buildChartModel(chart, table).pairLines.map((l) => l.row)).toEqual([0]);
  });
  it('draws lines only while the lines are on, in the colour and thickness of the data set', () => {
    const { p, table } = setup([[1, 2], [2, 3]]);
    const off = patchStyle(p.charts[0].id, 'all', { showLines: false })(p).charts[0];
    expect(buildChartModel(off, table).pairLines).toHaveLength(0);
    const styled = patchStyle(p.charts[0].id, 'all', { lineColor: '#112233', lineWidthPt: 4 })(p).charts[0];
    expect(buildChartModel(styled, table).pairLines[0]).toMatchObject({ color: '#112233', strokeWidth: 4 });
    expect(chartToSvgString(styled, table)).toContain('stroke="#112233" stroke-width="4"');
  });
  it('is not a scatter plot: that has no lines and its dots spread out', () => {
    const { table, chart } = setup([[1, 2], [2, 3]], 'scatter');
    expect(buildChartModel(chart, table).pairLines).toHaveLength(0);
  });
  it('can show the mean of each column, run horizontally, and be switched from other column charts', () => {
    const { p, table } = setup([[1, 2, 3], [2, 3, 5]]);
    const id = p.charts[0].id;
    const withMean = patchStyle(id, 'all', { showMeanLine: true })(p).charts[0];
    expect(buildChartModel(withMean, table).groups[0].meanLine).not.toBeNull();
    const flipped = patchLook(id, { orientation: 'horizontal' })(p).charts[0];
    const m = buildChartModel(flipped, table);
    expect(m.orient.horizontal).toBe(true);
    expect(chartToSvgString(flipped, table)).not.toContain('NaN');
    const back = setChartType(id, 'bar')(p);
    expect(buildChartModel(back.charts[0], table).pairLines).toHaveLength(0);
  });
  it('keeps its setting in a file, and old files join across nothing', () => {
    const { p } = setup([[1, 2]]);
    const next = patchLook(p.charts[0].id, { pairs: { bridge: true } })(p);
    expect(parseProject(stringifyProject(next)).charts[0].pairs.bridge).toBe(true);
    const text = JSON.parse(stringifyProject(next));
    delete text.project.charts[0].pairs;
    expect(parseProject(JSON.stringify(text)).charts[0].pairs.bridge).toBe(false);
  });
});
