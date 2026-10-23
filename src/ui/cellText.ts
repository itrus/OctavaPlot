/** Parsing and formatting of table cell text. Pure; unit-tested. */

import { rowTitleAt, sanitizeRowTitle } from '../model/rows';
import type { DataTable } from '../model/types';

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
const COMMA_DECIMAL_RE = /^[+-]?\d+,\d+$/;

type CellParse = { ok: true; value: number | null } | { ok: false; message: string };

/** Empty text = missing observation (null). Anything else must be a finite number. */
export function parseCell(text: string): CellParse {
  let t = text.trim();
  if (t === '') return { ok: true, value: null };
  if (COMMA_DECIMAL_RE.test(t)) t = t.replace(',', '.');
  if (!NUMBER_RE.test(t)) return { ok: false, message: `"${text.trim()}" is not a number` };
  const value = Number(t);
  if (!Number.isFinite(value)) return { ok: false, message: `"${text.trim()}" is not a finite number` };
  return { ok: true, value };
}

type PasteParse =
  | { ok: true; matrix: Array<Array<number | null>> }
  | { ok: false; message: string };

/** Index of the quote that closes the quoted field opening at i, or -1 (unterminated, or followed by more text). */
function closingQuote(text: string, i: number): number {
  let j = i + 1;
  while (j < text.length) {
    if (text[j] === '"') {
      if (text[j + 1] === '"') {
        j += 2;
        continue;
      }
      const next = text[j + 1];
      return next === undefined || next === '\t' || next === '\n' || next === '\r' ? j : -1;
    }
    j++;
  }
  return -1;
}

/**
 * Split tab/newline separated text into rows of fields. Quote-aware: a field that opens with a
 * quote may contain tabs and line breaks, and a doubled quote is one quote. An unterminated quote
 * is kept as literal text. One trailing line break (as Excel adds) does not start another row.
 */
export function splitTsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let i = 0;
  const n = text.length;
  for (;;) {
    const q = text[i] === '"' ? closingQuote(text, i) : -1;
    if (q >= 0) {
      row.push(text.slice(i + 1, q).replace(/""/g, '"'));
      i = q + 1;
    } else {
      let j = i;
      while (j < n && text[j] !== '\t' && text[j] !== '\n' && text[j] !== '\r') j++;
      row.push(text.slice(i, j));
      i = j;
    }
    if (i >= n) {
      rows.push(row);
      break;
    }
    const c = text[i];
    if (c === '\t') {
      i++;
      continue;
    }
    i += c === '\r' && text[i + 1] === '\n' ? 2 : 1;
    rows.push(row);
    row = [];
    if (i >= n) break;
  }
  return rows;
}

type BlockParse =
  | { ok: true; titles: string[]; matrix: Array<Array<number | null>> }
  | { ok: false; message: string };

/**
 * Parse a clipboard block. With withTitles the first field of every row is a row title (kept as
 * text, however numeric it looks) and the rest are values; titles is empty otherwise. Atomic:
 * any bad value rejects the whole block.
 */
export function parseClipboardBlock(text: string, withTitles: boolean): BlockParse {
  const titles: string[] = [];
  const matrix: Array<Array<number | null>> = [];
  const problems: string[] = [];
  splitTsv(text).forEach((fields, r) => {
    if (withTitles) titles.push(sanitizeRowTitle(fields[0]));
    const row: Array<number | null> = [];
    for (let c = withTitles ? 1 : 0; c < fields.length; c++) {
      const p = parseCell(fields[c]);
      if (p.ok) row.push(p.value);
      else {
        row.push(null);
        if (problems.length < 3) problems.push(`row ${r + 1}, column ${c + 1}: ${p.message}`);
      }
    }
    matrix.push(row);
  });
  if (problems.length > 0) {
    return { ok: false, message: `Paste rejected, non-numeric values found (${problems.join('; ')}).` };
  }
  return { ok: true, titles, matrix };
}

/** Parse tab/newline separated text (as copied from Excel). Atomic: any bad cell rejects the paste. */
export function parseClipboard(text: string): PasteParse {
  const r = parseClipboardBlock(text, false);
  return r.ok ? { ok: true, matrix: r.matrix } : r;
}

export function formatCell(value: number | null): string {
  return value === null ? '' : String(value);
}

export function matrixToText(rows: Array<Array<number | null>>): string {
  return rows.map((r) => r.map(formatCell).join('\t')).join('\n');
}

const quoteField = (s: string) => (/["\t\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Clipboard text; titles (when given) lead each row and are quoted when they need it. */
export function blockToText(titles: string[] | null, matrix: Array<Array<number | null>>): string {
  const height = Math.max(matrix.length, titles?.length ?? 0);
  const lines: string[] = [];
  for (let r = 0; r < height; r++) {
    const cells = (matrix[r] ?? []).map(formatCell);
    lines.push((titles ? [quoteField(titles[r] ?? ''), ...cells] : cells).join('\t'));
  }
  return lines.join('\n');
}

/** Inclusive cell range; c0 = -1 includes the Row title column. */
interface CellBounds {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

/** The selected cells: row titles (only when the title column is selected) and values. */
export function selectionStrings(table: DataTable, b: CellBounds): { titles: string[] | null; matrix: Array<Array<number | null>> } {
  const titles: string[] = [];
  const matrix: Array<Array<number | null>> = [];
  for (let r = b.r0; r <= b.r1; r++) {
    titles.push(rowTitleAt(table, r));
    const row: Array<number | null> = [];
    for (let c = Math.max(0, b.c0); c <= b.c1; c++) row.push(table.groups[c]?.observations[r]?.value ?? null);
    matrix.push(row);
  }
  return { titles: b.c0 < 0 ? titles : null, matrix };
}

interface PastePlan {
  row0: number;
  col0: number;
  /** Row titles for rows row0 onwards; null for a values-only paste. */
  titles: string[] | null;
  matrix: Array<Array<number | null>>;
  label: string;
  message: string;
  /** Selection to show afterwards; ac/fc are -1 for the Row title column. */
  sel: { ar: number; ac: number; fr: number; fc: number };
}

type PasteResult = ({ ok: true } & PastePlan) | { ok: false; message: string };

/**
 * Decide what a paste does. A selection in the Row title column pastes titles (the first field of
 * each row) and any further fields as values from the first group; otherwise the block is numeric.
 * One value (or title) over a larger selection fills it. A selection that spans the title column
 * and value cells is refused.
 */
export function planPaste(text: string, b: CellBounds): PasteResult {
  if (b.c0 < 0 && b.c1 >= 0) {
    return { ok: false, message: 'Paste rejected, the selection mixes the Row title column and value cells. Select one or the other.' };
  }
  const titleMode = b.c0 < 0;
  const parsed = parseClipboardBlock(text, titleMode);
  if (!parsed.ok) return parsed;
  let { titles, matrix } = parsed;
  if (titleMode) {
    if (titles.length === 1 && matrix[0].length === 0 && b.r1 > b.r0) {
      const title = titles[0];
      titles = Array.from({ length: b.r1 - b.r0 + 1 }, () => title);
      matrix = titles.map(() => []);
    }
  } else if (matrix.length === 1 && matrix[0].length === 1 && (b.r1 > b.r0 || b.c1 > b.c0)) {
    const value = matrix[0][0];
    matrix = Array.from({ length: b.r1 - b.r0 + 1 }, () => Array.from({ length: b.c1 - b.c0 + 1 }, () => value));
  }
  const h = titleMode ? titles.length : matrix.length;
  const w = Math.max(0, ...matrix.map((r) => r.length));
  const s = (n: number) => (n === 1 ? '' : 's');
  if (!titleMode) {
    return {
      ok: true,
      row0: b.r0,
      col0: b.c0,
      titles: null,
      matrix,
      label: 'Paste values',
      message: `Pasted ${h} row${s(h)} × ${w} column${s(w)}.`,
      sel: { ar: b.r0, ac: b.c0, fr: b.r0 + h - 1, fc: b.c0 + w - 1 },
    };
  }
  return {
    ok: true,
    row0: b.r0,
    col0: 0,
    titles,
    matrix,
    label: w > 0 ? 'Paste row titles and values' : 'Paste row titles',
    message: w > 0 ? `Pasted ${h} row title${s(h)} and ${w} column${s(w)} of values.` : `Pasted ${h} row title${s(h)}.`,
    sel: { ar: b.r0, ac: -1, fr: b.r0 + h - 1, fc: w > 0 ? w - 1 : -1 },
  };
}
