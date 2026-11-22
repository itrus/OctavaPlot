import { leadingColumns } from '../graph/chartTypes';
import type { Chart, DataTable, Group, Id } from '../types';
import { rowTitleAt } from './rows';

/**
 * The column a pie, doughnut, bar of slices or dot plot draws: one at a time, the first column of the table that has not been taken
 * off the graph. Undefined when there is none.
 */
export function pieColumn(chart: Pick<Chart, 'hiddenGroupIds'>, table: DataTable): Group | undefined {
  const hidden = new Set(chart.hiddenGroupIds);
  return table.groups.slice(leadingColumns(table.kind)).find((g) => !hidden.has(g.id));
}

/** A part of the whole: one row of the plotted column, named by its row title. Its id is the ID of the row with "part:" before it (a row ID can start with a character an XML id cannot). */
export interface PiePart {
  id: Id;
  /** Position of the row in the table. */
  row: number;
  label: string;
}

/** The parts of the plotted column: the rows that hold a title or a count, in table order. */
export function pieParts(table: DataTable, column: Group | undefined): PiePart[] {
  if (!column) return [];
  const parts: PiePart[] = [];
  for (let r = 0; r < table.rowCount; r++) {
    const title = rowTitleAt(table, r).trim();
    const value = column.observations[r]?.value;
    if (title === '' && (value === null || value === undefined)) continue;
    parts.push({ id: `part:${table.rows[r]?.id ?? r}`, row: r, label: title || `Row ${r + 1}` });
  }
  return parts;
}
