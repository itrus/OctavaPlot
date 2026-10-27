import type { DataTable } from '../../model/types';
import { rowTitleAt } from '../../model/table/rows';
import type { CellEdit } from '../../state/commands';

interface FillBounds {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

export type FillPlan =
  | { ok: false; message: string }
  | {
      ok: true;
      /** The values to write (a missing source value empties the cell, as a copy of it would). */
      edits: CellEdit[];
      /** Row titles to write when the Row title column is in the selection (fill down only). */
      titles: Array<{ row: number; title: string }>;
      label: string;
      message: string;
    };

const plural = (n: number, one: string, many: string) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * Fill the selected cells from their first row (down) or first column (right), as Ctrl+D and Ctrl+R do in a spreadsheet. A
 * selection of one row (column) is filled from the row above (the column to the left). Only values and row titles are copied:
 * whether a value is excluded stays with its own cell. The Row title column (col -1) is filled down with the others but is
 * never a source for, or part of, a fill to the right: a value column cannot hold a title. Pure: it plans the edits.
 */
export function planFill(table: DataTable, b: FillBounds, direction: 'down' | 'right'): FillPlan {
  const lastRow = Math.min(b.r1, table.rowCount - 1);
  const lastCol = Math.min(b.c1, table.groups.length - 1);
  const edits: CellEdit[] = [];
  const titles: Array<{ row: number; title: string }> = [];
  if (direction === 'down') {
    const multi = b.r1 > b.r0;
    const source = multi ? b.r0 : b.r0 - 1;
    if (source < 0) return { ok: false, message: 'There is no row above to fill from.' };
    for (let r = multi ? b.r0 + 1 : b.r0; r <= lastRow; r++) {
      if (b.c0 < 0) titles.push({ row: r, title: rowTitleAt(table, source) });
      for (let c = Math.max(0, b.c0); c <= lastCol; c++) edits.push({ row: r, col: c, value: table.groups[c]?.observations[source]?.value ?? null });
    }
  } else {
    const c0 = Math.max(0, b.c0);
    const multi = b.c1 > c0;
    const source = multi ? c0 : c0 - 1;
    if (source < 0) return { ok: false, message: 'There is no value column to the left to fill from.' };
    for (let c = multi ? c0 + 1 : c0; c <= lastCol; c++) for (let r = Math.max(0, b.r0); r <= lastRow; r++) edits.push({ row: r, col: c, value: table.groups[source]?.observations[r]?.value ?? null });
  }
  const n = edits.length + titles.length;
  if (n === 0) return { ok: false, message: direction === 'down' ? 'Select the cells to fill, below the first row.' : 'Select the cells to fill, to the right of the first column.' };
  return { ok: true, edits, titles, label: direction === 'down' ? 'Fill down' : 'Fill right', message: `Filled ${direction}: ${plural(n, 'cell', 'cells')}.` };
}

export type SeriesPlan = { ok: false; message: string } | { ok: true; edits: CellEdit[]; message: string };

/** The number with the rounding noise of a sum taken off (0.1 + 0.2 is 0.3). */
const clean = (v: number): number => Number(v.toPrecision(12));

/**
 * Fill the selection with a series: `start`, then `start + step`, `start + 2 step` ... down the rows of each selected column
 * (`down`) or across the columns of each selected row (`across`). The Row title column is left alone. Pure: it plans the edits.
 */
export function planSeries(table: DataTable, b: FillBounds, start: number, step: number, direction: 'down' | 'across'): SeriesPlan {
  if (!Number.isFinite(start) || !Number.isFinite(step)) return { ok: false, message: 'The start and the step must be numbers.' };
  const c0 = Math.max(0, b.c0);
  const lastRow = Math.min(b.r1, table.rowCount - 1);
  const lastCol = Math.min(b.c1, table.groups.length - 1);
  const edits: CellEdit[] = [];
  if (direction === 'down') {
    for (let c = c0; c <= lastCol; c++) for (let r = b.r0; r <= lastRow; r++) edits.push({ row: r, col: c, value: clean(start + (r - b.r0) * step) });
  } else {
    for (let r = b.r0; r <= lastRow; r++) for (let c = c0; c <= lastCol; c++) edits.push({ row: r, col: c, value: clean(start + (c - c0) * step) });
  }
  if (edits.length === 0) return { ok: false, message: 'Select the cells to fill with a series.' };
  return { ok: true, edits, message: `Filled a series: ${plural(edits.length, 'cell', 'cells')}.` };
}

/** The start and step the series dialog offers: the first selected value and its distance to the second, or 1 and 1. */
export function suggestSeries(table: DataTable, b: FillBounds, direction: 'down' | 'across'): { start: number; step: number } {
  const c0 = Math.max(0, b.c0);
  const at = (r: number, c: number) => table.groups[c]?.observations[r]?.value ?? null;
  const first = at(b.r0, c0);
  const second = direction === 'down' ? at(b.r0 + 1, c0) : at(b.r0, c0 + 1);
  const start = first ?? 1;
  return { start, step: first !== null && second !== null && second !== first ? clean(second - first) : 1 };
}
