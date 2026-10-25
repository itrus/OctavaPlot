import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createChart, createGroupedTable } from '../../model/defaults';
import type { Chart, ChartType } from '../../model/types';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { buildGroupedModel } from './groupedModel';
import { compileGroupedMarks } from './groupedMarks';
import type { SceneElement } from '../shared/scene/sceneElement';

const table = createGroupedTable('Replicates', true, { kind: 'replicates', n: 4 });
const chartOf = (type: ChartType, patch: Partial<Chart> = {}): Chart => {
  const c = createChart(table.id, undefined, type);
  return { ...c, ...patch, layers: c.layers.map((l, i) => (i === 0 ? { ...l, summary: { ...l.summary, spread: 'sd' as const }, style: { ...l.style, showErrorBars: true, showMeanLine: true, showSymbols: true, showLines: true } } : l)) };
};
type Hit = NonNullable<SceneElement['hit']>;
const hits = (nodes: ReadonlyArray<SceneElement>): Hit[] => nodes.flatMap((n) => [...(n.hit ? [n.hit] : []), ...hits(n.children ?? [])]);
const attrsOf = (h: Hit): string => `data-hit="${h.kind}"${h.groupId ? ` data-group-id="${h.groupId}"` : ''}${h.objectId ? ` data-object-id="${h.objectId}"` : ''}`;
const svg = (chart: Chart, editor?: { groupId: string }) =>
  renderToStaticMarkup(createElement(ChartCanvas, { chart, any: buildAnyModel(chart, table), cssWidth: '600px', cssHeight: '400px', ...(editor ? { editor: { selection: { kind: 'group' as const, groupId: editor.groupId } } } : {}) }));
const selectionIds = (nodes: ReadonlyArray<SceneElement>): string[] => nodes.flatMap((n) => [...(n.whenSelected !== undefined ? [n.whenSelected] : []), ...selectionIds(n.children ?? [])]);

describe('the data marks of a grouped chart as a scene', () => {
  it('are compiled once, when first asked for, and are not part of what a comparison of the scene sees', () => {
    const chart = chartOf('groupedBar');
    const model = buildGroupedModel(chart, table);
    expect(Object.keys(model.scene!)).not.toContain('marks');
    expect(model.scene!.marks).toBe(model.scene!.marks);
    expect(model.scene!.marks).toEqual(compileGroupedMarks(chart, model));
  });

  it.each(['groupedBar', 'groupedStacked', 'groupedFloating', 'groupedLine', 'groupedBox', 'groupedViolin'] as const)('give the editor the hit targets the scene says, and an export none: %s', (type) => {
    const chart = chartOf(type);
    const targets = hits(compileGroupedMarks(chart, buildGroupedModel(chart, table)));
    expect(targets.length).toBeGreaterThan(0);
    const editor = svg(chart, { groupId: table.groups[0].id });
    for (const t of new Set(targets.map(attrsOf))) expect(editor).toContain(t);
    expect(svg(chart)).not.toContain('data-hit');
  });

  it('show the glow and the frame of a series only while that series is selected, and only in the editor', () => {
    const chart = chartOf('groupedLine');
    const model = buildGroupedModel(chart, table);
    const owners = new Set(selectionIds(compileGroupedMarks(chart, model)));
    expect([...owners]).toEqual(model.series.map((s) => s.groupId));
    const [first, second] = model.series.map((s) => s.groupId);
    const marks = (markup: string) => (markup.match(/data-editor-only="true"/g) ?? []).length;
    expect(marks(svg(chart))).toBe(0);
    const one = marks(svg(chart, { groupId: first }));
    expect(one).toBeGreaterThan(0);
    expect(marks(svg(chart, { groupId: second }))).toBe(one);
    expect(marks(svg(chart, { groupId: 'nothing' }))).toBe(0);
  });

  it('turn a horizontal chart as a whole: one matrix, the symbols upright', () => {
    const chart = chartOf('groupedBar', { orientation: 'horizontal' });
    const model = buildGroupedModel(chart, table);
    const [clip] = model.scene!.marks!;
    const turned = clip.children!.filter((n) => n.tag === 'g' && n.attrs?.some(([k]) => k === 'transform'));
    expect(turned.length).toBeGreaterThan(0);
    expect(turned.every((g) => g.attrs!.find(([k]) => k === 'transform')![1] === model.orient.matrix)).toBe(true);
    expect(clip.children!.some((n) => n.tag === 'path' && n.hit?.kind === 'point')).toBe(true);
  });

  it('go in the order the chart asks for', () => {
    const order = (lineOrder: Chart['lineOrder']) => {
      const chart = chartOf('groupedBar', { lineOrder });
      const marks = compileGroupedMarks(chart, buildGroupedModel(chart, table))[0].children!;
      const firstOf = (kind: string) => marks.findIndex((n) => hits([n]).some((h) => h.kind === kind));
      return { bar: firstOf('bar'), error: firstOf('error'), point: firstOf('point') };
    };
    const auto = order('auto');
    expect(auto.bar).toBeLessThan(auto.error);
    expect(auto.error).toBeLessThan(auto.point);
    expect(order('onTop').point).toBeLessThan(order('onTop').error);
    expect(order('underneath').error).toBeLessThan(order('underneath').bar);
  });
});
