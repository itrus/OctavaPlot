/** Parsing and formatting of table cell text. Pure; unit-tested. */

import { MAX_TABLE_ROWS, rowTitleAt, sanitizeRowTitle } from '../../model/table/rows';
import type { DataTable } from '../../model/types';
import type { DecimalSeparator } from '../../model/types';
import { formatTimeCell, parseTimeBatch, parseTimeCell, type TimeColumn } from '../../util/timeColumn';

const NUMBER_RE = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;
/** A number with a decimal comma, with or without an exponent: 1,5  -2,5e-3 */
const COMMA_DECIMAL_RE = /^[+-]?(\d+,\d*|,\d+)([eE][+-]?\d+)?$/;
/** A comma followed by exactly three digits reads as a decimal comma and as a thousands separator alike. */
const AMBIGUOUS_COMMA_RE = /^[+-]?\d{1,3},\d{3}$/;

type CellParse = { ok: true; value: number | null; offset?: boolean } | { ok: false; message: string };

/**
 * Empty text = missing observation (null). Anything else must be a finite number. There are no thousands separators:
 * a point is the decimal separator unless the setting is comma, and then only a comma is.
 */
export function parseCell(text: string, separator: DecimalSeparator = 'auto'): CellParse {
  let t = text.trim();
  if (t === '') return { ok: true, value: null };
  if (separator === 'comma') {
    if (COMMA_DECIMAL_RE.test(t)) t = t.replace(',', '.');
    else if (t.includes('.')) return { ok: false, message: `"${t}" uses a decimal point, but the decimal separator is set to comma (Settings); thousands separators are not read` };
  } else if (COMMA_DECIMAL_RE.test(t)) {
    if (separator === 'point') return { ok: false, message: `"${t}" uses a comma: write a decimal point, or set the decimal separator to comma in Settings` };
    // Automatic: 1,5 is 1.5, but 1,234 could be 1.234 or one thousand two hundred thirty-four: it is not guessed.
    if (AMBIGUOUS_COMMA_RE.test(t)) return { ok: false, message: `"${t}" is ambiguous (decimal comma or thousands separator): set the decimal separator in Settings` };
    t = t.replace(',', '.');
  }
  if (!NUMBER_RE.test(t)) return { ok: false, message: `"${text.trim()}" is not a number` };
  const value = Number(t);
  if (!Number.isFinite(value)) return { ok: false, message: `"${text.trim()}" is not a finite number` };
  // A nonzero mantissa that underflows to 0 (1e-400) would silently become a different number.
  if (value === 0 && /[1-9]/.test(t.split(/e/i)[0])) return { ok: false, message: `"${text.trim()}" is too small to store` };
  return { ok: true, value };
}

/**
 * Read a cell of a column that has a time type (a date, a time or a duration), or of a plain one (`parseCell`). A duration also takes a number written
 * with the decimal separator of the setting, in the unit of the column. `offset` says a time was given with a UTC offset and was converted.
 */
export function parseCellFor(text: string, separator: DecimalSeparator = 'auto', time?: TimeColumn): CellParse {
  if (!time) return parseCell(text, separator);
  const read = parseTimeCell(text, time);
  if (read.ok || time.kind !== 'duration') return read;
  const plain = parseCell(text, separator);
  return plain.ok ? plain : read;
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
  | { ok: true; titles: string[]; matrix: Array<Array<number | null>>; notes?: string[] }
  | { ok: false; message: string };

/**
 * Parse a clipboard block. With withTitles the first field of every row is a row title (kept as
 * text, however numeric it looks) and the rest are values; titles is empty otherwise. Atomic:
 * any bad value rejects the whole block. `times` gives the type of each pasted value column (a date, a time or a duration, read as such;
 * undefined = a number); `notes` says what reading them did that the text did not ask for (times with an offset converted to UTC).
 */
export function parseClipboardBlock(text: string, withTitles: boolean, separator: DecimalSeparator = 'auto', times: ReadonlyArray<TimeColumn | undefined> = []): BlockParse {
  const titles: string[] = [];
  const records = splitTsv(text);
  if (records.length > MAX_TABLE_ROWS) {
    return { ok: false, message: `Paste rejected, it has ${records.length.toLocaleString('en-US')} rows and a table holds at most ${MAX_TABLE_ROWS.toLocaleString('en-US')}. Nothing was pasted.` };
  }
  const fields = records.map((r) => (withTitles ? r.slice(1) : r));
  if (withTitles) for (const r of records) titles.push(sanitizeRowTitle(r[0]));
  // Rows of unequal length are padded with missing values (an empty cell pastes as empty), so the block is a rectangle and
  // no old value survives under a short row.
  const width = fields.reduce((m, r) => Math.max(m, r.length), 0);
  const matrix: Array<Array<number | null>> = fields.map(() => Array.from({ length: width }, () => null));
  const problems: Array<{ r: number; c: number; message: string }> = [];
  const notes: string[] = [];
  for (let c = 0; c < width; c++) {
    const time = times[c];
    const texts = fields.map((r) => r[c] ?? '');
    if (time) {
      const batch = parseTimeBatch(texts, time, (t) => parseCellFor(t, separator, time));
      batch.values.forEach((v, r) => (matrix[r][c] = v));
      for (const q of batch.problems) problems.push({ r: q.index, c, message: q.message });
      notes.push(...batch.notes);
    } else {
      texts.forEach((t, r) => {
        const p = parseCell(t, separator);
        if (p.ok) matrix[r][c] = p.value;
        else problems.push({ r, c, message: p.message });
      });
    }
  }
  if (problems.length > 0) {
    const first = problems.sort((x, y) => x.r - y.r || x.c - y.c).slice(0, 3).map((q) => `row ${q.r + 1}, column ${q.c + (withTitles ? 2 : 1)}: ${q.message}`);
    return { ok: false, message: `Paste rejected, ${times.some((t) => t) ? 'values that cannot be read' : 'non-numeric values found'} (${first.join('; ')}).` };
  }
  return { ok: true, titles, matrix, ...(notes.length > 0 ? { notes } : {}) };
}

/** Parse tab/newline separated text (as copied from Excel). Atomic: any bad cell rejects the paste. */
export function parseClipboard(text: string): PasteParse {
  const r = parseClipboardBlock(text, false);
  return r.ok ? { ok: true, matrix: r.matrix } : r;
}

/** A value as it is shown, edited, copied and exported: full precision, no thousands separator, the decimal separator of the setting (a point unless comma). */
export function formatCell(value: number | null, separator: DecimalSeparator = 'auto'): string {
  if (value === null) return '';
  const s = String(value);
  return separator === 'comma' ? s.replace('.', ',') : s;
}

/** A value as `formatCell` writes it, or as a date, a time or a duration when the column has a time type. */
export function formatCellFor(value: number | null, separator: DecimalSeparator = 'auto', time?: TimeColumn): string {
  return time ? formatTimeCell(value, time) : formatCell(value, separator);
}

export function matrixToText(rows: Array<Array<number | null>>, separator: DecimalSeparator = 'auto'): string {
  return rows.map((r) => r.map((v) => formatCell(v, separator)).join('\t')).join('\n');
}

const quoteField = (s: string) => (/["\t\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** Clipboard text; titles (when given) lead each row and are quoted when they need it. `times` is the type of each value column, as `formatCellFor` takes it. */
export function blockToText(titles: string[] | null, matrix: Array<Array<number | null>>, separator: DecimalSeparator = 'auto', times: ReadonlyArray<TimeColumn | undefined> = []): string {
  const height = Math.max(matrix.length, titles?.length ?? 0);
  const lines: string[] = [];
  for (let r = 0; r < height; r++) {
    const cells = (matrix[r] ?? []).map((v, c) => formatCellFor(v, separator, times[c]));
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
export function planPaste(text: string, b: CellBounds, separator: DecimalSeparator = 'auto', times: ReadonlyArray<TimeColumn | undefined> = []): PasteResult {
  if (b.c0 < 0 && b.c1 >= 0) {
    return { ok: false, message: 'Paste rejected, the selection mixes the Row title column and value cells. Select one or the other.' };
  }
  const titleMode = b.c0 < 0;
  // The pasted columns start at the first column of the table when the paste starts at the titles, else at the selection.
  const parsed = parseClipboardBlock(text, titleMode, separator, titleMode ? times : times.slice(b.c0));
  if (!parsed.ok) return parsed;
  let { titles, matrix } = parsed;
  const notes = parsed.notes ?? [];
  if (titleMode) {
    if (titles.length === 1 && matrix[0].length === 0 && b.r1 > b.r0) {
      const title = titles[0];
      titles = Array.from({ length: b.r1 - b.r0 + 1 }, () => title);
      matrix = titles.map(() => []);
    }
  } else if (matrix.length === 1 && matrix[0].length === 1 && (b.r1 > b.r0 || b.c1 > b.c0)) {
    // One value over several columns is one reading: the columns must be of the same type, or it would mean different things in them.
    const kinds = new Set(times.slice(b.c0, b.c1 + 1).map((t) => (t ? `${t.kind}:${t.unit}` : 'number')));
    if (kinds.size > 1) return { ok: false, message: 'Paste rejected, the selected columns hold different kinds of values (numbers, dates, times or durations), so one value cannot fill them. Select one kind of column.' };
    const value = matrix[0][0];
    matrix = Array.from({ length: b.r1 - b.r0 + 1 }, () => Array.from({ length: b.c1 - b.c0 + 1 }, () => value));
  }
  const h = titleMode ? titles.length : matrix.length;
  const w = matrix.reduce((m, r) => Math.max(m, r.length), 0);
  const s = (n: number) => (n === 1 ? '' : 's');
  if (!titleMode) {
    return {
      ok: true,
      row0: b.r0,
      col0: b.c0,
      titles: null,
      matrix,
      label: 'Paste values',
      message: `Pasted ${h} row${s(h)} × ${w} column${s(w)}.${notes.map((n) => ` ${n}.`).join('')}`,
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
    message: w > 0 ? `Pasted ${h} row title${s(h)} and ${w} column${s(w)} of values.${notes.map((n) => ` ${n}.`).join('')}` : `Pasted ${h} row title${s(h)}.`,
    sel: { ar: b.r0, ac: -1, fr: b.r0 + h - 1, fc: w > 0 ? w - 1 : -1 },
  };
}
