import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { xySeries } from '../../model/table/tableLayout';
import type { DataTable, Project } from '../../model/types';
import { addDataTable, replaceTableData, setFactor } from '../../state/commands';
import { importCsv, tableToCsv } from './csv';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
/** A column table of Group A = 1, 2, 3 and Group B = 4, 5, 6. */
const column = (): Project =>
  replaceTableData('t', { names: ['Group A', 'Group B'], titles: null, values: [[1, 4], [2, 5], [3, 6]] })(addDataTable('t', 'column', { sample: true })(createExampleProject()));
/** Export a table and read it back as the file would be imported. */
const roundTrip = (t: DataTable, p: Project, mode: Parameters<typeof tableToCsv>[2] = 'entered') => {
  const read = importCsv(tableToCsv(t, 'point', mode), 'point');
  if (!read.ok) throw new Error(read.message);
  return { data: read.data, back: tableOf(replaceTableData('t', read.data)(p)) };
};

describe('CSV: subjects of an older export', () => {
  it('reads a "<Group> subject" column as no data and leaves it out, with a note', () => {
    const read = importCsv('Row title,Group A,Group A subject,Group B\r\n,1,M1,4\r\n,2,M1,5\r\n,3,M2,6\r\n', 'point');
    expect(read.ok).toBe(true);
    if (!read.ok) return;
    expect(read.data.names).toEqual(['Group A', 'Group B']);
    expect(read.data.values).toEqual([[1, 4], [2, 5], [3, 6]]);
    expect(read.data.notes?.some((n) => n.includes('subject'))).toBe(true);
    expect(tableToCsv(tableOf(replaceTableData('t', read.data)(column())), 'point')).not.toContain('subject');
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
