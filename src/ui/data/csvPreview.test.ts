import { describe, expect, it } from 'vitest';
import type { DecimalSeparator } from '../../model/types';
import { detectDelimiter, importCsv, isCsvFile, parseCsv, previewCsv, type CsvDelimiter, type FirstColumn } from './csv';

describe('delimiter detection and the tab delimiter', () => {
  it('picks the delimiter that is most frequent in the header line, outside quotes', () => {
    expect(detectDelimiter('A,B,C\n1,2,3')).toBe(',');
    expect(detectDelimiter('A;B;C\n1,5;2;3')).toBe(';');
    expect(detectDelimiter('A\tB\tC\n1,5\t2\t3')).toBe('\t');
    expect(detectDelimiter('"a;b;c",d\n1,2')).toBe(',');
    expect(detectDelimiter('﻿A;B\n1;2')).toBe(';');
  });
  it('falls back to the default when the header has none, or ties with it', () => {
    expect(detectDelimiter('Only\n1', ';')).toBe(';');
    expect(detectDelimiter('A,B;C', ';')).toBe(';');
    expect(detectDelimiter('A,B;C')).toBe(',');
  });
  it('parseCsv and importCsv read tabs, a quoted tab stays in the field', () => {
    expect(parseCsv('a\t"b\tc"\n1\t2', '\t')).toEqual([['a', 'b\tc'], ['1', '2']]);
    expect(importCsv('Row title\tA\tB\nx\t1.5\t2\n', 'point', '\t')).toEqual({ ok: true, data: { names: ['A', 'B'], titles: ['x'], values: [[1.5, 2]] } });
  });
  it('importCsv without a delimiter keeps the old pairing of delimiter and separator', () => {
    expect(importCsv('A;B\n1,5;2\n', 'comma').ok).toBe(true);
    expect(importCsv('A\tB\n1\t2\n', 'point').ok).toBe(false);
  });
  it('the first column can be forced to titles or to values', () => {
    expect(importCsv('Name,A\nx,1\n', 'point', ',', 'titles')).toEqual({ ok: true, data: { names: ['A'], titles: ['x'], values: [[1]] } });
    expect(importCsv('Row title,A\nx,1\n', 'point', ',', 'values').ok).toBe(false);
  });
  it('accepts .tsv files', () => {
    expect(isCsvFile({ name: 'data.TSV', type: '' })).toBe(true);
  });
});

describe('previewCsv', () => {
  const opts = (delimiter: CsvDelimiter, separator: DecimalSeparator, firstColumn: FirstColumn = 'auto') => ({ delimiter, separator, firstColumn });
  const must = (p: ReturnType<typeof previewCsv>) => {
    if (!p.ok) throw new Error(p.message);
    return p;
  };

  it('previews a point file: original text beside the parsed number, counts, no problems', () => {
    const p = must(previewCsv('Row title,A,B\nx,1.5,2\ny,,-3e2\n', opts(',', 'point')));
    expect(p.hasTitles).toBe(true);
    expect([p.rowCount, p.columnCount, p.hiddenColumns]).toEqual([2, 2, 0]);
    expect(p.rows[0]).toEqual({ line: 2, title: 'x', cells: [{ text: '1.5', value: 1.5, problem: null }, { text: '2', value: 2, problem: null }] });
    expect(p.rows[1].cells[0]).toEqual({ text: '', value: null, problem: null });
    expect(p.rows[1].cells[1].value).toBe(-300);
    expect(p.problems).toEqual([]);
    expect(p.data).toEqual({ names: ['A', 'B'], titles: ['x', 'y'], values: [[1.5, 2], [null, -300]] });
  });
  it('previews a comma file (semicolons) and a tab file', () => {
    const c = must(previewCsv('A;B\n1,5;2,25\n', opts(';', 'comma')));
    expect(c.rows[0].cells.map((x) => [x.text, x.value])).toEqual([['1,5', 1.5], ['2,25', 2.25]]);
    expect(c.data?.titles).toBeNull();
    const t = must(previewCsv('A\tB\n1,5\t2\n', opts('\t', 'comma')));
    expect(t.rows[0].cells.map((x) => [x.text, x.value])).toEqual([['1,5', 1.5], ['2', 2]]);
  });
  it('flags an ambiguous 1,234 under Automatic, with line, column and original text', () => {
    const p = must(previewCsv('Row title\tA\tB\nx\t1\t2\ny\t3\t1,234\n', opts('\t', 'auto')));
    expect(p.problems).toHaveLength(1);
    expect(p.problems[0]).toMatchObject({ line: 3, column: 3, label: '"B"', text: '1,234' });
    expect(p.problems[0].message).toContain('ambiguous');
    expect(p.rows[1].cells[1]).toMatchObject({ text: '1,234', value: null, problem: expect.stringContaining('ambiguous') });
    expect(p.data).toBeNull();
    // Choosing the separator resolves it: a comma separator reads it as 1.234, a point separator refuses it.
    expect(must(previewCsv('A\n1,234\n', opts('\t', 'comma'))).data?.values).toEqual([[1.234]]);
    expect(must(previewCsv('A\n1,234\n', opts('\t', 'point'))).problems).toHaveLength(1);
  });
  it('lists every problem cell, not only the first', () => {
    const p = must(previewCsv('A,B\n1,x\noops,2\n3,4\n', opts(',', 'point')));
    expect(p.problems.map((q) => [q.line, q.column, q.text])).toEqual([[2, 2, 'x'], [3, 1, 'oops']]);
    expect(importCsv('A,B\n1,x\noops,2\n', 'point')).toEqual({ ok: false, message: expect.stringContaining('Line 2, "B"') });
  });
  it('shows at most 20 rows and 8 columns but counts them all', () => {
    const header = Array.from({ length: 10 }, (_, i) => `C${i}`).join(',');
    const lines = Array.from({ length: 30 }, (_, r) => Array.from({ length: 10 }, (_, c) => r * 10 + c).join(','));
    const p = must(previewCsv([header, ...lines].join('\n'), opts(',', 'point')));
    expect([p.rows.length, p.rows[0].cells.length, p.rowCount, p.columnCount, p.hiddenColumns]).toEqual([20, 8, 30, 10, 2]);
  });
  it('the first column choice decides about row titles', () => {
    const text = 'Name,A\nx,1\n';
    const values = must(previewCsv(text, opts(',', 'point')));
    expect([values.hasTitles, values.problems.length]).toEqual([false, 1]);
    const titles = must(previewCsv(text, opts(',', 'point', 'titles')));
    expect([titles.hasTitles, titles.rows[0].title, titles.problems.length]).toEqual([true, 'x', 0]);
  });
  it('reports a file that does not split with the chosen delimiter, naming the right one', () => {
    expect(previewCsv('A\tB\n1\t2\n', opts(',', 'point'))).toEqual({ ok: false, message: expect.stringContaining('choose Tab') });
    expect(previewCsv('A,B\n1,2,3\n', opts(',', 'point'))).toEqual({ ok: false, message: expect.stringContaining('Line 2') });
    expect(previewCsv('only', opts(',', 'point')).ok).toBe(false);
  });
  it('imports exactly the numbers written in the file, in each setting', () => {
    const cases: Array<[CsvDelimiter, DecimalSeparator, string, number]> = [
      [',', 'point', '1.234', 1.234],
      [';', 'comma', '1,234', 1.234],
      ['\t', 'auto', '12,5', 12.5],
      ['\t', 'auto', '0.1', 0.1],
      [',', 'point', '1e-7', 1e-7],
      [';', 'comma', '-12345,678', -12345.678],
    ];
    for (const [d, s, cell, expected] of cases) {
      const p = must(previewCsv(`A${d}B\n${cell}${d}${cell}\n`, opts(d, s)));
      expect(p.data?.values[0]).toEqual([expected, expected]);
    }
  });
});
