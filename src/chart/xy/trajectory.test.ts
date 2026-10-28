import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { applyVariant } from '../../model/graph/chartVariant';
import type { Project } from '../../model/types';
import { addChart, addDataTable, patchLook, replaceTableData, setSubject } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildXyModel } from './xyModel';

/** An XY chart of one series; `rows` are [X, Y, subject] ('' = no subject). */
const setup = (rows: Array<[number, number | null, string]>, connect: 'table' | 'x' | 'subject' = 'subject'): Project => {
  let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
  p = addChart('c', 't', undefined, 'xyLineSymbols')(p);
  p = replaceTableData('t', { names: ['X', 'Y'], titles: null, values: rows.map(([x, y]) => [x, y]) })(p);
  rows.forEach(([, , s], row) => {
    if (s) p = setSubject('t', [{ col: 1, row }], s)(p);
  });
  return patchLook('c', { lineConnect: connect })(p);
};
const model = (p: Project) => buildXyModel(p.charts.find((c) => c.id === 'c')!, p.dataTables.find((t) => t.id === 't')!);
/** The runs of a path of M and L commands, each as its list of [x, y]. */
const runsOf = (d: string): number[][][] =>
  d.split(/(?=M)/).filter(Boolean).map((run) => [...run.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]));

// Rows are in no order, to show that each line is joined by X and not by row.
const rows: Array<[number, number, string]> = [[2, 6, 'A'], [1, 5, 'A'], [1, 2, 'B'], [3, 7, 'A'], [2, 4, 'B']];

describe('repeated measures: one line for each subject', () => {
  it('draws one run for each subject, each from the lowest X to the highest', () => {
    const m = model(setup(rows));
    const runs = runsOf(m.series[0].linePath);
    expect(runs).toHaveLength(2);
    expect(runs.map((r) => r.length)).toEqual([3, 2]);
    for (const run of runs) for (let i = 1; i < run.length; i++) expect(run[i][0]).toBeGreaterThan(run[i - 1][0]);
    // Subject A (first to appear) goes through its three points: X = 1, 2, 3 at Y = 5, 6, 7.
    const a = runs[0];
    const at = (x: number, y: number) => [Math.round(m.xScale(x) * 100) / 100, Math.round(m.yScale(y) * 100) / 100];
    expect(a).toEqual([at(1, 5), at(2, 6), at(3, 7)]);
  });
  it('does not join the subjects to each other, and joins nothing in table order when asked for that', () => {
    const table = runsOf(model(setup(rows, 'table')).series[0].linePath);
    expect(table).toHaveLength(1);
    expect(table[0]).toHaveLength(5);
  });
  it('draws every point whichever way it is joined', () => {
    expect(model(setup(rows)).series[0].points).toHaveLength(5);
  });
  it('leaves a point with no subject unjoined, and says how many', () => {
    const m = model(setup([...rows, [4, 9, '']]));
    expect(runsOf(m.series[0].linePath)).toHaveLength(2);
    expect(m.series[0].points).toHaveLength(6);
    expect(m.warnings.join(' ')).toMatch(/1 point has no subject and is not joined by a line/);
  });
  it('says so when no value has a subject, and draws the points without lines', () => {
    const m = model(setup([[1, 1, ''], [2, 2, '']]));
    expect(m.warnings.join(' ')).toMatch(/no value has a subject/);
    expect(m.series[0].linePath).toBe('');
    expect(m.series[0].points).toHaveLength(2);
  });
  it('joins across a subject\'s missing value: its own points are the line', () => {
    const gap = setup([[1, 5, 'A'], [2, null, 'A'], [3, 5, 'A']]);
    expect(runsOf(model(gap).series[0].linePath)[0]).toHaveLength(2);
  });
  it('draws without a number that is not a number, keeps the choice in the file, and is offered in the gallery', () => {
    const p = setup(rows);
    const chartC = (q: Project) => q.charts.find((c) => c.id === 'c')!;
    expect(chartToSvgString(chartC(p), p.dataTables.find((t) => t.id === 't')!)).not.toContain('NaN');
    expect(chartC(parseProject(stringifyProject(p))).lineConnect).toBe('subject');
    const item = galleryItems('xy').find((i) => i.id === 'xy.trajectory');
    expect(item?.type).toBe('xyLineSymbols');
    expect(applyVariant(chartC(p), { ...item?.variant, lineConnect: 'table' }).lineConnect).toBe('table');
    expect(item?.variant?.lineConnect).toBe('subject');
  });
});
