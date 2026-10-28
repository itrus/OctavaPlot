import { describe, expect, it } from 'vitest';
import { createChart, createContingencyTable, createGroupedTable } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { Chart, ChartType, DataTable } from '../../model/types';
import { patchLayerStyle, setLayerHidden, setLayerRange } from '../../state/commands';
import { afterCommands, markIds, reopened } from '../../testing/partChecks';
import { chartToSvgString } from '../export/export';
import { buildGroupedModel } from './groupedModel';

const replicates = createGroupedTable('Replicates', true, { kind: 'replicates', n: 4 });
const counts = createContingencyTable('Counts', true);
/** The same table with one replicate far from the rest. */
const far: DataTable = { ...replicates, groups: replicates.groups.map((g, i) => (i === 1 ? { ...g, observations: g.observations.map((o, r) => (r === 0 ? { ...o, value: 500 } : o)) } : g)) };
const chartOf = (type: ChartType, table: DataTable = replicates): Chart => {
  const c = createChart(table.id, undefined, type);
  return { ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, summary: { ...l.summary, spread: 'sd' as const }, style: { ...l.style, showErrorBars: true, showMeanLine: true, showSymbols: true, showLines: true } } : l)) };
};
const idOf = (chart: Chart, kind: string, at = 0, table: DataTable = replicates) => layersOf(chart, table).filter((l) => l.kind === kind)[at].id;
const svg = (chart: Chart, table: DataTable = replicates) => chartToSvgString(chart, table);
/** n, centre and interval of every cell: what the axis and the layers must leave as they are. */
const cells = (chart: Chart, table: DataTable = replicates) => buildGroupedModel(chart, table).series.map((s) => s.bars.map((b) => [b.stats?.n, b.stats?.centre, b.stats?.interval.lower, b.stats?.interval.upper]));
const top = (chart: Chart, table: DataTable = replicates) => buildGroupedModel(chart, table).y.domain[1];

describe('the look of the parts of a grouped chart', () => {
  it('is given to one part and drawn: error bars, individual values, centre lines, the line of a chart of lines and its means', () => {
    const cases: Array<[ChartType, string]> = [['groupedBar', 'errorBars'], ['groupedBar', 'rawPoints'], ['groupedBar', 'meanLine'], ['groupedLine', 'line'], ['groupedLine', 'points'], ['groupedLine', 'errorBars'], ['groupedFloating', 'meanLine']];
    for (const [type, kind] of cases) {
      const chart = chartOf(type);
      const id = idOf(chart, kind);
      const styled = afterCommands(chart, replicates, patchLayerStyle(chart.id, id, { color: '#ff0000', widthPt: 7.5 }));
      expect(styled.layerStyles[id]).toEqual({ color: '#ff0000', widthPt: 7.5 });
      const [before, after] = [svg(chart), svg(styled)];
      expect(after).not.toBe(before);
      expect(after.match(/#ff0000/gi)?.length ?? 0).toBeGreaterThan(before.match(/#ff0000/gi)?.length ?? 0);
    }
  });

  it('is drawn on the part of one data set only', () => {
    const chart = chartOf('groupedBar');
    const first = idOf(chart, 'rawPoints');
    const styled = afterCommands(chart, replicates, patchLayerStyle(chart.id, first, { shape: 'square', color: '#00aa00' }));
    const dots = buildGroupedModel(styled, replicates);
    expect(dots.series[0].dots.length).toBeGreaterThan(0);
    // The marks of the second data set are drawn in its own look: only the first one's got the green.
    const green = svg(styled).match(/ fill="#00aa00"/gi)?.length ?? 0;
    expect(green).toBe(dots.series[0].dots.length);
  });

  it('offers only what the drawing honours, and nothing for the bars, the boxes or a stacked chart', () => {
    const takes = (type: ChartType, kind: string, table: DataTable = replicates) => layerRows(chartOf(type, table), table).find((r) => r.layer.kind === kind)?.takes ?? null;
    expect(takes('groupedBar', 'errorBars')).toEqual(['color', 'widthPt', 'opacity']);
    expect(takes('groupedBar', 'rawPoints')).toEqual(['color', 'widthPt', 'opacity', 'shape']);
    expect(takes('groupedLine', 'line')).toEqual(['color', 'widthPt', 'lineStyle', 'opacity']);
    // The dots of a box plot have a fixed shape; the box is styled with the fill of the data set.
    expect(takes('groupedBox', 'rawPoints')).toEqual(['color', 'widthPt', 'opacity']);
    expect(takes('groupedBox', 'bars')).toBeNull();
    expect(takes('groupedBar', 'bars')).toBeNull();
    for (const type of ['contingencyBars', 'contingencyStacked', 'contingencyPercent'] as const) {
      expect(layerRows(chartOf(type, counts), counts).every((r) => r.takes === null && r.inRange === null)).toBe(true);
    }
    const stacked = chartOf('groupedStacked');
    expect(afterCommands(stacked, replicates, patchLayerStyle(stacked.id, idOf(stacked, 'bars'), { color: '#ff0000' })).layerStyles).toEqual({});
  });

  it('does not change the ids of the layers or of the marks', () => {
    for (const type of ['groupedBar', 'groupedLine', 'groupedFloating', 'groupedBox'] as const) {
      const chart = chartOf(type);
      let styled = chart;
      for (const l of layersOf(chart, replicates)) {
        for (const [key, value] of [['color', '#336699'], ['widthPt', 4], ['opacity', 0.5], ['shape', 'diamond']] as const) styled = afterCommands(styled, replicates, patchLayerStyle(chart.id, l.id, { [key]: value }));
      }
      expect(Object.keys(styled.layerStyles).length).toBeGreaterThan(0);
      expect(layersOf(styled, replicates).map((l) => l.id)).toEqual(layersOf(chart, replicates).map((l) => l.id));
      expect(markIds(svg(styled))).toEqual(markIds(svg(chart)));
    }
  });

  it('is taken back with null, and the chart is then drawn exactly as before', () => {
    const chart = chartOf('groupedBar');
    const id = idOf(chart, 'errorBars');
    const styled = afterCommands(chart, replicates, patchLayerStyle(chart.id, id, { color: '#ff0000' }));
    const back = afterCommands(styled, replicates, patchLayerStyle(chart.id, id, { color: null }));
    expect(back.layerStyles).toEqual({});
    expect(svg(back)).toBe(svg(chart));
  });
});

describe('hiding a part of a grouped chart', () => {
  it('does not change n, the statistics or the axis, and the marks of the other parts keep their ids', () => {
    for (const type of ['groupedBar', 'groupedLine', 'groupedFloating', 'groupedBox'] as const) {
      const chart = chartOf(type);
      for (const kind of ['errorBars', 'rawPoints', 'points', 'meanLine', 'line', 'bars']) {
        const layers = layersOf(chart, far).filter((l) => l.kind === kind);
        if (layers.length === 0) continue;
        const hidden = afterCommands(chart, far, ...layers.map((l) => setLayerHidden(chart.id, l.id, true)));
        expect(top(hidden, far)).toBe(top(chart, far));
        expect(cells(hidden, far)).toEqual(cells(chart, far));
        expect(buildGroupedModel(hidden, far).warnings).toEqual(buildGroupedModel(chart, far).warnings);
        const before = markIds(svg(chart, far));
        expect(markIds(svg(hidden, far)).every((id) => before.includes(id))).toBe(true);
      }
    }
  });
});

describe('keeping a part of a grouped chart out of the axis range', () => {
  const rangeOut = (chart: Chart, t: DataTable, kind: string) => afterCommands(chart, t, ...layersOf(chart, t).filter((l) => l.kind === kind).map((l) => setLayerRange(chart.id, l.id, false)));

  it('changes the axis and nothing else', () => {
    const chart = chartOf('groupedBar');
    const out = rangeOut(chart, far, 'rawPoints');
    expect(top(chart, far)).toBeGreaterThanOrEqual(500);
    expect(top(out, far)).toBeLessThan(top(chart, far));
    expect(cells(out, far)).toEqual(cells(chart, far));
    expect(out.hiddenLayerIds).toEqual(chart.hiddenLayerIds);
    expect(layersOf(out, far).map((l) => [l.id, l.visible, l.z])).toEqual(layersOf(chart, far).map((l) => [l.id, l.visible, l.z]));
    expect(buildGroupedModel(out, far).series.map((s) => s.dots.length)).toEqual(buildGroupedModel(chart, far).series.map((s) => s.dots.length));
    expect(markIds(svg(out, far))).toEqual(markIds(svg(chart, far)));
    // With the dots out the far value no longer holds the axis, the end of the error bar does; and that can go too.
    expect(top(rangeOut(out, far, 'errorBars'), far)).toBeLessThan(top(out, far));
  });

  it('applies to the error bars of a chart of lines, to floating bars and to the box and dots of a box plot', () => {
    const lines = chartOf('groupedLine');
    expect(top(rangeOut(lines, far, 'errorBars'), far)).toBeLessThan(top(lines, far));
    const floating = chartOf('groupedFloating');
    expect(top(floating, far)).toBeGreaterThanOrEqual(500);
    expect(top(rangeOut(floating, far, 'bars'), far)).toBeLessThan(top(floating, far));
    const box = chartOf('groupedBox');
    expect(top(rangeOut(box, far, 'bars'), far)).toBeLessThan(top(box, far));
    expect(top(rangeOut(box, far, 'rawPoints'), far)).toBeLessThanOrEqual(top(box, far));
  });

  it('is not what hiding does, and is not offered where the range is the totals of the stack', () => {
    const chart = chartOf('groupedBar');
    const hidden = afterCommands(chart, far, ...layersOf(chart, far).filter((l) => l.kind === 'rawPoints').map((l) => setLayerHidden(chart.id, l.id, true)));
    expect(top(hidden, far)).toBe(top(chart, far));
    const rows = (c: Chart) => new Set(layerRows(c, far).filter((r) => r.inRange !== null).map((r) => r.layer.kind));
    expect(rows(chart)).toEqual(new Set(['errorBars', 'rawPoints']));
    expect(rows(chartOf('groupedStacked')).size).toBe(0);
    expect(rows(chartOf('groupedLine'))).toEqual(new Set(['errorBars']));
  });
});

describe('the look and range of the parts of a grouped chart in a saved file', () => {
  it('come back when the file is opened again, and so does the drawing', () => {
    const chart = chartOf('groupedBar');
    const dots = idOf(chart, 'rawPoints');
    const styled = afterCommands(chart, far, patchLayerStyle(chart.id, dots, { color: '#ff0000', shape: 'star' }), patchLayerStyle(chart.id, idOf(chart, 'errorBars'), { widthPt: 6 }), setLayerRange(chart.id, dots, false), setLayerHidden(chart.id, idOf(chart, 'errorBars', 1), true));
    const back = reopened(styled, far);
    expect(back.layerStyles).toEqual(styled.layerStyles);
    expect(back.rangeExcludedLayerIds).toEqual([dots]);
    expect(back.hiddenLayerIds).toEqual(styled.hiddenLayerIds);
    expect(svg(back, far)).toBe(svg(styled, far));
    expect(top(back, far)).toBe(top(styled, far));
  });

  it('are absent from a file of an older version, which opens and is drawn as it always was', () => {
    const chart = chartOf('groupedBar');
    const old = JSON.parse(JSON.stringify(chart)) as Record<string, unknown>;
    delete old.layerStyles;
    delete old.rangeExcludedLayerIds;
    const back = reopened(old as unknown as Chart, replicates);
    expect(back.layerStyles).toEqual({});
    expect(back.rangeExcludedLayerIds).toEqual([]);
    expect(svg(back)).toBe(svg(chart));
  });
});
