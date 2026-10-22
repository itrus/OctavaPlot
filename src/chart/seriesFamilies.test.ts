import { describe, expect, it } from 'vitest';
import { CHART_TYPES, chartFamily, chartTypesFor } from '../model/chartTypes';
import { createChart, createExampleProject } from '../model/defaults';
import { xySeries } from '../model/tableLayout';
import type { ChartType, Project, TableKind } from '../model/types';
import { addChart, addDataTable, addGroup, pasteMatrix, removeSeries, renameSeries, replaceTableData, setCells } from '../state/commands';
import { parseProject, parseProjectWithNotes, stringifyProject } from '../state/serialize';
import { buildAnyModel } from './anyModel';
import { chartToSvgString } from './export';
import { buildGroupedModel } from './groupedModel';
import { buildSurvivalModel, kaplanMeier } from './survivalModel';

/** A project with one table of the kind (with sample data) and one chart of the type. */
function projectWith(kind: TableKind, type: ChartType, layout?: Parameters<typeof addDataTable>[2]): Project {
  const p = addDataTable('t', kind, { sample: true, ...layout })(createExampleProject());
  return addChart('c', 't', undefined, type)(p);
}
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;

describe('catalogue', () => {
  it('every table kind has chart types, and every chart type belongs to one table kind', () => {
    for (const kind of ['column', 'xy', 'grouped', 'contingency', 'survival'] as const) expect(chartTypesFor(kind).length).toBeGreaterThan(0);
    expect(new Set(CHART_TYPES.map((c) => c.type)).size).toBe(CHART_TYPES.length);
    expect(chartFamily('groupedBar')).toBe('grouped');
    expect(chartFamily('contingencyPercent')).toBe('grouped');
    expect(chartFamily('survival')).toBe('survival');
    expect(chartFamily('bar')).toBe('category');
  });
});

describe('Kaplan-Meier', () => {
  const subj = (rows: Array<[number, boolean]>) => rows.map(([time, event], row) => ({ time, event, row }));

  it('steps down at each event by the fraction of those at risk', () => {
    const km = kaplanMeier(subj([[1, true], [2, true], [3, true], [4, true]]));
    expect(km.steps.map((s) => s.survival)).toEqual([0.75, 0.5, 0.25, 0]);
    expect(km.n).toBe(4);
    expect(km.events).toBe(4);
  });

  it('a censored subject leaves the risk set without a drop, and is marked on the curve', () => {
    const km = kaplanMeier(subj([[2, true], [3, false], [5, true]]));
    expect(km.steps.map((s) => [s.time, s.atRisk])).toEqual([[2, 3], [5, 1]]);
    expect(km.steps[0].survival).toBeCloseTo(2 / 3, 12);
    expect(km.steps[1].survival).toBe(0);
    expect(km.marks).toHaveLength(1);
    expect(km.marks[0]).toMatchObject({ time: 3, row: 1 });
    expect(km.marks[0].survival).toBeCloseTo(2 / 3, 12);
  });

  it('counts events before censoring at a tied time, and handles tied events together', () => {
    const km = kaplanMeier(subj([[5, true], [5, false], [5, true], [8, true]]));
    expect(km.steps[0]).toMatchObject({ time: 5, atRisk: 4, events: 2, survival: 0.5 });
    expect(km.marks).toEqual([{ time: 5, survival: 0.5, row: 1 }]);
    expect(km.steps[1]).toMatchObject({ time: 8, atRisk: 1, survival: 0 });
  });

  it('has no steps when nobody has the event', () => {
    const km = kaplanMeier(subj([[2, false], [4, false]]));
    expect(km.steps).toEqual([]);
    expect(km.marks.map((m) => m.survival)).toEqual([1, 1]);
  });
});

describe('survival chart', () => {
  it('makes one curve per group from a subject-per-row table', () => {
    const p = projectWith('survival', 'survival');
    const t = tableOf(p);
    expect(t.groups.map((g) => g.name)).toEqual(['Time', 'Group A', 'Group B']);
    const m = buildSurvivalModel(chartOf(p), t);
    expect(m.series.map((s) => s.label)).toEqual(['Group A', 'Group B']);
    expect(m.series[0].linePath.startsWith('M')).toBe(true);
    // The sample has two censored subjects per group.
    expect(m.series[0].points).toHaveLength(2);
    expect(m.y.domain).toEqual([0, 1]);
    expect(m.x.domain[0]).toBe(0);
  });

  it('the cumulative-event curve is one minus the survival curve', () => {
    const p = projectWith('survival', 'survival');
    const q = projectWith('survival', 'cumulativeEvent');
    const s = buildSurvivalModel(chartOf(p), tableOf(p));
    const c = buildSurvivalModel(chartOf(q), tableOf(q));
    const surv = s.series[0].points[0];
    const cum = c.series[0].points.find((x) => x.row === surv.row)!;
    expect(cum.y).toBeCloseTo(1 - surv.y, 12);
  });

  it('ignores entries that are neither 0 nor 1, and subjects without a time, and says so', () => {
    const p = projectWith('survival', 'survival');
    const t = tableOf(p);
    const edited = setCells(t.id, [{ row: 0, col: 1, value: 2 }, { row: 1, col: 0, value: null }])(p).dataTables.find((x) => x.id === 't')!;
    const m = buildSurvivalModel(chartOf(p), edited);
    expect(m.warnings.join(' ')).toMatch(/neither 1/);
    expect(m.warnings.join(' ')).toMatch(/no valid time/);
  });

  it('is exported as a vector SVG', () => {
    const p = projectWith('survival', 'survival');
    const svg = chartToSvgString(chartOf(p), tableOf(p));
    expect(svg).not.toContain('data-');
    expect(svg).toContain('V');
  });
});

describe('grouped chart', () => {
  it('has a category for each row that holds something, and one series per group', () => {
    const p = projectWith('grouped', 'groupedBar');
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(m.categories.map((c) => c.label)).toEqual(['Male', 'Female']);
    expect(m.series.map((s) => s.label)).toEqual(['Group A', 'Group B']);
    expect(m.series[0].bars).toHaveLength(2);
    // Bars of one cluster sit side by side, left to right in series order.
    expect(m.series[1].bars[0].x).toBeGreaterThan(m.series[0].bars[0].x);
    expect(m.series[0].bars[0].x + m.series[0].bars[0].width).toBeCloseTo(m.series[1].bars[0].x, 6);
    // A bar's height matches its value on the axis.
    const b = m.series[0].bars[0];
    expect(m.yScale(0) - m.yScale(b.value)).toBeCloseTo(b.height, 6);
    expect(m.y.domain[0]).toBe(0);
  });

  it('bars of replicates are drawn at the mean with an SD error bar', () => {
    const p = projectWith('grouped', 'groupedBar', { layout: { kind: 'replicates', n: 3 } });
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(xySeries(tableOf(p))[0].columns).toHaveLength(3);
    expect(m.series[0].errorPath).not.toBe('');
    expect(m.series[0].errorMeaning).toBe('SD');
    expect(m.series[0].bars[0].stats!.n).toBe(3);
  });

  it('bars of entered mean and error are drawn as entered', () => {
    const p = projectWith('grouped', 'groupedBar', { layout: { kind: 'summary', format: 'mean-sem-n' } });
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(m.series[0].errorMeaning).toBe('SEM (as entered)');
    expect(m.series[0].bars[0].value).toBeCloseTo(4.2, 9);
  });

  it('lines over categories join the means of a series', () => {
    const p = projectWith('grouped', 'groupedLine');
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(m.asLines).toBe(true);
    expect(m.series[0].points).toHaveLength(2);
    expect(m.series[0].linePath).toMatch(/^M[\d.]+,[\d.]+L/);
    expect(m.series[0].bars).toHaveLength(0);
  });

  it('a category with no value in a series is left out for that series only', () => {
    const p = projectWith('grouped', 'groupedBar');
    const t = tableOf(p);
    const edited = setCells(t.id, [{ row: 1, col: 1, value: null }])(p).dataTables.find((x) => x.id === 't')!;
    const m = buildGroupedModel(chartOf(p), edited);
    expect(m.series[1].bars.map((b) => b.row)).toEqual([0]);
    expect(m.series[0].bars.map((b) => b.row)).toEqual([0, 1]);
  });
});

describe('contingency chart', () => {
  it('groups of subjects are the categories and outcomes the series', () => {
    const p = projectWith('contingency', 'contingencyBars');
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(m.categories.map((c) => c.label)).toEqual(['Treated', 'Control']);
    expect(m.series.map((s) => s.label)).toEqual(['Cured', 'Not cured']);
    expect(m.series[0].bars.map((b) => b.value)).toEqual([38, 21]);
    expect(m.series[0].errorPath).toBe('');
  });

  it('stacked bars stack the counts, and the axis fits the totals', () => {
    const p = projectWith('contingency', 'contingencyStacked');
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    const [cured, not] = m.series;
    // The second outcome starts where the first ends.
    expect(not.bars[0].y + not.bars[0].height).toBeCloseTo(cured.bars[0].y, 6);
    expect(m.y.domain[1]).toBeGreaterThanOrEqual(50);
  });

  it('percent bars show each row as a share of its own total, 0 to 100', () => {
    const p = projectWith('contingency', 'contingencyPercent');
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(m.y.domain).toEqual([0, 100]);
    expect(m.series[0].bars[0].value).toBeCloseTo(76, 9); // 38 of 50
    expect(m.series[0].bars[0].count).toBe(38);
    expect(m.series[1].bars[1].value).toBeCloseTo(58, 9); // 29 of 50
  });

  it('a negative count is not drawn and is reported', () => {
    const p = projectWith('contingency', 'contingencyBars');
    const edited = setCells('t', [{ row: 0, col: 0, value: -3 }])(p).dataTables.find((x) => x.id === 't')!;
    const m = buildGroupedModel(chartOf(p), edited);
    expect(m.series[0].bars.map((b) => b.row)).toEqual([1]);
    expect(m.warnings.join(' ')).toMatch(/negative/);
  });
});

describe('every chart type draws and exports', () => {
  const cases: Array<[TableKind, ChartType]> = CHART_TYPES.filter((c) => c.tableKind !== 'column').map((c) => [c.tableKind, c.type]);
  it.each(cases)('%s table: %s', (kind, type) => {
    const p = projectWith(kind, type);
    const any = buildAnyModel(chartOf(p), tableOf(p));
    expect(any.family).toBe(chartFamily(type));
    const svg = chartToSvgString(chartOf(p), tableOf(p));
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).not.toContain('data-');
    expect(svg).toContain('<rect');
  });

  it('an empty table of each kind draws without error', () => {
    for (const [kind, type] of cases) {
      const p = addChart('c', 't', undefined, type)(addDataTable('t', kind)(createExampleProject()));
      expect(() => chartToSvgString(p.charts.find((c) => c.id === 'c')!, p.dataTables.find((t) => t.id === 't')!)).not.toThrow();
    }
  });
});

describe('creating and saving the new tables', () => {
  it('names new tables by kind and adds series with the kind\'s names', () => {
    let p = createExampleProject();
    p = addDataTable('s', 'survival')(p);
    p = addDataTable('g', 'grouped')(p);
    p = addDataTable('k', 'contingency')(p);
    expect(p.dataTables.map((t) => t.name)).toEqual(['Data 1', 'Survival 1', 'Grouped 1', 'Contingency 1']);
    p = addGroup('s')(p);
    p = addGroup('k')(p);
    expect(p.dataTables.find((t) => t.id === 's')!.groups.map((g) => g.name)).toEqual(['Time', 'Group A', 'Group B', 'Group C']);
    expect(p.dataTables.find((t) => t.id === 'k')!.groups.map((g) => g.name)).toEqual(['Cured', 'Not cured', 'Outcome 3']);
  });

  it('a graph made from a table takes that table\'s first chart type', () => {
    for (const kind of ['grouped', 'contingency', 'survival'] as const) {
      const p = addChart('c', 't')(addDataTable('t', kind)(createExampleProject()));
      expect(chartOf(p).type).toBe(chartTypesFor(kind)[0].type);
    }
  });

  it('round-trips every table and chart kind through a saved file', () => {
    for (const [kind, type] of CHART_TYPES.filter((c) => c.tableKind !== 'column').map((c) => [c.tableKind, c.type] as const)) {
      const p = projectWith(kind, type);
      const back = parseProject(stringifyProject(p));
      expect(back.dataTables.find((t) => t.id === 't')!.kind).toBe(kind);
      expect(back.charts.find((c) => c.id === 'c')!.type).toBe(type);
    }
  });

  it('repairs a chart type that does not suit the new table kinds, with a note', () => {
    const p = projectWith('grouped', 'groupedBar');
    const file = JSON.parse(stringifyProject(p));
    file.project.charts.find((c: { id: string }) => c.id === 'c').type = 'survival';
    const { project, notes } = parseProjectWithNotes(JSON.stringify(file));
    expect(project.charts.find((c) => c.id === 'c')!.type).toBe('groupedBar');
    expect(notes.join(' ')).toMatch(/changed to groupedBar/);
  });

  it('a new chart of these types starts with sensible titles', () => {
    expect(createChart('t', undefined, 'survival').yAxis.title).toBe('Fraction surviving');
    expect(createChart('t', undefined, 'cumulativeEvent').xAxis.title).toBe('Time');
    expect(createChart('t', undefined, 'contingencyPercent').yAxis.title).toBe('Percent');
    expect(createChart('t', undefined, 'groupedBar').layers[0].summary.spread).toBe('sd');
  });
});

describe('block tables stay whole', () => {
  const table = (p: Project) => p.dataTables.find((t) => t.id === 't')!;

  it('pasting past the last column adds whole series, so the project still reloads', () => {
    let p = addDataTable('t', 'xy', { layout: { kind: 'replicates', n: 3 }, sample: true })(createExampleProject());
    // X + 2 series x 3 columns = 7; an 8-value row pasted at column 0 needs 8 columns: a third series is added whole.
    p = pasteMatrix('t', 0, 0, [[1, 2, 3, 4, 5, 6, 7, 8]])(p);
    expect(table(p).groups).toHaveLength(1 + 3 * 3);
    expect(xySeries(table(p)).every((s) => s.columns.length === 3)).toBe(true);
    expect(xySeries(table(p)).map((s) => s.name)).toEqual(['Series A', 'Series B', 'Series C']);
    expect(() => parseProject(stringifyProject(p))).not.toThrow();
  });

  it('importing a CSV keeps the series names and sub-column headings of the table', () => {
    let p = addDataTable('t', 'grouped', { layout: { kind: 'replicates', n: 2 }, sample: true })(createExampleProject());
    p = renameSeries('t', xySeries(table(p))[0].id, 'Drug')(p);
    const data = { names: ['a', 'b', 'c', 'd'], titles: ['Male', 'Female'], values: [[1, 2, 3, 4], [5, 6, 7, 8]] };
    const q = replaceTableData('t', data)(p);
    expect(xySeries(table(q)).map((s) => s.name)).toEqual(['Drug', 'Group B']);
    expect(table(q).groups.map((g) => g.name)).toEqual(['Y1', 'Y2', 'Y1', 'Y2']);
    expect(() => parseProject(stringifyProject(q))).not.toThrow();
  });

  it('adding a series after removing one never repeats a name', () => {
    let p = addDataTable('t', 'grouped', { layout: { kind: 'replicates', n: 2 }, sample: true })(createExampleProject());
    p = removeSeries('t', xySeries(table(p))[0].id)(p);
    p = addGroup('t')(p);
    const names = xySeries(table(p)).map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('a new column table has as many columns as the first one (at least four)', () => {
    let p = createExampleProject();
    p = addGroup(p.dataTables[0].id)(addGroup(p.dataTables[0].id)(p));
    p = addDataTable('n', 'column')(p);
    expect(p.dataTables.find((t) => t.id === 'n')!.groups).toHaveLength(6);
  });

  it('a grouped chart reports rows whose error cannot be drawn', () => {
    const p = projectWith('grouped', 'groupedBar', { layout: { kind: 'summary', format: 'mean-sd' } });
    const edited = setCells('t', [{ row: 0, col: 1, value: -1 }])(p).dataTables.find((x) => x.id === 't')!;
    const m = buildGroupedModel(chartOf(p), edited);
    expect(m.warnings.join(' ')).toMatch(/No error bar for 1 value/);
  });
});
