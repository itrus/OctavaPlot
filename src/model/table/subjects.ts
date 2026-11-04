import { memoFor } from '../../stats/memo';
import type { DataTable, Group, Observation } from '../types';

/**
 * Observation roles: the subject. An observation names the independent unit it belongs to (see `Observation.subject`).
 * Repeats of one subject inside a column are technical repeats, not independent observations; the same subject in several
 * columns is one unit measured again (paired, repeated measures). A role is only a label: it changes no value, and hiding a
 * layer or excluding a value never changes it. Excluded and missing values take no part in any count or mean here.
 */

/** One subject of a column, with the values that are used (not missing, not excluded) in table order. */
interface SubjectUnit {
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

/** Unit means as observations (what a calculation of the units takes in place of the values). Kept per observations array, so a style edit reuses it. */
export function unitObservations(group: Group): Observation[] {
  return memoFor(group.observations, 'unitObservations', () => unitMeans(group).map((m) => ({ id: `unit:${m.subject}`, value: m.mean })));
}
