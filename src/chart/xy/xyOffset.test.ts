import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { applyVariant } from '../../model/graph/chartVariant';
import { chartTypesFor } from '../../model/graph/chartTypes';
import type { Project } from '../../model/types';
import { addChart, addDataTable, patchLook, replaceTableData, setLayerHidden } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildXyModel } from './xyModel';

const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const model = (p: Project) => buildXyModel(chartOf(p), tableOf(p));

/** Three traces with the same shape at X = 1, 2, 3: Y = 0, 4, 2 each; the chart type is offset traces. */
const setup = (type: 'xyOffset' | 'xyLine' = 'xyOffset'): Project => {
  let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
  p = replaceTableData('t', { names: ['X', 'A', 'B', 'C'], titles: null, values: [[1, 0, 0, 0], [2, 4, 4, 4], [3, 2, 2, 2]] })(p);
  return addChart('c', 't', undefined, type)(p);
};
const ys = (p: Project, s: number) => model(p).series[s].points.map((q) => q.y);

describe('offset traces', () => {
  it('lifts trace i by i steps of the automatic offset: a little more than the largest range of a trace', () => {
    const p = setup();
    // The range of a trace is 4: 4 + 10% = 4.4.
    expect(ys(p, 0)).toEqual([0, 4, 2]);
    expect(ys(p, 1)).toEqual([4.4, 8.4, 6.4]);
    expect(ys(p, 2)).toEqual([8.8, 12.8, 10.8]);
  });
  it('uses the offset the chart was given, and a negative one stacks the traces downward', () => {
    expect(ys(patchLook('c', { traceOffset: 10 })(setup()), 2)).toEqual([20, 24, 22]);
    expect(ys(patchLook('c', { traceOffset: -10 })(setup()), 1)).toEqual([-10, -6, -8]);
    expect(ys(patchLook('c', { traceOffset: 0 })(setup()), 2)).toEqual([0, 4, 2]);
  });
  it('never changes the table, and the same data on another chart type is not shifted', () => {
    const p = setup();
    const before = JSON.stringify(tableOf(p));
    model(p);
    expect(JSON.stringify(tableOf(p))).toBe(before);
    expect(ys(setup('xyLine'), 2)).toEqual([0, 4, 2]);
  });
  it('holds all the traces in the Y axis', () => {
    const m = model(patchLook('c', { traceOffset: 10 })(setup()));
    expect(m.y.domain[0]).toBeLessThanOrEqual(0);
    expect(m.y.domain[1]).toBeGreaterThanOrEqual(24);
  });
  it('tells the offset on the figure and in the warnings of the chart', () => {
    const p = patchLook('c', { traceOffset: 10 })(setup());
    const m = model(p);
    expect(m.offsetNote).toBe('Traces offset by 10');
    expect(m.warnings.join(' ')).toMatch(/Traces offset by 10: the Y axis does not show the values of the traces/);
    expect(chartToSvgString(chartOf(p), tableOf(p))).toContain('>Traces offset by 10<');
    // The other chart types say nothing of an offset.
    expect(model(setup('xyLine')).offsetNote).toBeUndefined();
    expect(chartToSvgString(chartOf(setup('xyLine')), tableOf(setup('xyLine')))).not.toContain('Traces offset');
  });
  it('writes the offset in a row of its own below the plot, where no trace can lie', () => {
    const m = model(patchLook('c', { traceOffset: 10 })(setup()));
    expect(m.layout.extraBottom).not.toBeNull();
    expect(m.layout.extraBottom!.y).toBeGreaterThanOrEqual(m.layout.plot.y + m.layout.plot.height);
    // The other chart types reserve no such row.
    expect(model(setup('xyLine')).layout.extraBottom).toBeNull();
  });
  it('is made, from the gallery, with the Y axis hidden and a scale bar in its place', () => {
    const item = galleryItems('xy').find((i) => i.id === 'xy.offset');
    expect(item?.type).toBe('xyOffset');
    const made = applyVariant(chartOf(setup()), item?.variant);
    expect([made.yAxis.visible, made.yAxis.scaleBar]).toEqual([false, true]);
    expect(model({ ...setup(), charts: [made] }).warnings.join(' ')).toMatch(/the scale bar does/);
  });
  it('keeps the offset of a trace when another is hidden: hiding moves nothing', () => {
    const p = patchLook('c', { traceOffset: 10 })(setup());
    const m = model(p);
    const hidden = setLayerHidden('c', `${m.series[1].groupId}:line`, true)(p);
    expect(model(hidden).series[2].points.map((q) => q.y)).toEqual(ys(p, 2));
    expect(model(hidden).y.domain).toEqual(m.y.domain);
  });
  it('moves the error bars with their trace, by the same amount as the mean', () => {
    let p = addDataTable('t', 'xy', { sample: true, layout: { kind: 'replicates', n: 3 } })(createExampleProject());
    p = replaceTableData('t', { names: ['X', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3'], titles: null, values: [[1, 1, 2, 3, 1, 2, 3], [2, 2, 3, 4, 2, 3, 4]] })(p);
    p = patchLook('c', { traceOffset: 10 })(addChart('c', 't', undefined, 'xyOffset')(p));
    const m = model(p);
    expect(m.series[1].points.map((q) => q.y)).toEqual([12, 13]);
    expect(m.series[0].points.map((q) => q.y)).toEqual([2, 3]);
    // The spread is the same for both traces: the same stats.
    expect(m.series[1].points[0].stats?.interval.upper).toBeCloseTo((m.series[0].points[0].stats?.interval.upper ?? 0) + 10, 9);
  });
  it('is kept in the file, a text is refused as the offset, and a chart without an offset has the automatic one', () => {
    const p = patchLook('c', { traceOffset: 2.5 })(setup());
    expect(chartOf(parseProject(stringifyProject(p))).traceOffset).toBe(2.5);
    expect(chartOf(parseProject(stringifyProject(setup()))).traceOffset).toBeNull();
    const bad = JSON.parse(stringifyProject(p));
    (bad.project ?? bad).charts.find((c: { id: string }) => c.id === 'c').traceOffset = 'x';
    expect(chartOf(parseProject(JSON.stringify(bad))).traceOffset).toBeNull();
  });
  it('draws without a number that is not a number, and is offered for XY tables', () => {
    const p = setup();
    expect(chartToSvgString(chartOf(p), tableOf(p))).not.toContain('NaN');
    expect(chartTypesFor('xy').map((c) => c.type)).toContain('xyOffset');
  });
});
