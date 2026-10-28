import { kaplanMeier, medianSurvival, readSurvivalSubjects } from '../../chart/survival/survivalModel';
import type { Sheet } from '../../model/project/curveFit';
import { withoutExcluded } from '../../model/table/exclusion';
import type { DataTable } from '../../model/types';

/** A time at the precision of the sheet (five significant digits); the exact text keeps all of it. */
const timeText = (v: number): string => String(Number(v.toPrecision(5)));

/**
 * The Results of a survival table: for each group the number of subjects, the events and the censored, the median survival time and
 * how many entries were left out. The median is the first event time at which the Kaplan-Meier estimate is 0.5 or below, the same
 * estimate the survival chart draws (it is read from the table by the same function); "Not reached" when the curve never gets there
 * (too few events, or most subjects censored). No interval is given: the contracts name no method for one. Pure.
 */
export function survivalSheet(source: DataTable): Sheet {
  const table = withoutExcluded(source);
  const groups = readSurvivalSubjects(table).map((g) => {
    const km = kaplanMeier(g.subjects);
    const median = medianSurvival(km);
    return { id: g.series.id, label: g.series.name, n: km.n, events: km.events, censored: km.n - km.events, median, left: g.invalidStatus + g.noTime };
  });
  const count = (key: string, label: string, pick: (g: (typeof groups)[number]) => number) => ({ key, label, cells: groups.map((g) => String(pick(g))), exact: groups.map((g) => String(pick(g))) });
  return {
    corner: 'Survival summary',
    columns: groups.map((g) => ({ id: g.id, label: g.label })),
    rows: [
      count('n', 'Subjects', (g) => g.n),
      count('events', 'Events', (g) => g.events),
      count('censored', 'Censored', (g) => g.censored),
      { key: 'median', label: 'Median survival time', cells: groups.map((g) => (g.median === null ? 'Not reached' : timeText(g.median))), exact: groups.map((g) => (g.median === null ? 'Not reached' : String(g.median))) },
      { key: 'blank', label: '', blank: true, cells: groups.map(() => ''), exact: groups.map(() => '') },
      count('left', 'Entries left out', (g) => g.left),
    ],
  };
}
