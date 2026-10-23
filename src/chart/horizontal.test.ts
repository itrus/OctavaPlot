import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../model/defaults';
import type { DataTable, Project } from '../model/types';
import { addChart, patchAxis, patchBarLabels, patchDistribution, patchLook } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { chartToSvgString } from './export';
import { buildChartModel } from './model';

const setup = (type: 'bar' | 'scatter' | 'mean' | 'box' | 'violin' = 'bar') => {
  const table: DataTable = createColumnTable('Data', true);
  const chart = createChart(table.id, undefined, type);
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const flip = (p: Project) => patchLook(p.charts[0].id, { orientation: 'horizontal' })(p).charts[0];

describe('horizontal column charts', () => {
  it('turn the drawing a quarter: values along the bottom, categories down the left', () => {
    const { p, table } = setup();
    const v = buildChartModel(p.charts[0], table);
    const h = buildChartModel(flip(p), table);
    expect(h.orient.horizontal).toBe(true);
    // The virtual region is the real one on its side.
    expect(h.orient.virtual.width).toBeCloseTo(h.orient.real.height, 6);
    expect(h.orient.virtual.height).toBeCloseTo(h.orient.real.width, 6);
    // The low end of the value axis is at the left edge, the high end at the right edge.
    const lo = h.orient.toScreen(0, h.yScale(h.y.domain[0])).x;
    const hi = h.orient.toScreen(0, h.yScale(h.y.domain[1])).x;
    expect(lo).toBeCloseTo(h.orient.real.x, 6);
    expect(hi).toBeCloseTo(h.orient.real.x + h.orient.real.width, 6);
    // The first category is at the top.
    const ys = h.groups.map((g) => h.orient.toScreen(g.centerX, 0).y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    expect(ys[0]).toBeGreaterThan(h.orient.real.y);
    expect(ys[3]).toBeLessThan(h.orient.real.y + h.orient.real.height);
    // The vertical chart is untouched.
    expect(v.orient.horizontal).toBe(false);
    expect(v.orient.matrix).toBeNull();
  });
  it('turns every shape by one matrix that keeps lengths', () => {
    const { p, table } = setup();
    const h = buildChartModel(flip(p), table);
    const m = /matrix\(([-\d. ]+)\)/.exec(h.orient.matrix!)![1].split(' ').map(Number);
    expect(m.slice(0, 4)).toEqual([0, 1, -1, 0]);
    // A point of the virtual drawing and the same point turned by the matrix agree.
    const a = h.orient.toScreen(120, 45);
    expect(a.x).toBeCloseTo(m[0] * 120 + m[2] * 45 + m[4], 1);
    expect(a.y).toBeCloseTo(m[1] * 120 + m[3] * 45 + m[5], 1);
  });
  it('are drawn with the numbers along the bottom and the data set names on the left', () => {
    const { p, table } = setup();
    const svg = chartToSvgString(flip(p), table);
    expect(svg).toContain('transform="matrix(0 1 -1 0');
    expect(svg).not.toContain('NaN');
    for (const name of ['Group A', 'Group B', 'Group C', 'Group D']) expect(svg).toContain(`>${name}</text>`);
    expect(svg).toMatch(/text-anchor="end"[^>]*>Group A</);
  });
  it('make room on the left for the longest name', () => {
    const { p, table } = setup();
    table.groups[0].name = 'A very long data set name indeed';
    const v = buildChartModel(p.charts[0], table).layout.plot;
    const h = buildChartModel(flip(p), table).layout.plot;
    expect(h.x).toBeGreaterThan(v.x + 40);
  });
  it('use the value axis settings for the numbers: scale, range, format, reverse', () => {
    const { p, table } = setup();
    const flipped: Project = { ...p, charts: [flip(p)] };
    const id = flipped.charts[0].id;
    const logged = patchAxis(id, 'yAxis', { scale: 'log10', prefix: '$' })(flipped).charts[0];
    expect(buildChartModel(logged, table).y.log).toBe(10);
    expect(chartToSvgString(logged, table)).toContain('>$10<');
    const reversed = patchAxis(id, 'yAxis', { reverse: true })(flipped).charts[0];
    const r = buildChartModel(reversed, table);
    expect(r.orient.toScreen(0, r.yScale(r.y.domain[0])).x).toBeCloseTo(r.orient.real.x + r.orient.real.width, 6);
  });
  it('have no right axis, and say that point labels are not available yet', () => {
    const { p, table } = setup();
    let c = flip(p);
    c = { ...c, layers: [{ ...c.layers[0], groupOverrides: { [table.groups[0].id]: { axisBinding: 'secondary' } } }] };
    expect(buildChartModel(c, table).y2).toBeNull();
    const labelled = { ...c, layers: [{ ...c.layers[0], style: { ...c.layers[0].style, showPointLabels: true } }] };
    expect(buildChartModel(labelled, table).warnings.join(' ')).toMatch(/Point labels are not available on horizontal charts/);
  });
  it('put the label of a bar beside its end', () => {
    const { p, table } = setup();
    const c = patchBarLabels(p.charts[0].id, { show: 'value', decimals: 1 })({ ...p, charts: [flip(p)] }).charts[0];
    const svg = chartToSvgString(c, table);
    expect(svg).toMatch(/text-anchor="start"[^>]*>1\.2</);
    const m = buildChartModel(c, table);
    const g = m.groups[0];
    const end = m.orient.toScreen(g.centerX, m.yScale(g.centreValue!)).x;
    const dots = Math.max(...g.points.map((q) => m.orient.toScreen(q.cx, q.cy).x));
    const at = m.orient.toScreen(g.barLabel!.x, g.barLabel!.y).x;
    // Beyond the end of the bar and of the dots over it, 3 pt clear.
    expect(at).toBeGreaterThan(end);
    expect(at - Math.max(end, dots + 1)).toBeGreaterThanOrEqual(2);
  });
  it('work for box plots and violins too', () => {
    for (const type of ['box', 'violin'] as const) {
      const { p, table } = setup(type);
      const c = patchDistribution(p.charts[0].id, { points: 'all' })({ ...p, charts: [flip(p)] }).charts[0];
      const m = buildChartModel(c, table);
      expect(m.groups[0].dist).not.toBeNull();
      expect(chartToSvgString(c, table)).not.toContain('NaN');
    }
  });
  it('are chosen when a graph is made, kept in a file, and ignored by chart types that cannot turn', () => {
    const { p } = setup();
    const next = addChart('c2', p.dataTables[0].id, undefined, 'violin', { orientation: 'horizontal' })(p);
    expect(next.charts[1].orientation).toBe('horizontal');
    expect(addChart('c3', p.dataTables[0].id, undefined, 'bar')(p).charts[1].orientation).toBe('vertical');
    const back = parseProject(stringifyProject(next));
    expect(back.charts[1].orientation).toBe('horizontal');
    const text = JSON.parse(stringifyProject(next));
    text.project.charts[1].orientation = 'diagonal';
    expect(parseProject(JSON.stringify(text)).charts[1].orientation).toBe('vertical');
    delete text.project.charts[1].orientation;
    expect(parseProject(JSON.stringify(text)).charts[1].orientation).toBe('vertical');
  });
});
