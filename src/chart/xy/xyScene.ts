import { type LayerKind, type LayerSpec, DEFAULT_BAND_OPACITY as BAND_OPACITY, layerLook, partStyle } from '../../model/graph/layers';
import type { Chart, Id } from '../../model/types';
import type { XyModel, XySeries } from './xyModel';
import { type SceneElement, el } from '../shared/scene/sceneElement';
import { n2 } from '../../model/units';
import { SELECT_COLOR } from '../shared/scene/annotations';
import { svgId } from '../shared/scene/svgIds';
import type { Scene, SceneLayer, ScenePath } from '../shared/scene/scene';
import { linePattern } from '../../model/graph/look';
import { symbolPath } from '../shared/parts/symbols';
import { axisGaps, axisPieces } from '../shared/axes/axisScale';
import { crossingPosition, labelOffset } from '../shared/axes/axisTicks';
import { backgroundElements, frameElement, gridElements, legendElements, numericAxisElements, plotClipElement, referenceLineElements, regionElements, scaleBarElement, secondaryAxisElements, titleElements } from '../shared/scene/chrome';
import { referenceLinesOf, regionsOf } from '../shared/scene/referenceLines';
import { atRiskElements, fitParameterElements } from './xyChrome';
import { xyBracketElements } from './xyBrackets';
import { LEGEND_KEY, Y_TICK_LABEL_GAP } from '../shared/parts/layout';

/** The scene of an XY chart (and of a survival curve or a histogram, which have the shape of one): its data layers and its chrome. */
/** Size of an individual value relative to the symbol of the mean. */
export const RAW_POINT_SCALE = 0.6;

const DATA_KINDS: ReadonlyArray<LayerKind> = ['bars', 'band', 'area', 'line', 'fitBand', 'fitCurve', 'errorBars', 'xErrorBars', 'rawPoints', 'points'];

/** Layers in the order the families that are not drawn from layers draw their series. */
function drawnLayers(chart: Chart, model: XyModel): Array<{ id: Id; kind: LayerKind; seriesId: Id }> {
  const order: LayerKind[] = chart.lineOrder === 'onTop' ? ['points', 'band', 'area', 'line', 'fitBand', 'fitCurve', 'errorBars', 'xErrorBars'] : ['band', 'area', 'line', 'fitBand', 'fitCurve', 'errorBars', 'xErrorBars', 'points'];
  return order.flatMap((kind) => model.series.map((s) => ({ id: `${s.groupId}:${kind}`, kind, seriesId: s.groupId })));
}

/** The bars of a histogram, one rectangle for each bin. */
function barElements(s: XySeries, layerId: Id): SceneElement[] {
  const st = s.style;
  return (s.bars ?? []).map((b) => el('rect', [['x', n2(b.x)], ['y', n2(b.y)], ['width', n2(b.width)], ['height', n2(b.height)], ['fill', st.barFill], ['fill-opacity', st.barOpacity], ['stroke', st.barBorderColor], ['stroke-width', st.barBorderWidthPt], ['stroke-opacity', st.barBorderOpacity < 1 ? st.barBorderOpacity : undefined]], { hit: { kind: 'bar', groupId: s.groupId, objectId: b.id }, id: svgId(layerId, b.id) }));
}

function pathsOf(chart: Chart, s: XySeries, layerId: Id, kind: LayerKind): ScenePath[] {
  const base = svgId(layerId);
  // The look of the series, with what this part was given of its own over it.
  const st = partStyle(chart, layerId, s.style);
  switch (kind) {
    case 'band':
      if (!s.bandPath) return [];
      return [{ id: base, d: s.bandPath, fill: layerLook(chart, layerId, st).color, fillOpacity: chart.layerStyles[layerId]?.opacity ?? BAND_OPACITY, stroke: 'none', strokeWidth: 0, hit: { kind: 'line', groupId: s.groupId } }];
    case 'area':
      if (!s.areaPath) return [];
      return [{ id: base, d: s.areaPath, fill: layerLook(chart, layerId, st).color, fillOpacity: chart.layerStyles[layerId]?.opacity ?? BAND_OPACITY, stroke: 'none', strokeWidth: 0, hit: { kind: 'line', groupId: s.groupId } }];
    case 'line': {
      if (!st.showLines || s.linePath === '') return [];
      const pattern = linePattern(st);
      return [{ id: base, d: s.linePath, fill: 'none', stroke: st.lineColor, strokeWidth: st.lineWidthPt, strokeOpacity: st.lineOpacity < 1 ? st.lineOpacity : undefined, dashArray: pattern.strokeDasharray, lineCap: pattern.strokeLinecap, lineJoin: 'round', hit: { kind: 'line', groupId: s.groupId }, hitWidthPt: Math.max(20, st.lineWidthPt + 12), glow: true }];
    }
    case 'fitBand': {
      if (!s.fit?.bandPath) return [];
      const look = s.fitBandLook ?? layerLook(chart, layerId, st);
      return [{ id: base, d: s.fit.bandPath, fill: look.color, fillOpacity: look.opacity, stroke: 'none', strokeWidth: 0, hit: { kind: 'line', groupId: s.groupId } }];
    }
    case 'fitCurve': {
      if (!s.fit?.path) return [];
      const look = s.fitCurveLook ?? layerLook(chart, layerId, st);
      const pattern = linePattern({ lineStyle: look.lineStyle, lineWidthPt: look.widthPt });
      return [{ id: base, d: s.fit.path, fill: 'none', stroke: look.color, strokeWidth: look.widthPt, strokeOpacity: look.opacity < 1 ? look.opacity : undefined, dashArray: pattern.strokeDasharray, lineCap: pattern.strokeLinecap, lineJoin: 'round', hit: { kind: 'line', groupId: s.groupId } }];
    }
    case 'errorBars':
      if (s.errorPath === '') return [];
      return [{ id: base, d: s.errorPath, fill: 'none', stroke: st.errorColor, strokeWidth: st.errorLineWidthPt, strokeOpacity: st.errorOpacity < 1 ? st.errorOpacity : undefined, lineCap: 'butt', hit: { kind: 'error', groupId: s.groupId } }];
    case 'xErrorBars':
      if (!s.xErrorPath) return [];
      return [{ id: base, d: s.xErrorPath, fill: 'none', stroke: st.errorColor, strokeWidth: st.errorLineWidthPt, strokeOpacity: st.errorOpacity < 1 ? st.errorOpacity : undefined, lineCap: 'butt', hit: { kind: 'error', groupId: s.groupId } }];
    case 'rawPoints':
      return (s.rawPoints ?? []).map((p) => ({
        id: svgId(base, p.id),
        d: symbolPath(st.symbolShape, p.px, p.py, st.symbolSizePt * RAW_POINT_SCALE),
        fill: st.symbolColor,
        fillOpacity: st.symbolFillOpacity < 1 ? st.symbolFillOpacity : undefined,
        stroke: st.symbolBorderColor,
        strokeWidth: st.symbolBorderWidthPt,
        strokeOpacity: st.symbolBorderOpacity < 1 ? st.symbolBorderOpacity : undefined,
      }));
    case 'points':
      if (!st.showSymbols) return [];
      return s.points.map((p) => ({
        id: svgId(base, p.id),
        d: symbolPath(st.symbolShape, p.px, p.py, p.diameterPt ?? st.symbolSizePt),
        fill: st.symbolColor,
        fillOpacity: st.symbolFillOpacity < 1 ? st.symbolFillOpacity : undefined,
        stroke: st.symbolBorderColor,
        strokeWidth: st.symbolBorderWidthPt,
        strokeOpacity: st.symbolBorderOpacity < 1 ? st.symbolBorderOpacity : undefined,
        hit: { kind: 'point', groupId: s.groupId, objectId: p.id },
      }));
    default:
      return [];
  }
}

/**
 * The chrome of an XY, survival or histogram chart: what is behind the data and what is in front of it. Layers that are
 * hidden by ID (the reference lines, the at-risk table) are not in it.
 */
function compileXyChrome(chart: Chart, model: XyModel): Pick<Scene, 'defs' | 'back' | 'front'> {
  const { widthPt: W, heightPt: H, layout, series, x, y, xScale, yScale } = model;
  const { plot } = layout;
  const xa = chart.xAxis;
  const ya = chart.yAxis;
  const y2a = chart.y2Axis;
  // model.y2 is null while no series is bound to the right axis (and absent for survival curves and histograms); a hidden right axis draws nothing.
  const y2 = model.y2 && model.y2Scale && y2a.visible ? { scale: model.y2, map: model.y2Scale } : null;
  const bottom = plot.y + plot.height;
  const right = plot.x + plot.width;
  // Broken axes: the pieces of each that are drawn, and where its gaps are. The axis lines cross at the chosen values, or at the low edges.
  const xPieces = axisPieces(x, plot.x, plot.width);
  const yPieces = axisPieces(y, bottom, -plot.height);
  const hidden = new Set(model.layers ? chart.hiddenLayerIds : []);
  const yCross = crossingPosition(chart.origin.x, x, xScale, plot.x);
  const xCross = crossingPosition(chart.origin.y, y, yScale, bottom);
  const axis = { chart, plot };

  const back = [
    ...backgroundElements(chart, W, H, plot),
    ...(ya.visible ? gridElements({ dir: 'h', grid: chart.grid, major: y.ticks, minor: y.minorTicks ?? [], showMajor: ya.showGrid, showMinor: ya.showMinorGrid, at: yScale, from: plot.x, to: right }) : []),
    // Right gridlines: dashed when the left grid is also drawn, so the two sets stay distinguishable.
    ...(y2 ? gridElements({ dir: 'h', grid: chart.grid, major: y2.scale.ticks, minor: y2.scale.minorTicks ?? [], showMajor: y2a.showGrid, showMinor: y2a.showMinorGrid, at: y2.map, from: plot.x, to: right, fallbackDash: ya.visible && ya.showGrid ? '3 3' : undefined }) : []),
    ...(xa.visible ? gridElements({ dir: 'v', grid: chart.grid, major: x.ticks, minor: x.minorTicks ?? [], showMajor: xa.showGrid, showMinor: xa.showMinorGrid, at: xScale, from: plot.y, to: bottom }) : []),
    // The shaded regions are behind everything else that is drawn in the plot.
    ...regionElements(regionsOf(chart, { family: 'xy', model }).placed.filter((r) => !hidden.has(`${r.region.id}:region`)), ya.tickFontSizePt),
    ...referenceLineElements(referenceLinesOf(chart, { family: 'xy', model }).placed.filter((l) => !hidden.has(`${l.line.id}:referenceLine`)), ya.tickFontSizePt),
  ];
  const front = [
    // The comparison brackets stand in front of the data; one whose layer is hidden is not drawn.
    ...xyBracketElements(model.brackets ?? [], hidden),
    ...(model.fit.showParameters ? fitParameterElements(series, plot.x + 16, plot.y + 8, ya.tickFontSizePt, model.fit.level) : []),
    ...numericAxisElements({ ...axis, cfg: ya, scale: y, along: 'y', crossing: yCross, pieces: yPieces, gaps: axisGaps(y, bottom, -plot.height), map: yScale }),
    ...(y2 ? secondaryAxisElements({ chart, cfg: y2a, scale: y2.scale, map: y2.map, plot }) : []),
    ...numericAxisElements({ ...axis, cfg: xa, scale: x, along: 'x', crossing: xCross, pieces: xPieces, gaps: axisGaps(x, plot.x, plot.width), map: xScale }),
    ...[frameElement(chart, plot, ya.lineWidthPt), scaleBarElement(chart, xa, 'x', x, xScale, plot), scaleBarElement(chart, ya, 'y', y, yScale, plot)].flatMap((e) => (e ? [e] : [])),
    // Offset traces: the sentence that tells the offset stands in the row the layout reserved under the X axis title, centred under the plot.
    ...(model.offsetNote && layout.extraBottom ? [el('text', [['x', n2(plot.x + plot.width / 2)], ['y', n2(layout.extraBottom.y + ya.tickFontSizePt * 1.2)], ['text-anchor', 'middle'], ['font-size', ya.tickFontSizePt], ['fill', chart.textColor]], { text: model.offsetNote })] : []),
    ...titleElements(chart, layout, xa, ya, y2 ? y2a : null),
    ...(model.atRisk && !hidden.has(`${chart.id}:atRisk`) ? atRiskElements(chart, model.atRisk, plot.x, plot.x - labelOffset(ya) - Y_TICK_LABEL_GAP) : []),
    ...legendElements(chart, layout, (it, w) => {
      const s = series[model.legendSeries[it.index]];
      const st = s.style;
      const keys: SceneElement[] = [];
      if (s.bars) keys.push(el('rect', [['x', n2(it.x)], ['y', n2(it.y - 10)], ['width', w], ['height', 20], ['fill', st.barFill], ['fill-opacity', st.barOpacity], ['stroke', st.barBorderColor], ['stroke-width', st.barBorderWidthPt], ['stroke-opacity', st.barBorderOpacity < 1 ? st.barBorderOpacity : undefined]]));
      if (st.showLines) {
        const pattern = linePattern(st);
        keys.push(el('path', [['d', `M${n2(it.x)},${n2(it.y)}H${n2(it.x + w)}`], ['stroke', st.lineColor], ['stroke-width', st.lineWidthPt], ['stroke-opacity', st.lineOpacity < 1 ? st.lineOpacity : undefined], ['stroke-dasharray', pattern.strokeDasharray], ['stroke-linecap', pattern.strokeLinecap], ['fill', 'none']]));
      }
      if (st.showSymbols) keys.push(el('path', [['d', symbolPath(st.symbolShape, it.x + w / 2, it.y, Math.min(st.symbolSizePt, LEGEND_KEY.height))], ['fill', st.symbolColor], ['fill-opacity', st.symbolFillOpacity < 1 ? st.symbolFillOpacity : undefined], ['stroke', st.symbolBorderColor], ['stroke-width', st.symbolBorderWidthPt], ['stroke-opacity', st.symbolBorderOpacity < 1 ? st.symbolBorderOpacity : undefined]]));
      return { groupId: s.groupId, keys };
    }),
  ];
  return { defs: [plotClipElement(plot, xPieces, yPieces)], back, front };
}

/**
 * The data layers of an XY, survival or histogram chart as shapes. A chart drawn from layers takes its order and what is
 * hidden from them; the others draw every series in the same order of kinds, as before.
 */
export function compileXyScene(chart: Chart, model: XyModel): Scene {
  const wanted = model.layers
    ? model.layers.filter((l: LayerSpec) => l.visible && l.binding && DATA_KINDS.includes(l.kind)).map((l: LayerSpec) => ({ id: l.id, kind: l.kind, seriesId: l.binding!.seriesId }))
    : drawnLayers(chart, model);
  const layers: SceneLayer[] = [];
  for (const w of wanted) {
    const s = model.series.find((x) => x.groupId === w.seriesId);
    if (!s) continue;
    const paths = pathsOf(chart, s, w.id, w.kind);
    const elements = w.kind === 'bars' ? barElements(s, w.id) : [];
    if (paths.length > 0 || elements.length > 0) layers.push({ id: w.id, kind: w.kind, seriesId: w.seriesId, paths, ...(elements.length > 0 ? { elements } : {}) });
  }
  return { widthPt: model.widthPt, heightPt: model.heightPt, plot: model.layout.plot, ...compileXyChrome(chart, model), layers };
}

/**
 * Gives the model its scene, compiled the first time something asks for it (a drawing, an export, a hit test) and kept. A
 * model that is only measured (the range of the axes, the notices) does not pay for the shapes of 200,000 points.
 */
export function attachLazyScene(chart: Chart, model: XyModel): void {
  let scene: Scene | undefined;
  Object.defineProperty(model, 'scene', { enumerable: true, configurable: true, get: () => (scene ??= compileXyScene(chart, model)) });
}

/** The editor's own mark of an XY chart: the ring round each selected point. Never in an export. */
export function compileXySelection(model: XyModel, selectedPoints: readonly string[]): SceneElement[] {
  if (selectedPoints.length === 0) return [];
  return model.series.flatMap((s) =>
    s.points.filter((p) => selectedPoints.includes(p.id)).map((p) => el('circle', [['data-editor-only', 'true'], ['cx', n2(p.px)], ['cy', n2(p.py)], ['r', n2(s.style.symbolSizePt / 2 + 6)], ['fill', 'none'], ['stroke', SELECT_COLOR], ['stroke-width', 2.4], ['pointer-events', 'none']], { editorOnly: true })),
  );
}
