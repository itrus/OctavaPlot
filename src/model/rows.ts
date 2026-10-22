import { newId } from './ids';
import type { DataRow, DataTable } from './types';

/** Longest stored row title, in code points (P). */
export const MAX_ROW_TITLE_CHARS = 200;

/** Fresh rows with empty titles. */
export const createRows = (count: number): DataRow[] =>
  Array.from({ length: count }, () => ({ id: newId('row'), title: '' }));

/**
 * Single-line, printable row title: line breaks and tabs become one space, other
 * control characters and non-characters are removed, unpaired surrogates become
 * U+FFFD, spaces are collapsed and trimmed, and the result is cut to
 * MAX_ROW_TITLE_CHARS code points. Idempotent.
 */
export function sanitizeRowTitle(raw: string): string {
  const s = String(raw)
    .replace(/[\t\r\n\u0085\u2028\u2029]+/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF]/g, '');
  let out = '';
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const d = i + 1 < s.length ? s.charCodeAt(i + 1) : 0;
      if (d >= 0xdc00 && d <= 0xdfff) {
        out += s[i] + s[i + 1];
        i++;
      } else out += '\uFFFD';
    } else if (c >= 0xdc00 && c <= 0xdfff) out += '\uFFFD';
    else out += s[i];
  }
  const text = out.replace(/ +/g, ' ').replace(/^ | $/g, '');
  const chars = Array.from(text);
  if (chars.length <= MAX_ROW_TITLE_CHARS) return text;
  return chars.slice(0, MAX_ROW_TITLE_CHARS).join('').replace(/ +$/, '');
}

/**
 * Reorder rows: new row i is old row order[i], for the titles and for every
 * group's observations. Throws RangeError unless order is a permutation of
 * 0..rowCount-1; the identity returns the same table.
 */
export function permuteRows(table: DataTable, order: readonly number[]): DataTable {
  const n = table.rowCount;
  const seen = new Array<boolean>(n).fill(false);
  if (order.length !== n) throw new RangeError('order must list every row exactly once');
  for (const k of order) {
    if (!Number.isInteger(k) || k < 0 || k >= n || seen[k]) throw new RangeError('order must be a permutation of the row indices');
    seen[k] = true;
  }
  if (order.every((k, i) => k === i)) return table;
  return {
    ...table,
    rows: order.map((k) => table.rows[k]),
    groups: table.groups.map((g) => ({ ...g, observations: order.map((k) => g.observations[k]) })),
  };
}

/** The title of row i; '' when the row does not exist. */
export const rowTitleAt = (table: DataTable, i: number): string => table.rows[i]?.title ?? '';

/** Throws when rows and observations are not aligned or row IDs are empty or duplicated. */
export function assertTableInvariants(table: DataTable): void {
  if (table.rows.length !== table.rowCount) throw new Error(`Table ${table.id}: rows must have ${table.rowCount} entries.`);
  const ids = new Set<string>();
  for (const r of table.rows) {
    if (!r.id || ids.has(r.id)) throw new Error(`Table ${table.id}: row IDs must be non-empty and unique.`);
    ids.add(r.id);
  }
  for (const g of table.groups) {
    if (g.observations.length !== table.rowCount) throw new Error(`Table ${table.id}: group ${g.id} must have ${table.rowCount} observations.`);
  }
}
