import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import type { DataTable } from '../../model/types';
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

describe('other delimiters', () => {
  it('names a semicolon- or tab-separated file instead of failing on its first value', () => {
    for (const [text, kind] of [['A;B\n1;2\n', 'semicolon'], ['A\tB\n1\t2\n', 'tab']] as const) {
      const r = importCsv(text);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toContain(kind);
    }
  });
  it('comma mode reads and writes semicolon-separated files, and names a comma-separated one', () => {
    expect(importCsv('A;B\n1,5;2\n3;\n', 'comma')).toEqual({ ok: true, data: { names: ['A', 'B'], titles: null, values: [[1.5, 2], [3, null]] } });
    const r = importCsv('A,B\n1,2\n', 'comma');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('comma-separated');
    expect(importCsv('A;B\n"1;5";2\n', 'comma').ok).toBe(false);
  });
  it('a title that holds the delimiter is quoted in either mode', () => {
    const t = structuredClone(createExampleProject().dataTables[0]);
    t.rows[0] = { ...t.rows[0], title: 'a;b, c' };
    for (const s of ['point', 'comma'] as const) {
      const r = importCsv(tableToCsv(t, s), s);
      expect(r.ok && r.data.titles?.[0]).toBe('a;b, c');
    }
  });
});

describe('numbers in CSV follow the decimal separator', () => {
  // A blank inside the column (blank rows at the end are not exported).
  const VALUES = [1.234, 1234, null, 0.001, -12.345, 1e-7, 1.5e-7, 123.456, 12345.678, 1e21, 0];
  const tableOf = () => {
    const t = structuredClone(createExampleProject().dataTables[0]);
    t.groups[0].observations.forEach((o, i) => (o.value = VALUES[i] ?? null));
    return t;
  };
  const stored = (t: ReturnType<typeof tableOf>) => t.groups[0].observations.slice(0, VALUES.length).map((o) => o.value);

  it('round-trips the same numbers in point, comma and automatic mode', () => {
    for (const s of ['point', 'comma', 'auto'] as const) {
      const t = tableOf();
      const r = importCsv(tableToCsv(t, s), s);
      expect(r.ok).toBe(true);
      if (r.ok) expect(r.data.values.slice(0, VALUES.length).map((row) => row[0])).toEqual(stored(t));
    }
  });
  it('writes decimal commas with semicolons, and decimal points with commas', () => {
    const t = tableOf();
    const comma = tableToCsv(t, 'comma').split('\r\n')[1];
    const point = tableToCsv(t, 'point').split('\r\n')[1];
    expect(comma).toContain(';');
    expect(comma).toContain('1,234');
    expect(comma).not.toContain('1.234');
    expect(point).toContain('1.234');
  });
  it('a file written in one mode is refused or named in the other, never misread', () => {
    const t = tableOf();
    expect(importCsv(tableToCsv(t, 'comma'), 'point').ok).toBe(false);
    expect(importCsv(tableToCsv(t, 'point'), 'comma').ok).toBe(false);
  });
});

describe('CSV export of excluded values', () => {
  const obs = (id: string, value: number | null, reason?: string) => ({ id, value, ...(reason === undefined ? {} : { excluded: true as const, ...(reason ? { excludedReason: reason } : {}) }) });
  const table = (): DataTable => ({
    id: 't',
    name: 'T',
    kind: 'column',
    rowCount: 3,
    rows: [{ id: 'r0', title: 'a' }, { id: 'r1', title: 'b' }, { id: 'r2', title: '' }],
    groups: [
      { id: 'g0', name: 'Control', title: '', paletteIndex: 0, observations: [obs('o0', 1.5), obs('o1', 99, 'pipetting, error'), obs('o2', 2)] },
      { id: 'g1', name: 'Drug', title: '', paletteIndex: 1, observations: [obs('o3', 3), obs('o4', 4), obs('o5', null)] },
    ],
  });
  const plain = (t: DataTable): DataTable => ({ ...t, groups: t.groups.map((g) => ({ ...g, observations: g.observations.map((o) => ({ id: o.id, value: o.value })) })) });

  it('writes excluded values as entered by default', () => {
    expect(tableToCsv(table())).toBe('Row title,Control,Drug\r\na,1.5,3\r\nb,99,4\r\n,2,\r\n');
    expect(tableToCsv(table(), 'auto', 'entered')).toBe(tableToCsv(table()));
  });

  it('writes excluded values as empty cells when analysis-ready', () => {
    expect(tableToCsv(table(), 'auto', 'analysis')).toBe('Row title,Control,Drug\r\na,1.5,3\r\nb,,4\r\n,2,\r\n');
  });

  it('adds two columns after each column that has an exclusion, and none to the others', () => {
    expect(tableToCsv(table(), 'auto', 'withExclusions')).toBe(
      'Row title,Control,Control excluded,Control excluded reason,Drug\r\na,1.5,,,3\r\nb,99,1,"pipetting, error",4\r\n,2,,,\r\n',
    );
  });

  it('applies the delimiter rules in every mode', () => {
    expect(tableToCsv(table(), 'comma', 'withExclusions').split('\r\n')[2]).toBe('b;99;1;pipetting, error;4');
    expect(tableToCsv(table(), 'comma', 'analysis').split('\r\n')[1]).toBe('a;1,5;3');
  });

  it('leaves a table without exclusions unchanged in all modes', () => {
    const t = plain(table());
    const same = tableToCsv(t);
    expect(tableToCsv(t, 'auto', 'analysis')).toBe(same);
    expect(tableToCsv(t, 'auto', 'withExclusions')).toBe(same);
  });

  it('reads the exclusion columns back as exclusions, not as data columns', () => {
    const r = importCsv(tableToCsv(table(), 'auto', 'withExclusions'));
    expect(r).toEqual({
      ok: true,
      data: {
        names: ['Control', 'Drug'],
        titles: ['a', 'b', ''],
        values: [[1.5, 3], [99, 4], [2, null]],
        excluded: [[null, null], [{ reason: 'pipetting, error' }, null], [null, null]],
      },
    });
  });

  it('refuses a flag that is neither 1 nor empty, naming the cell', () => {
    const r = importCsv('A,A excluded\n1,yes\n');
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('Line 2, "A excluded"');
  });

  it('keeps a column called "<name> excluded" as data when it does not follow "<name>"', () => {
    const r = importCsv('B,A excluded\n1,2\n');
    expect(r.ok && r.data.names).toEqual(['B', 'A excluded']);
  });
});

describe('the header and the size of a file', () => {
  it('ignores a byte-order mark, as Excel writes one, in the first group name', () => {
    expect(parseCsv('﻿a,b\n1,2')).toEqual([['a', 'b'], ['1', '2']]);
    const r = importCsv('﻿Control,Treated\n1,2\n3,4');
    expect(r.ok && r.data.names).toEqual(['Control', 'Treated']);
  });
  it('keeps two groups with the same name as two groups', () => {
    const r = importCsv('A,A\n1,2\n3,4');
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.data.names).toEqual(['A', 'A']);
      expect(r.data.values).toEqual([[1, 2], [3, 4]]);
    }
  });
  it('names a group with an empty header by its place', () => {
    const r = importCsv('A,,C\n1,2,3');
    expect(r.ok && r.data.names).toEqual(['A', 'Group 2', 'C']);
  });
  it('refuses a file with more data lines than a table holds, with the count', () => {
    const lines = Array.from({ length: 100001 }, (_, i) => String(i));
    const r = importCsv('A\n' + lines.join('\n'));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/at most 100,000 rows.*100,001 data lines/);
    expect(importCsv('A\n' + lines.slice(0, 100000).join('\n')).ok).toBe(true);
  });
  it('refuses NaN and Infinity as text, since a cell is a number or empty', () => {
    for (const bad of ['NaN', 'Infinity', '-Infinity', 'inf']) expect(importCsv('A\n' + bad).ok).toBe(false);
  });
});
