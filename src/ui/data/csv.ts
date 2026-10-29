import type { DataTable } from '../../model/types';
import { MAX_TABLE_ROWS, sanitizeRowTitle } from '../../model/table/rows';
import { formatCellFor, parseCellFor } from './cellText';
import { detectTimeColumn, parseTimeBatch, type TimeColumn } from '../../util/timeColumn';
import type { DecimalSeparator } from '../../model/types';

/** First header cell that marks the row title column in an exported file. */
const ROW_TITLE_HEADER = 'Row title';

/** What separates the fields of a file: a comma, a semicolon or a tab. */
export type CsvDelimiter = ',' | ';' | '\t';

/** Fields are separated by a comma, or by a semicolon when the decimal separator is a comma, so that a number never holds the delimiter. */
const csvDelimiter = (separator: DecimalSeparator): ',' | ';' => (separator === 'comma' ? ';' : ',');

const quoter = (delimiter: string) => (s: string) => (s.includes(delimiter) || /["\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** What an exported file does with excluded values: write them as entered, leave them out, or write them with columns that mark them. */
export type CsvExportMode = 'entered' | 'analysis' | 'withExclusions';

/** Suffixes of the two columns that follow a data column holding excluded values. */
const EXCLUDED_SUFFIX = ' excluded';
const EXCLUDED_REASON_SUFFIX = ' excluded reason';
/** Suffixes of the column that follows a data column holding subjects, and of the one that follows the first column of a series with a factor (repeated on every line). */
const SUBJECT_SUFFIX = ' subject';
const FACTOR_SUFFIX = ' factor';

/**
 * CSV text (RFC 4180, CRLF lines): a header of group names, then one line per row up to the last row that has anything in it.
 * Numbers are written with the decimal separator of the setting and the fields are separated as `csvDelimiter` says.
 * Excluded values are written as entered unless the mode says otherwise: `analysis` writes them as empty cells, and
 * `withExclusions` adds "<Group> excluded" (1 or empty) and "<Group> excluded reason" after each column that has one.
 * In every mode a column whose values name subjects is followed by "<Group> subject", and the first column of a series that has a
 * factor by "<Group> factor" (the factor on every line), so that a file read back has the same roles.
 */
export function tableToCsv(table: DataTable, separator: DecimalSeparator = 'auto', mode: CsvExportMode = 'entered'): string {
  const delimiter = csvDelimiter(separator);
  const quote = quoter(delimiter);
  const marked = table.groups.map((g) => mode === 'withExclusions' && g.observations.some((o) => o.excluded));
  const withSubject = table.groups.map((g) => g.observations.some((o) => (o.subject ?? '') !== ''));
  const withFactor = table.groups.map((g) => (g.factor ?? '') !== '');
  const header = [ROW_TITLE_HEADER];
  table.groups.forEach((g, c) => header.push(g.name, ...(marked[c] ? [g.name + EXCLUDED_SUFFIX, g.name + EXCLUDED_REASON_SUFFIX] : []), ...(withSubject[c] ? [g.name + SUBJECT_SUFFIX] : []), ...(withFactor[c] ? [g.name + FACTOR_SUFFIX] : [])));
  const lines = [header.map(quote).join(delimiter)];
  const isBlank = (r: number) => (table.rows[r]?.title ?? '') === '' && table.groups.every((g) => (g.observations[r]?.value ?? null) === null);
  // The table keeps spare empty rows for typing into; they are not data and would export as lines of bare commas.
  let last = table.rowCount - 1;
  while (last >= 0 && isBlank(last)) last--;
  for (let r = 0; r <= last; r++) {
    const cells = [quote(table.rows[r]?.title ?? '')];
    table.groups.forEach((g, c) => {
      const o = g.observations[r];
      cells.push(formatCellFor(mode === 'analysis' && o?.excluded ? null : (o?.value ?? null), separator, g.time));
      if (marked[c]) cells.push(o?.excluded ? '1' : '', quote(o?.excluded ? (o.excludedReason ?? '') : ''));
      if (withSubject[c]) cells.push(quote(o?.subject ?? ''));
      if (withFactor[c]) cells.push(quote(g.factor ?? ''));
    });
    lines.push(cells.join(delimiter));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Split CSV text into records of fields. Handles quoted fields, doubled quotes, embedded line breaks and a BOM. */
export function parseCsv(text: string, delimiter: CsvDelimiter = ','): string[][] {
  const src = text.replace(/^﻿/, '');
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const endRecord = () => {
    row.push(field);
    field = '';
    records.push(row);
    row = [];
  };
  while (i < src.length) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        // After a closing quote only a separator or the end may follow: anything else would silently change the value.
        const next = src[i + 1];
        if (next !== undefined && next !== delimiter && next !== '\r' && next !== '\n') {
          const line = src.slice(0, i).split(/\r\n|\r|\n/).length;
          throw new Error(`Unexpected text after a closing quote on line ${line} (a quoted field must be followed by ${delimiter === ',' ? 'a comma' : delimiter === ';' ? 'a semicolon' : 'a tab'} or the end of the line).`);
        }
      } else field += c;
    } else if (c === '"' && field === '') inQuotes = true;
    else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\r') {
      if (src[i + 1] === '\n') i++;
      endRecord();
    } else if (c === '\n') endRecord();
    else field += c;
    i++;
  }
  if (inQuotes) throw new Error('A quoted field is not closed.');
  if (field !== '' || row.length > 0) endRecord();
  return records.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/**
 * The delimiter a file most likely uses: the one that occurs most often in its header line (outside quotes).
 * A header with none of them gives the fallback, and so does a tie that includes it.
 */
export function detectDelimiter(text: string, fallback: CsvDelimiter = ','): CsvDelimiter {
  const counts: Record<CsvDelimiter, number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;
  for (const c of text.replace(/^﻿/, '')) {
    if (c === '"') inQuotes = !inQuotes;
    else if (inQuotes) continue;
    else if (c === '\n' || c === '\r') break;
    else if (c === ',' || c === ';' || c === '\t') counts[c]++;
  }
  let best = fallback;
  for (const d of [',', ';', '\t'] as const) if (counts[d] > counts[best]) best = d;
  return best;
}

interface ImportedTable {
  names: string[];
  /** One title per row, or null when the file has no row title column. */
  titles: string[] | null;
  values: Array<Array<number | null>>;
  /** Per row and column: the exclusion (with its reason) the file marks, or null. Only present when the file has exclusion columns. */
  excluded?: Array<Array<{ reason: string } | null>>;
  /** Per row and column: the subject the file names ('' for none). Only present when the file has subject columns. */
  subjects?: string[][];
  /** Per column: the factor the file names ('' for none). Only present when the file has factor columns. */
  factors?: string[];
  /** Per column: the type the values were read as (a date, a time, a duration; undefined = a number). Only present when a column has one. */
  times?: Array<TimeColumn | undefined>;
  /** What reading did that the file did not ask for: times with a UTC offset converted to UTC. */
  notes?: string[];
}

type CsvImport = { ok: true; data: ImportedTable } | { ok: false; message: string };

/** Column label for messages: the group name, else its position. */
const colLabel = (name: string, c: number) => (name.trim() !== '' ? `"${name.trim()}"` : `column ${c + 1}`);

const DELIMITER_NAME: Record<CsvDelimiter, string> = { ',': 'Comma', ';': 'Semicolon', '\t': 'Tab' };

/** What to say about a header that did not split: the file uses another delimiter than the one in use; null when it holds none. */
function wrongDelimiter(header: string, delimiter: CsvDelimiter, inDialog: boolean): string | null {
  const found = ([',', ';', '\t'] as const).find((d) => d !== delimiter && header.includes(d));
  if (!found) return null;
  if (inDialog) return `The header line does not split with this delimiter, but it holds ${found === '\t' ? 'tabs' : DELIMITER_NAME[found].toLowerCase() + 's'}: choose ${DELIMITER_NAME[found]} as the delimiter.`;
  if (found === '\t') return 'This file looks tab-separated. Use a CSV file, or paste the cells into the table.';
  if (found === ';') return 'This file looks semicolon-separated. Set the decimal separator to comma in Settings to read it, or paste the cells into the table.';
  return 'This file looks comma-separated. With the decimal separator set to comma, CSV files use semicolons: change the setting, or paste the cells into the table.';
}

/** A cell that cannot be read as a number: where it is and what is wrong. */
interface CsvProblem {
  /** Line of the file (the header is line 1). */
  line: number;
  /** Column of the file, counting from 1 (the row title column is column 1 when there is one). */
  column: number;
  /** The heading of the column, or its position when it has none. */
  label: string;
  /** The cell exactly as the file has it. */
  text: string;
  message: string;
}

interface CsvRead {
  hasTitles: boolean;
  names: string[];
  titles: string[] | null;
  /** Values of the cells; a cell that cannot be read is null here and listed in `problems`. */
  values: Array<Array<number | null>>;
  /** Every data cell as the file has it. */
  texts: string[][];
  excluded?: Array<Array<{ reason: string } | null>>;
  subjects?: string[][];
  factors?: string[];
  /** What reading the time columns did that the file did not ask for. */
  notes: string[];
  /** Position of each data column in a line of the file. */
  positions: number[];
  problems: CsvProblem[];
}

/** A data column of a file and the columns that mark its excluded values, as positions in a line. */
interface CsvColumn {
  at: number;
  flag?: number;
  reason?: number;
  subject?: number;
  factor?: number;
}

/** The data columns of a header: "<Group> excluded", "<Group> excluded reason", "<Group> subject" and "<Group> factor" right after "<Group>" belong to it and are not data. */
function dataColumns(header: string[], offset: number): CsvColumn[] {
  const cols: CsvColumn[] = [];
  for (let at = offset; at < header.length; at++) {
    const name = header[at].trim();
    const prev = cols[cols.length - 1];
    if (prev && name !== '' && prev.flag === undefined && name === header[prev.at].trim() + EXCLUDED_SUFFIX) prev.flag = at;
    else if (prev && prev.flag === prev.at + 1 && prev.reason === undefined && name === header[prev.at].trim() + EXCLUDED_REASON_SUFFIX && at === prev.flag + 1) prev.reason = at;
    else if (prev && name !== '' && prev.subject === undefined && prev.factor === undefined && name === header[prev.at].trim() + SUBJECT_SUFFIX) prev.subject = at;
    else if (prev && name !== '' && prev.factor === undefined && name === header[prev.at].trim() + FACTOR_SUFFIX) prev.factor = at;
    else cols.push({ at });
  }
  return cols;
}

/** Whether the first column holds row titles: automatic goes by the header "Row title". */
export type FirstColumn = 'auto' | 'titles' | 'values';

/** Read every cell of a file. A fault of the file as a whole is an `error`; bad cells are collected, not fatal. */
function readCsv(text: string, separator: DecimalSeparator, delimiter: CsvDelimiter, firstColumn: FirstColumn, inDialog: boolean, times: ReadonlyArray<TimeColumn | undefined> = []): { error: string } | { read: CsvRead } {
  let records: string[][];
  try {
    records = parseCsv(text, delimiter);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }
  if (records.length < 2) return { error: 'The file needs a header line with the group names and at least one data line.' };
  // The same limit as a paste or a table that grows: a file is refused before any table is made from it.
  if (records.length - 1 > MAX_TABLE_ROWS) return { error: `A table holds at most ${MAX_TABLE_ROWS.toLocaleString('en-US')} rows; the file has ${(records.length - 1).toLocaleString('en-US')} data lines.` };
  const header = records[0];
  // A header that does not split is a differently delimited file; say so instead of failing on its first value.
  if (header.length === 1) {
    const hint = wrongDelimiter(header[0], delimiter, inDialog);
    if (hint) return { error: hint };
  }
  const hasTitles = firstColumn === 'auto' ? header[0]?.trim().toLowerCase() === ROW_TITLE_HEADER.toLowerCase() : firstColumn === 'titles';
  const offset = hasTitles ? 1 : 0;
  const cols = dataColumns(header, offset);
  const width = cols.length;
  const lineWidth = header.length - offset;
  if (width < 1) return { error: 'The file has no data columns.' };
  const names = cols.map((c, i) => (header[c.at].trim() !== '' ? header[c.at].trim() : `Group ${i + 1}`));
  const marks = cols.some((c) => c.flag !== undefined);
  const hasSubjects = cols.some((c) => c.subject !== undefined);
  const hasFactors = cols.some((c) => c.factor !== undefined);
  const body = records.slice(1);
  const values: Array<Array<number | null>> = [];
  const texts: string[][] = [];
  const excluded: Array<Array<{ reason: string } | null>> = [];
  const subjects: string[][] = [];
  const problems: CsvProblem[] = [];
  // A factor is one text for a column: the first line that has one.
  const factors: string[] = cols.map((c) => (c.factor === undefined ? '' : (body.map((rec) => (rec[c.factor!] ?? '').trim()).find((t) => t !== '') ?? '')));
  for (let r = 0; r < body.length; r++) {
    if (body[r].length - offset > lineWidth) {
      return { error: `Line ${r + 2} has more values than the ${lineWidth} group name${lineWidth === 1 ? '' : 's'} in the header.` };
    }
    const row: Array<number | null> = [];
    const cells: string[] = [];
    const marked: Array<{ reason: string } | null> = [];
    const named: string[] = [];
    for (let c = 0; c < width; c++) {
      const at = cols[c].at;
      const cell = body[r][at] ?? '';
      // A column with a time type is read together after the lines (a column is all wall-clock times or all with an offset).
      const parsed = times[c] ? ({ ok: true, value: null } as const) : parseCellFor(cell, separator);
      cells.push(cell);
      if (parsed.ok) row.push(parsed.value);
      else {
        row.push(null);
        problems.push({ line: r + 2, column: at + 1, label: colLabel(header[at], c), text: cell, message: parsed.message });
      }
      const { flag, reason } = cols[c];
      const flagText = flag === undefined ? '' : (body[r][flag] ?? '').trim();
      if (flag !== undefined && flagText !== '' && flagText !== '1' && flagText !== '0') {
        problems.push({ line: r + 2, column: flag + 1, label: colLabel(header[flag], c), text: flagText, message: `"${flagText}" must be 1 or empty` });
      }
      // An excluded value is one that exists: a flag on an empty cell marks nothing.
      marked.push(flagText === '1' && (times[c] ? cell.trim() !== '' : row[c] !== null) ? { reason: reason === undefined ? '' : (body[r][reason] ?? '').trim() } : null);
      const subjectAt = cols[c].subject;
      named.push(subjectAt === undefined ? '' : (body[r][subjectAt] ?? '').trim());
    }
    values.push(row);
    texts.push(cells);
    excluded.push(marked);
    subjects.push(named);
  }
  const notes: string[] = [];
  for (let c = 0; c < width; c++) {
    const time = times[c];
    if (!time) continue;
    const batch = parseTimeBatch(texts.map((r) => r[c]), time, (t) => parseCellFor(t, separator, time));
    batch.values.forEach((v, r) => (values[r][c] = v));
    for (const q of batch.problems) problems.push({ line: q.index + 2, column: cols[c].at + 1, label: colLabel(header[cols[c].at], c), text: texts[q.index][c], message: q.message });
    notes.push(...batch.notes);
  }
  problems.sort((x, y) => x.line - y.line || x.column - y.column);
  return { read: { hasTitles, names, titles: hasTitles ? body.map((rec) => sanitizeRowTitle(rec[0] ?? '')) : null, values, texts, positions: cols.map((c) => c.at), ...(marks ? { excluded } : {}), ...(hasSubjects ? { subjects } : {}), ...(hasFactors ? { factors } : {}), notes, problems } };
}

/**
 * Interpret CSV text as table data. The first line holds the group names; a first column headed "Row title" holds row titles.
 * Fields are separated as `csvDelimiter` says unless a delimiter is given.
 */
export function importCsv(text: string, separator: DecimalSeparator = 'auto', delimiter: CsvDelimiter = csvDelimiter(separator), firstColumn: FirstColumn = 'auto', times: ReadonlyArray<TimeColumn | undefined> = []): CsvImport {
  const result = readCsv(text, separator, delimiter, firstColumn, false, times);
  if ('error' in result) return { ok: false, message: result.error };
  const { read } = result;
  const bad = read.problems[0];
  if (bad) return { ok: false, message: `Line ${bad.line}, ${bad.label}: ${bad.message}. Use numbers or leave the cell empty.` };
  return { ok: true, data: importedOf(read, times) };
}

/** What a read file becomes as table data. */
function importedOf(read: CsvRead, times: ReadonlyArray<TimeColumn | undefined>): ImportedTable {
  const typed = read.names.map((_, c) => times[c]);
  return {
    names: read.names,
    titles: read.titles,
    values: read.values,
    ...(read.excluded ? { excluded: read.excluded } : {}),
    ...(read.subjects ? { subjects: read.subjects } : {}),
    ...(read.factors ? { factors: read.factors } : {}),
    ...(typed.some((t) => t) ? { times: typed } : {}),
    ...(read.notes.length > 0 ? { notes: read.notes } : {}),
  };
}

/** Rows and columns of a file shown before it is imported. */
const PREVIEW_ROWS = 20;
const PREVIEW_COLUMNS = 8;

interface CsvPreviewCell {
  /** The cell as the file has it. */
  text: string;
  /** The number it reads as (null: empty, or not readable). */
  value: number | null;
  /** Why the cell cannot be read, or null. */
  problem: string | null;
}

interface CsvPreviewRow {
  /** Line of the file. */
  line: number;
  title: string | null;
  cells: CsvPreviewCell[];
}

interface CsvPreviewOptions {
  delimiter: CsvDelimiter;
  separator: DecimalSeparator;
  firstColumn: FirstColumn;
  /** The type to read each data column as (a date, a time, a duration); absent or undefined = numbers. */
  times?: ReadonlyArray<TimeColumn | undefined>;
}

type CsvPreview =
  | { ok: false; message: string }
  | {
      ok: true;
      /** The first column holds row titles. */
      hasTitles: boolean;
      names: string[];
      rowCount: number;
      columnCount: number;
      /** The first rows and columns of the file. */
      rows: CsvPreviewRow[];
      /** Data columns beyond the ones shown. */
      hiddenColumns: number;
      /** Every cell that cannot be read, in file order. */
      problems: CsvProblem[];
      /** What Import puts in the table; null while there are problems. */
      data: ImportedTable | null;
      /** The type the cells of the first data column say they are (all dates, all times, all clock durations), when it was read as numbers; only a suggestion. */
      suggestedTime: TimeColumn | null;
      /** What reading the time columns did that the file did not ask for. */
      notes: string[];
    };

/** What a file becomes under these choices, without changing anything. Pure. */
export function previewCsv(text: string, options: CsvPreviewOptions): CsvPreview {
  const times = options.times ?? [];
  const result = readCsv(text, options.separator, options.delimiter, options.firstColumn, true, times);
  if ('error' in result) return { ok: false, message: result.error };
  const { read } = result;
  const shown = Math.min(PREVIEW_COLUMNS, read.names.length);
  const bad = new Map(read.problems.map((p) => [`${p.line}:${p.column}`, p.message]));
  const rows: CsvPreviewRow[] = read.values.slice(0, PREVIEW_ROWS).map((values, r) => ({
    line: r + 2,
    title: read.titles ? read.titles[r] : null,
    cells: Array.from({ length: shown }, (_, c) => ({ text: read.texts[r][c], value: values[c], problem: bad.get(`${r + 2}:${read.positions[c] + 1}`) ?? null })),
  }));
  return {
    ok: true,
    hasTitles: read.hasTitles,
    names: read.names,
    rowCount: read.values.length,
    columnCount: read.names.length,
    rows,
    hiddenColumns: read.names.length - shown,
    problems: read.problems,
    data: read.problems.length === 0 ? importedOf(read, times) : null,
    suggestedTime: times[0] ? null : detectTimeColumn(read.texts.map((r) => r[0])),
    notes: read.notes,
  };
}

/** Whether a picked file looks like CSV or tab-separated text (by extension or type); anything else is rejected before reading. */
export const isCsvFile = (file: { name: string; type: string }): boolean =>
  /\.(csv|tsv)$/i.test(file.name) || file.type === 'text/csv' || file.type === 'text/tab-separated-values';
