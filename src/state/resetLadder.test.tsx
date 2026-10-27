import type { ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { dataLayer, isGroupOverridden, resolveStyle } from '../model/graph/style';
import { isSummaryOverridden, resolveSummary } from '../model/graph/summary';
import type { Project } from '../model/types';
import { Field, GroupBox, NumField } from '../ui/inspector/common/controls';
import { clearGroupStyleSettings, clearGroupSummarySettings, clearSummaryOverrides, composeCommands, patchStyle, patchSummary, resetAllDataSets, resetStyle } from './commands';

const setup = () => {
  const p = createExampleProject();
  const chart = p.charts[0];
  const table = p.dataTables.find((t) => t.id === chart.dataTableId)!;
  return { p, chartId: chart.id, table, a: table.groups[0], b: table.groups[1] };
};
const layerOf = (p: Project, chartId: string) => dataLayer(p.charts.find((c) => c.id === chartId)!);

describe('field level: the way back from one overridden setting', () => {
  it('clears only the named settings of one data set, so the graph value shows again', () => {
    const { p, chartId, a, b } = setup();
    const set = composeCommands(patchStyle(chartId, a.id, { barOpacity: 0.4, barBorderWidthPt: 3 }), patchStyle(chartId, b.id, { barOpacity: 0.2 }));
    const edited = set(p);
    const chart = edited.charts[0];
    expect(isGroupOverridden(layerOf(edited, chartId), a.id, 'barOpacity')).toBe(true);
    const cleared = clearGroupStyleSettings(chartId, a.id, ['barOpacity'])(edited);
    const layer = layerOf(cleared, chartId);
    expect(isGroupOverridden(layer, a.id, 'barOpacity')).toBe(false);
    expect(resolveStyle(cleared.charts[0], layer, a).barOpacity).toBe(resolveStyle(chart, { ...layerOf(edited, chartId), groupOverrides: {} }, a).barOpacity);
    // The other setting of the same data set, and the other data set, are untouched.
    expect(isGroupOverridden(layer, a.id, 'barBorderWidthPt')).toBe(true);
    expect(isGroupOverridden(layer, b.id, 'barOpacity')).toBe(true);
  });
  it('drops an override that has nothing left in it, and changes nothing when the setting was not overridden', () => {
    const { p, chartId, a } = setup();
    const edited = patchStyle(chartId, a.id, { barOpacity: 0.4 })(p);
    const cleared = clearGroupStyleSettings(chartId, a.id, ['barOpacity'])(edited);
    expect(layerOf(cleared, chartId).groupOverrides[a.id]).toBeUndefined();
    expect(clearGroupStyleSettings(chartId, a.id, ['barOpacity'])(cleared)).toBe(cleared);
  });
  it('does the same for the summary settings of a data set', () => {
    const { p, chartId, a, b } = setup();
    const edited = composeCommands(patchSummary(chartId, a.id, { confidenceLevel: 0.9, spread: 'sem' }), patchSummary(chartId, b.id, { confidenceLevel: 0.99 }))(p);
    const cleared = clearGroupSummarySettings(chartId, a.id, ['confidenceLevel'])(edited);
    const layer = layerOf(cleared, chartId);
    expect(isSummaryOverridden(layer, a.id, 'confidenceLevel')).toBe(false);
    expect(resolveSummary(layer, a.id).confidenceLevel).toBe(layer.summary.confidenceLevel);
    expect(isSummaryOverridden(layer, a.id, 'spread')).toBe(true);
    expect(isSummaryOverridden(layer, b.id, 'confidenceLevel')).toBe(true);
    expect(clearGroupSummarySettings(chartId, a.id, ['confidenceLevel'])(cleared)).toBe(cleared);
  });
});

describe('data set level: one data set back to the graph', () => {
  it('clears its style, its summary settings and its points, and leaves the other data sets alone', () => {
    const { p, chartId, table, a, b } = setup();
    const edited = composeCommands(patchStyle(chartId, a.id, { barOpacity: 0.4 }), patchSummary(chartId, a.id, { spread: 'sem' }), patchStyle(chartId, b.id, { barOpacity: 0.2 }), patchSummary(chartId, b.id, { spread: 'sem' }))(p);
    const reset = composeCommands(resetStyle(chartId, a.id, table), clearSummaryOverrides(chartId, a.id))(edited);
    const layer = layerOf(reset, chartId);
    expect(layer.groupOverrides[a.id]).toBeUndefined();
    expect(layer.groupSummary[a.id]).toBeUndefined();
    expect(layer.groupOverrides[b.id]).toEqual({ barOpacity: 0.2 });
    expect(layer.groupSummary[b.id]).toEqual({ spread: 'sem' });
  });
});

describe('graph level: everything back to a new graph, with what it shows kept', () => {
  it('keeps the title, annotations and data sets shown, and drops every data set override', () => {
    const { p, chartId, a } = setup();
    const edited = patchStyle(chartId, a.id, { barOpacity: 0.4 })({ ...p, charts: p.charts.map((c) => ({ ...c, title: 'My title', annotations: [{ id: 'n', text: 'x', xFrac: 0.5, yFrac: 0.5, fontSizePt: 12, color: '#000000', opacity: 1 }] })) });
    const reset = resetAllDataSets(chartId)(edited);
    expect(reset.charts[0].title).toBe('My title');
    expect(reset.charts[0].annotations).toHaveLength(1);
    expect(layerOf(reset, chartId).groupOverrides).toEqual({});
  });
});

describe('the dot beside an overridden setting', () => {
  const html = (node: ReactElement) => renderToStaticMarkup(node);
  it('is a plain mark when there is no way back, and a named button that resets when there is', () => {
    const plain = html(<Field label="Opacity" overridden><span /></Field>);
    expect(plain).toContain('override-dot');
    expect(plain).not.toContain('<button');
    const button = html(<Field label="Opacity" overridden={() => undefined}><span /></Field>);
    expect(button).toMatch(/<button[^>]*class="override-dot override-reset"/);
    expect(button).toContain('aria-label="Reset Opacity to the graph&#x27;s value"');
    expect(html(<Field label="Opacity" overridden={false}><span /></Field>)).not.toContain('override');
  });
  it('is the same on number fields and group boxes', () => {
    expect(html(<NumField label="Border" value={1} min={0} max={5} overridden={() => undefined} onCommit={() => undefined} />)).toContain('aria-label="Reset Border to the graph&#x27;s value"');
    expect(html(<GroupBox title="Bars" overridden={() => undefined}><span /></GroupBox>)).toContain('aria-label="Reset Bars to the graph&#x27;s value"');
  });
});
