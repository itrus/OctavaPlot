import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { importCsv, isCsvFile, parseCsv, tableToCsv } from './csv';

describe('CSV', () => {
  it('parses quotes, doubled quotes, embedded commas and line breaks', () => {
    expect(parseCsv('a,"b,c","d ""e"""\r\n1,2,3\n')).toEqual([['a', 'b,c', 'd "e"'], ['1', '2', '3']]);
    expect(parseCsv('"x\ny",z')).toEqual([['x\ny', 'z']]);
  });

  it('rejects an unclosed quote', () => {
    expect(importCsv('a,b\n"1,2').ok).toBe(false);
  });

  it('round-trips a table through export and import', () => {
    const p = createExampleProject();
    const t = p.dataTables[0];
    const r = importCsv(tableToCsv(t));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.names).toEqual(t.groups.map((g) => g.name));
    // Spare empty rows are not exported, so the file holds only the rows that have data.
    expect(r.data.values.length).toBe(Math.max(...t.groups.map((g) => g.observations.findLastIndex((o) => o.value !== null) + 1)));
    expect(r.data.values[0]).toEqual(t.groups.map((g) => g.observations[0].value));
  });

  it('does not export the spare empty rows', () => {
    const t = createExampleProject().dataTables[0];
    const lines = tableToCsv(t).trimEnd().split('\r\n');
    expect(lines.length).toBeLessThan(t.rowCount + 1);
    expect(lines.every((l, i) => i === 0 || /[0-9]/.test(l))).toBe(true);
    expect(lines.length).toBe(t.groups.reduce((n, g) => Math.max(n, g.observations.findLastIndex((o) => o.value !== null) + 1), 0) + 1);
  });

  it('reads files without a row title column', () => {
    const r = importCsv('A,B\n1,2\n3,\n');
    expect(r).toEqual({ ok: true, data: { names: ['A', 'B'], titles: null, values: [[1, 2], [3, null]] } });
  });

  it('names the line and column of a bad value', () => {
    const r = importCsv('Row title,A,B\nx,1,2\ny,3,oops\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Line 3, "B"');
  });

  it('rejects files that are not CSV or have no data', () => {
    expect(isCsvFile({ name: 'data.csv', type: '' })).toBe(true);
    expect(isCsvFile({ name: 'data.xlsx', type: 'application/vnd.ms-excel' })).toBe(false);
    expect(importCsv('only a header').ok).toBe(false);
  });
});

describe('malformed quotes', () => {
  it('rejects text right after a closing quote, with its line', () => {
    expect(importCsv('a,b\r\n"1"2,3\r\n')).toEqual({ ok: false, message: expect.stringContaining('line 2') });
    expect(importCsv('a,b\r\n"1",3\r\n').ok).toBe(true);
  });
});
