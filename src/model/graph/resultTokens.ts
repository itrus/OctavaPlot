import { describeValues, formatResult, type Descriptive } from '../../stats/descriptive';
import { withoutExcluded } from '../table/exclusion';
import type { Chart, DataTable, Id, ResultStat } from '../types';

/**
 * Results in the text of a figure. A label can carry `{{mean Control}}`, `{{n Drug A}}` or `{{sd Control|2}}` (the result, then the name of
 * a data set, then a number of decimals after a bar); it is filled when the graph is drawn, so it follows the data: add a value and
 * the n of the label changes. A reference line can also be bound to a result (`valueFrom`) and is then drawn at it. The results are those
 * of the descriptive statistics of the values of the data set, with excluded values left out, as in every chart and calculation.
 */

const STATS: ReadonlyArray<{ id: ResultStat; name: string; of: (d: Descriptive) => number | null }> = [
  { id: 'n', name: 'n', of: (d) => d.n },
  { id: 'sum', name: 'sum', of: (d) => d.sum },
  { id: 'mean', name: 'mean', of: (d) => d.mean },
  { id: 'sd', name: 'SD', of: (d) => d.sd },
  { id: 'sem', name: 'SEM', of: (d) => d.sem },
  { id: 'median', name: 'median', of: (d) => d.median },
  { id: 'min', name: 'minimum', of: (d) => d.min },
  { id: 'max', name: 'maximum', of: (d) => d.max },
];

/** The results a text or a reference line can be bound to, in the order they are offered. */
export const RESULT_STATS: ReadonlyArray<{ id: ResultStat; label: string }> = STATS.map((s) => ({ id: s.id, label: s.name }));

const statOf = (id: string): (typeof STATS)[number] | undefined => STATS.find((s) => s.id === id);

/** A result of a data set of the table, or null when there is none (no such data set, no values, a spread of fewer than two values). */
export function resultValue(table: DataTable, groupId: Id, stat: ResultStat): number | null {
  const group = withoutExcluded(table).groups.find((g) => g.id === groupId);
  const s = statOf(stat);
  if (!group || !s) return null;
  const value = s.of(describeValues(group.observations.map((o) => o.value)));
  return value !== null && Number.isFinite(value) ? value : null;
}

const TOKEN = /\{\{\s*([A-Za-z]+)(?:\s+([^{}]*?))?(?:\|(\d{1,2}))?\s*\}\}/g;

/**
 * The text with its tokens filled in, and what was wrong with the ones that could not be (each once): those stay as typed. A data set is
 * named as it is in the table or as it is called on the chart (`displayNames`), capitals ignored; a table with one data set needs no name.
 */
export function fillResultTokens(text: string, table: DataTable, displayNames: Readonly<Record<Id, string>> = {}): { text: string; problems: string[] } {
  if (!text.includes('{{')) return { text, problems: [] };
  const problems: string[] = [];
  const problem = (message: string) => {
    if (!problems.includes(message)) problems.push(message);
  };
  const named = (name: string) => {
    const wanted = name.trim().toLowerCase();
    return table.groups.find((g) => g.name.trim().toLowerCase() === wanted || (displayNames[g.id] ?? '').trim().toLowerCase() === wanted);
  };
  const out = text.replace(TOKEN, (token, statName: string, rawName: string | undefined, digits: string | undefined) => {
    const stat = statOf(statName.toLowerCase());
    if (!stat) {
      problem(`"${statName}" is not a result: use ${STATS.slice(0, -1).map((s) => s.id).join(', ')} or ${STATS[STATS.length - 1].id} (in ${token}).`);
      return token;
    }
    const name = rawName?.trim() ?? '';
    const group = name === '' ? (table.groups.length === 1 ? table.groups[0] : undefined) : named(name);
    if (!group) {
      problem(name === '' ? `Name a data set: ${token} needs one, for example {{${stat.id} ${table.groups[0]?.name ?? 'Control'}}}.` : `No data set is called "${name}" (in ${token}).`);
      return token;
    }
    const value = resultValue(table, group.id, stat.id);
    if (value === null) {
      problem(`The ${stat.name} of "${group.name}" cannot be calculated (in ${token}).`);
      return token;
    }
    return digits !== undefined && stat.id !== 'n' ? value.toFixed(Number(digits)) : formatResult(value, stat.id === 'n' ? 'count' : 'number');
  });
  return { text: out, problems };
}

/**
 * The chart as it is drawn: the annotations, the labels of the reference lines and of the brackets with their tokens filled in, and a
 * reference line bound to a result put at it (one whose result is not available is left out, with a notice). The very same chart when
 * nothing in it is bound, so that its caches and the memoised drawing are not disturbed. The chart as written is never changed.
 */
export function resolveChartTokens(chart: Chart, table: DataTable): { chart: Chart; notices: string[] } {
  const bound = chart.referenceLines.some((l) => l.valueFrom !== undefined);
  const typed = chart.annotations.some((a) => a.text.includes('{{')) || chart.referenceLines.some((l) => l.label.includes('{{')) || chart.brackets.some((b) => b.label.includes('{{'));
  if (!bound && !typed) return { chart, notices: [] };
  const notices: string[] = [];
  const fill = (what: string, text: string) => {
    const r = fillResultTokens(text, table, chart.displayNames);
    for (const p of r.problems) if (!notices.includes(`${what}: ${p}`)) notices.push(`${what}: ${p}`);
    return r.text;
  };
  const referenceLines = chart.referenceLines.flatMap((l) => {
    const label = l.showLabel ? fill('Label of a reference line', l.label) : l.label;
    if (!l.valueFrom) return [label === l.label ? l : { ...l, label }];
    const group = table.groups.find((g) => g.id === l.valueFrom?.groupId);
    const value = resultValue(table, l.valueFrom.groupId, l.valueFrom.stat);
    if (value === null) {
      const what = statOf(l.valueFrom.stat)?.name ?? l.valueFrom.stat;
      notices.push(group ? `A reference line is bound to the ${what} of "${group.name}", which cannot be calculated, so it is not drawn.` : 'A reference line is bound to a data set that is not in the table, so it is not drawn.');
      return [];
    }
    return [{ ...l, value, label }];
  });
  return {
    chart: {
      ...chart,
      annotations: chart.annotations.map((a) => (a.text.includes('{{') ? { ...a, text: fill('Text of an annotation', a.text) } : a)),
      referenceLines,
      brackets: chart.brackets.map((b) => (b.label.includes('{{') ? { ...b, label: fill('Label of a bracket', b.label) } : b)),
    },
    notices,
  };
}
