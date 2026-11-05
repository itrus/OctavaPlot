import { describe, expect, it } from 'vitest';
import { createXyTable } from '../../model/defaults';
import { timeColumn } from '../../util/timeColumn';
import { blockToText, formatCellFor, parseCellFor, parseClipboardBlock, planPaste } from './cellText';
import { importCsv, previewCsv, tableToCsv } from './csv';

// 2025-03-04 is day 20151, 2025-03-05 is 20152; 2025-03-04T10:30:00 is 1741084200 s (from 2025-01-01T00:00:00Z = 1735689600).
const DATE = timeColumn('date');
const DATETIME = timeColumn('datetime');
const HOURS = timeColumn('duration', 'h');
const at = (r0: number, r1: number, c0: number, c1: number) => ({ r0, r1, c0, c1 });

describe('a cell of a typed column', () => {
  it('is read as its type, and a plain column as before', () => {
    expect(parseCellFor('2025-03-04', 'auto', DATE)).toEqual({ ok: true, value: 20151 });
    expect(parseCellFor('2025-03-04', 'auto')).toMatchObject({ ok: false });
    expect(parseCellFor('', 'auto', DATE)).toEqual({ ok: true, value: null });
    expect(parseCellFor('20151', 'auto', DATE)).toMatchObject({ ok: false });
  });

  it('takes a duration as a number with the decimal separator of the setting, in the unit of the column', () => {
    expect(parseCellFor('1,5', 'comma', HOURS)).toEqual({ ok: true, value: 1.5 });
    expect(parseCellFor('1.5', 'point', HOURS)).toEqual({ ok: true, value: 1.5 });
    expect(parseCellFor('1,5', 'point', HOURS)).toMatchObject({ ok: false });
    expect(parseCellFor('1:30', 'point', HOURS)).toEqual({ ok: true, value: 1.5 });
  });

  it('is written as its type, whatever the decimal separator', () => {
    expect(formatCellFor(20151, 'comma', DATE)).toBe('2025-03-04');
    expect(formatCellFor(1.5, 'comma', HOURS)).toBe('1:30:00');
    expect(formatCellFor(1.5, 'comma')).toBe('1,5');
  });
});

describe('pasting into typed columns', () => {
  it('reads dates in the first column and numbers in the others, and reports an offset converted to UTC', () => {
    const p = planPaste('2025-03-04\t1.5\n2025-03-05\t2', at(0, 0, 0, 0), 'auto', [DATE, undefined]);
    expect(p).toMatchObject({ ok: true, matrix: [[20151, 1.5], [20152, 2]] });
    const dt = planPaste('2025-03-04T12:30:00+02:00\t1\n2025-03-04T10:31:00Z\t2', at(0, 0, 0, 0), 'auto', [DATETIME, undefined]);
    expect(dt).toMatchObject({ ok: true, matrix: [[1741084200, 1], [1741084260, 2]] });
    expect(dt.ok && dt.message).toContain('2 times had a UTC offset and were converted to UTC');
  });

  it('starts counting the columns at the selection', () => {
    const p = planPaste('2025-03-04\n2025-03-05', at(0, 0, 1, 1), 'auto', [undefined, DATE]);
    expect(p).toMatchObject({ ok: true, col0: 1, matrix: [[20151], [20152]] });
    // the same text into a plain column is refused whole
    expect(planPaste('2025-03-04', at(0, 0, 1, 1), 'auto', [DATE, undefined])).toMatchObject({ ok: false });
  });

  it('refuses the whole paste when one cell cannot be read, naming it, and when offsets are mixed with wall-clock times', () => {
    const bad = planPaste('2025-03-04\nsoon\n2025-02-30', at(0, 0, 0, 0), 'auto', [DATE]);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.message).toContain('row 2, column 1');
    expect(!bad.ok && bad.message).toContain('"soon"');
    const mixed = planPaste('2025-03-04T10:30:00\n2025-03-04T10:30:00Z', at(0, 0, 0, 0), 'auto', [DATETIME]);
    expect(mixed.ok).toBe(false);
    expect(!mixed.ok && mixed.message).toContain('a column is all wall-clock times or all times with an offset');
  });

  it('reads pasted row titles first, then the values by the types of the columns from the first', () => {
    const p = parseClipboardBlock('first\t2025-03-04\t3\nsecond\t2025-03-05\t4', true, 'auto', [DATE, undefined]);
    expect(p).toEqual({ ok: true, titles: ['first', 'second'], matrix: [[20151, 3], [20152, 4]] });
    const planned = planPaste('first\t2025-03-04\t3', at(0, 0, -1, -1), 'auto', [DATE, undefined]);
    expect(planned).toMatchObject({ ok: true, titles: ['first'], matrix: [[20151, 3]] });
  });

  it('fills a selection with one value only when its columns hold the same kind of value', () => {
    expect(planPaste('2025-03-04', at(0, 1, 0, 0), 'auto', [DATE])).toMatchObject({ ok: true, matrix: [[20151], [20151]] });
    const mixed = planPaste('1.5', at(0, 0, 0, 1), 'auto', [HOURS, undefined]);
    expect(mixed.ok).toBe(false);
    expect(!mixed.ok && mixed.message).toContain('different kinds of values');
  });

  it('copies a date as text that pastes back as the same number', () => {
    const text = blockToText(null, [[20151, 1.5], [null, 2]], 'auto', [DATE, undefined]);
    expect(text).toBe('2025-03-04\t1.5\n\t2');
    expect(planPaste(text, at(0, 0, 0, 0), 'auto', [DATE, undefined])).toMatchObject({ ok: true, matrix: [[20151, 1.5], [null, 2]] });
  });
});

describe('CSV with dates', () => {
  const csv = 'Row title,Day,Value\r\n,2025-03-04,1.5\r\n,2025-03-05,2\r\n,,3\r\n';

  it('reads a column of dates as numbers of days when told so, and keeps the type for the import', () => {
    const r = importCsv(csv, 'auto', ',', 'auto', [DATE, undefined]);
    expect(r.ok && r.data.values).toEqual([[20151, 1.5], [20152, 2], [null, 3]]);
    expect(r.ok && r.data.times).toEqual([DATE, undefined]);
  });

  it('refuses a column of dates read as numbers, naming the first cell, and suggests the type', () => {
    expect(importCsv(csv, 'auto', ',', 'auto')).toMatchObject({ ok: false });
    const preview = previewCsv(csv, { delimiter: ',', separator: 'auto', firstColumn: 'auto' });
    expect(preview.ok && preview.problems.map((p) => [p.line, p.column])).toEqual([[2, 2], [3, 2]]);
    expect(preview.ok && preview.suggestedTime).toEqual(DATE);
    expect(preview.ok && preview.data).toBeNull();
    const typed = previewCsv(csv, { delimiter: ',', separator: 'auto', firstColumn: 'auto', times: [DATE] });
    expect(typed.ok && typed.problems).toEqual([]);
    expect(typed.ok && typed.suggestedTime).toBeNull();
    expect(typed.ok && typed.data?.times).toEqual([DATE, undefined]);
  });

  it('lists every cell that is not a date, by line and column', () => {
    const p = previewCsv('Day,V\n2025-03-04,1\nsoon,2\n2025-02-30,3\n', { delimiter: ',', separator: 'auto', firstColumn: 'values', times: [DATE] });
    expect(p.ok && p.problems.map((q) => [q.line, q.column, q.text])).toEqual([[3, 1, 'soon'], [4, 1, '2025-02-30']]);
  });

  it('notes the times converted from an offset, and refuses a mixture', () => {
    const text = 'T,V\n2025-03-04T12:30:00+02:00,1\n2025-03-04T10:31:00Z,2\n';
    const p = previewCsv(text, { delimiter: ',', separator: 'auto', firstColumn: 'values', times: [DATETIME] });
    expect(p.ok && p.notes).toEqual(['2 times had a UTC offset and were converted to UTC (times are stored and shown in UTC)']);
    expect(p.ok && p.data?.values).toEqual([[1741084200, 1], [1741084260, 2]]);
    const mixed = previewCsv('T,V\n2025-03-04T10:30:00,1\n2025-03-04T10:31:00Z,2\n', { delimiter: ',', separator: 'auto', firstColumn: 'values', times: [DATETIME] });
    expect(mixed.ok && mixed.problems.map((q) => q.line)).toEqual([3]);
  });

  it('keeps an exclusion flag on a date that is read', () => {
    const text = 'Day,Day excluded,V\n2025-03-04,1,1\n2025-03-05,,2\n';
    const r = importCsv(text, 'auto', ',', 'values', [DATE]);
    expect(r.ok && r.data.excluded).toEqual([[{ reason: '' }, null], [null, null]]);
  });

  it('writes a typed column as dates, and reads that file back to the same numbers', () => {
    const table = createXyTable('T', false);
    table.groups[0].time = DATE;
    table.groups[0].observations[0].value = 20151;
    table.groups[0].observations[1].value = 20152;
    table.groups[1].observations[0].value = 1.5;
    table.groups[1].observations[1].value = 2;
    const out = tableToCsv(table);
    expect(out).toContain('2025-03-04,1.5');
    expect(out).toContain('2025-03-05,2');
    const back = importCsv(out, 'auto', ',', 'auto', [DATE, undefined, undefined]);
    expect(back.ok && back.data.values.slice(0, 2)).toEqual([[20151, 1.5, null], [20152, 2, null]]);
  });
});
