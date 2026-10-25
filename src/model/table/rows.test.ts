import { describe, expect, it } from 'vitest';
import { createExampleProject, createExampleTable, INITIAL_ROWS } from '../defaults';
import { assertTableInvariants, permuteRows } from '../../testing/tableChecks';
import { createRows, MAX_ROW_TITLE_CHARS, rowTitleAt, sanitizeRowTitle } from './rows';
import type { DataTable } from '../types';

/** Example table with titles p, q, r in rows 0..2. */
function titled(): DataTable {
  const t = createExampleTable();
  return { ...t, rows: t.rows.map((r, i) => ({ ...r, title: ['p', 'q', 'r'][i] ?? '' })) };
}

describe('sanitizeRowTitle', () => {
  const cases: Array<[string, string, string]> = [
    ['plain', 'Sample 1', 'Sample 1'],
    ['line breaks and tab', 'a\r\nb\tc', 'a b c'],
    ['NEL and separators', 'a\u0085b\u2028c\u2029d', 'a b c d'],
    ['controls removed', 'a\u0000b\u0008c\u000Bd\u000Ce\u001Ff\u007Fg', 'abcdefg'],
    ['non-characters removed', 'a\uFFFEb\uFFFFc', 'abc'],
    ['spaces collapsed and trimmed', '  a   b  ', 'a b'],
    ['unpaired high surrogate', 'a\uD800b', 'a\uFFFDb'],
    ['unpaired low surrogate', 'a\uDC00', 'a\uFFFD'],
    ['trailing high surrogate', 'a\uD83D', 'a\uFFFD'],
    ['valid pair kept', 'a\uD83D\uDE00b', 'a\uD83D\uDE00b'],
    ['only breaks', '\n\t\r', ''],
  ];
  it.each(cases)('%s', (_name, input, expected) => {
    expect(sanitizeRowTitle(input)).toBe(expected);
  });
  it('cuts to 200 code points without splitting a pair', () => {
    const long = '\uD83D\uDE00'.repeat(MAX_ROW_TITLE_CHARS + 5);
    expect(Array.from(sanitizeRowTitle(long))).toHaveLength(MAX_ROW_TITLE_CHARS);
    expect(sanitizeRowTitle('x'.repeat(300))).toHaveLength(MAX_ROW_TITLE_CHARS);
  });
  it('strips a trailing space exposed by the cut', () => {
    const s = 'x'.repeat(MAX_ROW_TITLE_CHARS - 1) + ' y';
    expect(sanitizeRowTitle(s)).toBe('x'.repeat(MAX_ROW_TITLE_CHARS - 1));
  });
  it('is idempotent', () => {
    for (const [, input] of cases) {
      const once = sanitizeRowTitle(input);
      expect(sanitizeRowTitle(once)).toBe(once);
    }
    const cut = sanitizeRowTitle('x'.repeat(MAX_ROW_TITLE_CHARS - 1) + ' y');
    expect(sanitizeRowTitle(cut)).toBe(cut);
  });
});

describe('createRows and example table', () => {
  it('creates unique rows with empty titles', () => {
    const rows = createRows(5);
    expect(rows).toHaveLength(5);
    expect(new Set(rows.map((r) => r.id)).size).toBe(5);
    expect(rows.every((r) => r.title === '')).toBe(true);
    expect(createRows(0)).toEqual([]);
  });
  it('example rows are aligned with observations', () => {
    const t = createExampleProject().dataTables[0];
    expect(t.rows).toHaveLength(INITIAL_ROWS);
    expect(() => assertTableInvariants(t)).not.toThrow();
  });
  it('rowTitleAt returns empty text outside the table', () => {
    const t = titled();
    expect(rowTitleAt(t, 1)).toBe('q');
    expect(rowTitleAt(t, -1)).toBe('');
    expect(rowTitleAt(t, 99)).toBe('');
  });
});

describe('permuteRows', () => {
  it('moves titles, observations and row ids together', () => {
    const t = titled();
    const order = Array.from({ length: t.rowCount }, (_, i) => t.rowCount - 1 - i);
    const u = permuteRows(t, order);
    expect(u.rows.map((r) => r.id)).toEqual(order.map((k) => t.rows[k].id));
    expect(u.rows[t.rowCount - 1].title).toBe('p');
    expect(u.groups[0].observations.map((o) => o.id)).toEqual(order.map((k) => t.groups[0].observations[k].id));
    expect(() => assertTableInvariants(u)).not.toThrow();
  });
  it('identity returns the same table', () => {
    const t = titled();
    expect(permuteRows(t, Array.from({ length: t.rowCount }, (_, i) => i))).toBe(t);
  });
  it('throws RangeError unless a permutation', () => {
    const t = titled();
    const id = Array.from({ length: t.rowCount }, (_, i) => i);
    expect(() => permuteRows(t, id.slice(1))).toThrow(RangeError);
    expect(() => permuteRows(t, [...id.slice(1), 0, 1])).toThrow(RangeError);
    expect(() => permuteRows(t, [0, 0, ...id.slice(2)])).toThrow(RangeError);
    expect(() => permuteRows(t, [...id.slice(0, -1), t.rowCount])).toThrow(RangeError);
    expect(() => permuteRows(t, [...id.slice(0, -1), 1.5])).toThrow(RangeError);
    expect(() => permuteRows(t, [...id.slice(0, -1), -1])).toThrow(RangeError);
  });
});

describe('assertTableInvariants', () => {
  it('rejects corruption', () => {
    const t = titled();
    expect(() => assertTableInvariants({ ...t, rows: t.rows.slice(1) })).toThrow(/rows/);
    expect(() => assertTableInvariants({ ...t, rows: [{ ...t.rows[0], id: '' }, ...t.rows.slice(1)] })).toThrow(/row IDs/);
    expect(() => assertTableInvariants({ ...t, rows: [t.rows[0], t.rows[0], ...t.rows.slice(2)] })).toThrow(/row IDs/);
    const g = { ...t.groups[0], observations: t.groups[0].observations.slice(1) };
    expect(() => assertTableInvariants({ ...t, groups: [g, ...t.groups.slice(1)] })).toThrow(/observations/);
  });
});
