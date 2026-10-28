import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createChart, createContingencyTable, createGroupedTable } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { Chart, ChartType, DataTable, Id, Project } from '../../model/types';
import { addAnnotation, addReferenceLine, moveLayer, setLayerHidden } from '../../state/commands';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { chartToSvgString } from '../export/export';
import { buildGroupedModel } from './groupedModel';
import type { SceneElement } from '../shared/scene/sceneElement';

const replicates = createGroupedTable('Replicates', true, { kind: 'replicates', n: 4 });
const counts = createContingencyTable('Counts', true);
const chartOf = (type: ChartType, table: DataTable = replicates, patch: Partial<Chart> = {}): Chart => {
  const c = createChart(table.id, undefined, type);
  return { ...c, ...patch, layers: c.layers.map((l, i) => (i === 0 ? { ...l, summary: { ...l.summary, spread: 'sd' as const }, style: { ...l.style, showErrorBars: true, showMeanLine: true, showSymbols: true, showLines: true } } : l)) };
};
const project = (chart: Chart, table: DataTable = replicates): Project => ({ id: 'p', name: 'p', dataTables: [table], charts: [chart] });
const kinds = (chart: Chart, table: DataTable = replicates) => [...new Set(layersOf(chart, table).map((l) => l.kind))].sort();
const hitKinds = (nodes: ReadonlyArray<SceneElement>): string[] => nodes.flatMap((n) => [...(n.hit ? [n.hit.kind] : []), ...hitKinds(n.children ?? [])]);
const marksOf = (chart: Chart, table: DataTable = replicates) => buildGroupedModel(chart, table).scene!.marks![0].children!;
const svg = (chart: Chart, table: DataTable = replicates, editor = false) =>
  editor ? renderToStaticMarkup(createElement(ChartCanvas, { chart, any: buildAnyModel(chart, table), cssWidth: '600px', cssHeight: '400px', editor: { selection: { kind: 'chart' as const } } })) : chartToSvgString(chart, table);
const idOf = (chart: Chart, kind: string, at = 0, table: DataTable = replicates): Id => layersOf(chart, table).filter((l) => l.kind === kind)[at].id;

describe('the layers of a grouped or contingency chart', () => {
  it.each([
    ['groupedBar', ['bars', 'errorBars', 'meanLine', 'rawPoints']],
    ['groupedStacked', ['bars']],
    ['groupedFloating', ['bars', 'meanLine', 'rawPoints']],
    ['groupedLine', ['errorBars', 'line', 'points']],
    ['groupedBox', ['bars', 'rawPoints']],
    ['groupedViolin', ['bars', 'rawPoints']],
  ] as const)('are the parts of a %s chart', (type, expected) => {
    expect(kinds(chartOf(type))).toEqual([...expected].sort());
  });

  it('are the bars alone for a contingency chart', () => {
    for (const type of ['contingencyBars', 'contingencyStacked', 'contingencyPercent'] as const) expect(kinds(chartOf(type, counts), counts)).toEqual(['bars']);
  });

  it('have one layer of each kind for each series, bound to it, with unique ids', () => {
    const chart = chartOf('groupedBar');
    const ls = layersOf(chart, replicates);
    expect(new Set(ls.map((l) => l.id)).size).toBe(ls.length);
    const bars = ls.filter((l) => l.kind === 'bars');
    expect(bars).toHaveLength(2);
    expect(bars.every((l) => l.binding?.tableId === replicates.id)).toBe(true);
    expect(new Set(bars.map((l) => l.binding?.seriesId)).size).toBe(2);
  });

  it.each(['auto', 'onTop', 'underneath'] as const)('are in the order the chart draws them: lines %s', (lineOrder) => {
    const chart = chartOf('groupedBar', replicates, { lineOrder });
    const order = layersOf(chart, replicates).map((l) => l.kind);
    const first = (k: string) => order.indexOf(k as never);
    if (lineOrder === 'auto') expect(first('bars')).toBeLessThan(first('errorBars')), expect(first('errorBars')).toBeLessThan(first('rawPoints'));
    if (lineOrder === 'onTop') expect(first('rawPoints')).toBeLessThan(first('errorBars'));
    if (lineOrder === 'underneath') expect(first('errorBars')).toBeLessThan(first('bars'));
  });

  it('draw the marks in the order of the layers, and follow a layer that was moved', () => {
    const chart = chartOf('groupedBar');
    const order = hitKinds(marksOf(chart));
    expect(order.indexOf('bar')).toBeLessThan(order.indexOf('error'));
    expect(order.indexOf('error')).toBeLessThan(order.indexOf('point'));
    let p = project(chart);
    for (let i = 0; i < 12; i++) p = moveLayer(chart.id, idOf(chart, 'rawPoints'), -1)(p);
    const moved = hitKinds(marksOf(p.charts[0]));
    expect(moved.indexOf('point')).toBeLessThan(moved.indexOf('bar'));
  });
});

describe('hiding a layer of a grouped chart', () => {
  it('takes only its shapes out of the drawing, in the editor and in an export', () => {
    const chart = chartOf('groupedBar');
    const hidden: Chart = { ...chart, hiddenLayerIds: layersOf(chart, replicates).filter((l) => l.kind === 'errorBars').map((l) => l.id) };
    expect(hitKinds(marksOf(chart))).toContain('error');
    expect(hitKinds(marksOf(hidden))).not.toContain('error');
    expect(hitKinds(marksOf(hidden)).filter((k) => k !== 'error')).toEqual(hitKinds(marksOf(chart)).filter((k) => k !== 'error'));
    expect(svg(hidden, replicates, true)).not.toContain('data-hit="error"');
    expect(svg(hidden).length).toBeLessThan(svg(chart).length);
  });

  it('hides one series of a part and keeps the others', () => {
    const chart = chartOf('groupedBar');
    const first = idOf(chart, 'errorBars', 0);
    const hidden: Chart = { ...chart, hiddenLayerIds: [first] };
    const count = (c: Chart) => hitKinds(marksOf(c)).filter((k) => k === 'error').length;
    expect(count(chart)).toBe(2);
    expect(count(hidden)).toBe(1);
  });

  it('changes no number and no axis', () => {
    const chart = chartOf('groupedBar');
    const hidden: Chart = { ...chart, hiddenLayerIds: layersOf(chart, replicates).filter((l) => l.kind === 'bars' || l.kind === 'errorBars').map((l) => l.id) };
    const a = buildGroupedModel(chart, replicates);
    const b = buildGroupedModel(hidden, replicates);
    expect(b.y.domain).toEqual(a.y.domain);
    expect(b.series.map((s) => s.bars.map((x) => [x.value, x.height]))).toEqual(a.series.map((s) => s.bars.map((x) => [x.value, x.height])));
  });

  it('hides the line of a chart of lines and keeps its means', () => {
    const chart = chartOf('groupedLine');
    const hidden: Chart = { ...chart, hiddenLayerIds: layersOf(chart, replicates).filter((l) => l.kind === 'line').map((l) => l.id) };
    expect(hitKinds(marksOf(chart))).toContain('line');
    expect(hitKinds(marksOf(hidden))).not.toContain('line');
    expect(hitKinds(marksOf(hidden))).toContain('point');
  });

  it('hides a reference line or an annotation on its own', () => {
    const mid = buildGroupedModel(chartOf('groupedBar'), replicates).y.domain.reduce((a, b) => a + b, 0) / 2;
    const base = addAnnotation('c', { id: 'n1', text: 'A note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#000000', opacity: 1 })(addReferenceLine('c', { id: 'r1', axis: 'y', value: mid, color: '#cc0000', widthPt: 2, style: 'dashed', label: 'Limit', showLabel: true, opacity: 1 })(project({ ...chartOf('groupedBar'), id: 'c' })));
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

describe('the layer rows of a grouped chart', () => {
  it('are named for what they draw in the chart type', () => {
    const rows = (type: ChartType) => layerRows(chartOf(type), replicates).map((r) => r.label.split(':')[0]);
    expect(rows('groupedBar')).toEqual(expect.arrayContaining(['Bars', 'Error bars', 'Mean line', 'Individual values']));
    expect(rows('groupedBox')).toEqual(expect.arrayContaining(['Box and whiskers', 'Points']));
    expect(rows('groupedViolin')).toContain('Violin');
    expect(rows('groupedFloating')).toEqual(expect.arrayContaining(['Floating bars', 'Centre line']));
    expect(rows('groupedLine')).toEqual(expect.arrayContaining(['Line', 'Means', 'Error bars']));
  });

  it('offer hiding and moving; looks and the axis range only for the parts that have them (see groupedPartLooks.test.ts)', () => {
    const rows = layerRows(chartOf('groupedBar'), replicates);
    expect(rows.filter((r) => r.layer.kind === 'bars').every((r) => r.takes === null && r.inRange === null)).toBe(true);
    expect(rows.filter((r) => r.layer.kind === 'errorBars').every((r) => r.takes !== null && r.inRange !== null)).toBe(true);
    expect(rows.some((r) => r.canMoveUp && r.canMoveDown)).toBe(true);
  });
});
