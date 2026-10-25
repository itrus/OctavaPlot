import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { Chart, ChartType, DataTable, Project, TableKind } from '../../model/types';
import { addAnnotation, addChart, addDataTable, addReferenceLine, moveLayer, patchLayerStyle, setLayerHidden } from '../../state/commands';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { chartToSvgString } from '../export/export';
import { buildPieModel } from './pieModel';
import type { SceneElement } from '../shared/scene/sceneElement';

function project(type: ChartType, kind: TableKind, patch: (c: Chart) => Chart = (c) => c): Project {
  const p = addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true })(createExampleProject()));
  return { ...p, charts: p.charts.map((c) => (c.id === 'c' ? patch(c) : c)) };
}
const chartOf = (p: Project): Chart => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project): DataTable => p.dataTables.find((t) => t.id === 't')!;
const svg = (p: Project, editor = false): string =>
  editor
    ? renderToStaticMarkup(createElement(ChartCanvas, { chart: chartOf(p), any: buildAnyModel(chartOf(p), tableOf(p)), cssWidth: '600px', cssHeight: '400px', editor: { selection: { kind: 'group' as const, groupId: tableOf(p).groups[0].id } } }))
    : chartToSvgString(chartOf(p), tableOf(p));
const count = (markup: string, text: string) => markup.split(text).length - 1;
const idsOf = (markup: string): string[] => [...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
const hitKinds = (nodes: ReadonlyArray<SceneElement>): string[] => nodes.flatMap((n) => [...(n.hit ? [n.hit.kind] : []), ...hitKinds(n.children ?? [])]);

describe('the layers of a pie chart', () => {
  const p = project('pie', 'contingency');
  const parts = tableOf(p).groups.length;

  it('are the slices and the labels of each part, and the titles of the pies', () => {
    const ls = layersOf(chartOf(p), tableOf(p));
    expect(ls.filter((l) => l.kind === 'bars')).toHaveLength(parts);
    expect(ls.filter((l) => l.kind === 'labels')).toHaveLength(parts);
    expect(ls.filter((l) => l.kind === 'titles')).toHaveLength(1);
    expect(ls.filter((l) => l.kind === 'bars').map((l) => l.binding?.seriesId)).toEqual(tableOf(p).groups.map((g) => g.id));
    expect(ls.map((l) => l.z)).toEqual(ls.map((_, i) => i));
  });

  it('have no reference lines, since a pie has no axes, but have annotations', () => {
    const decorated = addAnnotation('c', { id: 'n1', text: 'A note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#000000', opacity: 1 })(addReferenceLine('c', { id: 'r1', axis: 'y', value: 1, color: '#cc0000', widthPt: 2, style: 'dashed', label: '', showLabel: false, opacity: 1 })(p));
    const kinds = layersOf(chartOf(decorated), tableOf(decorated)).map((l) => l.kind);
    expect(kinds).toContain('annotation');
    expect(kinds).not.toContain('referenceLine');
  });

  it('say what is switched off: the labels when the chart writes none', () => {
    const none = project('pie', 'contingency', (c) => ({ ...c, pie: { ...c.pie, labels: 'none' } }));
    const rows = layerRows(chartOf(none), tableOf(none));
    expect(rows.filter((r) => r.layer.kind === 'labels').every((r) => !r.canToggle && r.reason !== null)).toBe(true);
    expect(rows.filter((r) => r.layer.kind === 'bars').every((r) => r.canToggle)).toBe(true);
  });

  it('are named for what they draw, take no look of their own and no say in the axis range', () => {
    const rows = layerRows(chartOf(p), tableOf(p));
    const names = rows.map((r) => r.label.split(':')[0]);
    expect(names).toEqual(expect.arrayContaining(['Slices', 'Slice labels', 'Pie titles and totals']));
    expect(rows.every((r) => r.takes === null && r.inRange === null)).toBe(true);
    expect(patchLayerStyle('c', rows[0].layer.id, { color: '#ff0000' })(p).charts[0].layerStyles).toEqual({});
  });

  it('are drawn from the scene: the hit targets of the slices are the ones the editor has', () => {
    const model = buildPieModel(chartOf(p), tableOf(p));
    const drawn = model.pies.flatMap((pie) => pie.slices.filter((s) => s.path !== ''));
    expect(drawn.length).toBeGreaterThan(0);
    expect(hitKinds(model.marks!).filter((k) => k === 'bar')).toHaveLength(drawn.length);
    const editor = svg(p, true);
    for (const s of drawn) expect(editor).toContain(`data-hit="bar" data-group-id="${s.groupId}" data-object-id="${s.id}"`);
    expect(svg(p)).not.toContain('data-hit');
  });

  it('hide the slices of one part and keep the others, the numbers and the layout', () => {
    const slicesOf = (c: Chart) => hitKinds(buildPieModel(c, tableOf(p)).marks!).length;
    const part = layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'bars')!;
    const hidden: Chart = { ...chartOf(p), hiddenLayerIds: [part.id] };
    const a = buildPieModel(chartOf(p), tableOf(p));
    const b = buildPieModel(hidden, tableOf(p));
    expect(slicesOf(hidden)).toBe(slicesOf(chartOf(p)) - a.pies.filter((pie) => pie.slices.some((s) => s.groupId === part.binding?.seriesId && s.path !== '')).length);
    expect(b.pies.map((pie) => pie.slices.map((s) => [s.value, s.path]))).toEqual(a.pies.map((pie) => pie.slices.map((s) => [s.value, s.path])));
    expect(b.layout.plot).toEqual(a.layout.plot);
  });

  it('hide the labels, or the titles and totals, each on its own', () => {
    const labelled = project('pie', 'contingency', (c) => ({ ...c, pie: { ...c.pie, labels: 'percent', showTotal: true } }));
    const full = svg(labelled);
    const layers = layersOf(chartOf(labelled), tableOf(labelled));
    const without = (kind: string) => svg({ ...labelled, charts: labelled.charts.map((c) => ({ ...c, hiddenLayerIds: layers.filter((l) => l.kind === kind).map((l) => l.id) })) });
    expect(count(without('labels'), '%')).toBeLessThan(count(full, '%'));
    expect(without('titles').length).toBeLessThan(full.length);
    expect(without('titles')).toContain('d="M');
    expect(without('titles')).not.toBe(without('labels'));
  });

  it('hide an annotation on its own', () => {
    const base = addAnnotation('c', { id: 'n1', text: 'A note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#000000', opacity: 1 })(p);
    expect(svg(base)).toContain('A note');
    expect(svg(setLayerHidden('c', 'n1:annotation', true)(base))).not.toContain('A note');
  });

  it('are drawn in the order they are put in: the titles can go under the slices', () => {
    const titles = layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'titles')!.id;
    let q = p;
    for (let i = 0; i < 12; i++) q = moveLayer('c', titles, -1)(q);
    const order = (c: Chart) => buildPieModel(c, tableOf(p)).layers.map((l) => l.kind);
    expect(order(chartOf(q))[0]).toBe('titles');
    expect(order(chartOf(p))[0]).toBe('bars');
  });

  it('show the dashed outline of the slices of the selected data set, in the editor only', () => {
    expect(count(svg(p, true), 'data-editor-only')).toBeGreaterThan(0);
    expect(count(svg(p), 'data-editor-only')).toBe(0);
  });
});

describe('ids of the slices of a pie and a doughnut', () => {
  it('are valid in XML and used once', () => {
    for (const q of [project('pie', 'contingency'), project('doughnut', 'contingency')]) {
      const ids = idsOf(svg(q));
      expect(new Set(ids).size).toBe(ids.length);
      for (const id of ids) expect(id).toMatch(/^[A-Za-z_][A-Za-z0-9_.-]*$/);
    }
  });
});
