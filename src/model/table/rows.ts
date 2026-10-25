import { newId } from '../ids';
import type { DataRow, DataTable } from '../types';

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

/** The title of row i; '' when the row does not exist. */
export const rowTitleAt = (table: DataTable, i: number): string => table.rows[i]?.title ?? '';
