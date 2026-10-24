import type { LayerKind, LayerSpec } from '../model/layers';
import { DEFAULT_BAND_OPACITY as BAND_OPACITY, layerLook } from '../model/layers';
import { linePattern } from '../model/look';
import { n2 } from '../model/units';
import type { Chart, Id } from '../model/types';
import { axisGaps, axisPieces } from './axisScale';
import { crossingPosition, labelOffset } from './axisTicks';
import { atRiskElements, backgroundElements, fitParameterElements, frameElement, gridElements, legendElements, numericAxisElements, plotClipElement, referenceLineElements, scaleBarElement, titleElements } from './chrome';
import { Y_TICK_LABEL_GAP, type Rect } from './layout';
import { referenceLinesOf } from './referenceLines';
import { el, type SceneElement } from './sceneElement';
import { svgId } from './svgIds';
import { symbolPath } from './symbols';
import type { XyModel, XySeries } from './xyModel';

/**
 * The scene of a chart: what is drawn as data, as shapes in pt with their styles, in drawing order, before any renderer has
 * looked at it. The SVG of the screen, of the export and of the tests is made from it, and so is what the editor knows about
 * what can be clicked, so the three cannot disagree about where something is or what it is. Step one: the data layers of the
 * families that share the XY drawing (XY, survival, histogram); titles, axes, the legend and the other families follow.
 */

/** What every family has in a scene: the clip, what is behind the data and what is in front of it. */
export type ChromeScene = Pick<Scene, 'defs' | 'back' | 'front'>;

/** What a click on a shape selects. */
export interface SceneHit {
  kind: 'point' | 'line' | 'error';
  groupId: Id;
  /** The observation of a point. */
  objectId?: Id;
}

export interface ScenePath {
  /** Stable, from the layer (and the observation) the shape belongs to; unique in the drawing. */
  id: string;
  d: string;
  fill: string;
  fillOpacity?: number;
  stroke: string;
  strokeWidth: number;
  strokeOpacity?: number;
  dashArray?: string;
  lineCap?: 'round' | 'butt';
  lineJoin?: 'round';
  /** Absent: the shape cannot be clicked. */
  hit?: SceneHit;
  /** In the editor a thin line is also given a transparent twin this wide, so that it can be hit. */
  hitWidthPt?: number;
  /** In the editor the shape gets a glow while its series is selected. */
  glow?: boolean;
}

export interface SceneLayer {
  /** The ID of the layer (see model/layers.ts). */
  id: Id;
  kind: LayerKind;
  seriesId: Id | null;
  paths: ScenePath[];
}

export interface Scene {
  widthPt: number;
  heightPt: number;
  /** The plotting region that the data are clipped to. */
  plot: Rect;
  /** What the drawing defines for the rest to use: the clip of the plotting region. */
  defs: SceneElement[];
  /** Behind the data: the backgrounds, the gridlines and the reference lines. */
  back: SceneElement[];
  /** The layers that are drawn, lowest first; a layer that is hidden or has nothing to draw is not here. */
  layers: SceneLayer[];
  /** In front of the data: the fitted parameters, the axes with their ticks and numbers, the frame, the scale bars, the titles, the at-risk table and the legend. */
  front: SceneElement[];
}

/** Size of an individual value relative to the symbol of the mean. */
export const RAW_POINT_SCALE = 0.6;

const DATA_KINDS: ReadonlyArray<LayerKind> = ['band', 'line', 'fitBand', 'fitCurve', 'errorBars', 'rawPoints', 'points'];

/** Layers in the order the families that are not drawn from layers draw their series. */
function drawnLayers(chart: Chart, model: XyModel): Array<{ id: Id; kind: LayerKind; seriesId: Id }> {
  const order: LayerKind[] = chart.lineOrder === 'onTop' ? ['points', 'band', 'line', 'fitBand', 'fitCurve', 'errorBars'] : ['band', 'line', 'fitBand', 'fitCurve', 'errorBars', 'points'];
  return order.flatMap((kind) => model.series.map((s) => ({ id: `${s.groupId}:${kind}`, kind, seriesId: s.groupId })));
}

function pathsOf(chart: Chart, s: XySeries, layerId: Id, kind: LayerKind): ScenePath[] {
  const base = svgId(layerId);
  const st = s.style;
  switch (kind) {
    case 'band':
      if (!s.bandPath) return [];
      return [{ id: base, d: s.bandPath, fill: layerLook(chart, layerId, st).color, fillOpacity: chart.layerStyles[layerId]?.opacity ?? BAND_OPACITY, stroke: 'none', strokeWidth: 0, hit: { kind: 'line', groupId: s.groupId } }];
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
        d: symbolPath(st.symbolShape, p.px, p.py, st.symbolSizePt),
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
    ...(xa.visible ? gridElements({ dir: 'v', grid: chart.grid, major: x.ticks, minor: x.minorTicks ?? [], showMajor: xa.showGrid, showMinor: xa.showMinorGrid, at: xScale, from: plot.y, to: bottom }) : []),
    ...referenceLineElements(referenceLinesOf(chart, { family: 'xy', model }).placed.filter((l) => !hidden.has(`${l.line.id}:referenceLine`)), ya.tickFontSizePt),
  ];
  const front = [
    ...(model.fit.showParameters ? fitParameterElements(series, plot.x + 16, plot.y + 8, ya.tickFontSizePt, model.fit.level) : []),
    ...numericAxisElements({ ...axis, cfg: ya, scale: y, along: 'y', crossing: yCross, pieces: yPieces, gaps: axisGaps(y, bottom, -plot.height), map: yScale }),
    ...numericAxisElements({ ...axis, cfg: xa, scale: x, along: 'x', crossing: xCross, pieces: xPieces, gaps: axisGaps(x, plot.x, plot.width), map: xScale }),
    ...[frameElement(chart, plot, ya.lineWidthPt), scaleBarElement(chart, xa, 'x', x, xScale, plot), scaleBarElement(chart, ya, 'y', y, yScale, plot)].flatMap((e) => (e ? [e] : [])),
    ...titleElements(chart, layout, xa, ya),
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
      if (st.showSymbols) keys.push(el('path', [['d', symbolPath(st.symbolShape, it.x + w / 2, it.y, st.symbolSizePt)], ['fill', st.symbolColor], ['fill-opacity', st.symbolFillOpacity < 1 ? st.symbolFillOpacity : undefined], ['stroke', st.symbolBorderColor], ['stroke-width', st.symbolBorderWidthPt], ['stroke-opacity', st.symbolBorderOpacity < 1 ? st.symbolBorderOpacity : undefined]]));
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
    if (paths.length > 0) layers.push({ id: w.id, kind: w.kind, seriesId: w.seriesId, paths });
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

/** Every shape of the scene with what a click on it selects, for the editor's hit-testing and for the tests. */
export const sceneTargets = (scene: Scene): Array<{ id: string; layerId: Id; hit: SceneHit }> =>
  scene.layers.flatMap((l) => l.paths.flatMap((p) => (p.hit ? [{ id: p.id, layerId: l.id, hit: p.hit }] : [])));
