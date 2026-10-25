import { describe, expect, it } from 'vitest';
import { createChart, createSurvivalTable, createXyTable } from '../../model/defaults';
import { layerRows, layersOf, mergeLayerOrder } from '../../model/graph/layers';
import type { Chart, Id, Project } from '../../model/types';
import { addAnnotation, addReferenceLine, moveLayer, resetLayerOrder, setLayerHidden } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { buildSurvivalModel } from '../survival/survivalModel';
import { buildXyModel } from './xyModel';

const table = createXyTable('XY', true, { kind: 'replicates', n: 3 });
const make = (patch: Partial<Chart> = {}): Chart => {
  const c = createChart(table.id, undefined, 'xyLineSymbols');
  return { ...c, ...patch, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, showErrorBars: true, showRawPoints: true } } : l)) };
};
const project = (chart: Chart): Project => ({ id: 'p', name: 'p', dataTables: [table], charts: [chart] });
const chartOf = (p: Project) => p.charts[0];
const idsOf = (chart: Chart): Id[] => layersOf(chart, table).map((l) => l.id);
const sceneOrder = (chart: Chart): Id[] => buildXyModel(chart, table).scene!.layers.map((l) => l.id);
const idOf = (chart: Chart, kind: string, series = 0): Id => layersOf(chart, table).filter((l) => l.kind === kind)[series].id;
const move = (p: Project, id: Id, step: 1 | -1) => moveLayer(p.charts[0].id, id, step)(p);

describe('putting the data layers in another order', () => {
  it('is the order of the chart type until a layer is moved', () => {
    const chart = make();
    expect(chart.layerOrder).toEqual([]);
    expect(idsOf(chart)).toEqual(idsOf({ ...chart, layerOrder: [] }));
  });

  it('moves a layer one place up and down among the data layers, and the drawing follows', () => {
    const chart = make();
    const pointsId = idOf(chart, 'points');
    const before = sceneOrder(chart);
    const z = (c: Chart, id: Id) => layersOf(c, table).find((l) => l.id === id)!.z;
    const down = chartOf(move(project(chart), pointsId, -1));
    expect(z(down, pointsId)).toBeLessThan(z(chart, pointsId));
    expect(sceneOrder(down).indexOf(pointsId)).toBeLessThan(before.indexOf(pointsId));
    const back = chartOf(move(project(down), pointsId, 1));
    expect(sceneOrder(back)).toEqual(before);
  });

  it('puts the points under the line when asked: the drawing has them first', () => {
    const chart = make();
    let p = project(chart);
    const points = idOf(chart, 'points');
    const line = idOf(chart, 'line');
    // Down until the points are below the line of the same series.
    for (let i = 0; i < 10; i++) p = move(p, points, -1);
    const order = sceneOrder(chartOf(p));
    expect(order.indexOf(points)).toBeLessThan(order.indexOf(line));
  });

  it('changes nothing in the numbers, the axes or the other styles', () => {
    const chart = make();
    const moved = chartOf(move(project(chart), idOf(chart, 'errorBars'), 1));
    const a = buildXyModel(chart, table);
    const b = buildXyModel(moved, table);
    expect(b.y.domain).toEqual(a.y.domain);
    expect(b.series.map((s) => s.points)).toEqual(a.series.map((s) => s.points));
    expect(b.series.map((s) => s.errorPath)).toEqual(a.series.map((s) => s.errorPath));
  });

  it('does nothing at the ends, and for a layer that is not a data layer', () => {
    const chart = make();
    const p = project(chart);
    const first = layersOf(chart, table)[0].id;
    const last = layersOf(chart, table).at(-1)!.id;
    expect(move(p, first, -1)).toBe(p);
    expect(move(p, last, 1)).toBe(p);
    const decorated = addReferenceLine('c', { id: 'r1', axis: 'y', value: 5, color: '#cc0000', widthPt: 2, style: 'dashed', label: '', showLabel: false, opacity: 1 })(addAnnotation(chart.id, { id: 'n1', text: 'A', xFrac: 0.1, yFrac: 0.1, fontSize: 20, fontSizePt: 20, color: '#000000', opacity: 1 } as never)(p));
    expect(move(decorated, 'r1:referenceLine', 1)).toBe(decorated);
    expect(move(decorated, 'n1:annotation', -1)).toBe(decorated);
    expect(move(p, 'nothing', 1)).toBe(p);
  });

  it('leaves the reference lines and annotations where they are in the list', () => {
    const chart = make();
    const decorated = addAnnotation(chart.id, { id: 'n1', text: 'A', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#000000', opacity: 1 })(project(chart));
    const before = layersOf(chartOf(decorated), table);
    const after = layersOf(chartOf(move(decorated, idOf(chartOf(decorated), 'points'), -1)), table);
    const at = (ls: typeof before, id: Id) => ls.findIndex((l) => l.id === id);
    expect(at(after, 'n1:annotation')).toBe(at(before, 'n1:annotation'));
  });

  it('keeps a hidden layer in its place, and hiding or showing does not move anything', () => {
    const chart = make();
    const pointsId = idOf(chart, 'points');
    let p = move(project(chart), pointsId, -1);
    const order = idsOf(chartOf(p));
    p = setLayerHidden(chart.id, pointsId, true)(p);
    expect(idsOf(chartOf(p))).toEqual(order);
    expect(layerRows(chartOf(p), table).find((r) => r.layer.id === pointsId)!.shown).toBe(false);
  });

  it('says which layers can go up or down', () => {
    const rows = layerRows(make(), table);
    const data = rows.filter((r) => r.canMoveUp || r.canMoveDown);
    expect(data.length).toBe(rows.length);
    // Topmost first: the first row cannot go further up, the last cannot go further down.
    expect(rows[0].canMoveUp).toBe(false);
    expect(rows[0].canMoveDown).toBe(true);
    expect(rows.at(-1)!.canMoveDown).toBe(false);
    expect(rows.at(-1)!.canMoveUp).toBe(true);
  });

  it('goes back to the order of the chart type', () => {
    const chart = make();
    const moved = move(project(chart), idOf(chart, 'points'), -1);
    expect(chartOf(moved).layerOrder.length).toBeGreaterThan(0);
    const reset = resetLayerOrder(chart.id)(moved);
    expect(chartOf(reset).layerOrder).toEqual([]);
    expect(idsOf(chartOf(reset))).toEqual(idsOf(chart));
    expect(resetLayerOrder(chart.id)(reset).charts[0]).toBe(reset.charts[0]);
  });

  it('beats the setting of lines over or under the symbols', () => {
    const chart = make({ lineOrder: 'onTop' });
    const defaultOrder = idsOf(chart);
    const moved = chartOf(move(project(chart), defaultOrder.find((id) => id.endsWith(':line'))!, -1));
    expect(idsOf({ ...moved, lineOrder: 'underneath' })).toEqual(idsOf(moved));
  });

  it('puts a layer that is new where the chart type has it, above the layer below it', () => {
    const chart = make();
    const moved = chartOf(move(project(chart), idOf(chart, 'points'), -1));
    const fitted: Chart = { ...moved, fit: { ...moved.fit, analysisId: 'a1', band: 'confidence' } };
    const ids = idsOf(fitted);
    const curve = ids.find((id) => id.endsWith(':fitCurve'))!;
    expect(ids).toContain(curve);
    // The points that were moved are still where they were put, relative to the layers that were there before.
    const kept = idsOf(moved);
    expect(ids.filter((id) => kept.includes(id))).toEqual(kept);
  });

  it('works for a survival chart', () => {
    const t = createSurvivalTable('S', true);
    const chart = createChart(t.id, undefined, 'survival');
    const p: Project = { id: 'p', name: 'p', dataTables: [t], charts: [chart] };
    const marks = layersOf(chart, t).find((l) => l.kind === 'points')!.id;
    // The layers go kind by kind over all the series, so the marks of the first group pass the error bars of both groups and the curve of the second before they are under their own curve: four steps.
    let q = p;
    for (let i = 0; i < 4; i++) q = moveLayer(chart.id, marks, -1)(q);
    const moved = chartOf(q);
    const line = layersOf(chart, t).find((l) => l.kind === 'line')!.id;
    const order = buildSurvivalModel(moved, t).scene!.layers.map((l) => l.id);
    const plain = buildSurvivalModel(chart, t).scene!.layers.map((l) => l.id);
    expect(plain.indexOf(marks)).toBeGreaterThan(plain.indexOf(line));
    expect(order.indexOf(marks)).toBeLessThan(order.indexOf(line));
  });

  it('is saved and read back, and anything that is not an id is dropped', () => {
    const chart = make();
    const moved = chartOf(move(project(chart), idOf(chart, 'points'), -1));
    expect(parseProject(stringifyProject(project(moved))).charts[0].layerOrder).toEqual(moved.layerOrder);
    const raw = JSON.parse(stringifyProject(project(moved))) as { project: { charts: Array<Record<string, unknown>> } };
    const id = moved.layerOrder[0];
    raw.project.charts[0].layerOrder = [id, 7, null, id];
    expect(parseProject(JSON.stringify(raw)).charts[0].layerOrder).toEqual([id]);
    delete raw.project.charts[0].layerOrder;
    expect(parseProject(JSON.stringify(raw)).charts[0].layerOrder).toEqual([]);
  });
});

describe('merging a stored order with the order of the chart type', () => {
  it('keeps the stored order of the layers that are still there', () => {
    expect(mergeLayerOrder(['a', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'b']);
  });
  it('drops layers that are gone and repeats', () => {
    expect(mergeLayerOrder(['a', 'b'], ['x', 'b', 'a', 'b'])).toEqual(['b', 'a']);
  });
  it('puts a new layer above the one below it in the order of the chart type, or at the bottom when none is', () => {
    expect(mergeLayerOrder(['a', 'n', 'b', 'c'], ['c', 'a', 'b'])).toEqual(['c', 'a', 'n', 'b']);
    expect(mergeLayerOrder(['n', 'a', 'b'], ['b', 'a'])).toEqual(['n', 'b', 'a']);
  });
  it('is the order of the chart type when nothing is stored', () => {
    expect(mergeLayerOrder(['a', 'b'], [])).toEqual(['a', 'b']);
  });
});
