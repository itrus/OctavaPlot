import { leadingColumns } from '../graph/chartTypes';
import type { DataTable, Group, Id, ReplicateLayout, SummaryFormat, TableKind } from '../types';

/** How the error was entered when a table holds values "already calculated elsewhere". */
type SuppliedError = 'sd' | 'sem' | 'cv' | 'plusMinus' | 'limits';

interface SummaryFormatInfo {
  id: SummaryFormat;
  label: string;
  /** Sub-column headings of one series, in order. */
  columns: string[];
  error: SuppliedError;
}

/** Spec 2.3 "Supplied summary": a centre plus a named spread or limits; N is kept but not needed to draw. */
export const SUMMARY_FORMATS: readonly SummaryFormatInfo[] = [
  { id: 'mean-sd-n', label: 'Mean, SD, N', columns: ['Mean', 'SD', 'N'], error: 'sd' },
  { id: 'mean-sem-n', label: 'Mean, SEM, N', columns: ['Mean', 'SEM', 'N'], error: 'sem' },
  { id: 'mean-cv-n', label: 'Mean, %CV, N', columns: ['Mean', '%CV', 'N'], error: 'cv' },
  { id: 'mean-sd', label: 'Mean & SD', columns: ['Mean', 'SD'], error: 'sd' },
  { id: 'mean-sem', label: 'Mean & SEM', columns: ['Mean', 'SEM'], error: 'sem' },
  { id: 'mean-cv', label: 'Mean & %CV', columns: ['Mean', '%CV'], error: 'cv' },
  { id: 'mean-pm', label: 'Mean (or median), +/- error', columns: ['Mean', '+/- error'], error: 'plusMinus' },
  { id: 'mean-limits', label: 'Mean (or median), Upper/Lower limits', columns: ['Mean', 'Upper', 'Lower'], error: 'limits' },
];

export const summaryFormatInfo = (id: SummaryFormat): SummaryFormatInfo => SUMMARY_FORMATS.find((f) => f.id === id) ?? SUMMARY_FORMATS[0];

const SINGLE_LAYOUT: ReplicateLayout = { kind: 'single' };
export const MIN_REPLICATES = 2;
export const MAX_REPLICATES = 10;

export const layoutOf = (table: Pick<DataTable, 'layout'>): ReplicateLayout => table.layout ?? SINGLE_LAYOUT;

/** Number of table columns one Y series occupies. */
export function seriesWidth(layout: ReplicateLayout): number {
  if (layout.kind === 'replicates') return layout.n;
  if (layout.kind === 'summary') return summaryFormatInfo(layout.format).columns.length;
  if (layout.kind === 'sized') return 2;
  if (layout.kind === 'vector') return 3;
  return 1;
}

/** Headings of the sub-columns of one series. */
export function subLabels(layout: ReplicateLayout): string[] {
  if (layout.kind === 'replicates') return Array.from({ length: layout.n }, (_, i) => `Y${i + 1}`);
  if (layout.kind === 'summary') return summaryFormatInfo(layout.format).columns;
  if (layout.kind === 'sized') return ['Y', 'Size'];
  if (layout.kind === 'vector') return ['Y', 'dX', 'dY'];
  return ['Y'];
}

/** A Y series of an XY table: one column, or a block of replicate / summary sub-columns. */
interface XySeriesDef {
  /** The first column's ID: the stable identity of the series (styles, legend and selection are keyed by it). */
  id: Id;
  name: string;
  columns: Group[];
  index: number;
}

const letter = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : String(i + 1));

/** Default name of series number `i` of a table of this kind. */
export const defaultSeriesName = (i: number, kind: TableKind = 'xy'): string =>
  kind === 'grouped' || kind === 'survival' ? `Group ${letter(i)}` : kind === 'contingency' ? `Outcome ${i + 1}` : `Series ${letter(i)}`;

/** Columns per series of this table: its layout's width for XY and grouped tables, one for the others. */
export const tableSeriesWidth = (table: DataTable): number => (table.kind === 'xy' || table.kind === 'grouped' ? seriesWidth(layoutOf(table)) : 1);

/**
 * The series of a table, in order: the Y series of an XY table (the columns after X), the groups of a survival table,
 * the series of a grouped table, the outcomes of a contingency table. With a single column per series the series is the
 * column and its name is the column name; with sub-columns the name is the title of the block's first column.
 */
export function xySeries(table: DataTable): XySeriesDef[] {
  const width = tableSeriesWidth(table);
  const out: XySeriesDef[] = [];
  const ys = table.groups.slice(leadingColumns(table.kind));
  for (let i = 0; i * width < ys.length; i++) {
    const columns = ys.slice(i * width, (i + 1) * width);
    const first = columns[0];
    out.push({ id: first.id, name: width === 1 ? first.name : first.title.trim() !== '' ? first.title : defaultSeriesName(i, table.kind), columns, index: i });
  }
  return out;
}
