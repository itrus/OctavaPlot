import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { applyVariant } from '../../model/graph/chartVariant';
import type { Chart, DataTable, Project } from '../../model/types';
import { patchJitter, setExcluded } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildColumnModel } from './columnModel';

/** Column 0 holds `values`; `subjects[i]` is the subject of row i ('' = none). */
const setup = (values: Array<number | null>, subjects: string[], bySubject = true) => {
  const table: DataTable = createColumnTable('Data', false);
  table.groups[0].observations.forEach((o, r) => {
    o.value = values[r] ?? null;
    if (subjects[r]) o.subject = subjects[r];
  });
  const chart: Chart = { ...createChart(table.id, undefined, 'scatter') };
  chart.jitter = { ...chart.jitter, bySubject };
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const dots = (m: ReturnType<typeof buildColumnModel>) => m.groups[0].points.filter((q) => q.observationId !== null);
const units = (m: ReturnType<typeof buildColumnModel>) => m.groups[0].points.filter((q) => q.observationId === null);

describe('nested dots (dots grouped by subject)', () => {
  const values = [0, 0, 0, 10];
  const subjects = ['A', 'A', 'A', 'B'];

  it('takes the mean of the subjects, not of the values: A [0,0,0] and B [10] give 5, with n = 2 (contract fixture)', () => {
    const { table, chart } = setup(values, subjects);
    const m = buildColumnModel(chart, table);
    expect(m.groups[0].stats.centre).toBe(5);
    expect(m.groups[0].stats.n).toBe(2);
    const plain = setup(values, subjects, false);
    expect(buildColumnModel(plain.chart, plain.table).groups[0].stats.centre).toBe(2.5);
  });
  it('draws every value as a dot and a larger marker at the mean of each subject', () => {
    const { table, chart } = setup(values, subjects);
    const m = buildColumnModel(chart, table);
    expect(dots(m)).toHaveLength(4);
    expect(units(m).map((q) => q.value)).toEqual([0, 10]);
    expect(units(m)[0].size).toBeGreaterThan(dots(m)[0].size);
  });
  it('keeps the dots of one subject together and apart from the other subjects, inside the slot', () => {
    const { table, chart } = setup(values, subjects);
    const m = buildColumnModel(chart, table);
    const [a1, a2, a3, b] = dots(m);
    const g = m.groups[0];
    expect(Math.max(a1.cx, a2.cx, a3.cx)).toBeLessThan(b.cx);
    expect(Math.abs(units(m)[0].cx - g.centerX)).toBeGreaterThan(0);
    for (const q of [...dots(m), ...units(m)]) expect(Math.abs(q.cx - g.centerX)).toBeLessThanOrEqual(m.layout.plot.width);
    // The marker of a subject is in the middle of its cluster, not of the column.
    expect(units(m)[0].cx).toBeLessThan(g.centerX);
    expect(units(m)[1].cx).toBeGreaterThan(g.centerX);
  });
  it('leaves values with no subject in the middle and out of the mean, and says how many', () => {
    const { table, chart } = setup([1, 3, 9], ['A', 'A', '']);
    const m = buildColumnModel(chart, table);
    expect(m.groups[0].stats.centre).toBe(2);
    expect(m.groups[0].stats.n).toBe(1);
    expect(dots(m)).toHaveLength(3);
    expect(m.warnings.join(' ')).toMatch(/1 value has no subject, and is left out of the mean and the error bar/);
  });
  it('says so when no value has a subject, and then behaves as an ordinary dot plot', () => {
    const { table, chart } = setup([1, 3], ['', '']);
    const m = buildColumnModel(chart, table);
    expect(m.warnings.join(' ')).toMatch(/no value has a subject/);
    expect(m.groups[0].stats.centre).toBe(2);
    expect(units(m)).toHaveLength(0);
  });
  it('an excluded value takes no part in its subject\'s mean', () => {
    const { p, table, chart } = setup([2, 100, 10], ['A', 'A', 'B']);
    const edited = setExcluded(table.id, [{ col: 0, row: 1 }], true)(p);
    const m = buildColumnModel(chart, edited.dataTables[0]);
    // The excluded 100 is not drawn and the mean of A is 2 (not 51).
    expect(units(m).map((q) => q.value)).toEqual([2, 10]);
  });
  it('changes nothing when the option is off, and a style edit does not change the unit means', () => {
    const on = setup(values, subjects);
    const off = setup(values, subjects, false);
    expect(units(buildColumnModel(off.chart, off.table))).toHaveLength(0);
    const again = buildColumnModel({ ...on.chart, title: 'other' }, on.table);
    expect(units(again).map((q) => q.value)).toEqual([0, 10]);
  });
  it('draws without a number that is not a number, and the option is kept in the file', () => {
    const { p, chart } = setup(values, subjects);
    expect(chartToSvgString(chart, p.dataTables[0])).not.toContain('NaN');
    const back = parseProject(stringifyProject(p));
    expect(back.charts[0].jitter.bySubject).toBe(true);
    expect(back.dataTables[0].groups[0].observations[3].subject).toBe('B');
    expect(parseProject(stringifyProject(patchJitter(chart.id, { bySubject: false })(p))).charts[0].jitter.bySubject).toBe(false);
  });
  it('is offered in the gallery as the dot plot grouped by subject', () => {
    const item = galleryItems('column').find((i) => i.id === 'cat.nested');
    expect(item?.type).toBe('scatter');
    expect(applyVariant(createChart('t', { widthPx: 400, heightPx: 300 }, 'scatter'), item?.variant).jitter.bySubject).toBe(true);
    expect(createChart('t', { widthPx: 400, heightPx: 300 }, 'scatter').jitter.bySubject).toBe(false);
  });
});
