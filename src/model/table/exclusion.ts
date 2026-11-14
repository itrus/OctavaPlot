import type { DataTable, Observation } from '../types';

/**
 * Excluded observations (a value that is kept in the table, with a reason, but not used): hidden from every chart and
 * calculation, never silently dropped from the table, and counted so the screen can say how many were left out.
 * An excluded value is different from a missing one (there is no value) and from a data set switched off on a graph.
 */

/** How many observations of the table are excluded. */
export const excludedCount = (table: DataTable): number => table.groups.reduce((n, g) => n + g.observations.reduce((m, o) => m + (o.excluded ? 1 : 0), 0), 0);

const withoutExcludedOf = new WeakMap<DataTable, DataTable>();

/**
 * The table as the charts and calculations see it: excluded values are missing. The same table when none is excluded, kept for as long as
 * the table object is the same one; a data set with nothing excluded in it is the same object too, with its own observations array, so a
 * calculation cached by that array is found again.
 */
export function withoutExcluded(table: DataTable): DataTable {
  const known = withoutExcludedOf.get(table);
  if (known) return known;
  const blank = (o: Observation): Observation => (o.excluded && o.value !== null ? { ...o, value: null } : o);
  let any = false;
  const groups = table.groups.map((g) => {
    if (!g.observations.some((o) => o.excluded && o.value !== null)) return g;
    any = true;
    return { ...g, observations: g.observations.map(blank) };
  });
  const result = any ? { ...table, groups } : table;
  withoutExcludedOf.set(table, result);
  return result;
}
