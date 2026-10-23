import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../model/defaults';
import type { DataTable, Project } from '../model/types';
import { patchAxis, patchDistribution, setCells, setChartType } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { boxSummary, quantile6 } from '../stats/distribution';
import { chartToSvgString } from './export';
import { buildChartModel } from './model';

/** One data set per column; values given per column. */
const setup = (columns: Array<Array<number | null>>, type: 'box' | 'violin') => {
  const table: DataTable = createColumnTable('Data', false);
  table.groups.forEach((g, i) => g.observations.forEach((o, r) => (o.value = columns[i]?.[r] ?? null)));
  const chart = createChart(table.id, undefined, type);
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const withOutlier = [1, 2, 3, 4, 5, 6, 7, 8, 30];
const plain = [10, 12, 13, 15, 16, 18, 21, 22];

describe('box plot chart', () => {
  it('draws the quartile box, the median and the whiskers from the raw values', () => {
    const { table, chart } = setup([plain, withOutlier], 'box');
    const m = buildChartModel(chart, table);
    const g = m.groups[0];
    const s = boxSummary(plain, 'minmax')!;
    expect(g.dist!.shape).toBe('box');
    expect(g.bar!.y).toBeCloseTo(m.yScale(s.q3), 6);
    expect(g.bar!.y + g.bar!.height).toBeCloseTo(m.yScale(s.q1), 6);
    expect(s.q1).toBe(quantile6(plain, 0.25));
    const names = g.dist!.lines.map((l) => l.id.split(':').pop());
    expect(names).toEqual(['whisker-hi', 'whisker-lo', 'median']);
    expect(g.errorBar).toBeNull();
    expect(g.barLabel).toBeNull();
  });
  it('makes the axis show the whiskers and the dots it draws', () => {
    const { p, table } = setup([plain, withOutlier], 'box');
    const id = p.charts[0].id;
    const top = (c: Project) => buildChartModel(c.charts[0], table).y.domain[1];
    expect(top(p)).toBeGreaterThanOrEqual(30);
    const tukey = patchDistribution(id, { whisker: 'tukey' })(p);
    expect(top(tukey)).toBeLessThan(30);
    const dots = patchDistribution(id, { whisker: 'tukey', points: 'outside' })(tukey);
    expect(top(dots)).toBeGreaterThanOrEqual(30);
  });
  it('shows the values outside the whiskers as dots, or all of them', () => {
    const { p, table } = setup([plain, withOutlier], 'box');
    const id = p.charts[0].id;
    const outside = patchDistribution(id, { whisker: 'tukey', points: 'outside' })(p);
    const m = buildChartModel(outside.charts[0], table);
    expect(m.groups[0].points).toHaveLength(0);
    expect(m.groups[1].points.map((q) => q.value)).toEqual([30]);
    const all = patchDistribution(id, { points: 'all' })(p);
    expect(buildChartModel(all.charts[0], table).groups[1].points).toHaveLength(withOutlier.length);
    const mean = patchDistribution(id, { showMean: true })(p);
    expect(buildChartModel(mean.charts[0], table).groups[0].points.at(-1)).toMatchObject({ value: 15.875, shape: 'plus' });
  });
  it('draws only the median and the range for fewer than 4 values', () => {
    const { table, chart } = setup([[2, 5, 9]], 'box');
    const g = buildChartModel(chart, table).groups[0];
    expect(g.dist!.shape).toBe('range');
    expect(g.bar).toBeNull();
    expect(g.dist!.lines.map((l) => l.id.split(':').pop())).toEqual(['range', 'median']);
  });
  it('draws nothing for a data set without values, and no NaN anywhere', () => {
    const { table, chart } = setup([plain], 'box');
    const m = buildChartModel(chart, table);
    expect(m.groups[1].dist).toBeNull();
    expect(chartToSvgString(chart, table)).not.toContain('NaN');
  });
  it('leaves out values of 0 or less on a log axis and says so', () => {
    const { p, table } = setup([[0, 3, 4, 5, 9, 12], plain], 'box');
    const log = patchAxis(p.charts[0].id, 'yAxis', { scale: 'log10' })(p).charts[0];
    const m = buildChartModel(log, table);
    expect(m.warnings.join(' ')).toMatch(/1 value is 0 or less on a log axis/);
    expect(chartToSvgString(log, table)).not.toContain('NaN');
  });
});

describe('violin chart', () => {
  it('draws a mirrored outline with the quartiles and the median across it', () => {
    const { table, chart } = setup([plain, withOutlier], 'violin');
    const g = buildChartModel(chart, table).groups[0];
    expect(g.dist!.shape).toBe('violin');
    expect(g.dist!.outline).toMatch(/^M.*Z$/);
    expect(g.dist!.lines.map((l) => l.id.split(':').pop())).toEqual(['q1', 'q3', 'median']);
    expect(g.dist!.lines[0].dash).toBe('4 3');
    expect(g.errorBar).toBeNull();
  });
  it('is symmetric about the middle of its column', () => {
    const { table, chart } = setup([plain], 'violin');
    const g = buildChartModel(chart, table).groups[0];
    const xs = [...g.dist!.outline!.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[1]));
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(g.centerX, 1);
  });
  it('shows the values and says why when there is no density', () => {
    const { table, chart } = setup([[4, 4, 4, 4], [1, 2]], 'violin');
    const m = buildChartModel(chart, table);
    expect(m.groups[0].dist!.shape).toBe('points');
    expect(m.groups[0].points).toHaveLength(4);
    expect(m.groups[1].points).toHaveLength(2);
    expect(m.warnings.join(' ')).toMatch(/Group A: a density cannot be drawn: it has no spread/);
    expect(m.warnings.join(' ')).toMatch(/Group B: a density cannot be drawn: it has fewer than 3 values/);
  });
  it('never gets wider than its share of a column, whatever the smoothing', () => {
    const { p, table } = setup([plain], 'violin');
    const id = p.charts[0].id;
    const slot = buildChartModel(p.charts[0], table).groups[0].slotWidth;
    for (const level of ['light', 'medium', 'heavy'] as const) {
      const g = buildChartModel(patchDistribution(id, { smoothing: level })(p).charts[0], table).groups[0];
      const xs = [...g.dist!.outline!.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((m) => Number(m[1]));
      expect((Math.max(...xs) - Math.min(...xs)) / 2).toBeLessThanOrEqual((slot * 0.8) / 2 + 0.01);
    }
  });
});

describe('box and violin settings', () => {
  it('can be chosen from a column chart and keep its data', () => {
    const { p, table } = setup([plain], 'box');
    const next = setChartType(p.charts[0].id, 'violin')(p);
    expect(next.charts[0].type).toBe('violin');
    expect(buildChartModel(next.charts[0], table).groups[0].dist!.kind).toBe('violin');
    const back = setChartType(p.charts[0].id, 'bar')(next);
    expect(buildChartModel(back.charts[0], table).groups[0].bar).not.toBeNull();
  });
  it('are kept in a saved file; bad values fall back, and old files get the defaults', () => {
    const { p } = setup([plain], 'box');
    const next = patchDistribution(p.charts[0].id, { whisker: 'p5_95', showMean: true, bandwidth: 0.4, tukeyK: 99 })(p);
    expect(next.charts[0].distribution.tukeyK).toBe(5);
    const back = parseProject(stringifyProject(next));
    expect(back.charts[0].distribution).toMatchObject({ whisker: 'p5_95', showMean: true, bandwidth: 0.4 });
    const text = JSON.parse(stringifyProject(next));
    text.project.charts[0].distribution = { whisker: 'nonsense', points: 7, bandwidth: -3, smoothing: 'x' };
    expect(parseProject(JSON.stringify(text)).charts[0].distribution).toMatchObject({ whisker: 'minmax', points: 'none', bandwidth: null, smoothing: 'medium' });
    delete text.project.charts[0].distribution;
    expect(parseProject(JSON.stringify(text)).charts[0].distribution.whisker).toBe('minmax');
  });
  it('are not lost when a cell is edited', () => {
    const { p, table } = setup([plain], 'box');
    const edited = setCells(table.id, [{ col: 0, row: 0, value: 50 }])(p);
    expect(edited.charts[0].distribution).toEqual(p.charts[0].distribution);
  });
});
