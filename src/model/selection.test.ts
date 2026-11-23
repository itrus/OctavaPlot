import { describe, expect, it } from 'vitest';
import { createExampleProject } from './defaults';
import type { Annotation } from './types';
import { type Selection, mixedAnnotationKeys, mixedPointStyleKeys, selectedAnnotationIds, selectedPoints, selectionOfAnnotations, selectionOfPoints, toggleAnnotationSelection, togglePointSelection, selectedGroupIds, mixedStyleKeys, mixedSummaryKeys, scopeGroupIds, selectionOfGroups, toggleGroupSelection } from './selection';
import { addAnnotation, composeCommands, patchAnnotations, patchPointStyle, clearGroupStyleSettings, clearGroupSummarySettings, clearSummaryOverrides, patchStyle, patchSummary, resetStyle } from '../state/commands';
import { dataLayer, isGroupOverridden } from './graph/style';
import { historyReducer, initialHistory } from '../state/history';
import { isSummaryOverridden } from './graph/summary';

const note = (id: string, over: Partial<Annotation> = {}): Annotation => ({ id, text: id, xFrac: 0.2, yFrac: 0.2, fontSizePt: 12, color: '#000000', opacity: 1, ...over });
const ref = (groupId: string, pointId: string) => ({ groupId, pointId });

describe('several points selected together', () => {
  it('reads the points of a point, the several, and none for anything else', () => {
    expect(selectedPoints({ kind: 'point', groupId: 'a', pointId: 'p1' })).toEqual([ref('a', 'p1')]);
    expect(selectedPoints({ kind: 'points', points: [ref('a', 'p1'), ref('b', 'p2')] })).toEqual([ref('a', 'p1'), ref('b', 'p2')]);
    expect(selectedPoints({ kind: 'group', groupId: 'a' })).toEqual([]);
    expect(selectedPoints({ kind: 'chart' })).toEqual([]);
  });
  it('makes the smallest selection that stands for them', () => {
    expect(selectionOfPoints([])).toEqual({ kind: 'chart' });
    expect(selectionOfPoints([ref('a', 'p1')])).toEqual({ kind: 'point', groupId: 'a', pointId: 'p1' });
    expect(selectionOfPoints([ref('a', 'p1'), ref('a', 'p2')])).toEqual({ kind: 'points', points: [ref('a', 'p1'), ref('a', 'p2')] });
  });
  it('adds a point to the points, takes it out when it is there, and starts afresh from anything else', () => {
    const one: Selection = { kind: 'point', groupId: 'a', pointId: 'p1' };
    const two = togglePointSelection(one, ref('b', 'p9'));
    expect(two).toEqual({ kind: 'points', points: [ref('a', 'p1'), ref('b', 'p9')] });
    expect(togglePointSelection(two, ref('a', 'p1'))).toEqual({ kind: 'point', groupId: 'b', pointId: 'p9' });
    expect(togglePointSelection({ kind: 'group', groupId: 'a' }, ref('a', 'p1'))).toEqual(one);
    expect(togglePointSelection({ kind: 'annotation', annotationId: 'n' }, ref('a', 'p1'))).toEqual(one);
  });
  it('stands for the data sets of its points, each once, in the order they were picked', () => {
    expect(selectedGroupIds({ kind: 'points', points: [ref('b', 'x'), ref('a', 'y'), ref('b', 'z')] })).toEqual(['b', 'a']);
  });
});

describe('several annotations selected together', () => {
  it('reads the annotations of an annotation or the several, and none for anything else', () => {
    expect(selectedAnnotationIds({ kind: 'annotation', annotationId: 'n1' })).toEqual(['n1']);
    expect(selectedAnnotationIds({ kind: 'annotations', annotationIds: ['n1', 'n2'] })).toEqual(['n1', 'n2']);
    expect(selectedAnnotationIds({ kind: 'point', groupId: 'a', pointId: 'p' })).toEqual([]);
  });
  it('makes the smallest selection that stands for them', () => {
    expect(selectionOfAnnotations([])).toEqual({ kind: 'chart' });
    expect(selectionOfAnnotations(['n1'])).toEqual({ kind: 'annotation', annotationId: 'n1' });
    expect(selectionOfAnnotations(['n1', 'n2'])).toEqual({ kind: 'annotations', annotationIds: ['n1', 'n2'] });
  });
  it('toggles an annotation and keeps the order of the chart', () => {
    const order = ['n1', 'n2', 'n3'];
    const a = toggleAnnotationSelection({ kind: 'annotation', annotationId: 'n3' }, 'n1', order);
    expect(a).toEqual({ kind: 'annotations', annotationIds: ['n1', 'n3'] });
    expect(toggleAnnotationSelection(a, 'n3', order)).toEqual({ kind: 'annotation', annotationId: 'n1' });
    expect(toggleAnnotationSelection({ kind: 'chart' }, 'n2', order)).toEqual({ kind: 'annotation', annotationId: 'n2' });
    expect(toggleAnnotationSelection({ kind: 'group', groupId: 'g' }, 'n2', order)).toEqual({ kind: 'annotation', annotationId: 'n2' });
  });
  it('finds the settings in which the annotations differ', () => {
    const same = mixedAnnotationKeys([note('a'), note('b')]);
    expect([...same]).toEqual([]);
    const differ = mixedAnnotationKeys([note('a'), note('b', { fontSizePt: 20, color: '#ff0000' }), note('c', { opacity: 0.5 })]);
    expect([...differ].sort()).toEqual(['color', 'fontSizePt', 'opacity']);
    expect([...mixedAnnotationKeys([note('a', { fontSizePt: 20 })])]).toEqual([]);
  });
  it('changes the settings of the annotations asked for, and no others, in one command', () => {
    const p = [note('n1'), note('n2'), note('n3')].reduce((acc, a) => addAnnotation('chart-x', a)(acc), (() => {
      const base = createExampleProject();
      return { ...base, charts: base.charts.map((c, i) => (i === 0 ? { ...c, id: 'chart-x' } : c)) };
    })());
    const after = patchAnnotations('chart-x', ['n1', 'n3'], { fontSizePt: 30, color: '#00ff00' })(p);
    const notes = after.charts[0].annotations;
    expect(notes.map((a) => a.fontSizePt)).toEqual([30, 12, 30]);
    expect(notes.map((a) => a.color)).toEqual(['#00ff00', '#000000', '#00ff00']);
    expect(notes.map((a) => a.text)).toEqual(['n1', 'n2', 'n3']);
  });
});

describe('the label settings in which several points differ', () => {
  const p = createExampleProject();
  const chart = p.charts[0];
  const table = p.dataTables.find((t) => t.id === chart.dataTableId)!;
  const g = table.groups[0];
  const [o1, o2, o3] = g.observations.map((o) => o.id);
  const edited = composeCommands(patchPointStyle(chart.id, o2, { pointLabelBold: true, pointLabelOffsetXPt: 7 }), patchPointStyle(chart.id, o3, { pointLabelBold: true }))(p);
  const chart2 = edited.charts[0];
  it('names the keys where the resolved values differ, and none for equal points', () => {
    const layer = dataLayer(chart2);
    expect([...mixedPointStyleKeys(chart2, layer, [{ group: g, pointId: o2 }, { group: g, pointId: o3 }])]).toEqual(['pointLabelOffsetXPt']);
    const keys = [...mixedPointStyleKeys(chart2, layer, [{ group: g, pointId: o1 }, { group: g, pointId: o2 }])].sort();
    expect(keys).toEqual(['pointLabelBold', 'pointLabelOffsetXPt']);
    expect([...mixedPointStyleKeys(chart2, layer, [{ group: g, pointId: o1 }])]).toEqual([]);
  });
});

const setup = () => {
  const p = createExampleProject();
  const chart = p.charts[0];
  const table = p.dataTables.find((t) => t.id === chart.dataTableId)!;
  return { p, chart, chartId: chart.id, table, ids: table.groups.map((g) => g.id), [0]: table.groups[0] };
};
const layerOf = (p: ReturnType<typeof setup>['p'], chartId: string) => dataLayer(p.charts.find((c) => c.id === chartId)!);

describe('the data sets a selection stands for', () => {
  const g = (groupId: string): Selection => ({ kind: 'group', groupId });
  it('reads the data set of a data set or a point, the several, and none for the chart or an annotation', () => {
    expect(selectedGroupIds(g('a'))).toEqual(['a']);
    expect(selectedGroupIds({ kind: 'point', groupId: 'a', pointId: 'p' })).toEqual(['a']);
    expect(selectedGroupIds({ kind: 'groups', groupIds: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(selectedGroupIds({ kind: 'chart' })).toEqual([]);
    expect(selectedGroupIds({ kind: 'annotation', annotationId: 'n' })).toEqual([]);
  });
  it('makes the selection of some data sets the smallest one that stands for them', () => {
    expect(selectionOfGroups([])).toEqual({ kind: 'chart' });
    expect(selectionOfGroups(['a'])).toEqual(g('a'));
    expect(selectionOfGroups(['a', 'b'])).toEqual({ kind: 'groups', groupIds: ['a', 'b'] });
  });
  it('lists the data sets of a scope in the order they are drawn', () => {
    expect(scopeGroupIds('all', ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(scopeGroupIds('b', ['a', 'b', 'c'])).toEqual(['b']);
    expect(scopeGroupIds(['c', 'a'], ['a', 'b', 'c'])).toEqual(['a', 'c']);
  });
});

describe('a click with Ctrl or Shift on a data set', () => {
  const order = ['a', 'b', 'c', 'd'];
  it('adds it to the selection, in drawing order, and takes it out again when it was there', () => {
    expect(toggleGroupSelection({ kind: 'chart' }, 'c', order)).toEqual({ kind: 'group', groupId: 'c' });
    expect(toggleGroupSelection({ kind: 'group', groupId: 'c' }, 'a', order)).toEqual({ kind: 'groups', groupIds: ['a', 'c'] });
    expect(toggleGroupSelection({ kind: 'groups', groupIds: ['a', 'c'] }, 'b', order)).toEqual({ kind: 'groups', groupIds: ['a', 'b', 'c'] });
    expect(toggleGroupSelection({ kind: 'groups', groupIds: ['a', 'c'] }, 'a', order)).toEqual({ kind: 'group', groupId: 'c' });
    expect(toggleGroupSelection({ kind: 'group', groupId: 'c' }, 'c', order)).toEqual({ kind: 'chart' });
  });
  it('lets a point stand for its data set', () => {
    expect(toggleGroupSelection({ kind: 'point', groupId: 'a', pointId: 'p' }, 'b', order)).toEqual({ kind: 'groups', groupIds: ['a', 'b'] });
  });
});

describe('what differs between data sets', () => {
  it('finds the settings whose drawn value is not the same in every one of them', () => {
    const { p, chart, chartId, table } = setup();
    const [a, b, c] = table.groups;
    const edited = composeCommands(patchStyle(chartId, a.id, { barOpacity: 0.4 }), patchStyle(chartId, b.id, { barOpacity: 0.4 }))(p);
    const layer = layerOf(edited, chartId);
    const c0 = edited.charts.find((x) => x.id === chart.id)!;
    expect(mixedStyleKeys(c0, layer, [a, b]).has('barOpacity')).toBe(false);
    expect(mixedStyleKeys(c0, layer, [a, c]).has('barOpacity')).toBe(true);
    expect(mixedStyleKeys(c0, layer, [a, b, c]).has('barOpacity')).toBe(true);
    // The palette gives each data set its own colour.
    expect(mixedStyleKeys(c0, layer, [a, b]).has('barFill')).toBe(true);
    expect(mixedStyleKeys(c0, layer, [a]).size).toBe(0);
  });
  it('finds the summary settings that differ', () => {
    const { p, chartId, table } = setup();
    const [a, b, c] = table.groups;
    const edited = composeCommands(patchSummary(chartId, a.id, { spread: 'sem' }), patchSummary(chartId, b.id, { spread: 'sem' }))(p);
    const layer = layerOf(edited, chartId);
    expect(mixedSummaryKeys(layer, [a.id, b.id]).has('spread')).toBe(false);
    expect(mixedSummaryKeys(layer, [a.id, c.id]).has('spread')).toBe(true);
    expect(mixedSummaryKeys(layer, [a.id]).size).toBe(0);
  });
});

describe('edits of several data sets together', () => {
  it('a style edit reaches exactly the selected data sets, in one history step', () => {
    const { p, chartId, table } = setup();
    const [a, b, c] = table.groups;
    const h = historyReducer(initialHistory(p), { type: 'commit', label: 'x', command: patchStyle(chartId, [a.id, c.id], { barOpacity: 0.3, barBorderWidthPt: 2 }), now: 0 });
    expect(h.past).toHaveLength(1);
    const layer = layerOf(h.present, chartId);
    expect(isGroupOverridden(layer, a.id, 'barOpacity')).toBe(true);
    expect(isGroupOverridden(layer, c.id, 'barBorderWidthPt')).toBe(true);
    expect(isGroupOverridden(layer, b.id, 'barOpacity')).toBe(false);
    const undone = historyReducer(h, { type: 'undo' });
    expect(isGroupOverridden(layerOf(undone.present, chartId), a.id, 'barOpacity')).toBe(false);
    expect(isGroupOverridden(layerOf(undone.present, chartId), c.id, 'barOpacity')).toBe(false);
  });
  it('a summary edit does the same', () => {
    const { p, chartId, table } = setup();
    const [a, b, c] = table.groups;
    const layer = layerOf(patchSummary(chartId, [a.id, b.id], { spread: 'sem' })(p), chartId);
    expect(isSummaryOverridden(layer, a.id, 'spread')).toBe(true);
    expect(isSummaryOverridden(layer, b.id, 'spread')).toBe(true);
    expect(isSummaryOverridden(layer, c.id, 'spread')).toBe(false);
  });
  it('the way back from single settings, and from a whole data set, covers every selected data set', () => {
    const { p, chartId, table } = setup();
    const [a, b, c] = table.groups;
    const edited = composeCommands(patchStyle(chartId, [a.id, b.id, c.id], { barOpacity: 0.3, barBorderWidthPt: 2 }), patchSummary(chartId, [a.id, b.id, c.id], { spread: 'sem' }))(p);
    const some = clearGroupStyleSettings(chartId, [a.id, b.id], ['barOpacity'])(edited);
    expect(isGroupOverridden(layerOf(some, chartId), a.id, 'barOpacity')).toBe(false);
    expect(isGroupOverridden(layerOf(some, chartId), b.id, 'barOpacity')).toBe(false);
    expect(isGroupOverridden(layerOf(some, chartId), c.id, 'barOpacity')).toBe(true);
    expect(isGroupOverridden(layerOf(some, chartId), a.id, 'barBorderWidthPt')).toBe(true);
    const sum = clearGroupSummarySettings(chartId, [a.id, b.id], ['spread'])(edited);
    expect(isSummaryOverridden(layerOf(sum, chartId), a.id, 'spread')).toBe(false);
    expect(isSummaryOverridden(layerOf(sum, chartId), c.id, 'spread')).toBe(true);
    const reset = composeCommands(resetStyle(chartId, [a.id, b.id], table), clearSummaryOverrides(chartId, [a.id, b.id]))(edited);
    const layer = layerOf(reset, chartId);
    expect(layer.groupOverrides[a.id]).toBeUndefined();
    expect(layer.groupOverrides[b.id]).toBeUndefined();
    expect(layer.groupOverrides[c.id]).toBeDefined();
    expect(layer.groupSummary[a.id]).toBeUndefined();
    expect(layer.groupSummary[c.id]).toBeDefined();
  });
  it('one id and a list of one behave alike', () => {
    const { p, chartId, table } = setup();
    const a = table.groups[0];
    expect(layerOf(patchStyle(chartId, [a.id], { barOpacity: 0.3 })(p), chartId)).toEqual(layerOf(patchStyle(chartId, a.id, { barOpacity: 0.3 })(p), chartId));
  });
});
