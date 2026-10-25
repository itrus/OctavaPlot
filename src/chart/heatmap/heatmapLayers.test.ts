import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { Chart, ChartType, DataTable, Project, TableKind } from '../../model/types';
import { addAnnotation, addChart, addDataTable, moveLayer, setLayerHidden } from '../../state/commands';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { chartToSvgString } from '../export/export';
import { buildHeatModel } from './heatmapModel';
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
const idsOf = (markup: string): string[] => [...markup.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
const hitKinds = (nodes: ReadonlyArray<SceneElement>): string[] => nodes.flatMap((n) => [...(n.hit ? [n.hit.kind] : []), ...hitKinds(n.children ?? [])]);

describe('the layers of a heat map', () => {
  const p = project('heatmap', 'grouped', (c) => ({ ...c, heatmap: { ...c.heatmap, showValues: true, colourbar: true } }));

  it('are the cells, the numbers in them and the colour bar, each one for the whole map', () => {
    const ls = layersOf(chartOf(p), tableOf(p));
    expect(ls.map((l) => l.kind)).toEqual(['bars', 'labels', 'colourBar']);
    expect(ls.every((l) => l.binding === null)).toBe(true);
    expect(layerRows(chartOf(p), tableOf(p)).map((r) => r.label)).toEqual(['Colour bar', 'Values in the cells', 'Cells']);
  });

  it('say what is switched off: the numbers and the colour bar when the map has none', () => {
    const bare = project('heatmap', 'grouped', (c) => ({ ...c, heatmap: { ...c.heatmap, showValues: false, colourbar: false } }));
    const rows = layerRows(chartOf(bare), tableOf(bare));
    expect(rows.find((r) => r.layer.kind === 'labels')!.canToggle).toBe(false);
    expect(rows.find((r) => r.layer.kind === 'colourBar')!.canToggle).toBe(false);
    expect(rows.find((r) => r.layer.kind === 'bars')!.canToggle).toBe(true);
  });

  it('hide the cells and keep the colour bar, or the other way round', () => {
    const layers = layersOf(chartOf(p), tableOf(p));
    const hiding = (kind: string): Chart => ({ ...chartOf(p), hiddenLayerIds: layers.filter((l) => l.kind === kind).map((l) => l.id) });
    const marks = (c: Chart) => buildHeatModel(c, tableOf(p)).marks!;
    const cells = (c: Chart) => marks(c).filter((n) => n.hit?.kind === 'bar').length;
    expect(cells(chartOf(p))).toBeGreaterThan(0);
    expect(cells(hiding('bars'))).toBe(0);
    expect(cells(hiding('colourBar'))).toBe(cells(chartOf(p)));
    expect(marks(hiding('colourBar')).length).toBe(marks(chartOf(p)).length - 1);
    expect(marks(hiding('labels')).filter((n) => n.tag === 'text')).toHaveLength(0);
    expect(buildHeatModel(hiding('bars'), tableOf(p)).cells).toEqual(buildHeatModel(chartOf(p), tableOf(p)).cells);
  });

  it('are drawn from the scene: the hit targets of the cells are the ones the editor has', () => {
    const model = buildHeatModel(chartOf(p), tableOf(p));
    const editor = svg(p, true);
    for (const c of model.cells) expect(editor).toContain(`data-hit="bar" data-group-id="${c.seriesId}" data-object-id="${c.id}"`);
    expect(svg(p)).not.toContain('data-hit');
  });

  it('hide an annotation on its own', () => {
    const base = addAnnotation('c', { id: 'n1', text: 'A note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#000000', opacity: 1 })(p);
    expect(svg(base)).toContain('A note');
    expect(svg(setLayerHidden('c', 'n1:annotation', true)(base))).not.toContain('A note');
  });

  it('give each cell the same id when the map is turned: the cell is the cell of the same series and row', () => {
    const cellIds = (c: Chart) => idsOf(chartToSvgString(c, tableOf(p))).filter((id) => id.startsWith('c-bars-'));
    const turned: Chart = { ...chartOf(p), heatmap: { ...chartOf(p).heatmap, transpose: true } };
    expect(cellIds(chartOf(p)).length).toBeGreaterThan(0);
    expect(cellIds(turned).slice().sort()).toEqual(cellIds(chartOf(p)).slice().sort());
  });

  it('have the order they are put in', () => {
    const bar = layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'colourBar')!.id;
    let q = p;
    for (let i = 0; i < 5; i++) q = moveLayer('c', bar, -1)(q);
    expect(layersOf(chartOf(q), tableOf(q)).map((l) => l.kind)[0]).toBe('colourBar');
    const marks = buildHeatModel(chartOf(q), tableOf(q)).marks!;
    expect(marks[0].tag).toBe('g');
  });
});

describe('ids of the cells of a heat map', () => {
  it('are the same when the rows of the table are put in another order', () => {
    const p = project('heatmap', 'grouped');
    const reversed: DataTable = { ...tableOf(p), rows: [...tableOf(p).rows].reverse(), groups: tableOf(p).groups.map((g) => ({ ...g, observations: [...g.observations].reverse() })) };
    const moved: Project = { ...p, dataTables: p.dataTables.map((t) => (t.id === 't' ? reversed : t)) };
    const ids = (q: Project) => idsOf(chartToSvgString(chartOf(q), tableOf(q))).filter((id) => id.startsWith('c-bars-'));
    expect(ids(moved).slice().sort()).toEqual(ids(p).slice().sort());
  });

  it('are valid in XML and used once', () => {
    const ids = idsOf(svg(project('heatmap', 'grouped')));
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[A-Za-z_][A-Za-z0-9_.-]*$/);
  });
});
