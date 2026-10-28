import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { xySeries } from '../../model/table/tableLayout';
import type { DataTable, Project } from '../../model/types';
import { addDataTable, replaceTableData, setExcluded, setFactor, setSubject } from '../../state/commands';
import { importCsv, previewCsv, tableToCsv } from './csv';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
/** A column table of Group A = 1, 2, 3 and Group B = 4, 5, 6 (empty names of subjects). */
const column = (): Project =>
  replaceTableData('t', { names: ['Group A', 'Group B'], titles: null, values: [[1, 4], [2, 5], [3, 6]] })(addDataTable('t', 'column', { sample: true })(createExampleProject()));
const named = (p: Project, col: number, subjects: string[]) => subjects.reduce((q, s, row) => (s === '' ? q : setSubject('t', [{ col, row }], s)(q)), p);
/** Export a table and read it back as the file would be imported. */
const roundTrip = (t: DataTable, p: Project, mode: Parameters<typeof tableToCsv>[2] = 'entered') => {
  const read = importCsv(tableToCsv(t, 'point', mode), 'point');
  if (!read.ok) throw new Error(read.message);
  return { data: read.data, back: tableOf(replaceTableData('t', read.data)(p)) };
};

describe('CSV: subjects', () => {
  it('writes a "<Group> subject" column after a column whose values name subjects, and none for a table without', () => {
    const p = named(column(), 0, ['M1', 'M1', 'M2']);
    const [header, ...lines] = tableToCsv(tableOf(p), 'point').trim().split('\r\n');
    expect(header).toBe('Row title,Group A,Group A subject,Group B');
    expect(lines).toEqual([',1,M1,4', ',2,M1,5', ',3,M2,6']);
    expect(tableToCsv(tableOf(column()), 'point')).not.toContain('subject');
  });
  it('reads the subjects back, and does not take the column for data', () => {
    const p = named(column(), 0, ['M1', 'M1', 'M2']);
    const { data, back } = roundTrip(tableOf(p), column());
    expect(data.names).toEqual(['Group A', 'Group B']);
    expect(data.subjects).toEqual([['M1', ''], ['M1', ''], ['M2', '']]);
    expect(back.groups[0].observations.slice(0, 3).map((o) => o.subject)).toEqual(['M1', 'M1', 'M2']);
    expect('subject' in back.groups[1].observations[0]).toBe(false);
    expect(back.groups[0].observations.slice(0, 3).map((o) => o.value)).toEqual([1, 2, 3]);
  });
  it('is written in every mode, after the exclusion columns', () => {
    let p = named(column(), 0, ['M1', 'M1', 'M2']);
    p = setExcluded('t', [{ col: 0, row: 1 }], true, 'outlier')(p);
    expect(tableToCsv(tableOf(p), 'point', 'withExclusions').split('\r\n')[0]).toBe('Row title,Group A,Group A excluded,Group A excluded reason,Group A subject,Group B');
    expect(tableToCsv(tableOf(p), 'point', 'analysis').split('\r\n')[0]).toBe('Row title,Group A,Group A subject,Group B');
    const { back } = roundTrip(tableOf(p), column(), 'withExclusions');
    expect(back.groups[0].observations[1]).toMatchObject({ value: 2, excluded: true, excludedReason: 'outlier', subject: 'M1' });
  });
  it('keeps a subject with a comma or a quote in it, and a subject on an empty cell', () => {
    let p = named(column(), 0, ['Mouse 1, left', 'say "hi"', '']);
    p = setSubject('t', [{ col: 1, row: 0 }], 'P')(setExcluded('t', [], true)(p));
    const { back } = roundTrip(tableOf(p), column());
    expect(back.groups[0].observations.slice(0, 2).map((o) => o.subject)).toEqual(['Mouse 1, left', 'say "hi"']);
    expect(back.groups[1].observations[0].subject).toBe('P');
  });
  it('works with the decimal comma, where fields are separated by semicolons', () => {
    const p = named(column(), 1, ['A', 'B', 'C']);
    const text = tableToCsv(tableOf(p), 'comma');
    expect(text.split('\r\n')[0]).toBe('Row title;Group A;Group B;Group B subject');
    const read = importCsv(text, 'comma');
    expect(read.ok && read.data.subjects).toEqual([['', 'A'], ['', 'B'], ['', 'C']]);
  });
  it('is not counted among the columns of the preview', () => {
    const preview = previewCsv(tableToCsv(tableOf(named(column(), 0, ['M1', 'M1', 'M2'])), 'point'), { delimiter: ',', separator: 'point', firstColumn: 'auto' });
    expect(preview.ok && preview.columnCount).toBe(2);
    expect(preview.ok && preview.data?.subjects).toBeDefined();
  });
});

describe('CSV: factors', () => {
  const grouped = (): Project => {
    let p = addDataTable('t', 'grouped', { layout: { kind: 'replicates', n: 2 }, sample: true })(createExampleProject());
    const series = xySeries(tableOf(p));
    p = setFactor('t', [series[0].id], 'Wild type')(p);
    return setFactor('t', [series[1].id], 'Knock-out')(p);
  };
  it('writes a "<Group> factor" column after the first column of a series that has one, on every line', () => {
    const t = tableOf(grouped());
    const [header, first] = tableToCsv(t, 'point').split('\r\n');
    const cells = header.split(',');
    expect(cells.filter((c) => c.endsWith(' factor'))).toHaveLength(2);
    expect(first.split(',').filter((c) => c === 'Wild type' || c === 'Knock-out')).toHaveLength(2);
  });
  it('reads the factors back onto the first column of each series', () => {
    const p = grouped();
    const { data, back } = roundTrip(tableOf(p), p);
    expect(data.factors?.filter((f) => f !== '')).toEqual(['Wild type', 'Knock-out']);
    expect(xySeries(back).map((s) => s.columns[0].factor)).toEqual(['Wild type', 'Knock-out']);
    expect(back.groups.filter((g) => g.factor !== undefined)).toHaveLength(2);
  });
  it('keeps the factors a table has when the file has none, and takes the file\'s when it has some', () => {
    const p = grouped();
    const read = importCsv('Row title,Group A,Group B\r\nx,1,2\r\n', 'point');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.data.factors).toBeUndefined();
    const kept = tableOf(replaceTableData('t', { ...read.data, names: tableOf(p).groups.map((g) => g.name), values: [tableOf(p).groups.map(() => 1)] })(p));
    expect(xySeries(kept).map((s) => s.columns[0].factor)).toEqual(['Wild type', 'Knock-out']);
    const none = tableOf(replaceTableData('t', { names: tableOf(p).groups.map((g) => g.name), titles: null, values: [tableOf(p).groups.map(() => 1)], factors: tableOf(p).groups.map(() => '') })(p));
    expect(none.groups.some((g) => g.factor !== undefined)).toBe(false);
  });
});
