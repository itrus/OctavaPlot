import type { DataTable, Group } from '../types';
import { withoutExcluded } from './exclusion';

/**
 * Observation roles: the subject. An observation names the independent unit it belongs to (see `Observation.subject`).
 * Repeats of one subject inside a column are technical repeats, not independent observations; the same subject in several
 * columns is one unit measured again (paired, repeated measures). A role is only a label: it changes no value, and hiding a
 * layer or excluding a value never changes it. Excluded and missing values take no part in any count or mean here.
 */

/** One subject of a column, with the values that are used (not missing, not excluded) in table order. */
export interface SubjectUnit {
  subject: string;
  /** Rows of the observations, in table order. */
  rows: number[];
  values: number[];
}

/** True when any observation of the table names a subject. */
export const hasSubjects = (table: DataTable): boolean => table.groups.some((g) => g.observations.some((o) => (o.subject ?? '') !== ''));

/**
 * The subjects of one column in order of first appearance. Values without a subject are not a unit: they are counted apart
 * as `unassigned`, so the caller can say how many were left out instead of dropping them silently.
 */
export function subjectUnits(group: Group): { units: SubjectUnit[]; unassigned: number } {
  const bySubject = new Map<string, SubjectUnit>();
  let unassigned = 0;
  group.observations.forEach((o, row) => {
    if (o.value === null || o.excluded === true) return;
    const subject = o.subject ?? '';
    if (subject === '') {
      unassigned++;
      return;
    }
    const unit = bySubject.get(subject) ?? { subject, rows: [], values: [] };
    unit.rows.push(row);
    unit.values.push(o.value);
    bySubject.set(subject, unit);
  });
  return { units: [...bySubject.values()], unassigned };
}

/** The mean of each subject of a column: the independent values of a nested design. */
export const unitMeans = (group: Group): Array<{ subject: string; mean: number; n: number }> =>
  subjectUnits(group).units.map((u) => ({ subject: u.subject, mean: u.values.reduce((a, b) => a + b, 0) / u.values.length, n: u.values.length }));

/**
 * The mean of the unit means: every subject counts once, however many repeats it has. Null when no subject has a value.
 * Contract fixture: unit A [0, 0, 0] and unit B [10] give 5, where the pooled mean is 2.5.
 */
export function equalUnitMean(group: Group): number | null {
  const means = unitMeans(group);
  return means.length === 0 ? null : means.reduce((a, m) => a + m.mean, 0) / means.length;
}

/**
 * Subjects measured in two or more columns of the table, with the value of each (null where the column has none): the
 * lines of a paired or repeated-measures graph. A subject with repeats inside a column is given by its mean there.
 */
export function subjectTrajectories(table: DataTable): Array<{ subject: string; values: Array<number | null> }> {
  const used = withoutExcluded(table);
  const perColumn = used.groups.map((g) => new Map(unitMeans(g).map((m) => [m.subject, m.mean] as const)));
  const order: string[] = [];
  for (const m of perColumn) for (const s of m.keys()) if (!order.includes(s)) order.push(s);
  return order
    .map((subject) => ({ subject, values: perColumn.map((m) => m.get(subject) ?? null) }))
    .filter((t) => t.values.filter((v) => v !== null).length >= 2);
}
