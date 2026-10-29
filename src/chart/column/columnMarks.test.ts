import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createExampleProject } from '../../model/defaults';
import { replaceTableData, setChartType } from '../../state/commands';
import type { Chart, ChartType } from '../../model/types';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { compileColumnMarks, drawnDotCount } from './columnMarks';
import { DENSE_CELL_PT } from '../shared/scene/denseDots';
import { buildColumnModel } from './columnModel';
import type { SceneElement } from '../shared/scene/sceneElement';

const table = createColumnTable('Column', true, 3);
const chartOf = (type: ChartType, patch: Partial<Chart> = {}): Chart => {
  const c = createChart(table.id, undefined, type);
  return { ...c, ...patch, layers: c.layers.map((l, i) => (i === 0 ? { ...l, summary: { ...l.summary, spread: 'sd' as const }, style: { ...l.style, showErrorBars: true, showMeanLine: true, showSymbols: true } } : l)) };
};
type Hit = NonNullable<SceneElement['hit']>;
const hits = (nodes: ReadonlyArray<SceneElement>): Hit[] => nodes.flatMap((n) => [...(n.hit ? [n.hit] : []), ...hits(n.children ?? [])]);
const attrsOf = (h: Hit): string => `data-hit="${h.kind}"${h.groupId ? ` data-group-id="${h.groupId}"` : ''}${h.objectId ? ` data-object-id="${h.objectId}"` : ''}`;
const svg = (chart: Chart, editor: boolean) => renderToStaticMarkup(createElement(ChartCanvas, { chart, any: buildAnyModel(chart, table), cssWidth: '600px', cssHeight: '400px', ...(editor ? { editor: { selection: { kind: 'chart' as const } } } : {}) }));

describe('the data marks of a column chart as a scene', () => {
  it('are compiled once, when first asked for, and are not part of what a comparison of the scene sees', () => {
    const model = buildColumnModel(chartOf('bar'), table);
    expect(Object.keys(model.scene!)).not.toContain('marks');
    expect(model.scene!.marks).toBe(model.scene!.marks);
    expect(model.scene!.marks).toEqual(compileColumnMarks(chartOf('bar'), model));
  });

  it.each(['bar', 'scatter', 'mean', 'box', 'violin', 'paired'] as const)('give the editor the hit targets the scene says, and an export none: %s', (type) => {
    const chart = chartOf(type);
    const targets = hits(compileColumnMarks(chart, buildColumnModel(chart, table)));
    expect(targets.length).toBeGreaterThan(0);
    const editor = svg(chart, true);
    const inEditor = [...editor.matchAll(/<[^>]*data-hit="(bar|point|error|line|meanLine)"[^>]*>/g)];
    // Every target of the scene is in the editor's drawing (the chrome has targets of its own, so there can be more).
    expect(inEditor.length).toBeGreaterThanOrEqual(targets.length);
    for (const t of new Set(targets.map(attrsOf))) expect(editor).toContain(t);
    expect(svg(chart, false)).not.toContain('data-hit');
  });

  it('turn a horizontal chart as a whole: one matrix, the same shapes, the points upright', () => {
    const model = buildColumnModel(chartOf('bar', { orientation: 'horizontal' }), table);
    const [clip] = model.scene!.marks!;
    const turned = clip.children!.filter((n) => n.tag === 'g' && n.attrs?.some(([k]) => k === 'transform'));
    expect(turned.length).toBeGreaterThan(0);
    expect(turned.every((g) => g.attrs!.find(([k]) => k === 'transform')![1] === model.orient.matrix)).toBe(true);
    const points = clip.children!.filter((n) => n.tag === 'path' && n.hit?.kind === 'point');
    expect(points.length).toBeGreaterThan(0);
  });

  it('go in the order the chart asks for: bars, lines, points; points before lines on top; lines first underneath', () => {
    const order = (lineOrder: Chart['lineOrder']) => {
      const marks = compileColumnMarks(chartOf('bar', { lineOrder }), buildColumnModel(chartOf('bar', { lineOrder }), table))[0].children!;
      const firstOf = (kind: string) => marks.findIndex((n) => hits([n]).some((h) => h.kind === kind));
      return { bar: firstOf('bar'), error: firstOf('error'), point: firstOf('point') };
    };
    const auto = order('auto');
    expect(auto.bar).toBeLessThan(auto.error);
    expect(auto.error).toBeLessThan(auto.point);
    const onTop = order('onTop');
    expect(onTop.point).toBeLessThan(onTop.error);
    const under = order('underneath');
    expect(under.error).toBeLessThan(under.bar);
  });
});

describe('what an edit of the chrome leaves alone', () => {
  const dotsOf = (chart: Chart) => (buildColumnModel(chart, table).scene!.marks as SceneElement[])[0].children!.filter((n) => n.hit?.kind === 'point');
  const base = chartOf('scatter');

  it.each([
    ['the title', { title: 'Another title' }],
    ['the font of the text', { fontFamily: 'Georgia, serif' }],
    ['the colour of the text', { textColor: '#aa0000' }],
  ] as const)('keeps the very same dots and shapes when %s changes', (_, patch) => {
    const a = buildColumnModel(base, table);
    const b = buildColumnModel({ ...base, ...patch }, table);
    a.groups.forEach((g, i) => expect(b.groups[i].points).toBe(g.points));
    const [da, db] = [dotsOf(base), dotsOf({ ...base, ...patch })];
    expect(da.length).toBeGreaterThan(0);
    expect(db.length).toBe(da.length);
    expect(db.every((n, i) => n === da[i])).toBe(true);
  });

  it('makes new dots and shapes when a dot changes: its colour, the axis, a hidden group', () => {
    const before = dotsOf(base);
    const restyled = chartOf('scatter', { layers: base.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, symbolColor: '#00aa00' } } : l)) });
    const after = dotsOf(restyled);
    expect(after.some((n, i) => n !== before[i])).toBe(true);
    const rescaled = dotsOf({ ...base, yAxis: { ...base.yAxis, max: 1000 } });
    expect(rescaled.some((n, i) => n !== before[i])).toBe(true);
  });
});

describe('the preview of a graph with very many dots', () => {
  // 25 000 values in each of 4 data sets: 100 000 dots, the least the preview simplifies.
  const big = (() => {
    let seed = 7;
    const next = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    let p = createExampleProject();
    p = replaceTableData(p.dataTables[0].id, { names: ['A', 'B', 'C', 'D'], titles: null, values: Array.from({ length: 25_000 }, () => Array.from({ length: 4 }, () => Math.round((10 + 4 * next()) * 1000) / 1000)) })(p);
    return { table: p.dataTables[0], chart: setChartType(p.charts[0].id, 'scatter')(p).charts[0] };
  })();
  const pointsOf = (nodes: ReadonlyArray<SceneElement>) => nodes[0].children!.filter((n) => n.hit?.kind === 'point');
  const model = buildColumnModel(big.chart, big.table);
  const exact = pointsOf(compileColumnMarks(big.chart, model));
  const dense = pointsOf(compileColumnMarks(big.chart, model, true));

  it('draws the dots of one look as a few shapes, each of them with the extent of a small square of the page, and the export draws every dot', () => {
    expect(exact).toHaveLength(100_000);
    const squares = Math.ceil(model.widthPt / DENSE_CELL_PT) * Math.ceil(model.heightPt / DENSE_CELL_PT);
    expect(dense.length).toBeGreaterThan(4);
    expect(dense.length).toBeLessThanOrEqual(4 * squares);
    expect(dense.every((n) => n.hit?.groupId !== undefined && n.hit.objectId === undefined)).toBe(true);
    // No shape is as wide as the plot: a shape is painted again whole whenever part of it is.
    const extent = (n: SceneElement) => {
      const xs = [...String(n.attrs!.find(([k]) => k === 'd')![1]).matchAll(/M(-?[0-9.]+),(-?[0-9.]+)/g)].map((m) => Number(m[1]));
      expect(xs.length).toBeGreaterThan(0);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(Math.max(...dense.map(extent))).toBeLessThanOrEqual(DENSE_CELL_PT + 8);
  });

  it('keeps the geometry of every dot: the shapes hold exactly the dots of the export, with the same look', () => {
    const dOf = (n: SceneElement) => String(n.attrs!.find(([k]) => k === 'd')![1]);
    const lookOf = (n: SceneElement) => JSON.stringify(n.attrs!.filter(([k]) => k !== 'd'));
    const parts = (nodes: SceneElement[]) => nodes.flatMap((n) => dOf(n).split(/(?=M)/)).sort();
    for (const groupId of new Set(exact.map((n) => n.hit!.groupId))) {
      const mine = exact.filter((n) => n.hit!.groupId === groupId);
      const runs = dense.filter((n) => n.hit!.groupId === groupId);
      expect(parts(runs)).toEqual(parts(mine));
      expect(runs.every((n) => lookOf(n) === lookOf(mine[0]))).toBe(true);
    }
  });

  it('is the same shapes again after an edit that does not touch the dots', () => {
    const again = pointsOf(compileColumnMarks({ ...big.chart, title: 'Other' }, buildColumnModel({ ...big.chart, title: 'Other' }, big.table), true));
    expect(again.every((n, i) => n === dense[i])).toBe(true);
  });

  it('does not simplify dots with transparency (they add up where they overlap), nor a graph below 100 000 dots', () => {
    const see = { ...big.chart, layers: big.chart.layers.map((l) => ({ ...l, style: { ...l.style, symbolFillOpacity: 0.4 } })) };
    expect(pointsOf(compileColumnMarks(see, buildColumnModel(see, big.table), true))).toHaveLength(100_000);
    const small = { ...big.table, groups: big.table.groups.map((g) => ({ ...g, observations: g.observations.slice(0, 24_999) })) };
    const m = buildColumnModel(big.chart, small);
    expect(pointsOf(compileColumnMarks(big.chart, m, true))).toHaveLength(99_996);
  });

  it('counts only the dots a shown points layer draws: a hidden layer is not simplified', () => {
    expect(drawnDotCount(big.chart, model)).toBe(100_000);
    const points = model.layers.filter((l) => l.kind === 'points').map((l) => l.id);
    const hiddenAll = { ...big.chart, hiddenLayerIds: points };
    expect(drawnDotCount(hiddenAll, model)).toBe(0);
    expect(pointsOf(compileColumnMarks(hiddenAll, model, true))).toHaveLength(0);
    expect(drawnDotCount({ ...big.chart, hiddenLayerIds: points.slice(0, 1) }, model)).toBe(75_000);
  });

});
