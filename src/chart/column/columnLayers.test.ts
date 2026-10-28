import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { Chart, ChartType, Id, Project } from '../../model/types';
import { addAnnotation, addReferenceLine, moveLayer, patchLayerStyle, setLayerHidden } from '../../state/commands';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { chartToSvgString } from '../export/export';
import { buildColumnModel } from './columnModel';
import type { SceneElement } from '../shared/scene/sceneElement';

const table = createColumnTable('Column', true, 3);
const chartOf = (type: ChartType, patch: Partial<Chart> = {}): Chart => {
  const c = createChart(table.id, undefined, type);
  return { ...c, ...patch, layers: c.layers.map((l, i) => (i === 0 ? { ...l, summary: { ...l.summary, spread: 'sd' as const }, style: { ...l.style, showErrorBars: true, showMeanLine: true, showSymbols: true, showLines: true } } : l)) };
};
const project = (chart: Chart): Project => ({ id: 'p', name: 'p', dataTables: [table], charts: [chart] });
const kinds = (chart: Chart) => [...new Set(layersOf(chart, table).map((l) => l.kind))];
const hitKinds = (nodes: ReadonlyArray<SceneElement>): string[] => nodes.flatMap((n) => [...(n.hit ? [n.hit.kind] : []), ...hitKinds(n.children ?? [])]);
const marksOf = (chart: Chart) => buildColumnModel(chart, table).scene!.marks![0].children!;
const svg = (chart: Chart, editor = false) => (editor ? renderToStaticMarkup(createElement(ChartCanvas, { chart, any: buildAnyModel(chart, table), cssWidth: '600px', cssHeight: '400px', editor: { selection: { kind: 'chart' as const } } })) : chartToSvgString(chart, table));
const idOf = (chart: Chart, kind: string, at = 0): Id => layersOf(chart, table).filter((l) => l.kind === kind)[at].id;

describe('the layers of a column chart', () => {
  it.each([
    ['bar', ['bars', 'errorBars', 'points']],
    ['scatter', ['bars', 'errorBars', 'meanLine', 'points']],
    ['mean', ['bars', 'line', 'errorBars', 'points']],
    ['paired', ['bars', 'pairLines', 'errorBars', 'meanLine', 'points']],
    ['box', ['bars', 'distribution', 'points']],
    ['floating', ['bars', 'distribution', 'points']],
    ['violin', ['distribution', 'points']],
  ] as const)('are the parts of a %s chart', (type, expected) => {
    expect(kinds(chartOf(type)).sort()).toEqual([...expected].sort());
  });

  it('have one layer of each kind for each data set, bound to it, and unique ids', () => {
    const chart = chartOf('bar');
    const ls = layersOf(chart, table);
    expect(new Set(ls.map((l) => l.id)).size).toBe(ls.length);
    const points = ls.filter((l) => l.kind === 'points');
    expect(points.map((l) => l.binding?.seriesId)).toEqual(table.groups.map((g) => g.id));
    expect(points.every((l) => l.binding?.tableId === table.id)).toBe(true);
    // A line joining the means goes from a data set to the next: one fewer than the data sets.
    expect(layersOf(chartOf('mean'), table).filter((l) => l.kind === 'line')).toHaveLength(table.groups.length - 1);
  });

  it.each(['auto', 'onTop', 'underneath'] as const)('are in the order the chart draws them: lines %s', (lineOrder) => {
    const chart = chartOf('paired', { lineOrder });
    const order = layersOf(chart, table).map((l) => l.kind);
    const first = (k: string) => order.indexOf(k as never);
    if (lineOrder === 'auto') expect([first('bars'), first('pairLines'), first('points')]).toEqual([...[first('bars'), first('pairLines'), first('points')]].sort((a, b) => a - b));
    if (lineOrder === 'onTop') expect(first('points')).toBeLessThan(first('pairLines'));
    if (lineOrder === 'underneath') expect(first('pairLines')).toBeLessThan(first('bars'));
    expect(layersOf(chart, table).map((l) => l.z)).toEqual(order.map((_, i) => i));
  });

  it('draw the marks in the order of the layers', () => {
    const chart = chartOf('bar');
    const order = hitKinds(marksOf(chart));
    expect(order.indexOf('bar')).toBeLessThan(order.indexOf('error'));
    expect(order.indexOf('error')).toBeLessThan(order.indexOf('point'));
    // Put the points under the bars: the drawing has them first.
    let p = project(chart);
    for (let i = 0; i < 12; i++) p = moveLayer(chart.id, idOf(chart, 'points'), -1)(p);
    const moved = hitKinds(marksOf(p.charts[0]));
    expect(moved.indexOf('point')).toBeLessThan(moved.indexOf('bar'));
  });

  it('give a horizontal chart a turned group for each run of layers of one kind of drawing', () => {
    const chart = chartOf('bar', { orientation: 'horizontal' });
    const groupsOf = (c: Chart) => marksOf(c).filter((n) => n.tag === 'g' && n.attrs?.some(([k]) => k === 'transform')).length;
    expect(groupsOf(chart)).toBe(2);
    // An error bar layer between the bars of two data sets splits the body in two, and the lines after it start a group of their own: body, lines, body, lines.
    let p = project(chart);
    p = moveLayer(chart.id, idOf(chart, 'errorBars'), -1)(p);
    expect(groupsOf(p.charts[0])).toBe(4);
  });
});

describe('hiding a layer of a column chart', () => {
  it('takes only its shapes out of the drawing, in the editor and in an export', () => {
    const chart = chartOf('bar');
    const hidden: Chart = { ...chart, hiddenLayerIds: layersOf(chart, table).filter((l) => l.kind === 'errorBars').map((l) => l.id) };
    expect(hitKinds(marksOf(chart))).toContain('error');
    expect(hitKinds(marksOf(hidden))).not.toContain('error');
    expect(hitKinds(marksOf(hidden)).filter((k) => k !== 'error')).toEqual(hitKinds(marksOf(chart)).filter((k) => k !== 'error'));
    expect(svg(hidden, true)).not.toContain('data-hit="error"');
    expect(svg(hidden).length).toBeLessThan(svg(chart).length);
  });

  it('changes no number and no axis', () => {
    const chart = chartOf('bar');
    const hidden: Chart = { ...chart, hiddenLayerIds: layersOf(chart, table).filter((l) => l.kind === 'bars' || l.kind === 'errorBars').map((l) => l.id) };
    const a = buildColumnModel(chart, table);
    const b = buildColumnModel(hidden, table);
    expect(b.y.domain).toEqual(a.y.domain);
    expect(b.groups.map((g) => [g.centreValue, g.stats.interval])).toEqual(a.groups.map((g) => [g.centreValue, g.stats.interval]));
  });

  it('hides the box and keeps the whiskers, or the other way round', () => {
    const chart = chartOf('box');
    const bars = layersOf(chart, table).filter((l) => l.kind === 'bars').map((l) => l.id);
    const lines = layersOf(chart, table).filter((l) => l.kind === 'distribution').map((l) => l.id);
    const withoutBox = svg({ ...chart, hiddenLayerIds: bars }, true);
    const withoutLines = svg({ ...chart, hiddenLayerIds: lines }, true);
    expect(withoutBox.length).toBeLessThan(svg(chart, true).length);
    expect(withoutLines.length).toBeLessThan(svg(chart, true).length);
    expect(withoutBox).not.toBe(withoutLines);
  });

  it('hides a reference line or an annotation on its own', () => {
    const mid = (buildColumnModel(chartOf('bar'), table).y.domain.reduce((a, b) => a + b, 0)) / 2;
    const base = addAnnotation('c', { id: 'n1', text: 'A note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#000000', opacity: 1 })(addReferenceLine('c', { id: 'r1', axis: 'y', value: mid, color: '#cc0000', widthPt: 2, style: 'dashed', label: 'Limit', showLabel: true, opacity: 1 })(project({ ...chartOf('bar'), id: 'c' })));
    const chart = base.charts[0];
    expect(svg(chart)).toContain('A note');
    expect(svg(chart)).toContain('Limit');
    const noNote = setLayerHidden('c', 'n1:annotation', true)(base).charts[0];
    expect(svg(noNote)).not.toContain('A note');
    expect(svg(noNote)).toContain('Limit');
    const noLine = setLayerHidden('c', 'r1:referenceLine', true)(base).charts[0];
    expect(svg(noLine)).not.toContain('Limit');
    expect(svg(noLine)).toContain('A note');
  });
});

describe('the layer rows of a column chart', () => {
  it('are named for what they draw in the chart type, and say what is switched off in Style', () => {
    const rows = (type: ChartType) => layerRows(chartOf(type), table).map((r) => r.label.split(':')[0]);
    expect(rows('box')).toEqual(expect.arrayContaining(['Box', 'Whiskers and median', 'Points']));
    expect(rows('violin')).toContain('Violin');
    expect(rows('floating')).toEqual(expect.arrayContaining(['Floating bars', 'Centre line']));
    expect(rows('bar')).toEqual(expect.arrayContaining(['Bars', 'Error bars', 'Individual values']));
    expect(rows('paired')).toContain('Lines joining the rows');
    const off = layerRows({ ...chartOf('bar'), layers: chartOf('bar').layers.map((l) => ({ ...l, style: { ...l.style, showErrorBars: false } })) }, table);
    expect(off.filter((r) => r.layer.kind === 'errorBars').every((r) => !r.canToggle && r.reason !== null)).toBe(true);
  });

  it('offer hiding and moving; looks and the axis range only for the parts that have them (see columnPartLooks.test.ts)', () => {
    const rows = layerRows(chartOf('bar'), table);
    expect(rows.filter((r) => r.layer.kind === 'bars').every((r) => r.takes === null && r.inRange === null)).toBe(true);
    expect(rows.filter((r) => r.layer.kind === 'points').every((r) => r.takes !== null && r.inRange === true)).toBe(true);
    expect(rows.some((r) => r.canMoveUp || r.canMoveDown)).toBe(true);
    const chart = chartOf('bar');
    // A body is styled with the fill of its data set, so a look given to it is not stored.
    expect(patchLayerStyle(chart.id, idOf(chart, 'bars'), { color: '#ff0000' })(project(chart)).charts[0].layerStyles).toEqual({});
  });
});
