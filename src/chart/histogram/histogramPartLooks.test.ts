import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { Chart, ChartType, DataTable } from '../../model/types';
import { patchLayerStyle, setLayerHidden, setLayerRange } from '../../state/commands';
import { afterCommands, markIds, reopened } from '../../testing/partChecks';
import { chartToSvgString } from '../export/export';
import { buildHistogramModel } from './histogramModel';

const table = createColumnTable('Column', true, 3);
/** The first data set holds many values in a few bins, the second a few in many: the tallest bar and the longest step differ in height. */
const lopsided: DataTable = {
  ...table,
  groups: table.groups.map((g, i) => ({ ...g, observations: g.observations.map((o, r) => ({ ...o, value: i === 0 ? (r < 8 ? 5 : null) : i === 1 ? (r < 8 ? r * 3 : null) : null })) })),
};
const chartOf = (type: ChartType): Chart => {
  const c = createChart(table.id, undefined, type);
  return { ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, showSymbols: true, showLines: true } } : l)) };
};
const idOf = (chart: Chart, kind: string, at = 0, t: DataTable = lopsided) => layersOf(chart, t).filter((l) => l.kind === kind)[at].id;
const svg = (chart: Chart, t: DataTable = lopsided) => chartToSvgString(chart, t);
const top = (chart: Chart, t: DataTable = lopsided) => buildHistogramModel(chart, t).y.domain[1];
/** The bars (heights, counts) and steps of every data set, which the axis range must leave as they are. */
const drawn = (chart: Chart, t: DataTable = lopsided) => buildHistogramModel(chart, t).series.map((s) => [s.bars?.map((b) => [b.count, b.value, b.bin]), s.points.map((p) => [p.x, p.y])]);

describe('the look of the steps and symbols of a cumulative distribution', () => {
  it('is given to one part and drawn: the steps of a data set, its symbols', () => {
    for (const kind of ['line', 'points']) {
      const chart = chartOf('ecdf');
      const styled = afterCommands(chart, lopsided, patchLayerStyle(chart.id, idOf(chart, kind), { color: '#ff0000', widthPt: 6 }));
      expect(styled.layerStyles[idOf(chart, kind)]).toEqual({ color: '#ff0000', widthPt: 6 });
      expect(svg(styled).match(/#ff0000/gi)?.length ?? 0).toBeGreaterThan(svg(chart).match(/#ff0000/gi)?.length ?? 0);
    }
    const chart = chartOf('ecdf');
    const dashed = afterCommands(chart, lopsided, patchLayerStyle(chart.id, idOf(chart, 'line'), { lineStyle: 'dotted' }));
    expect(svg(dashed)).toContain('stroke-dasharray');
  });

  it('is offered for the steps and symbols of a cumulative distribution only: the bars of a histogram are styled with the fill of the data set', () => {
    expect(layerRows(chartOf('ecdf'), lopsided).filter((r) => r.layer.kind === 'line').every((r) => r.takes?.includes('lineStyle'))).toBe(true);
    expect(layerRows(chartOf('histogram'), lopsided).every((r) => r.takes === null)).toBe(true);
    const chart = chartOf('histogram');
    expect(afterCommands(chart, lopsided, patchLayerStyle(chart.id, idOf(chart, 'bars'), { color: '#ff0000' })).layerStyles).toEqual({});
  });

  it('does not change the ids of the layers or of the marks', () => {
    const chart = chartOf('ecdf');
    let styled = chart;
    for (const l of layersOf(chart, lopsided)) {
      for (const [key, value] of [['color', '#336699'], ['widthPt', 4], ['opacity', 0.5], ['shape', 'diamond']] as const) styled = afterCommands(styled, lopsided, patchLayerStyle(chart.id, l.id, { [key]: value }));
    }
    expect(Object.keys(styled.layerStyles).length).toBeGreaterThan(0);
    expect(layersOf(styled, lopsided).map((l) => l.id)).toEqual(layersOf(chart, lopsided).map((l) => l.id));
    expect(markIds(svg(styled))).toEqual(markIds(svg(chart)));
  });

  it('is taken back with null, and the chart is then drawn exactly as before', () => {
    const chart = chartOf('ecdf');
    const id = idOf(chart, 'line');
    const back = afterCommands(afterCommands(chart, lopsided, patchLayerStyle(chart.id, id, { color: '#ff0000' })), lopsided, patchLayerStyle(chart.id, id, { color: null }));
    expect(back.layerStyles).toEqual({});
    expect(svg(back)).toBe(svg(chart));
  });
});

describe('hiding a part of a histogram or a cumulative distribution', () => {
  it('does not change the bins, the counts, the steps or the axis', () => {
    for (const [type, kind] of [['histogram', 'bars'], ['ecdf', 'line'], ['ecdf', 'points']] as const) {
      const chart = chartOf(type);
      const layers = layersOf(chart, lopsided).filter((l) => l.kind === kind);
      const hidden = afterCommands(chart, lopsided, ...layers.map((l) => setLayerHidden(chart.id, l.id, true)));
      expect(top(hidden)).toBe(top(chart));
      expect(buildHistogramModel(hidden, lopsided).x.domain).toEqual(buildHistogramModel(chart, lopsided).x.domain);
      expect(drawn(hidden)).toEqual(drawn(chart));
      const before = markIds(svg(chart));
      expect(markIds(svg(hidden)).every((id) => before.includes(id))).toBe(true);
    }
  });
});

describe('keeping the bars or the steps of a histogram out of the axis range', () => {
  /** Keeps the bars of the data set at this place out of the range. */
  const rangeOut = (chart: Chart, at: number) => afterCommands(chart, lopsided, setLayerRange(chart.id, idOf(chart, 'bars', at), false));

  it('changes the height of the axis and nothing else: the bins and the counts stay, and so does the x axis', () => {
    const chart = chartOf('histogram');
    // The 8 values of the first data set fall in one bin, the tallest bar by far.
    const out = rangeOut(chart, 0);
    expect(top(out)).toBeLessThan(top(chart));
    expect(drawn(out)).toEqual(drawn(chart));
    expect(buildHistogramModel(out, lopsided).x.domain).toEqual(buildHistogramModel(chart, lopsided).x.domain);
    expect(out.hiddenLayerIds).toEqual(chart.hiddenLayerIds);
    expect(layersOf(out, lopsided).map((l) => [l.id, l.visible, l.z])).toEqual(layersOf(chart, lopsided).map((l) => [l.id, l.visible, l.z]));
    expect(markIds(svg(out))).toEqual(markIds(svg(chart)));
  });

  it('applies to the steps of a cumulative distribution: the values of a data set no longer hold the X axis', () => {
    const chart = chartOf('ecdf');
    const wide = { ...lopsided, groups: lopsided.groups.map((g, i) => (i === 1 ? { ...g, observations: g.observations.map((o, r) => (r === 0 ? { ...o, value: 400 } : o)) } : g)) };
    const all = buildHistogramModel(chart, wide);
    const out = buildHistogramModel(afterCommands(chart, wide, setLayerRange(chart.id, idOf(chart, 'line', 1, wide), false)), wide);
    expect(all.x.domain[1]).toBeGreaterThanOrEqual(400);
    expect(out.x.domain[1]).toBeLessThan(all.x.domain[1]);
    expect(out.series.map((s) => s.points.map((p) => [p.x, p.y]))).toEqual(all.series.map((s) => s.points.map((p) => [p.x, p.y])));
  });

  it('is not what hiding does, and is offered for the bars and the steps', () => {
    const rows = (c: Chart) => new Set(layerRows(c, lopsided).filter((r) => r.inRange !== null).map((r) => r.layer.kind));
    expect(rows(chartOf('histogram'))).toEqual(new Set(['bars']));
    expect(rows(chartOf('ecdf'))).toEqual(new Set(['line']));
  });
});

describe('the look and range of the parts of a cumulative distribution in a saved file', () => {
  it('come back when the file is opened again, and so does the drawing', () => {
    const chart = chartOf('ecdf');
    const steps = idOf(chart, 'line');
    const styled = afterCommands(chart, lopsided, patchLayerStyle(chart.id, steps, { color: '#ff0000', lineStyle: 'dashed' }), patchLayerStyle(chart.id, idOf(chart, 'points'), { shape: 'star' }), setLayerRange(chart.id, steps, false));
    const back = reopened(styled, lopsided);
    expect(back.layerStyles).toEqual(styled.layerStyles);
    expect(back.rangeExcludedLayerIds).toEqual([steps]);
    expect(svg(back)).toBe(svg(styled));
    expect(top(back)).toBe(top(styled));
  });

  it('are absent from a file of an older version, which opens and is drawn as it always was', () => {
    for (const type of ['histogram', 'ecdf'] as const) {
      const chart = chartOf(type);
      const old = JSON.parse(JSON.stringify(chart)) as Record<string, unknown>;
      delete old.layerStyles;
      delete old.rangeExcludedLayerIds;
      const back = reopened(old as unknown as Chart, table);
      expect(back.layerStyles).toEqual({});
      expect(back.rangeExcludedLayerIds).toEqual([]);
      expect(svg(back)).toBe(svg(chart));
    }
  });
});
