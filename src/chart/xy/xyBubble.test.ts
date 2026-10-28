import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { applyVariant } from '../../model/graph/chartVariant';
import { chartTypesFor } from '../../model/graph/chartTypes';
import { seriesWidth, subLabels, xySeries } from '../../model/table/tableLayout';
import type { Project } from '../../model/types';
import { addChart, addDataTable, replaceTableData } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildXyModel } from './xyModel';

const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const model = (p: Project) => buildXyModel(chartOf(p), tableOf(p));

/** A bubble chart of a table of the layout "Y and size": `rows` are [X, Y, size]; a second series follows when rows hold [X, Y, size, Y2, size2]. */
const setup = (rows: Array<Array<number | null>>, type: 'xyBubble' | 'xyScatter' = 'xyBubble'): Project => {
  let p = addDataTable('t', 'xy', { sample: true, layout: { kind: 'sized' } })(createExampleProject());
  const series = (rows[0].length - 1) / 2;
  const names = ['X', ...Array.from({ length: series }, (_, i) => [`Y${i}`, `Size${i}`]).flat()];
  p = replaceTableData('t', { names, titles: null, values: rows })(p);
  return addChart('c', 't', undefined, type)(p);
};
/** The diameter of each bubble of the first series, in order of row. */
const diameters = (p: Project, s = 0) => model(p).series[s].points.map((q) => q.diameterPt);

describe('bubbles: the table', () => {
  it('has a Y and a size for each series', () => {
    expect(seriesWidth({ kind: 'sized' })).toBe(2);
    expect(subLabels({ kind: 'sized' })).toEqual(['Y', 'Size']);
    const t = tableOf(addDataTable('t', 'xy', { sample: true, layout: { kind: 'sized' } })(createExampleProject()));
    expect(xySeries(t)[0].columns).toHaveLength(2);
    // The sample sizes are positive, so the sample table draws bubbles.
    expect(xySeries(t)[0].columns[1].observations.some((o) => o.value !== null && o.value > 0)).toBe(true);
  });
  it('survives save and reopen as a sized table, and a file of another layout is as before', () => {
    const back = parseProject(stringifyProject(setup([[1, 5, 10], [2, 6, 20]])));
    expect(tableOf(back).layout).toEqual({ kind: 'sized' });
    const plain = parseProject(stringifyProject(addDataTable('t', 'xy', { sample: true })(createExampleProject())));
    expect(tableOf(plain).layout).toBeUndefined();
  });
});

describe('bubbles: the chart', () => {
  it('gives the largest bubble the symbol size, and the others an area in proportion to their size', () => {
    const p = setup([[1, 5, 10], [2, 6, 40], [3, 7, 20]]);
    const size = model(p).series[0].style.symbolSizePt;
    const [a, b, c] = diameters(p) as number[];
    expect(b).toBeCloseTo(size, 9);
    // The area follows the size: a quarter of the size is half the diameter.
    expect(a).toBeCloseTo(size * 0.5, 9);
    expect((a / b) ** 2).toBeCloseTo(10 / 40, 9);
    expect((c / b) ** 2).toBeCloseTo(20 / 40, 9);
  });
  it('uses one scale for all the series of the chart', () => {
    const p = setup([[1, 5, 10, 4, 40], [2, 6, 20, 3, 5]]);
    const size = model(p).series[0].style.symbolSizePt;
    expect(Math.max(...(diameters(p, 1) as number[]))).toBeCloseTo(size, 9);
    expect((diameters(p, 0)[1] as number) ** 2 / size ** 2).toBeCloseTo(20 / 40, 9);
  });
  it('does not draw a point with no size, or a size of 0 or less, and says how many', () => {
    const p = setup([[1, 5, 10], [2, 6, null], [3, 7, 0], [4, 8, -5], [5, 9, 20]]);
    const m = model(p);
    expect(m.series[0].points.map((q) => q.x)).toEqual([1, 5]);
    expect(m.warnings.join(' ')).toMatch(/3 points have no size above 0 and are not drawn as bubbles/);
  });
  it('draws the bubbles at X and Y, where the axes put them', () => {
    const m = model(setup([[1, 5, 10], [2, 6, 40]]));
    const q = m.series[0].points[1];
    expect(q.px).toBeCloseTo(m.xScale(2), 6);
    expect(q.py).toBeCloseTo(m.yScale(6), 6);
  });
  it('on a table without a size column draws every symbol at the symbol size, and says what to do', () => {
    let p = addChart('c', 't', undefined, 'xyBubble')(addDataTable('t', 'xy', { sample: true })(createExampleProject()));
    p = replaceTableData('t', { names: ['X', 'Y'], titles: null, values: [[1, 2], [2, 3]] })(p);
    const m = model(p);
    expect(m.series[0].points.every((q) => q.diameterPt === undefined)).toBe(true);
    expect(m.warnings.join(' ')).toMatch(/make the data table with the layout "Y and size"/);
  });
  it('is the same as a scatter chart for every other chart type: the size column changes no other drawing', () => {
    const scatter = model(setup([[1, 5, 10], [2, 6, 40]], 'xyScatter'));
    expect(scatter.series[0].points.every((q) => q.diameterPt === undefined)).toBe(true);
  });
  it('is drawn with a different size for each symbol, never a number that is not a number', () => {
    const p = setup([[1, 5, 10], [2, 6, 40], [3, 7, 20]]);
    const svg = chartToSvgString(chartOf(p), tableOf(p));
    expect(svg).not.toContain('NaN');
    const before = chartToSvgString(chartOf(setup([[1, 5, 40], [2, 6, 40], [3, 7, 40]])), tableOf(setup([[1, 5, 40], [2, 6, 40], [3, 7, 40]])));
    expect(svg).not.toBe(before);
  });
  it('is offered for XY tables and in the gallery, and is kept in the file', () => {
    expect(chartTypesFor('xy').map((c) => c.type)).toContain('xyBubble');
    expect(galleryItems('xy').find((i) => i.id === 'xy.bubble')?.type).toBe('xyBubble');
    expect(chartOf(parseProject(stringifyProject(setup([[1, 5, 10]])))).type).toBe('xyBubble');
  });
});

describe('bubbles: made from the gallery', () => {
  it('start with a large largest bubble that is a little see-through, so that sizes and overlaps can be read', () => {
    const item = galleryItems('xy').find((i) => i.id === 'xy.bubble');
    const made = applyVariant(chartOf(setup([[1, 5, 10], [2, 6, 40]])), item?.variant);
    expect(made.defaults.symbolSizePt).toBe(36);
    expect(made.defaults.symbolFillOpacity).toBe(0.6);
    // Other chart types keep the usual symbol.
    expect(applyVariant(chartOf(setup([[1, 5, 10]], 'xyScatter')), item?.variant).defaults.symbolSizePt).not.toBe(36);
  });
});
