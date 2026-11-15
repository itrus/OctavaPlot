import type { TableKind } from '../../model/types';

/** What adding a column is called for each kind of table: on the table toolbar and in the Format menu. */
export const ADD_COLUMN_LABEL: Record<TableKind, string> = {
  column: 'Add group',
  xy: 'Add Y series',
  grouped: 'Add group',
  contingency: 'Add outcome',
  survival: 'Add group',
};

/** The table actions the Format menu fires (command `table-action`); DataTableView runs them. */
export type TableAction =
  | 'type'
  | 'add-column'
  | 'row-above'
  | 'row-below'
  | 'row-duplicate'
  | 'row-delete'
  | 'rows-1000'
  | 'rows-append'
  | 'fill-series'
  | 'exclude'
  | 'include'
  | 'x-type'
  | 'factor';
