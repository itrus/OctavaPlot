import { previewCsv, type CsvDelimiter, type FirstColumn } from './csv';
import type { DecimalSeparator, ImportedTable } from '../../model/types';
import type { TimeColumn } from '../../util/timeColumn';

/**
 * What the tests of the CSV reader ask: the table a text becomes, or the first thing wrong with it, as the Import dialog would say it.
 * A thin layer over previewCsv (which the dialog uses), so the tests read the same code as the app does.
 */
export function importCsv(
  text: string,
  separator: DecimalSeparator = 'auto',
  delimiter: CsvDelimiter = separator === 'comma' ? ';' : ',',
  firstColumn: FirstColumn = 'auto',
  times: ReadonlyArray<TimeColumn | undefined> = [],
): { ok: true; data: ImportedTable } | { ok: false; message: string } {
  const r = previewCsv(text, { separator, delimiter, firstColumn, times });
  if (!r.ok) return { ok: false, message: r.message };
  const bad = r.problems[0];
  if (bad) return { ok: false, message: `Line ${bad.line}, ${bad.label}: ${bad.message}. Use numbers or leave the cell empty.` };
  return { ok: true, data: r.data! };
}
