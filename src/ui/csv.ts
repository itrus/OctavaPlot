import type { DataTable } from '../model/types';
import { sanitizeRowTitle } from '../model/rows';
import { parseCell, type DecimalSeparator } from './cellText';

/** First header cell that marks the row title column in an exported file. */
const ROW_TITLE_HEADER = 'Row title';

const quote = (s: string) => (/[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);

/** CSV text (RFC 4180, comma separated, CRLF lines): a header of group names, then one line per row up to the last row that has anything in it. */
export function tableToCsv(table: DataTable): string {
  const lines = [[ROW_TITLE_HEADER, ...table.groups.map((g) => g.name)].map(quote).join(',')];
  const isBlank = (r: number) => (table.rows[r]?.title ?? '') === '' && table.groups.every((g) => (g.observations[r]?.value ?? null) === null);
  // The table keeps spare empty rows for typing into; they are not data and would export as lines of bare commas.
  let last = table.rowCount - 1;
  while (last >= 0 && isBlank(last)) last--;
  for (let r = 0; r <= last; r++) {
    const cells = table.groups.map((g) => {
      const v = g.observations[r]?.value ?? null;
      return v === null ? '' : String(v);
    });
    lines.push([quote(table.rows[r]?.title ?? ''), ...cells].join(','));
  }
  return lines.join('\r\n') + '\r\n';
}

/** Split CSV text into records of fields. Handles quoted fields, doubled quotes, embedded line breaks and a BOM. */
export function parseCsv(text: string): string[][] {
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
        if (next !== undefined && next !== ',' && next !== '\r' && next !== '\n') {
          const line = src.slice(0, i).split(/\r\n|\r|\n/).length;
          throw new Error(`Unexpected text after a closing quote on line ${line} (a quoted field must be followed by a comma or the end of the line).`);
        }
      } else field += c;
    } else if (c === '"' && field === '') inQuotes = true;
    else if (c === ',') {
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

interface ImportedTable {
  names: string[];
  /** One title per row, or null when the file has no row title column. */
  titles: string[] | null;
  values: Array<Array<number | null>>;
}

type CsvImport = { ok: true; data: ImportedTable } | { ok: false; message: string };

/** Column label for messages: the group name, else its position. */
const colLabel = (name: string, c: number) => (name.trim() !== '' ? `"${name.trim()}"` : `column ${c + 1}`);

/** Interpret CSV text as table data. The first line holds the group names; a first column headed "Row title" holds row titles. */
export function importCsv(text: string, separator: DecimalSeparator = 'auto'): CsvImport {
  let records: string[][];
  try {
    records = parseCsv(text);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
  if (records.length < 2) return { ok: false, message: 'The file needs a header line with the group names and at least one data line.' };
  const header = records[0];
  const hasTitles = header[0]?.trim().toLowerCase() === ROW_TITLE_HEADER.toLowerCase();
  const offset = hasTitles ? 1 : 0;
  const width = header.length - offset;
  if (width < 1) return { ok: false, message: 'The file has no data columns.' };
  const names = header.slice(offset).map((n, i) => (n.trim() !== '' ? n.trim() : `Group ${i + 1}`));
  const body = records.slice(1);
  const values: Array<Array<number | null>> = [];
  for (let r = 0; r < body.length; r++) {
    if (body[r].length - offset > width) {
      return { ok: false, message: `Line ${r + 2} has more values than the ${width} group name${width === 1 ? '' : 's'} in the header.` };
    }
    const row: Array<number | null> = [];
    for (let c = 0; c < width; c++) {
      const parsed = parseCell(body[r][c + offset] ?? '', separator);
      if (!parsed.ok) return { ok: false, message: `Line ${r + 2}, ${colLabel(header[c + offset], c)}: ${parsed.message}. Use numbers or leave the cell empty.` };
      row.push(parsed.value);
    }
    values.push(row);
  }
  return { ok: true, data: { names, titles: hasTitles ? body.map((rec) => sanitizeRowTitle(rec[0] ?? '')) : null, values } };
}

/** Whether a picked file looks like CSV (by extension or type); anything else is rejected before reading. */
export const isCsvFile = (file: { name: string; type: string }): boolean =>
  /\.csv$/i.test(file.name) || file.type === 'text/csv';
