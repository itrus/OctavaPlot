import type { DataTable } from '../model/types';

// Helpers for the tests of tables: they are not part of the app.

/**
 * Reorder rows: new row i is old row order[i], for the titles and for every
 * group's observations. Throws RangeError unless order is a permutation of
 * 0..rowCount-1; the identity returns the same table.
 */
export function permuteRows(table: DataTable, order: readonly number[]): DataTable {
  const n = table.rowCount;
  const seen = new Array<boolean>(n).fill(false);
  if (order.length !== n) throw new RangeError('order must list every row exactly once');
  for (const k of order) {
    if (!Number.isInteger(k) || k < 0 || k >= n || seen[k]) throw new RangeError('order must be a permutation of the row indices');
    seen[k] = true;
  }
  if (order.every((k, i) => k === i)) return table;
  return {
    ...table,
    rows: order.map((k) => table.rows[k]),
    groups: table.groups.map((g) => ({ ...g, observations: order.map((k) => g.observations[k]) })),
  };
}

/** Throws when rows and observations are not aligned or row IDs are empty or duplicated. */
export function assertTableInvariants(table: DataTable): void {
  if (table.rows.length !== table.rowCount) throw new Error(`Table ${table.id}: rows must have ${table.rowCount} entries.`);
  const ids = new Set<string>();
  for (const r of table.rows) {
    if (!r.id || ids.has(r.id)) throw new Error(`Table ${table.id}: row IDs must be non-empty and unique.`);
    ids.add(r.id);
  }
  for (const g of table.groups) {
    if (g.observations.length !== table.rowCount) throw new Error(`Table ${table.id}: group ${g.id} must have ${table.rowCount} observations.`);
  }
}
