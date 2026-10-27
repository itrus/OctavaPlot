import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../defaults';
import type { Selection } from '../../types';
import { historyReducer, initialHistory } from '../../../state/history';
import { clearGroupStyleSettings, clearGroupSummarySettings, clearSummaryOverrides, composeCommands, patchStyle, patchSummary, resetStyle } from '../../../state/commands';
import { mixedStyleKeys, mixedSummaryKeys, scopeGroupIds, scopeOfSelection, selectedGroupIds, selectionOfGroups, toggleGroupSelection } from './scope';
import { dataLayer, isGroupOverridden } from '../style';
import { isSummaryOverridden } from '../summary';

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
  it('gives the scope an inspector edits: all, one, or the several', () => {
    expect(scopeOfSelection({ kind: 'chart' })).toBe('all');
    expect(scopeOfSelection(g('a'))).toBe('a');
    expect(scopeOfSelection({ kind: 'groups', groupIds: ['a', 'b'] })).toEqual(['a', 'b']);
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
