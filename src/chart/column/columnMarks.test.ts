import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import type { Chart, ChartType } from '../../model/types';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { compileColumnMarks } from './columnMarks';
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
