import { describe, expect, it } from 'vitest';
import { buildGroupedModel } from '../chart/grouped/groupedModel';
import { buildPieModel } from '../chart/pie/pieModel';
import { buildXyModel } from '../chart/xy/xyModel';
import { createEmptyProject } from '../model/defaults';
import { xySeries } from '../model/table/tableLayout';
import type { ChartType, Project, TableKind } from '../model/types';
import { addChart, addDataTable, addGroup, changeTableKind, removeGroup, removeSeries } from './commands';
import { parseProject, stringifyProject } from './serialize';

/** A project with one table of the kind (with its sample data) and one graph of the type over it. */
const make = (kind: TableKind, type: ChartType): Project => addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true })(createEmptyProject()));
const table = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chart = (p: Project, id = 'c') => p.charts.find((c) => c.id === id)!;
const colours = {
  xy: (p: Project) => buildXyModel(chart(p), table(p)).series.map((s) => s.style.barFill),
  grouped: (p: Project) => buildGroupedModel(chart(p), table(p)).series.map((s) => s.style.barFill),
  pie: (p: Project) => buildPieModel(chart(p, 'pie'), table(p)).parts.map((x) => x.style.barFill),
};
const firstSeries = (p: Project) => xySeries(table(p))[0].id;

describe('the colour of a series stays with it when another series is removed', () => {
  it('in an XY graph: the series that are left keep the colours they had', () => {
    let p = make('xy', 'xyScatter');
    p = addGroup('t')(p);
    const before = colours.xy(p);
    expect(before.length).toBeGreaterThanOrEqual(3);
    p = removeSeries('t', firstSeries(p))(p);
    expect(colours.xy(p)).toEqual(before.slice(1));
    // The next series added takes a colour no series has.
    const after = colours.xy(addGroup('t')(p));
    expect(new Set(after).size).toBe(after.length);
  });

  it('in a grouped graph', () => {
    const p = make('grouped', 'groupedBar');
    const before = colours.grouped(p);
    expect(before.length).toBeGreaterThanOrEqual(2);
    expect(colours.grouped(removeSeries('t', firstSeries(p))(p))).toEqual(before.slice(1));
  });

  it('in a contingency table the pie and the bars colour an outcome alike, before and after the first outcome is removed', () => {
    let bars = make('contingency', 'contingencyBars');
    bars = addChart('pie', 't', undefined, 'pie')(bars);
    expect(colours.grouped(bars)).toEqual(colours.pie(bars));
    const after = removeGroup('t', table(bars).groups[0].id)(bars);
    expect(colours.pie(after)).toEqual(colours.pie(bars).slice(1));
    expect(colours.grouped(after)).toEqual(colours.pie(after));
  });

  it('survives a change of the way the series are entered, a copy and a file', () => {
    let p = make('xy', 'xyScatter');
    p = addGroup('t')(p);
    p = removeSeries('t', firstSeries(p))(p);
    const before = colours.xy(p);
    const replicates = changeTableKind('t', 'xy', { kind: 'replicates', n: 3 })(p);
    // The columns are read in series of three now, so there is one series: it is the first of the two, in the colour it had.
    expect(colours.xy(replicates)).toEqual(before.slice(0, 1));
    expect(colours.xy(parseProject(stringifyProject(p)))).toEqual(before);
  });

  it('is what an older file does without slots: the series are coloured by their places, until one is removed', () => {
    const p = make('xy', 'xyScatter');
    const raw = JSON.parse(stringifyProject(p));
    expect(raw.project.dataTables[0].groups.some((g: { slot?: number }) => g.slot !== undefined)).toBe(false);
    expect(colours.xy(parseProject(JSON.stringify(raw)))).toEqual(colours.xy(p));
  });
});
