import { describe, expect, it } from 'vitest';
import { createChart, createXyTable } from '../model/defaults';
import { CHART_TYPES, chartTypesFor } from '../model/chartTypes';
import { effectiveTable, graphSources } from '../model/chartTable';
import type { Chart, ChartType, DataTable, Project } from '../model/types';
import { addChart, addDataTable, addGroup, applyPalette, setCells, setChartType, setGroupOnGraph } from '../state/commands';
import { createExampleProject } from '../model/defaults';
import { paletteById } from '../model/palettes';
import { parseProject, parseProjectWithNotes, stringifyProject } from '../state/serialize';
import { chartToSvgString } from './export';
import { buildXyModel } from './xyModel';

const project = (type: ChartType): { p: Project; table: DataTable; chart: Chart } => {
  const table = createXyTable('XY 1', true);
  const chart = createChart(table.id, undefined, type);
  return { p: { id: 'p', name: 'p', dataTables: [table], charts: [chart] }, table, chart };
};

describe('chart types and table types', () => {
  it('offers the chart types of each table type', () => {
    expect(chartTypesFor('column').map((c) => c.type)).toEqual(['bar', 'scatter', 'mean']);
    expect(chartTypesFor('xy').map((c) => c.type)).toEqual(['xyScatter', 'xyLine', 'xyLineSymbols']);
    expect(CHART_TYPES).toHaveLength(13);
  });
  it('the presets decide symbols and lines', () => {
    const s = (t: ChartType) => createChart('t', undefined, t).layers[0].style;
    expect([s('xyScatter').showSymbols, s('xyScatter').showLines]).toEqual([true, false]);
    expect([s('xyLine').showSymbols, s('xyLine').showLines]).toEqual([false, true]);
    expect([s('xyLineSymbols').showSymbols, s('xyLineSymbols').showLines]).toEqual([true, true]);
  });
});

describe('XY model', () => {
  it('takes X from the first column and one series from each other column', () => {
    const { chart, table } = project('xyLineSymbols');
    const m = buildXyModel(chart, table);
    expect(m.series.map((s) => s.label)).toEqual(['Series A', 'Series B']);
    expect(m.series[0].points).toHaveLength(8);
    expect(m.series[0].points[2]).toMatchObject({ x: 3, y: 2.9 });
    // Series are coloured from the palette, symbols and line alike.
    expect(m.series[0].style.symbolColor).toBe(m.series[0].style.lineColor);
    expect(m.series[0].style.symbolColor).not.toBe(m.series[1].style.symbolColor);
  });

  it('maps data to the plotting region with a numeric X scale', () => {
    const { chart, table } = project('xyScatter');
    const m = buildXyModel(chart, table);
    const { plot } = m.layout;
    const first = m.series[0].points[0];
    const last = m.series[0].points[7];
    expect(first.px).toBeGreaterThan(plot.x);
    expect(last.px).toBeLessThan(plot.x + plot.width);
    expect(last.px).toBeGreaterThan(first.px);
    expect(m.xScale(m.x.domain[0])).toBeCloseTo(plot.x, 6);
    expect(m.yScale(m.y.domain[0])).toBeCloseTo(plot.y + plot.height, 6);
  });

  it('includes zero when the data starts near it, and fits the data when it does not', () => {
    const { chart, table } = project('xyScatter');
    const near = buildXyModel(chart, table);
    expect(near.y.domain[0]).toBe(0);
    expect(near.x.domain[0]).toBe(0);
    const far = setCells(table.id, table.groups[0].observations.map((_, row) => ({ row, col: 0, value: row < 8 ? 1000 + row : null })))({ id: 'p', name: 'p', dataTables: [table], charts: [chart] }).dataTables[0];
    expect(buildXyModel(chart, far).x.domain[0]).toBeGreaterThan(900);
  });

  it('breaks the line at a missing Y and does not draw the row', () => {
    const { p, table, chart } = project('xyLine');
    const edited = setCells(table.id, [{ row: 3, col: 1, value: null }])(p).dataTables[0];
    const m = buildXyModel(chart, edited);
    expect(m.series[0].points).toHaveLength(7);
    expect(m.series[0].linePath.match(/M/g)).toHaveLength(2);
    expect(m.series[0].skipped).toBe(1);
    expect(m.warnings.join(' ')).toMatch(/not drawn/);
  });

  it('respects manual axis limits for X as well as Y', () => {
    const { chart, table } = project('xyLine');
    const m = buildXyModel({ ...chart, xAxis: { ...chart.xAxis, min: 0, max: 20 }, yAxis: { ...chart.yAxis, min: -5, max: 25 } }, table);
    expect(m.x.domain).toEqual([0, 20]);
    expect(m.y.domain).toEqual([-5, 25]);
  });

  it('refuses a column-table chart type', () => {
    const { chart, table } = project('bar');
    expect(() => buildXyModel(chart, table)).toThrow();
  });
});

describe('XY series on a graph', () => {
  it('lists only the Y series and can switch one off without losing X', () => {
    const { p, chart, table } = project('xyLine');
    expect(graphSources(p, chart).map((s) => s.group.name)).toEqual(['Series A', 'Series B']);
    const hidden = setGroupOnGraph(chart.id, table.id, table.groups[1].id, false)(p);
    const t = effectiveTable(hidden, hidden.charts[0])!;
    expect(t.groups.map((g) => g.name)).toEqual(['X', 'Series B']);
    expect(buildXyModel(hidden.charts[0], t).series).toHaveLength(1);
  });
});

describe('XY export', () => {
  it('is a vector SVG with the lines and symbols and no editor attributes', () => {
    const { chart, table } = project('xyLineSymbols');
    const svg = chartToSvgString(chart, table);
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).not.toContain('data-');
    // 16 data symbols plus one legend key symbol per series.
    expect((svg.match(/<path d="M[\d.]+,[\d.]+a/g) ?? []).length).toBe(18);
    expect(svg).toContain('stroke-linecap="round"');
  });
});

describe('creating XY tables and graphs', () => {
  it('makes an XY table with an X column and Y series, and adds series by name', () => {
    let p = createExampleProject();
    p = addDataTable('t2', 'xy')(p);
    const t = p.dataTables.find((x) => x.id === 't2')!;
    expect(t.kind).toBe('xy');
    expect(t.groups.map((g) => g.name)).toEqual(['X', 'Series A', 'Series B']);
    p = addGroup('t2')(p);
    expect(p.dataTables.find((x) => x.id === 't2')!.groups.map((g) => g.name)).toEqual(['X', 'Series A', 'Series B', 'Series C']);
    // A column table is still made by default, with the same groups as before.
    expect(addDataTable('t3')(p).dataTables.find((x) => x.id === 't3')!.kind).toBe('column');
  });

  it('a graph of an XY table starts as an XY scatter and takes the chosen chart type', () => {
    let p = addDataTable('t2', 'xy')(createExampleProject());
    p = addChart('c2', 't2')(p);
    expect(p.charts.find((c) => c.id === 'c2')!.type).toBe('xyScatter');
    p = addChart('c3', 't2', undefined, 'xyLineSymbols')(p);
    const c3 = p.charts.find((c) => c.id === 'c3')!;
    expect([c3.type, c3.layers[0].style.showLines, c3.layers[0].style.showSymbols]).toEqual(['xyLineSymbols', true, true]);
    expect(c3.xAxis.title).toBe('X');
  });

  it('colours the Y series in order, leaving the X column out', () => {
    const { p, chart } = project('xyLineSymbols');
    const q = applyPalette(chart.id, paletteById('vibrant')!)(p);
    const m = buildXyModel(q.charts[0], q.dataTables[0]);
    expect(m.series.map((s) => s.style.lineColor)).toEqual(['#e6194b', '#3cb44b']);
    expect(m.series.map((s) => s.style.symbolColor)).toEqual(['#e6194b', '#3cb44b']);
  });

  it('survives saving and loading, and older files without a table type are column tables', () => {
    const { p } = project('xyLine');
    const back = parseProject(stringifyProject(p));
    expect(back.dataTables[0].kind).toBe('xy');
    expect(back.charts[0].type).toBe('xyLine');
    const file = JSON.parse(stringifyProject(createExampleProject()));
    delete file.project.dataTables[0].kind;
    expect(parseProject(JSON.stringify(file)).dataTables[0].kind).toBe('column');
  });
});

describe('chart type and table type must agree', () => {
  it('addChart and setChartType ignore a chart type that does not suit the table', () => {
    const { p, table } = project('xyLine');
    const q = addChart('c9', table.id, undefined, 'bar')(p);
    expect(q.charts.find((c) => c.id === 'c9')!.type).toBe('xyScatter');
    const r = setChartType(p.charts[0].id, 'mean')(p);
    expect(r.charts[0].type).toBe('xyLine');
    expect(setChartType(p.charts[0].id, 'xyScatter')(p).charts[0].type).toBe('xyScatter');
  });

  it('a file whose chart type does not suit its table is repaired on load, with a note', () => {
    const { p } = project('xyLine');
    const file = JSON.parse(stringifyProject(p));
    file.project.charts[0].type = 'bar';
    const { project: back, notes } = parseProjectWithNotes(JSON.stringify(file));
    expect(back.charts[0].type).toBe('xyScatter');
    expect(back.charts[0].layers[0].style.showSymbols).toBe(true);
    expect(notes.join(' ')).toMatch(/changed to xyScatter/);
    // and the reverse: an XY chart type on a column table
    const q = createExampleProject();
    const f2 = JSON.parse(stringifyProject(q));
    f2.project.charts[0].type = 'xyLine';
    expect(parseProject(JSON.stringify(f2)).charts[0].type).toBe('bar');
  });
});
