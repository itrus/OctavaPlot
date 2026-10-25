import { describe, expect, it } from 'vitest';
import { createChart, createXyTable } from '../../model/defaults';
import { layersOf } from '../../model/graph/layers';
import type { ChartType } from '../../model/types';
import { buildXyModel } from './xyModel';

const build = (type: ChartType) => {
  const table = createXyTable('XY 1', true);
  const chart = createChart(table.id, undefined, type);
  return { chart, table, model: buildXyModel(chart, table) };
};

/** The pixel positions of the points of a path "M x,y L x,y ...", ignoring Z. */
const coords = (d: string): Array<[number, number]> => [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])]);

describe('spikes', () => {
  it('draws one stem from the baseline to each point, and keeps zero on the axis', () => {
    const { model } = build('xySpikes');
    const s = model.series[0];
    const stems = coords(s.linePath);
    expect(stems).toHaveLength(2 * s.points.length);
    const base = model.yScale(0);
    s.points.forEach((p, i) => {
      expect(stems[2 * i]).toEqual([expect.closeTo(p.px, 1), expect.closeTo(base, 1)]);
      expect(stems[2 * i + 1]).toEqual([expect.closeTo(p.px, 1), expect.closeTo(p.py, 1)]);
    });
    expect(model.y.domain[0]).toBeLessThanOrEqual(0);
  });
  it('has no fill layer', () => {
    const { chart, table } = build('xySpikes');
    expect(layersOf(chart, table).some((l) => l.kind === 'area')).toBe(false);
  });
});

describe('area', () => {
  it('closes each run of the line down to the baseline, and puts the fill behind the line', () => {
    const { chart, table, model } = build('xyArea');
    const s = model.series[0];
    expect(s.areaPath).toMatch(/^M.*Z$/);
    const pts = coords(s.areaPath ?? '');
    const base = model.yScale(0);
    expect(pts[0][1]).toBeCloseTo(base, 1);
    expect(pts[pts.length - 1][1]).toBeCloseTo(base, 1);
    expect(pts).toHaveLength(s.points.length + 2);
    const kinds = layersOf(chart, table).filter((l) => l.binding?.seriesId === s.groupId).map((l) => l.kind);
    expect(kinds.indexOf('area')).toBeGreaterThanOrEqual(0);
    expect(kinds.indexOf('area')).toBeLessThan(kinds.indexOf('line'));
  });
  it('hiding the fill keeps the outline', () => {
    const { chart, table } = build('xyArea');
    const area = layersOf(chart, table).find((l) => l.kind === 'area');
    const hidden = layersOf({ ...chart, hiddenLayerIds: [area?.id ?? ''] }, table);
    expect(hidden.find((l) => l.kind === 'area')?.visible).toBe(false);
    expect(hidden.find((l) => l.kind === 'line')?.visible).toBe(true);
  });
  it('starts at the lower edge of a log axis, which has no zero', () => {
    const table = createXyTable('XY 1', true);
    const chart = { ...createChart(table.id, undefined, 'xyArea') };
    chart.yAxis = { ...chart.yAxis, scale: 'log10' };
    const model = buildXyModel(chart, table);
    const first = coords(model.series[0].areaPath ?? '')[0];
    expect(first[1]).toBeCloseTo(model.yScale(model.y.domain[0]), 1);
  });
});
