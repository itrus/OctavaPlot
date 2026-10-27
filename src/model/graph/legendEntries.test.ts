import { describe, expect, it } from 'vitest';
import { createChart, createXyTable } from '../defaults';
import { xySeries } from '../table/tableLayout';
import type { Chart, Project } from '../types';
import { duplicateChart, setLegendColumns, setLegendItemVisible, setLegendOrder } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { buildXyModel } from '../../chart/xy/xyModel';
import { chartToSvgString } from '../../chart/export/export';
import { inheritChart } from './chartFormat';
import { syncLinks } from './chartLink';
import { legendColumns, legendEntries, sanitizeLegendLayout } from './legendEntries';

const base = { hiddenGroupIds: [] as string[] };

describe('legendEntries', () => {
  const ids = ['a', 'b', 'c'];
  it('is the series order when there is no order', () => {
    expect(legendEntries(base, ids)).toEqual([0, 1, 2]);
  });
  it('puts the listed ids first and the others after them in series order', () => {
    expect(legendEntries({ ...base, order: ['c'] }, ids)).toEqual([2, 0, 1]);
  });
  it('ignores ids that do not exist', () => {
    expect(legendEntries({ ...base, order: ['zzz', 'b'] }, ids)).toEqual([1, 0, 2]);
  });
  it('leaves hidden series out, whatever the order says', () => {
    expect(legendEntries({ hiddenGroupIds: ['b'], order: ['b', 'c'] }, ids)).toEqual([2, 0]);
  });
});

describe('legend layout from a file', () => {
  it('keeps a good order and a column count of 2 to 6', () => {
    expect(sanitizeLegendLayout({ order: ['a', 'a', 'b'], columns: 3 })).toEqual({ order: ['a', 'b'], columns: 3 });
  });
  it('drops what cannot be read and clamps the columns', () => {
    expect(sanitizeLegendLayout({ order: 'x', columns: 'many' })).toEqual({});
    expect(sanitizeLegendLayout({ order: [1, {}], columns: 1 })).toEqual({});
    expect(sanitizeLegendLayout({ columns: 99 })).toEqual({ columns: 6 });
    expect(sanitizeLegendLayout({ columns: -2 })).toEqual({});
  });
  it('reads one column when none is set', () => {
    expect(legendColumns({})).toBe(1);
    expect(legendColumns({ columns: 4 })).toBe(4);
    expect(legendColumns({ columns: 40 })).toBe(1);
  });
});

const setup = () => {
  const table = createXyTable('XY 1', true);
  const chart = createChart(table.id, undefined, 'xyLineSymbols');
  const [a, b] = xySeries(table).map((s) => s.id);
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { table, chart, p, a, b };
};
const chartOf = (p: Project): Chart => p.charts[0];

describe('legend order on a graph', () => {
  it('changes the entries and not the drawing order of the marks', () => {
    const { table, chart, p, a, b } = setup();
    const plain = buildXyModel(chart, table);
    const next = chartOf(setLegendOrder(chart.id, [b, a])(p));
    const m = buildXyModel(next, table);
    expect(m.layout.legend!.items.map((i) => i.label)).toEqual(['Series B', 'Series A']);
    expect(plain.layout.legend!.items.map((i) => i.label)).toEqual(['Series A', 'Series B']);
    expect(m.series.map((s) => s.label)).toEqual(plain.series.map((s) => s.label));
    expect(m.legendSeries.map((i) => m.series[i].label)).toEqual(['Series B', 'Series A']);
  });
  it('reset puts the entries back, and the file keeps nothing', () => {
    const { chart, p, a, b } = setup();
    const ordered = setLegendOrder(chart.id, [b, a])(p);
    const reset = chartOf(setLegendOrder(chart.id, [])(ordered));
    expect(reset.legend).toEqual(chart.legend);
    expect('order' in reset.legend).toBe(false);
  });
  it('keeps a hidden series hidden, and an id that is gone is ignored', () => {
    const { table, chart, p, a, b } = setup();
    const hid = setLegendItemVisible(chart.id, a, false)(setLegendOrder(chart.id, ['gone', a, b])(p));
    const m = buildXyModel(chartOf(hid), table);
    expect(m.layout.legend!.items.map((i) => i.label)).toEqual(['Series B']);
  });
  it('survives a round trip of the file', () => {
    const { chart, p, a, b } = setup();
    const set = setLegendColumns(chart.id, 2)(setLegendOrder(chart.id, [b, a])(p));
    const back = parseProject(stringifyProject(set));
    expect(chartOf(back).legend.order).toEqual([b, a]);
    expect(chartOf(back).legend.columns).toBe(2);
  });
  it('adds no new fields to an old file', () => {
    const { p } = setup();
    const back = parseProject(stringifyProject(p));
    expect(Object.keys(chartOf(back).legend).sort()).toEqual(['fontSizePt', 'hiddenGroupIds', 'keyShape', 'position', 'visible']);
  });
  it('is read safely from a damaged file', () => {
    const { p } = setup();
    const raw = JSON.parse(stringifyProject(p));
    const c = raw.project?.charts?.[0] ?? raw.charts?.[0];
    c.legend.order = 'nope';
    c.legend.columns = 'wide';
    const back = parseProject(JSON.stringify(raw));
    expect(chartOf(back).legend.order).toBeUndefined();
    expect(chartOf(back).legend.columns).toBeUndefined();
  });
  it('is kept when a graph is duplicated', () => {
    const { chart, p, a, b } = setup();
    const copy = duplicateChart(chart.id, 'copy')(setLegendOrder(chart.id, [b, a])(p)).charts[1];
    expect(copy.legend.order).toEqual([b, a]);
  });
  it('is not inherited by a graph made like another, but the columns are', () => {
    const { table, chart, p, a, b } = setup();
    const source = chartOf(setLegendColumns(chart.id, 3)(setLegendOrder(chart.id, [b, a])(p)));
    const made = inheritChart(source, table, createXyTable('XY 2', true), 'new');
    expect(made.legend.order).toBeUndefined();
    expect(made.legend.columns).toBe(3);
  });
  it('is not followed by a linked graph, but the columns are', () => {
    const { table, chart, p, a, b } = setup();
    const child: Chart = { ...inheritChart(chart, table, table, 'child'), linkedTo: chart.id };
    const before: Project = { ...p, charts: [chart, child] };
    const after = setLegendColumns(chart.id, 2)(setLegendOrder(chart.id, [b, a])(before));
    const synced = syncLinks(before, after);
    const kid = synced.charts.find((c) => c.id === 'child')!;
    expect(kid.legend.order).toBeUndefined();
    expect(kid.legend.columns).toBe(2);
  });
  it('is drawn in the exported SVG in the new order', () => {
    const { table, chart, p, a, b } = setup();
    const svg = chartToSvgString(chartOf(setLegendOrder(chart.id, [b, a])(p)), table);
    expect(svg.indexOf('Series B')).toBeLessThan(svg.indexOf('Series A'));
  });
});
