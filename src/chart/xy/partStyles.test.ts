import { describe, expect, it } from 'vitest';
import { createChart, createSurvivalTable, createXyTable } from '../../model/defaults';
import { layerEditLook, layersOf, sanitizeLayerStyles } from '../../model/graph/layers';
import type { Chart, ChartStyle, Id, Project } from '../../model/types';
import { PALETTES } from '../../model/graph/palettes';
import { applyPalette, patchLayerStyle, patchStyle, resetStyle } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { buildSurvivalModel } from '../survival/survivalModel';
import { buildXyModel } from './xyModel';

const table = createXyTable('XY', true, { kind: 'replicates', n: 3 });
const base: Chart = (() => {
  const c = createChart(table.id, undefined, 'xyLineSymbols');
  return { ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, showErrorBars: true, showRawPoints: true } } : l)) };
})();
const project = (chart: Chart): Project => ({ id: 'p', name: 'p', dataTables: [table], charts: [chart] });
const chartOf = (p: Project): Chart => p.charts[0];
const layerId = (kind: string, series = 0): Id => layersOf(base, table).filter((l) => l.kind === kind)[series].id;
const seriesId = (series = 0): Id => layersOf(base, table).filter((l) => l.kind === 'points')[series].binding!.seriesId;
const pathOf = (chart: Chart, id: Id) => buildXyModel(chart, table).scene!.layers.find((l) => l.id === id)!.paths;
const withPart = (chart: Chart, id: Id, patch: Parameters<typeof patchLayerStyle>[2]): Chart => chartOf(patchLayerStyle(chart.id, id, patch)(project(chart)));

describe('a part of a series in a look of its own', () => {
  it('changes only that part: the line, and not the points or the other series', () => {
    const chart = withPart(base, layerId('line'), { color: '#ff0000', widthPt: 9, lineStyle: 'dotted', opacity: 0.5 });
    const [line] = pathOf(chart, layerId('line'));
    expect([line.stroke, line.strokeWidth, line.strokeOpacity]).toEqual(['#ff0000', 9, 0.5]);
    expect(line.dashArray).toBeDefined();
    expect(pathOf(chart, layerId('line', 1))).toEqual(pathOf(base, layerId('line', 1)));
    expect(pathOf(chart, layerId('points'))).toEqual(pathOf(base, layerId('points')));
    expect(pathOf(chart, layerId('errorBars'))).toEqual(pathOf(base, layerId('errorBars')));
  });

  it('draws error bars, points and individual values each in their own look', () => {
    let chart = withPart(base, layerId('errorBars'), { color: '#00aa00', widthPt: 7 });
    expect([pathOf(chart, layerId('errorBars'))[0].stroke, pathOf(chart, layerId('errorBars'))[0].strokeWidth]).toEqual(['#00aa00', 7]);
    chart = withPart(chart, layerId('points'), { color: '#0000ff', shape: 'square', widthPt: 0, opacity: 0.4 });
    const point = pathOf(chart, layerId('points'))[0];
    expect([point.fill, point.stroke, point.strokeWidth, point.fillOpacity]).toEqual(['#0000ff', '#0000ff', 0, 0.4]);
    expect(point.d).not.toBe(pathOf(base, layerId('points'))[0].d);
    chart = withPart(chart, layerId('rawPoints'), { shape: 'star' });
    expect(pathOf(chart, layerId('rawPoints'))[0].d).not.toBe(pathOf(base, layerId('rawPoints'))[0].d);
    // The points of the series are still as they were.
    expect(pathOf(chart, layerId('points', 1))).toEqual(pathOf(base, layerId('points', 1)));
  });

  it('changes nothing in the numbers, the axes or the legend', () => {
    const chart = withPart(withPart(base, layerId('points'), { shape: 'square', color: '#123456' }), layerId('line'), { widthPt: 12 });
    const a = buildXyModel(base, table);
    const b = buildXyModel(chart, table);
    expect(b.y.domain).toEqual(a.y.domain);
    expect(b.series.map((s) => s.points.map((p) => [p.x, p.y, p.px, p.py]))).toEqual(a.series.map((s) => s.points.map((p) => [p.x, p.y, p.px, p.py])));
    expect(b.series.map((s) => s.style)).toEqual(a.series.map((s) => s.style));
  });

  it('is given back to the series with null', () => {
    const own = withPart(base, layerId('line'), { color: '#ff0000' });
    expect(chartOf(patchLayerStyle(base.id, layerId('line'), { color: null })(project(own))).layerStyles).toEqual({});
  });

  it('shows in the Layers section as its own setting over the series', () => {
    const series = buildXyModel(base, table).series[0].style;
    expect(layerEditLook(base, layerId('points'), series)).toMatchObject({ color: series.symbolColor, widthPt: series.symbolBorderWidthPt, opacity: series.symbolFillOpacity, shape: series.symbolShape });
    const chart = withPart(base, layerId('points'), { shape: 'diamond', color: '#abcdef' });
    expect(layerEditLook(chart, layerId('points'), series)).toMatchObject({ shape: 'diamond', color: '#abcdef', opacity: series.symbolFillOpacity });
  });
});

describe('the latest edit wins', () => {
  const styled = (): Chart => withPart(withPart(withPart(base, layerId('line'), { color: '#ff0000', widthPt: 9 }), layerId('line', 1), { color: '#00ff00' }), layerId('points'), { color: '#0000ff', shape: 'square' });

  it('takes the part back when the series is given that setting', () => {
    const chart = chartOf(patchStyle(base.id, seriesId(0), { lineColor: '#777777' })(project(styled())));
    // The colour of the line of the first series is the series' again; its thickness was not edited and stays.
    expect(chart.layerStyles[layerId('line')]).toEqual({ widthPt: 9 });
    expect(pathOf(chart, layerId('line'))[0].stroke).toBe('#777777');
    expect(pathOf(chart, layerId('line'))[0].strokeWidth).toBe(9);
    // The other series and the other parts keep theirs.
    expect(chart.layerStyles[layerId('line', 1)]).toEqual({ color: '#00ff00' });
    expect(chart.layerStyles[layerId('points')]).toEqual({ color: '#0000ff', shape: 'square' });
  });

  it('takes the parts of every series back for an edit of all of them', () => {
    const chart = chartOf(patchStyle(base.id, 'all', { lineColor: '#777777', lineWidthPt: 3 })(project(styled())));
    expect(chart.layerStyles[layerId('line')]).toBeUndefined();
    expect(chart.layerStyles[layerId('line', 1)]).toBeUndefined();
    expect(chart.layerStyles[layerId('points')]).toEqual({ color: '#0000ff', shape: 'square' });
  });

  it('takes the colour of the points back when either colour of the symbols is edited, and leaves the shape', () => {
    for (const key of ['symbolColor', 'symbolBorderColor'] as const) {
      const chart = chartOf(patchStyle(base.id, seriesId(0), { [key]: '#777777' })(project(styled())));
      expect(chart.layerStyles[layerId('points')]).toEqual({ shape: 'square' });
    }
  });

  it('keeps a part when something else of the series is edited', () => {
    const before = styled();
    const after = chartOf(patchStyle(base.id, seriesId(0), { symbolSizePt: 30, showBars: false } as Partial<ChartStyle>)(project(before)));
    expect(after.layerStyles).toEqual(before.layerStyles);
  });

  it('lets a part edit made after the series edit stand', () => {
    let chart = chartOf(patchStyle(base.id, seriesId(0), { lineColor: '#777777' })(project(styled())));
    chart = withPart(chart, layerId('line'), { color: '#ff00ff' });
    expect(pathOf(chart, layerId('line'))[0].stroke).toBe('#ff00ff');
  });

  it('takes the colours of the parts back when a palette is applied, and keeps their other settings', () => {
    const p = applyPalette(base.id, PALETTES[1])(project(styled()));
    expect(chartOf(p).layerStyles[layerId('line')]).toEqual({ widthPt: 9 });
    expect(chartOf(p).layerStyles[layerId('line', 1)]).toBeUndefined();
    expect(chartOf(p).layerStyles[layerId('points')]).toEqual({ shape: 'square' });
  });

  it('takes all that a series was given of its own back when its style is reset', () => {
    const one = chartOf(resetStyle(base.id, seriesId(0), table)(project(styled())));
    expect(one.layerStyles[layerId('line')]).toBeUndefined();
    expect(one.layerStyles[layerId('points')]).toBeUndefined();
    expect(one.layerStyles[layerId('line', 1)]).toEqual({ color: '#00ff00' });
    expect(chartOf(resetStyle(base.id, 'all', table)(project(styled()))).layerStyles).toEqual({});
  });

  it('applies to the fit curve and the bands too: their own colour goes when the series colour is set', () => {
    const fitted: Chart = { ...base, fit: { ...base.fit, analysisId: 'a1', band: 'confidence' } };
    const curve = layersOf(fitted, table).find((l) => l.kind === 'fitCurve')!;
    const own = withPart(fitted, curve.id, { color: '#ff0000', widthPt: 5 });
    const after = chartOf(patchStyle(fitted.id, curve.binding!.seriesId, { lineColor: '#777777' })(project(own)));
    expect(after.layerStyles[curve.id]).toEqual({ widthPt: 5 });
  });
});

describe('the look of a part in a survival chart', () => {
  it('draws the curve and the censor marks in their own look', () => {
    const t = createSurvivalTable('S', true);
    const chart = createChart(t.id, undefined, 'survival');
    const ls = layersOf(chart, t);
    const line = ls.find((l) => l.kind === 'line')!;
    const marks = ls.find((l) => l.kind === 'points')!;
    const own: Chart = { ...chart, layerStyles: { [line.id]: { color: '#ff0000', widthPt: 8 }, [marks.id]: { shape: 'diamond' } } };
    const plain = buildSurvivalModel(chart, t).scene!;
    const scene = buildSurvivalModel(own, t).scene!;
    const strokeOf = (s: typeof scene, id: string) => s.layers.find((l) => l.id === id)!.paths[0];
    expect([strokeOf(scene, line.id).stroke, strokeOf(scene, line.id).strokeWidth]).toEqual(['#ff0000', 8]);
    expect(strokeOf(scene, marks.id).d).not.toBe(strokeOf(plain, marks.id).d);
  });
});

describe('saving the look of a part', () => {
  it('writes it and reads it back, and drops what is not valid for the kind', () => {
    const chart = withPart(withPart(base, layerId('points'), { shape: 'hexagon', color: '#112233', widthPt: 0 }), layerId('errorBars'), { color: '#445566' });
    const back = parseProject(stringifyProject(project(chart))).charts[0];
    expect(back.layerStyles).toEqual(chart.layerStyles);
    const r = sanitizeLayerStyles({ 'a:points': { shape: 'blob', color: '#00ff00', lineStyle: 'dotted' }, 'b:errorBars': { widthPt: 0 }, 'c:points': { widthPt: -1 } });
    expect(r.styles).toEqual({ 'a:points': { color: '#00ff00' } });
    expect(r.dropped).toBe(1 + 1 + 1 + 1);
  });
});
