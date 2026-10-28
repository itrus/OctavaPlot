import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { chartTypesFor } from '../../model/graph/chartTypes';
import { seriesWidth, subLabels, xySeries } from '../../model/table/tableLayout';
import type { Project } from '../../model/types';
import { addChart, addDataTable, patchAxis, replaceTableData } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildXyModel } from './xyModel';

const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const model = (p: Project) => buildXyModel(chartOf(p), tableOf(p));

/** A vector chart of a table of the layout "Y, dX and dY": `rows` are [X, Y, dX, dY]. */
const setup = (rows: Array<Array<number | null>>): Project => {
  let p = addDataTable('t', 'xy', { sample: true, layout: { kind: 'vector' } })(createExampleProject());
  p = replaceTableData('t', { names: ['X', 'Y', 'dX', 'dY'], titles: null, values: rows })(p);
  return addChart('c', 't', undefined, 'xyVector')(p);
};
/** The subpaths of the line of the first series, each as its list of [x, y]. */
const runs = (p: Project): number[][][] =>
  model(p).series[0].linePath.split(/(?=M)/).filter(Boolean).map((run) => [...run.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]));
/** Arrow k is two subpaths: the shaft (two vertices) then the head (wing, tip, wing). */
const arrow = (p: Project, k = 0) => {
  const r = runs(p);
  return { shaft: r[2 * k], head: r[2 * k + 1] };
};

describe('vectors: the table', () => {
  it('has a Y, a dX and a dY for each series', () => {
    expect(seriesWidth({ kind: 'vector' })).toBe(3);
    expect(subLabels({ kind: 'vector' })).toEqual(['Y', 'dX', 'dY']);
    const t = tableOf(addDataTable('t', 'xy', { sample: true, layout: { kind: 'vector' } })(createExampleProject()));
    expect(xySeries(t)[0].columns).toHaveLength(3);
    // The sample has a step in each of the two columns, so the sample table draws arrows.
    expect(xySeries(t)[0].columns[1].observations.some((o) => o.value !== null && o.value !== 0)).toBe(true);
    expect(xySeries(t)[0].columns[2].observations.some((o) => o.value !== null && o.value !== 0)).toBe(true);
  });
  it('survives save and reopen as a vector table', () => {
    expect(tableOf(parseProject(stringifyProject(setup([[1, 2, 1, 1]])))).layout).toEqual({ kind: 'vector' });
  });
});

describe('vectors: the chart', () => {
  it('draws an arrow from (X, Y) to (X + dX, Y + dY)', () => {
    const p = setup([[1, 2, 3, 4], [5, 1, -2, 1]]);
    const m = model(p);
    const a = arrow(p, 0);
    expect(a.shaft).toHaveLength(2);
    expect(a.shaft[0][0]).toBeCloseTo(m.xScale(1), 1);
    expect(a.shaft[0][1]).toBeCloseTo(m.yScale(2), 1);
    expect(a.shaft[1][0]).toBeCloseTo(m.xScale(4), 1);
    expect(a.shaft[1][1]).toBeCloseTo(m.yScale(6), 1);
    const b = arrow(p, 1);
    expect(b.shaft[1][0]).toBeCloseTo(m.xScale(3), 1);
    expect(b.shaft[1][1]).toBeCloseTo(m.yScale(2), 1);
    expect(runs(p)).toHaveLength(4);
  });
  it('is an arrow from the origin when X and Y are 0', () => {
    const p = setup([[0, 0, 2, 3]]);
    const m = model(p);
    const a = arrow(p);
    expect(a.shaft[0][0]).toBeCloseTo(m.xScale(0), 1);
    expect(a.shaft[0][1]).toBeCloseTo(m.yScale(0), 1);
  });
  it('puts an open head on the end of the shaft: two strokes of one length, either side of the shaft', () => {
    const p = setup([[1, 1, 4, 3]]);
    const { shaft, head } = arrow(p);
    expect(head).toHaveLength(3);
    const [w1, tip, w2] = head;
    expect(tip[0]).toBeCloseTo(shaft[1][0], 1);
    expect(tip[1]).toBeCloseTo(shaft[1][1], 1);
    const length1 = Math.hypot(w1[0] - tip[0], w1[1] - tip[1]);
    const length2 = Math.hypot(w2[0] - tip[0], w2[1] - tip[1]);
    expect(length1).toBeCloseTo(length2, 1);
    // The default line is thinner than 1.25 pt, so the head is the 5 pt minimum.
    expect(length1).toBeGreaterThan(4.9);
    // The wings are on opposite sides of the shaft: the middle of the wings lies back along it.
    const [mx, my] = [(w1[0] + w2[0]) / 2, (w1[1] + w2[1]) / 2];
    const [ux, uy] = [shaft[1][0] - shaft[0][0], shaft[1][1] - shaft[0][1]];
    const cross = (a: number[], b: number[]) => a[0] * b[1] - a[1] * b[0];
    expect(Math.sign(cross([ux, uy], [w1[0] - tip[0], w1[1] - tip[1]]))).toBe(-Math.sign(cross([ux, uy], [w2[0] - tip[0], w2[1] - tip[1]])));
    expect((mx - tip[0]) * ux + (my - tip[1]) * uy).toBeLessThan(0);
  });
  it('keeps the head to half of a short shaft', () => {
    const p = setup([[1, 1, 0.01, 0.01], [3, 3, 3, 3]]);
    const short = arrow(p, 0);
    const shaftLength = Math.hypot(short.shaft[1][0] - short.shaft[0][0], short.shaft[1][1] - short.shaft[0][1]);
    const wing = Math.hypot(short.head[0][0] - short.head[1][0], short.head[0][1] - short.head[1][1]);
    expect(wing).toBeLessThanOrEqual(shaftLength * 0.5 + 0.02);
  });
  it('holds the ends of the arrows in the axes, not only their starts', () => {
    const m = model(setup([[1, 1, 9, 7], [2, 2, 1, 1]]));
    expect(m.x.domain[1]).toBeGreaterThanOrEqual(10);
    expect(m.y.domain[1]).toBeGreaterThanOrEqual(8);
  });
  it('does not draw an arrow with a step missing or with no length, and says how many', () => {
    const p = setup([[1, 1, 2, 2], [2, 2, null, 1], [3, 3, 1, null], [4, 4, 0, 0]]);
    expect(runs(p)).toHaveLength(2);
    const w = model(p).warnings.join(' ');
    expect(w).toMatch(/2 vectors lack dX or dY and are not drawn/);
    expect(w).toMatch(/1 vector has no length \(dX and dY are 0\) and is not drawn/);
  });
  it('does not draw an arrow that ends where a log axis has no place, and says so', () => {
    const p = patchAxis('c', 'yAxis', { scale: 'log10' })(setup([[1, 1, 1, 1], [2, 1, 1, -5]]));
    expect(runs(p)).toHaveLength(2);
    expect(model(p).warnings.join(' ')).toMatch(/1 vector ends where the axis has no place/);
  });
  it('on a table without dX and dY draws nothing and says what to do', () => {
    let p = addChart('c', 't', undefined, 'xyVector')(addDataTable('t', 'xy', { sample: true })(createExampleProject()));
    p = replaceTableData('t', { names: ['X', 'Y'], titles: null, values: [[1, 2], [2, 3]] })(p);
    expect(model(p).series[0].linePath).toBe('');
    expect(model(p).warnings.join(' ')).toMatch(/make the data table with the layout "Y, dX and dY"/);
  });
  it('draws without a number that is not a number, and is offered for XY tables and in the gallery', () => {
    const p = setup([[1, 2, 3, 4], [5, 1, -2, 1]]);
    expect(chartToSvgString(chartOf(p), tableOf(p))).not.toContain('NaN');
    expect(chartTypesFor('xy').map((c) => c.type)).toContain('xyVector');
    expect(galleryItems('xy').find((i) => i.id === 'xy.vector')?.type).toBe('xyVector');
    expect(chartOf(parseProject(stringifyProject(p))).type).toBe('xyVector');
  });
});
