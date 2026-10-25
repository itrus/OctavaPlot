import type { DataTable, Observation } from '../types';

/**
 * Excluded observations (a value that is kept in the table, with a reason, but not used): hidden from every chart and
 * calculation, never silently dropped from the table, and counted so the screen can say how many were left out.
 * An excluded value is different from a missing one (there is no value) and from a data set switched off on a graph.
 */

/** How many observations of the table are excluded. */
export const excludedCount = (table: DataTable): number => table.groups.reduce((n, g) => n + g.observations.reduce((m, o) => m + (o.excluded ? 1 : 0), 0), 0);

/** The table as the charts and calculations see it: excluded values are missing. The same table when none is excluded. */
export function withoutExcluded(table: DataTable): DataTable {
  if (excludedCount(table) === 0) return table;
  const blank = (o: Observation): Observation => (o.excluded && o.value !== null ? { ...o, value: null } : o);
  return { ...table, groups: table.groups.map((g) => ({ ...g, observations: g.observations.map(blank) })) };
}
