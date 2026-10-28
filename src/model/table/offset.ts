import type { DataTable, Group, Observation } from '../types';
import { layoutOf, summaryFormatInfo, xySeries } from './tableLayout';

/**
 * Offset traces: the series of an XY table drawn one above the other, trace i lifted by i times a step, so that curves that would lie on
 * each other can be read apart. The offset is a presentation, never a change of the table: the chart is built from a shifted copy.
 * Only what is a place on the Y axis moves (a single Y, every replicate, the centre and the limits of a summary): a spread (SD, SEM,
 * %CV, +/- error) and a count do not, and the steps of a vector are lengths, so they stay.
 */

/** The columns of a series that move with it. */
function movingColumns(table: DataTable, columns: readonly Group[]): Group[] {
  const layout = layoutOf(table);
  if (layout.kind === 'replicates') return [...columns];
  if (layout.kind === 'summary') {
    const info = summaryFormatInfo(layout.format);
    // The centre moves; the limits of a "mean, upper, lower" table are places too, so they move with it.
    return columns.filter((_, i) => i === 0 || info.error === 'limits');
  }
  return columns.slice(0, 1);
}

/** A little more than the largest range of any trace, rounded up to two significant digits: the traces just do not overlap. 1 when there is nothing to measure. */
export function autoOffsetStep(table: DataTable): number {
  let span = 0;
  for (const s of xySeries(table)) {
    const values = movingColumns(table, s.columns).flatMap((c) => c.observations.flatMap((o) => (o.value !== null && o.excluded !== true && Number.isFinite(o.value) ? [o.value] : [])));
    if (values.length > 1) span = Math.max(span, Math.max(...values) - Math.min(...values));
  }
  if (!(span > 0)) return 1;
  const want = span * 1.1;
  const unit = 10 ** (Math.floor(Math.log10(want)) - 1);
  return Number((Math.ceil(want / unit - 1e-9) * unit).toPrecision(12));
}

/** The step in use: the one the chart was given, or the automatic one. */
export const offsetStepOf = (traceOffset: number | null, table: DataTable): number => traceOffset ?? autoOffsetStep(table);

/** The table with series number i lifted by i times `step`; the same table when the step is 0. Missing values stay missing. */
export function offsetTable(table: DataTable, step: number): DataTable {
  if (step === 0) return table;
  const shift = new Map<string, number>();
  xySeries(table).forEach((s, i) => {
    for (const c of movingColumns(table, s.columns)) shift.set(c.id, i * step);
  });
  const lift = (o: Observation, by: number): Observation => (o.value === null ? o : { ...o, value: o.value + by });
  return { ...table, groups: table.groups.map((g) => (shift.has(g.id) && shift.get(g.id) !== 0 ? { ...g, observations: g.observations.map((o) => lift(o, shift.get(g.id)!)) } : g)) };
}
