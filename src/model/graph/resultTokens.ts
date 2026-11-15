import { describeValuesCached, formatResult, type Descriptive } from '../../stats/descriptive';
import { withoutExcluded } from '../table/exclusion';
import { tableSeriesWidth, xySeries } from '../table/tableLayout';
import { usesSeriesBlocks } from './chartTypes';
import type { Chart, DataTable, Id, Observation, ResultStat } from '../types';

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

/** The values of an observation list, made once for each list object, so that a calculation cached by that array is found again. */
const valuesOfList = new WeakMap<ReadonlyArray<Observation>, Array<number | null>>();
function valuesOf(observations: ReadonlyArray<Observation>): Array<number | null> {
  let values = valuesOfList.get(observations);
  if (!values) {
    values = observations.map((o) => o.value);
    valuesOfList.set(observations, values);
  }
  return values;
}

/** The results already worked out in one drawing of a chart, by data set (or series): several tokens of one data set cost one calculation. */
type Memo = Map<string, Descriptive>;

/** A result of a data set of the table, or null when there is none (no such data set, no values, a spread of fewer than two values). */
export function resultValue(table: DataTable, groupId: Id, stat: ResultStat, memo: Memo = new Map()): number | null {
  const group = withoutExcluded(table).groups.find((g) => g.id === groupId);
  const s = statOf(stat);
  if (!group || !s) return null;
  let d = memo.get(groupId);
  if (!d) {
    d = describeValuesCached(valuesOf(group.observations));
    memo.set(groupId, d);
  }
  const value = s.of(d);
  return value !== null && Number.isFinite(value) ? value : null;
}

/** {{result Name|decimals}}: the name may hold braces one level deep, so a data set called "H_{2}O" can be named. */
const TOKEN = /\{\{\s*([A-Za-z]+)(?:\s+((?:[^{}]|\{[^{}]*\})*?))?(?:\|(\d{1,2}))?\s*\}\}/g;
const WHOLE_TOKEN = new RegExp(`^${TOKEN.source}$`);
/** A pair of double braces that starts with a letter: meant as a token, whether or not it is one. */
const LOOKS_LIKE_TOKEN = /\{\{\s*[A-Za-z](?:[^{}]|\{[^{}]*\})*\}\}/g;

/** A result as it is written in a text: five significant digits; a minimum or a maximum is a value of the data, so it keeps the digits it has. */
const shown = (value: number, id: ResultStat, digits: string | undefined): string =>
  digits !== undefined && id !== 'n' ? value.toFixed(Number(digits)) : id === 'min' || id === 'max' ? String(Number(value.toPrecision(15))) : formatResult(value, id === 'n' ? 'count' : 'number');

/**
 * The text with its tokens filled in, and what was wrong with the ones that could not be (each once): those stay as typed. A data set is
 * named as it is in the table or as it is called on the chart (`displayNames`), capitals ignored; a table with one data set needs no name.
 */
export function fillResultTokens(text: string, table: DataTable, displayNames: Readonly<Record<Id, string>> = {}, memo: Memo = new Map()): { text: string; problems: string[] } {
  if (!text.includes('{{')) return { text, problems: [] };
  const problems: string[] = [];
  const problem = (message: string) => {
    if (!problems.includes(message)) problems.push(message);
  };
  // In a table whose series have several columns (replicates, mean and SD) a data set is a series, not a column: named as the chart names it, and for
  // replicates its result is that of all its values. A series entered as mean, SD and N has no values to take a result from.
  const bySeries = usesSeriesBlocks(table.kind) && tableSeriesWidth(table) > 1;
  const series = bySeries ? xySeries(table) : [];
  const seriesNamed = (name: string, token: string) => {
    const wanted = name.trim().toLowerCase();
    const found = series.filter((s) => s.name.trim().toLowerCase() === wanted || (displayNames[s.id] ?? '').trim().toLowerCase() === wanted);
    if (found.length > 1) problem(`${found.length} data sets are called "${name.trim()}": the first is used (in ${token}).`);
    return found[0];
  };
  const named = (name: string, token: string) => {
    const wanted = name.trim().toLowerCase();
    const found = table.groups.filter((g) => g.name.trim().toLowerCase() === wanted || (displayNames[g.id] ?? '').trim().toLowerCase() === wanted);
    if (found.length > 1) problem(`${found.length} data sets are called "${name.trim()}": the first is used (in ${token}).`);
    return found[0];
  };
  const out = text.replace(TOKEN, (token, statName: string, rawName: string | undefined, digits: string | undefined) => {
    const stat = statOf(statName.toLowerCase());
    if (!stat) {
      problem(`"${statName}" is not a result: use ${STATS.slice(0, -1).map((s) => s.id).join(', ')} or ${STATS[STATS.length - 1].id} (in ${token}).`);
      return token;
    }
    const name = rawName?.trim() ?? '';
    if (bySeries) {
      const s = name === '' ? (series.length === 1 ? series[0] : undefined) : seriesNamed(name, token);
      if (!s) {
        problem(name === '' ? `Name a data set: ${token} needs one, for example {{${stat.id} ${series[0]?.name ?? 'Control'}}}.` : `No data set is called "${name}" (in ${token}).`);
        return token;
      }
      if (table.layout?.kind !== 'replicates') {
        problem(`"${s.name}" is entered as calculated values (not as replicates), so its ${stat.name} is not calculated from them (in ${token}).`);
        return token;
      }
      let d = memo.get(`series:${s.id}`);
      if (!d) {
        const kept = withoutExcluded(table).groups;
        d = describeValuesCached(s.columns.flatMap((c) => (kept.find((g) => g.id === c.id)?.observations ?? []).map((o) => o.value)));
        memo.set(`series:${s.id}`, d);
      }
      const pooled = stat.of(d);
      if (pooled === null || !Number.isFinite(pooled)) {
        problem(`The ${stat.name} of "${s.name}" cannot be calculated (in ${token}).`);
        return token;
      }
      return shown(pooled, stat.id, digits);
    }
    const group = name === '' ? (table.groups.length === 1 ? table.groups[0] : undefined) : named(name, token);
    if (!group) {
      problem(name === '' ? `Name a data set: ${token} needs one, for example {{${stat.id} ${table.groups[0]?.name ?? 'Control'}}}.` : `No data set is called "${name}" (in ${token}).`);
      return token;
    }
    const value = resultValue(table, group.id, stat.id, memo);
    if (value === null) {
      problem(`The ${stat.name} of "${group.name}" cannot be calculated (in ${token}).`);
      return token;
    }
    return shown(value, stat.id, digits);
  });
  // (b) A pair of braces that was meant as a token and is not one (a misplaced character, a missing space) stays as typed, and is said once.
  for (const m of text.matchAll(LOOKS_LIKE_TOKEN)) {
    if (!WHOLE_TOKEN.test(m[0])) problem(`${m[0]} is not a result token: write it like {{mean Control}} or {{sd Control|2}}.`);
  }
  return { text: out, problems };
}

/**
 * The chart as it is drawn: the annotations, the labels of the reference lines and the texts of the drawing objects with their tokens filled in, and a
 * reference line bound to a result put at it (one whose result is not available is left out, with a notice). The very same chart when
 * nothing in it is bound, so that its caches and the memoised drawing are not disturbed. The chart as written is never changed.
 */
export function resolveChartTokens(chart: Chart, table: DataTable): { chart: Chart; notices: string[] } {
  const bound = chart.referenceLines.some((l) => l.valueFrom !== undefined);
  const typed = chart.annotations.some((a) => a.text.includes('{{')) || chart.referenceLines.some((l) => l.label.includes('{{')) || (chart.drawings ?? []).some((d) => d.text?.includes('{{'));
  if (!bound && !typed) return { chart, notices: [] };
  const notices: string[] = [];
  const memo: Memo = new Map();
  const fill = (what: string, text: string) => {
    const r = fillResultTokens(text, table, chart.displayNames, memo);
    for (const p of r.problems) if (!notices.includes(`${what}: ${p}`)) notices.push(`${what}: ${p}`);
    return r.text;
  };
  const referenceLines = chart.referenceLines.flatMap((l) => {
    const label = l.showLabel ? fill('Label of a reference line', l.label) : l.label;
    if (!l.valueFrom) return [label === l.label ? l : { ...l, label }];
    const group = table.groups.find((g) => g.id === l.valueFrom?.groupId);
    const value = resultValue(table, l.valueFrom.groupId, l.valueFrom.stat, memo);
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
      ...(chart.drawings ? { drawings: chart.drawings.map((d) => (d.text?.includes('{{') ? { ...d, text: fill('Text of a shape', d.text) } : d)) } : {}),
    },
    notices,
  };
}
