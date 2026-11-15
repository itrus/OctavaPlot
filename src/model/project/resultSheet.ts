import type { Id } from '../types';

/** One row of a results sheet: a label and one cell for each column. */
export interface SheetRow {
  key: string;
  label: string;
  cells: string[];
  /** The same cells at full precision, for copying and files; the cells are rounded for the screen. */
  exact?: string[];
  /** A gap between groups of rows. */
  blank?: boolean;
  indent?: boolean;
}

export interface Sheet {
  corner: string;
  columns: Array<{ id: Id; label: string }>;
  rows: SheetRow[];
}
