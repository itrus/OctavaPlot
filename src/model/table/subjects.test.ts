import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../defaults';
import { addDataTable, deleteRows, duplicateRows, replaceTableData, setExcluded, setSubject } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import type { Project } from '../types';
import { equalUnitMean, hasSubjects, subjectTrajectories, subjectUnits, unitMeans } from './subjects';

const table = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
/** A column table with the given columns (A, B ...) of values; no subjects yet. */
const withColumns = (...columns: Array<Array<number | null>>): Project => {
  const rows = Math.max(...columns.map((c) => c.length));
  const values = Array.from({ length: rows }, (_, r) => columns.map((c) => c[r] ?? null));
  return replaceTableData('t', { names: columns.map((_, i) => 'ABCD'[i]), titles: null, values })(addDataTable('t', 'column', { sample: true })(createExampleProject()));
};
const name = (col: number, subjects: string[]) => (p: Project) => subjects.reduce((q, s, row) => (s === '' ? q : setSubject('t', [{ col, row }], s)(q)), p);
const subjectsOf = (p: Project, col: number, n: number) => table(p).groups[col].observations.slice(0, n).map((o) => o.subject);

describe('observation roles: subject', () => {
  it('equal-unit mean: unit A [0,0,0] and unit B [10] give 5, not the pooled 2.5 (contract fixture)', () => {
    const g = table(name(0, ['A', 'A', 'A', 'B'])(withColumns([0, 0, 0, 10]))).groups[0];
    expect(equalUnitMean(g)).toBe(5);
    expect(unitMeans(g)).toEqual([{ subject: 'A', mean: 0, n: 3 }, { subject: 'B', mean: 10, n: 1 }]);
  });
  it('leaves out missing and excluded values, and counts values with no subject instead of dropping them silently', () => {
    let p = name(0, ['A', 'A', 'A', 'B', ''])(withColumns([1, 2, 3, null, 9]));
    p = setExcluded('t', [{ col: 0, row: 2 }], true)(p);
    const r = subjectUnits(table(p).groups[0]);
    expect(r.units).toEqual([{ subject: 'A', rows: [0, 1], values: [1, 2] }]);
    expect(r.unassigned).toBe(1);
    expect(equalUnitMean({ ...table(p).groups[0], observations: [] })).toBeNull();
  });
  it('is a label: setting it changes no value, and setting the same text again returns the same project', () => {
    const p = name(0, ['A', 'A'])(withColumns([4, 5]));
    expect(table(p).groups[0].observations.map((o) => o.value)).toEqual([4, 5]);
    expect(setSubject('t', [{ col: 0, row: 0 }], 'A')(p)).toBe(p);
    expect(setSubject('t', [{ col: 0, row: 0 }], '  A ')(p)).toBe(p);
  });
  it('can be set on an empty cell and cleared with an empty text', () => {
    let p = setSubject('t', [{ col: 0, row: 0 }], 'M1')(withColumns([null]));
    expect(table(p).groups[0].observations[0].subject).toBe('M1');
    expect(hasSubjects(table(p))).toBe(true);
    p = setSubject('t', [{ col: 0, row: 0 }], '')(p);
    expect('subject' in table(p).groups[0].observations[0]).toBe(false);
    expect(hasSubjects(table(p))).toBe(false);
  });
  it('ignores cells outside the table and columns that do not exist', () => {
    const p = withColumns([1]);
    expect(setSubject('t', [{ col: 99, row: 0 }, { col: 0, row: -1 }, { col: 0, row: 9999 }], 'A')(p)).toBe(p);
  });
  it('survives save and reopen, and a file without subjects opens as before', () => {
    const p = name(0, ['A', 'B'])(withColumns([1, 2]));
    expect(subjectsOf(parseProject(stringifyProject(p)), 0, 2)).toEqual(['A', 'B']);
    expect(hasSubjects(table(parseProject(stringifyProject(withColumns([1, 2])))))).toBe(false);
  });
  it('stays with its row when rows are duplicated or deleted', () => {
    let p = name(0, ['A', 'B'])(withColumns([1, 2]));
    p = duplicateRows('t', [0])(p);
    expect(subjectsOf(p, 0, 3)).toEqual(['A', 'A', 'B']);
    p = deleteRows('t', [0])(p);
    expect(subjectsOf(p, 0, 2)).toEqual(['A', 'B']);
  });
  it('lines for repeated measures: a subject in two columns, repeats averaged, a subject in one column only left out', () => {
    let p = name(0, ['A', 'A', 'B'])(withColumns([1, 3, 10], [6, 7]));
    p = name(1, ['A', 'C'])(p);
    expect(subjectTrajectories(table(p))).toEqual([{ subject: 'A', values: [2, 6] }]);
  });
  it('an excluded value takes no part in a line', () => {
    let p = name(1, ['A'])(name(0, ['A'])(withColumns([1], [6])));
    p = setExcluded('t', [{ col: 1, row: 0 }], true)(p);
    expect(subjectTrajectories(table(p))).toEqual([]);
  });
});
