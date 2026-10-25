import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { Chart, ChartType, Id, Project } from '../../model/types';
import { addAnnotation, addReferenceLine, moveLayer, setLayerHidden } from '../../state/commands';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { chartToSvgString } from '../export/export';
import { buildHistogramModel } from './histogramModel';
import { sceneTargets } from '../shared/scene/scene';

const table = createColumnTable('Column', true, 3);
const chartOf = (type: ChartType, patch: Partial<Chart> = {}): Chart => ({ ...createChart(table.id, undefined, type), ...patch });
const project = (chart: Chart): Project => ({ id: 'p', name: 'p', dataTables: [table], charts: [chart] });
const kinds = (chart: Chart) => [...new Set(layersOf(chart, table).map((l) => l.kind))].sort();
const sceneOf = (chart: Chart) => buildHistogramModel(chart, table).scene!;
const svg = (chart: Chart, editor = false) => (editor ? renderToStaticMarkup(createElement(ChartCanvas, { chart, any: buildAnyModel(chart, table), cssWidth: '600px', cssHeight: '400px', editor: { selection: { kind: 'chart' as const } } })) : chartToSvgString(chart, table));
const count = (markup: string, text: string) => markup.split(text).length - 1;
const idOf = (chart: Chart, kind: string, at = 0): Id => layersOf(chart, table).filter((l) => l.kind === kind)[at].id;
const layerIds = sceneOf;

describe('the layers of a histogram and a cumulative distribution', () => {
  it('are the bars of a histogram, one layer for each data set', () => {
    const chart = chartOf('histogram');
    expect(kinds(chart)).toEqual(['bars']);
    expect(layersOf(chart, table).map((l) => l.binding?.seriesId)).toEqual(table.groups.map((g) => g.id));
  });

  it('are the steps and the symbols of a distribution', () => {
    expect(kinds(chartOf('ecdf'))).toEqual(['line', 'points']);
  });

  it('put the symbols over the steps, or under them when lines go on top', () => {
    const z = (chart: Chart, kind: string) => layersOf(chart, table).find((l) => l.kind === kind)!.z;
    expect(z(chartOf('ecdf'), 'points')).toBeGreaterThan(z(chartOf('ecdf'), 'line'));
    expect(z(chartOf('ecdf', { lineOrder: 'onTop' }), 'points')).toBeLessThan(z(chartOf('ecdf', { lineOrder: 'onTop' }), 'line'));
  });

  it('say what is switched off in Style, and take no look of their own', () => {
    const rows = layerRows(chartOf('ecdf'), table);
    expect(rows.filter((r) => r.layer.kind === 'points').every((r) => !r.canToggle && r.reason !== null)).toBe(true);
    expect(rows.filter((r) => r.layer.kind === 'line').every((r) => r.canToggle)).toBe(true);
    expect(rows.every((r) => r.takes === null && r.inRange === null)).toBe(true);
    expect(layerRows(chartOf('histogram'), table).map((r) => r.label.split(':')[0])).toEqual(table.groups.map(() => 'Bars'));
    expect(rows.map((r) => r.label.split(':')[0])).toEqual(expect.arrayContaining(['Steps', 'Symbols']));
  });
});

describe('the symbols of a cumulative distribution', () => {
  const symbols = (chart: Chart) => sceneOf(chart).layers.filter((l) => l.kind === 'points').flatMap((l) => l.paths).length;
  it('are drawn when the distribution asks for them, and not otherwise', () => {
    const plain = chartOf('ecdf');
    expect(symbols(plain)).toBe(0);
    const asked: Chart = { ...plain, histogram: { ...plain.histogram, ecdfSymbols: true } };
    expect(symbols(asked)).toBeGreaterThan(0);
    expect(layerRows(asked, table).filter((r) => r.layer.kind === 'points').every((r) => r.shown && r.canToggle)).toBe(true);
  });
  it('can be hidden with their layer even when the distribution asks for them', () => {
    const plain = chartOf('ecdf');
    const asked: Chart = { ...plain, histogram: { ...plain.histogram, ecdfSymbols: true } };
    expect(symbols({ ...asked, hiddenLayerIds: layersOf(asked, table).filter((l) => l.kind === 'points').map((l) => l.id) })).toBe(0);
  });
});

describe('the bars of a histogram in the scene', () => {
  it('are in the layers of the scene, in the order of the layers, and the drawing has them', () => {
    const chart = chartOf('histogram');
    const scene = layerIds(chart);
    expect(scene.layers.map((l) => l.id)).toEqual(layersOf(chart, table).map((l) => l.id));
    expect(scene.layers.every((l) => (l.elements ?? []).length > 0)).toBe(true);
    expect(count(svg(chart), '<rect')).toBeGreaterThan(table.groups.length);
  });

  it('give the editor the hit targets the scene says, one for each bar', () => {
    const chart = chartOf('histogram');
    const targets = sceneTargets(layerIds(chart));
    const model = buildHistogramModel(chart, table);
    expect(targets).toHaveLength(model.series.reduce((n, s) => n + (s.bars?.length ?? 0), 0));
    const editor = svg(chart, true);
    for (const t of targets) expect(editor).toContain(`data-hit="bar" data-group-id="${t.hit.groupId}" data-object-id="${t.hit.objectId}"`);
    expect(svg(chart)).not.toContain('data-hit');
  });

  it('are hidden with their layer, and nothing else changes', () => {
    const chart = chartOf('histogram');
    const id = idOf(chart, 'bars', 1);
    const hidden: Chart = { ...chart, hiddenLayerIds: [id] };
    const a = buildHistogramModel(chart, table);
    const b = buildHistogramModel(hidden, table);
    expect(b.y.domain).toEqual(a.y.domain);
    expect(b.series.map((s) => s.bars)).toEqual(a.series.map((s) => s.bars));
    const bars = (c: Chart) => sceneTargets(layerIds(c)).filter((t) => t.layerId === id).length;
    expect(bars(chart)).toBeGreaterThan(0);
    expect(bars(hidden)).toBe(0);
    expect(sceneTargets(layerIds(hidden)).length).toBe(sceneTargets(layerIds(chart)).length - bars(chart));
    expect(count(svg(hidden), '<rect')).toBeLessThan(count(svg(chart), '<rect'));
  });

  it('are drawn in the order of the layers once one is moved', () => {
    const chart = chartOf('histogram');
    const first = idOf(chart, 'bars', 0);
    let p = project(chart);
    for (let i = 0; i < 3; i++) p = moveLayer(chart.id, first, 1)(p);
    const order = layerIds(p.charts[0]).layers.map((l) => l.id);
    expect(order.at(-1)).toBe(first);
    expect(order).toHaveLength(table.groups.length);
  });
});

describe('hiding a part of a cumulative distribution', () => {
  it('hides the steps of one data set and keeps the others', () => {
    const chart = chartOf('ecdf');
    const hidden: Chart = { ...chart, hiddenLayerIds: [idOf(chart, 'line', 0)] };
    const stepPaths = (c: Chart) => sceneOf(c).layers.filter((l) => l.kind === 'line').length;
    expect(stepPaths(chart)).toBe(table.groups.length);
    expect(stepPaths(hidden)).toBe(table.groups.length - 1);
  });

  it('hides a reference line or an annotation on its own', () => {
    const any = buildAnyModel(chartOf('histogram'), table);
    const [x, y] = any.family === 'histogram' ? [any.model.x.domain.reduce((a, b) => a + b, 0) / 2, any.model.y.domain.reduce((a, b) => a + b, 0) / 2] : [0, 0];
    const base = addAnnotation('c', { id: 'n1', text: 'A note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#000000', opacity: 1 })(addReferenceLine('c', { id: 'r1', axis: 'x', value: x, color: '#cc0000', widthPt: 2, style: 'dashed', label: 'Cut', showLabel: true, opacity: 1 })(addReferenceLine('c', { id: 'r2', axis: 'y', value: y, color: '#0000cc', widthPt: 2, style: 'solid', label: 'Limit', showLabel: true, opacity: 1 })(project({ ...chartOf('histogram'), id: 'c' }))));
    const chart = base.charts[0];
    expect(svg(chart)).toContain('A note');
    expect(svg(chart)).toContain('Cut');
    const noNote = setLayerHidden('c', 'n1:annotation', true)(base).charts[0];
    expect(svg(noNote)).not.toContain('A note');
    expect(svg(noNote)).toContain('Cut');
    const noLine = setLayerHidden('c', 'r1:referenceLine', true)(base).charts[0];
    expect(svg(noLine)).not.toContain('Cut');
    expect(svg(noLine)).toContain('Limit');
  });
});
