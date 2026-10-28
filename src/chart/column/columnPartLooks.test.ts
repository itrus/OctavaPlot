import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { Chart, ChartType, DataTable } from '../../model/types';
import { patchLayerStyle, setLayerHidden, setLayerRange } from '../../state/commands';
import { afterCommands, markIds, reopened } from '../../testing/partChecks';
import { chartToSvgString } from '../export/export';
import { buildColumnModel } from './columnModel';

const table = createColumnTable('Column', true, 3);
/** The same table with one value far from the rest in the second data set. */
const far: DataTable = { ...table, groups: table.groups.map((g, i) => (i === 1 ? { ...g, observations: g.observations.map((o, r) => (r === 0 ? { ...o, value: 500 } : o)) } : g)) };
const chartOf = (type: ChartType): Chart => {
  const c = createChart(table.id, undefined, type);
  return { ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, summary: { ...l.summary, spread: 'sd' as const }, style: { ...l.style, showErrorBars: true, showMeanLine: true, showSymbols: true, showLines: true } } : l)) };
};
const idOf = (chart: Chart, kind: string, at = 0) => layersOf(chart, table).filter((l) => l.kind === kind)[at].id;
const svg = (chart: Chart, t: DataTable = table) => chartToSvgString(chart, t);
const stats = (chart: Chart, t: DataTable = table) => buildColumnModel(chart, t).groups.map((g) => ({ n: g.stats.n, centre: g.stats.centre, lower: g.stats.interval.lower, upper: g.stats.interval.upper }));

describe('the look of the parts of a column chart', () => {
  it('is given to one part and drawn: the dots, the error bars, the mean lines, the joins and the lines of a paired plot', () => {
    const red = { color: '#ff0000' };
    const cases: Array<[ChartType, string]> = [['bar', 'points'], ['bar', 'errorBars'], ['scatter', 'meanLine'], ['mean', 'line'], ['paired', 'pairLines']];
    for (const [type, kind] of cases) {
      const chart = chartOf(type);
      const id = idOf(chart, kind);
      const styled = afterCommands(chart, table, patchLayerStyle(chart.id, id, { ...red, widthPt: 7.5 }));
      expect(styled.layerStyles[id]).toEqual({ color: '#ff0000', widthPt: 7.5 });
      // Only the marks of that part changed colour.
      const before = svg(chart);
      const after = svg(styled);
      expect(after).not.toBe(before);
      expect(after.match(/#ff0000/gi)?.length ?? 0).toBeGreaterThan(before.match(/#ff0000/gi)?.length ?? 0);
    }
  });

  it('is drawn on the dots of one data set only, and a look given to a single dot still wins over it', () => {
    const chart = chartOf('scatter');
    const id = idOf(chart, 'points');
    const once = afterCommands(chart, table, patchLayerStyle(chart.id, id, { shape: 'square', color: '#00aa00' }));
    const model = buildColumnModel(once, table);
    expect(model.groups[0].points.every((p) => p.shape === 'square' && p.color === '#00aa00')).toBe(true);
    expect(model.groups[1].points.some((p) => p.shape === 'square')).toBe(false);
    // An override on one dot (the most specific) stays over the look of the part.
    const dot = model.groups[0].points[0].id;
    const layer = once.layers[0];
    const single: Chart = { ...once, layers: [{ ...layer, objectOverrides: { ...layer.objectOverrides, [dot]: { symbolColor: '#123456' } } }, ...once.layers.slice(1)] };
    const g0 = buildColumnModel(single, table).groups[0].points;
    expect(g0[0].color).toBe('#123456');
    expect(g0[1].color).toBe('#00aa00');
  });

  it('offers only what the drawing honours, and stores nothing else', () => {
    const rows = (type: ChartType) => layerRows(chartOf(type), table);
    const takes = (type: ChartType, kind: string) => rows(type).find((r) => r.layer.kind === kind)?.takes ?? null;
    expect(takes('bar', 'points')).toEqual(['color', 'widthPt', 'opacity', 'shape']);
    expect(takes('bar', 'errorBars')).toEqual(['color', 'widthPt', 'opacity']);
    // The join of a mean chart is drawn solid, so a pattern is not offered; the bodies are styled with the fill of the data set.
    expect(takes('mean', 'line')).toEqual(['color', 'widthPt', 'opacity']);
    expect(takes('bar', 'bars')).toBeNull();
    expect(takes('box', 'distribution')).toBeNull();
    const chart = chartOf('mean');
    const stored = afterCommands(chart, table, patchLayerStyle(chart.id, idOf(chart, 'line'), { lineStyle: 'dotted', color: '#0000ff' }), patchLayerStyle(chart.id, idOf(chart, 'bars'), { color: '#ff0000' }));
    expect(stored.layerStyles).toEqual({ [idOf(chart, 'line')]: { color: '#0000ff' } });
  });

  it('does not change the ids of the layers or of the marks', () => {
    for (const type of ['bar', 'scatter', 'mean', 'paired', 'box'] as const) {
      const chart = chartOf(type);
      let styled = chart;
      for (const l of layersOf(chart, table)) {
        for (const [key, value] of [['color', '#336699'], ['widthPt', 4], ['opacity', 0.5], ['shape', 'diamond']] as const) styled = afterCommands(styled, table, patchLayerStyle(chart.id, l.id, { [key]: value }));
      }
      expect(Object.keys(styled.layerStyles).length).toBeGreaterThan(0);
      expect(layersOf(styled, table).map((l) => l.id)).toEqual(layersOf(chart, table).map((l) => l.id));
      expect(markIds(svg(styled))).toEqual(markIds(svg(chart)));
    }
  });

  it('is taken back with null, and the chart is then drawn exactly as before', () => {
    const chart = chartOf('bar');
    const id = idOf(chart, 'errorBars');
    const styled = afterCommands(chart, table, patchLayerStyle(chart.id, id, { color: '#ff0000', widthPt: 5 }));
    const back = afterCommands(styled, table, patchLayerStyle(chart.id, id, { color: null, widthPt: null }));
    expect(back.layerStyles).toEqual({});
    expect(svg(back)).toBe(svg(chart));
  });
});

describe('hiding a part of a column chart', () => {
  it('does not change n, the statistics or the axis, and leaves the other parts as they were', () => {
    for (const type of ['bar', 'scatter', 'mean', 'paired', 'box'] as const) {
      const chart = chartOf(type);
      const model = buildColumnModel(chart, far);
      for (const kind of ['errorBars', 'points', 'meanLine', 'line', 'pairLines', 'distribution', 'bars']) {
        const layers = layersOf(chart, far).filter((l) => l.kind === kind);
        if (layers.length === 0) continue;
        const hidden = afterCommands(chart, far, ...layers.map((l) => setLayerHidden(chart.id, l.id, true)));
        const hiddenModel = buildColumnModel(hidden, far);
        expect(hiddenModel.y.domain).toEqual(model.y.domain);
        expect(stats(hidden, far)).toEqual(stats(chart, far));
        expect(hiddenModel.warnings).toEqual(model.warnings);
        // Nothing is drawn that was not, and the marks of the other parts keep their ids.
        const before = markIds(svg(chart, far));
        expect(markIds(svg(hidden, far)).every((id) => before.includes(id))).toBe(true);
      }
    }
  });
});

describe('keeping a part of a column chart out of the axis range', () => {
  const rangeOut = (chart: Chart, t: DataTable, kind: string) => afterCommands(chart, t, ...layersOf(chart, t).filter((l) => l.kind === kind).map((l) => setLayerRange(chart.id, l.id, false)));

  it('changes the axis and nothing else: the numbers, the visibility and the drawing order stay', () => {
    const chart = chartOf('bar');
    const out = rangeOut(chart, far, 'points');
    const [a, b] = [buildColumnModel(chart, far), buildColumnModel(out, far)];
    // The value of 500 no longer stretches the axis; the bar of its data set, a mean of the values, still counts.
    expect(a.y.domain[1]).toBeGreaterThanOrEqual(500);
    expect(b.y.domain[1]).toBeLessThan(a.y.domain[1]);
    expect(stats(out, far)).toEqual(stats(chart, far));
    expect(out.hiddenLayerIds).toEqual(chart.hiddenLayerIds);
    expect(layersOf(out, far).map((l) => [l.id, l.visible, l.z])).toEqual(layersOf(chart, far).map((l) => [l.id, l.visible, l.z]));
    expect(b.groups.map((g) => g.points.length)).toEqual(a.groups.map((g) => g.points.length));
    expect(markIds(svg(out, far))).toEqual(markIds(svg(chart, far)));
  });

  it('can leave out the error bars, and the box, the whiskers and the dots of a distribution', () => {
    const bar = chartOf('bar');
    // With the dots still in the range the far value holds the axis open; with them out, the end of the error bar does, and then it can be left out too.
    const noDots = rangeOut(bar, far, 'points');
    expect(buildColumnModel(rangeOut(noDots, far, 'errorBars'), far).y.domain[1]).toBeLessThan(buildColumnModel(noDots, far).y.domain[1]);
    const box = chartOf('box');
    const whole = buildColumnModel(box, far).y.domain[1];
    expect(whole).toBeGreaterThanOrEqual(500);
    expect(buildColumnModel(rangeOut(box, far, 'points'), far).y.domain[1]).toBeLessThanOrEqual(whole);
    expect(buildColumnModel(rangeOut(box, far, 'distribution'), far).y.domain[1]).toBeLessThan(whole);
    const floating = chartOf('floating');
    expect(buildColumnModel(rangeOut(floating, far, 'bars'), far).y.domain[1]).toBeLessThan(buildColumnModel(floating, far).y.domain[1]);
  });

  it('is not what hiding does: a hidden part still counts', () => {
    const chart = chartOf('bar');
    const hidden = afterCommands(chart, far, ...layersOf(chart, far).filter((l) => l.kind === 'points').map((l) => setLayerHidden(chart.id, l.id, true)));
    expect(buildColumnModel(hidden, far).y.domain).toEqual(buildColumnModel(chart, far).y.domain);
  });

  it('is offered for the parts the range reads, and says what it is now', () => {
    const rows = (chart: Chart) => layerRows(chart, far).filter((r) => r.inRange !== null).map((r) => [r.layer.kind, r.inRange]);
    expect(new Set(rows(chartOf('bar')).map((r) => r[0]))).toEqual(new Set(['errorBars', 'points']));
    expect(rows(chartOf('bar')).every((r) => r[1] === true)).toBe(true);
    expect(rows(rangeOut(chartOf('bar'), far, 'points')).filter((r) => r[0] === 'points').every((r) => r[1] === false)).toBe(true);
    // A mean marker is the centre of the data set, which always counts; the join, the mean lines and the bars have no values of their own.
    expect(new Set(rows(chartOf('mean')).map((r) => r[0]))).toEqual(new Set(['errorBars']));
    expect(new Set(rows(chartOf('box')).map((r) => r[0]))).toEqual(new Set(['distribution', 'points']));
    // Not offered for a part that is switched off in Style: it adds nothing to the range anyway.
    const off = { ...chartOf('bar'), layers: chartOf('bar').layers.map((l) => ({ ...l, style: { ...l.style, showErrorBars: false } })) };
    expect(rows(off).some((r) => r[0] === 'errorBars')).toBe(false);
  });
});

describe('the look and range of the parts of a column chart in a saved file', () => {
  const styled = (): { chart: Chart; id: string } => {
    const chart = chartOf('bar');
    const id = idOf(chart, 'points');
    return { chart: afterCommands(chart, far, patchLayerStyle(chart.id, id, { color: '#ff0000', shape: 'star' }), patchLayerStyle(chart.id, idOf(chart, 'errorBars'), { widthPt: 6 }), setLayerRange(chart.id, id, false), setLayerHidden(chart.id, idOf(chart, 'errorBars', 1), true)), id };
  };

  it('come back when the file is opened again, and so does the drawing', () => {
    const { chart, id } = styled();
    const back = reopened(chart, far);
    expect(back.layerStyles).toEqual(chart.layerStyles);
    expect(back.rangeExcludedLayerIds).toEqual([id]);
    expect(back.hiddenLayerIds).toEqual(chart.hiddenLayerIds);
    expect(svg(back, far)).toBe(svg(chart, far));
    expect(buildColumnModel(back, far).y.domain).toEqual(buildColumnModel(chart, far).y.domain);
  });

  it('are absent from a file of an older version, which opens and is drawn as it always was', () => {
    const chart = chartOf('bar');
    const old = JSON.parse(JSON.stringify(chart)) as Record<string, unknown>;
    delete old.layerStyles;
    delete old.rangeExcludedLayerIds;
    const back = reopened(old as unknown as Chart, table);
    expect(back.layerStyles).toEqual({});
    expect(back.rangeExcludedLayerIds).toEqual([]);
    expect(svg(back)).toBe(svg(chart));
  });
});
