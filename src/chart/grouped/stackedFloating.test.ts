import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createGroupedTable } from '../../model/defaults';
import type { DataTable } from '../../model/types';
import { patchLook } from '../../state/commands';
import { chartToSvgString } from '../export/export';
import { buildGroupedModel } from './groupedModel';
import { buildColumnModel } from '../column/columnModel';

describe('stacked bars of a grouped table', () => {
  // Male: 4.2 and 3.1, Female: 6.5 and 5.2 (two series, two categories).
  const grouped = (values?: [number, number, number, number]): DataTable => {
    const t = createGroupedTable('Grouped', true);
    if (values) {
      t.groups[0].observations[0].value = values[0];
      t.groups[0].observations[1].value = values[1];
      t.groups[1].observations[0].value = values[2];
      t.groups[1].observations[1].value = values[3];
    }
    return t;
  };
  it('puts the series on top of each other, each as high as its own value', () => {
    const table = grouped();
    const chart = createChart(table.id, undefined, 'groupedStacked');
    const m = buildGroupedModel(chart, table);
    expect(m.arrangement).toBe('stacked');
    const [a, b] = m.series;
    const first = a.bars[0];
    const second = b.bars[0];
    // The second bar sits on the first: its bottom is the top of the first.
    expect(second.y + second.height).toBeCloseTo(first.y, 6);
    expect(first.x).toBeCloseTo(second.x, 6);
    // Heights follow the values.
    expect(first.height / second.height).toBeCloseTo(first.value / second.value, 6);
    expect(m.y.domain[1]).toBeGreaterThanOrEqual(first.value + second.value);
    expect(m.y.log ?? null).toBeNull();
  });
  it('draws no error bars on the parts', () => {
    const table = grouped();
    const chart = createChart(table.id, undefined, 'groupedStacked');
    const m = buildGroupedModel(chart, table);
    expect(m.series.every((s) => s.errorPath === '')).toBe(true);
  });
  it('piles positive values up from the baseline and negative ones down from it', () => {
    const table = grouped([4, 3, -2, 5]);
    const chart = createChart(table.id, undefined, 'groupedStacked');
    const m = buildGroupedModel(chart, table);
    const zero = m.yScale(0);
    const [a, b] = m.series;
    // Category 1: +4 up, then -2 down from zero (not from the top of the 4).
    expect(a.bars[0].y + a.bars[0].height).toBeCloseTo(zero, 6);
    expect(b.bars[0].y).toBeCloseTo(zero, 6);
    expect(m.y.domain[0]).toBeLessThanOrEqual(-2);
    // Category 2: +3 then +5 stacked.
    expect(b.bars[1].y + b.bars[1].height).toBeCloseTo(a.bars[1].y, 6);
    expect(chartToSvgString(chart, table)).not.toContain('NaN');
  });
  it('is offered for a grouped table only', () => {
    expect(chartToSvgString(createChart('t', undefined, 'groupedStacked'), grouped())).toContain('<svg');
  });
});

describe('floating bars', () => {
  const table = (): DataTable => {
    const t = createColumnTable('Data', false);
    t.groups[0].observations.slice(0, 5).forEach((o, i) => (o.value = [2, 3, 5, 8, 12][i]));
    t.groups[1].observations.slice(0, 3).forEach((o, i) => (o.value = [4, 6, 10][i]));
    return t;
  };
  it('run from the smallest to the largest value, with a line at the mean', () => {
    const t = table();
    const chart = createChart(t.id, undefined, 'floating');
    const m = buildColumnModel(chart, t);
    const g = m.groups[0];
    expect(g.bar!.y).toBeCloseTo(m.yScale(12), 6);
    expect(g.bar!.y + g.bar!.height).toBeCloseTo(m.yScale(2), 6);
    const line = g.dist!.lines[0];
    expect(line.d).toContain(String(Math.round(m.yScale(6) * 100) / 100));
    expect(g.errorBar).toBeNull();
  });
  it('put the line at the median when the summary says so', () => {
    const t = table();
    const chart = createChart(t.id, undefined, 'floating');
    chart.layers[0] = { ...chart.layers[0], summary: { ...chart.layers[0].summary, centre: 'median' } };
    const m = buildColumnModel(chart, t);
    expect(m.groups[0].dist!.lines[0].d).toContain(String(Math.round(m.yScale(5) * 100) / 100));
  });
  it('include the smallest and largest value in the axis, and draw no bar for an empty column', () => {
    const t = table();
    const chart = createChart(t.id, undefined, 'floating');
    const m = buildColumnModel(chart, t);
    expect(m.y.domain[1]).toBeGreaterThanOrEqual(12);
    expect(m.groups[2].dist).toBeNull();
    expect(m.groups[2].bar).toBeNull();
  });
  it('can run horizontally, with dots over them', () => {
    const t = table();
    const base = createChart(t.id, undefined, 'floating');
    const flipped = patchLook(base.id, { orientation: 'horizontal' })({ id: 'p', name: 'p', dataTables: [t], charts: [base] });
    const c = { ...flipped.charts[0], distribution: { ...flipped.charts[0].distribution, points: 'all' as const } };
    const m = buildColumnModel(c, t);
    expect(m.orient.horizontal).toBe(true);
    expect(m.groups[0].points).toHaveLength(5);
    expect(chartToSvgString(c, t)).not.toContain('NaN');
  });
});
