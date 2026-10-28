import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { chartTypesFor } from '../../model/graph/chartTypes';
import type { Project } from '../../model/types';
import { addChart, addDataTable, patchAxis, patchBars, replaceTableData, setLayerHidden } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildXyModel } from './xyModel';

/** An XY chart of bars; `rows` are [X, Y1, Y2?] and a second series exists when any row has a Y2. */
const setup = (rows: Array<[number, number | null, number?]>): Project => {
  const two = rows.some((r) => r.length > 2);
  let p = addChart('c', 't', undefined, 'xyBars')(addDataTable('t', 'xy', { sample: true })(createExampleProject()));
  p = replaceTableData('t', { names: two ? ['X', 'A', 'B'] : ['X', 'A'], titles: null, values: rows.map((r) => (two ? [r[0], r[1], r[2] ?? null] : [r[0], r[1]])) })(p);
  return p;
};
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const model = (p: Project) => buildXyModel(chartOf(p), tableOf(p));

describe('bars at numeric X', () => {
  const rows: Array<[number, number | null]> = [[1, 5], [2, 8], [3, -3]];

  it('draws a bar at each X from the baseline 0 up (or down) to its Y, centred on its X', () => {
    const m = model(setup(rows));
    const bars = m.series[0].bars!;
    expect(bars).toHaveLength(3);
    bars.forEach((b, i) => {
      const [x, y] = rows[i];
      expect(b.x + b.width / 2).toBeCloseTo(m.xScale(x), 6);
      expect(b.y).toBeCloseTo(Math.min(m.yScale(y!), m.yScale(0)), 6);
      expect(b.height).toBeCloseTo(Math.abs(m.yScale(y!) - m.yScale(0)), 6);
      expect(b.value).toBe(y);
    });
    // The negative value hangs below the baseline.
    expect(bars[2].y).toBeCloseTo(m.yScale(0), 6);
  });
  it('fills the room of an X, which is the smallest distance between two X values, less the space between bars', () => {
    const even = model(setup(rows)).series[0].bars!;
    const uneven = model(setup([[1, 5], [2, 8], [2.5, 3]])).series[0].bars!;
    // The default space is 300/7 percent of a bar's width: the bar fills 70% of the room.
    const m = model(setup(rows));
    expect(even[0].width / (m.xScale(2) - m.xScale(1))).toBeCloseTo(0.7, 3);
    // With X values 0.5 apart the bars are half as wide in X, so as wide as before relative to a wider scale: the same share of the room.
    const mu = model(setup([[1, 5], [2, 8], [2.5, 3]]));
    expect(uneven[0].width / (mu.xScale(1.5) - mu.xScale(1))).toBeCloseTo(0.7, 3);
  });
  it('lets the space between bars be chosen, and bars touch at 0', () => {
    const p = patchBars('c', { gapPct: 0 })(setup(rows));
    const m = model(p);
    expect(m.series[0].bars![0].width).toBeCloseTo(m.xScale(2) - m.xScale(1), 6);
  });
  it('begins the bars at the baseline that was set', () => {
    const p = patchBars('c', { baseline: 2 })(setup(rows));
    const m = model(p);
    const b = m.series[0].bars![0];
    expect(b.y).toBeCloseTo(m.yScale(5), 6);
    expect(b.y + b.height).toBeCloseTo(m.yScale(2), 6);
    // The bar of Y = 8 is taller than the first from the same baseline.
    expect(m.series[0].bars![1].height).toBeGreaterThan(b.height);
  });
  it('puts several series side by side inside the room of an X, without overlap', () => {
    const m = model(setup([[1, 5, 4], [2, 8, 6], [3, 3, 7]]));
    const [a, b] = m.series.map((s) => s.bars!);
    expect(a[0].x + a[0].width).toBeLessThanOrEqual(b[0].x + 1e-9);
    expect(a[0].width).toBeCloseTo(b[0].width, 9);
    const single = model(setup([[1, 5], [2, 8], [3, 3]])).series[0].bars![0];
    expect(a[0].width).toBeLessThan(single.width);
    // Together they are centred on the X.
    expect((a[0].x + b[0].x + b[0].width) / 2).toBeCloseTo(m.xScale(1), 6);
  });
  it('holds the bars in the axes: the baseline on Y and the edges of the first and last bar on X', () => {
    const m = model(setup([[1, 5], [2, 8], [3, 4]]));
    expect(m.y.domain[0]).toBeLessThanOrEqual(0);
    expect(m.x.domain[0]).toBeLessThan(1);
    expect(m.x.domain[1]).toBeGreaterThan(3);
    const b = m.series[0].bars!;
    expect(b[0].x).toBeGreaterThanOrEqual(m.layout.plot.x - 1e-6);
    expect(b[2].x + b[2].width).toBeLessThanOrEqual(m.layout.plot.x + m.layout.plot.width + 1e-6);
  });
  it('is the bars layer: hiding it draws no bars and changes neither the axes nor the points', () => {
    const p = setup(rows);
    const id = model(p).layers!.find((l) => l.kind === 'bars')!.id;
    const hidden = setLayerHidden('c', id, true)(p);
    expect(chartToSvgString(chartOf(hidden), tableOf(hidden))).not.toBe(chartToSvgString(chartOf(p), tableOf(p)));
    expect(model(hidden).x.domain).toEqual(model(p).x.domain);
    expect(model(hidden).y.domain).toEqual(model(p).y.domain);
  });
  it('leaves a row with no Y out, says nothing about it being a bar, and never draws NaN', () => {
    const p = setup([[1, 5], [2, null], [3, 4]]);
    expect(model(p).series[0].bars).toHaveLength(2);
    expect(chartToSvgString(chartOf(p), tableOf(p))).not.toContain('NaN');
  });
  it('draws a bar over an omitted range of the X axis as one rectangle without a number that is not a number', () => {
    const p = patchAxis('c', 'xAxis', { min: 0, max: 10, breaks: [{ from: 3, to: 7 }] })(setup([[1, 5], [2, 8], [8, 4], [9, 6]]));
    expect(chartToSvgString(chartOf(p), tableOf(p))).not.toContain('NaN');
    expect(model(p).series[0].bars!.length).toBeGreaterThan(0);
  });
  it('is made as a bar chart with no line or symbol, and is kept in the file', () => {
    const p = setup(rows);
    const style = chartOf(p).layers[0].style;
    expect([style.showBars, style.showLines, style.showSymbols]).toEqual([true, false, false]);
    const back = parseProject(stringifyProject(p));
    expect(back.charts.find((c) => c.id === 'c')!.type).toBe('xyBars');
  });
  it('is offered for XY tables and in the gallery', () => {
    expect(chartTypesFor('xy').map((c) => c.type)).toContain('xyBars');
    const item = galleryItems('xy').find((i) => i.id === 'xy.bars');
    expect(item?.type).toBe('xyBars');
  });
});
