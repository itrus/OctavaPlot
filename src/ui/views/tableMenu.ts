import type { TableKind } from '../../model/types';

/** What the Format menu calls adding a column to each kind of table (the same words as the table toolbar's button in DataTableView.tsx). */
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
