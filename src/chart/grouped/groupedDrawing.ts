import { turned } from '../shared/parts/orientation';
import { partStyle, type LayerKind, type LayerSpec, legendKeyStyle } from '../../model/graph/layers';
import { linePattern } from '../../model/graph/look';
import type { Chart, ChartStyle } from '../../model/types';
import { n2 } from '../../model/units';
import { SELECT_COLOR, visibleAnnotations } from '../shared/scene/annotations';
import type { GroupedModel } from './groupedModel';
import { el, type SceneElement } from '../shared/scene/sceneElement';
import { drawLayerPasses, type DrawPass } from '../shared/parts/layerPasses';
import { svgId } from '../shared/scene/svgIds';
import { barLabelElement, insideBarLabelElement } from '../shared/parts/barLabels';
import { symbolPath } from '../shared/parts/symbols';
import type { ChromeScene } from '../shared/scene/scene';
import { compileCategoryChrome, lineAndSymbolKeys } from '../shared/scene/categoryChrome';
import { referenceLinesOf } from '../shared/scene/referenceLines';
import { annotationPlacer } from '../shared/scene/annotationPlace';
import type { ChartDrawing } from '../shared/scene/SceneChart';

/**
 * The data marks of a grouped or contingency chart (bars, boxes and violins, mean lines, lines, error bars, symbols) as scene
 * elements, in drawing order, clipped to the plotting region: what the drawing of the screen, an export and the editor's
 * hit-testing are made from. The order is that of the chart's layers (model.layers); a layer hidden by its ID draws nothing.
 * Horizontal charts are the vertical drawing under one matrix; symbols stay upright at their turned positions. What shows only
 * while a series is selected carries that series' ID (`whenSelected`).
 */

/**
 * The shapes of a layer are drawn in one of three passes: the body (bars, centre lines), the lines (the line of a chart of lines,
 * error bars) and the symbols. Layers that follow each other in the same pass share one matrix group on a horizontal chart; the
 * symbols are not turned.
 */
const PASS: Partial<Record<LayerKind, DrawPass>> = { bars: 'body', meanLine: 'body', line: 'lines', errorBars: 'lines', points: 'points', rawPoints: 'points' };

export function compileGroupedMarks(chart: Chart, model: GroupedModel): SceneElement[] {
  const { series, orient } = model;
  const hidden = new Set(chart.hiddenLayerIds);
  const seriesOf = new Map(series.map((s) => [s.groupId, s]));
  /** Shapes of the vertical drawing: under the matrix of a horizontal chart, as they are otherwise. */
  const at = (p: { px: number; py: number }) => orient.toScreen(p.px, p.py);
  /** A summary diamond: from the lower to the upper limit along the value axis, `height` across it, its corners put in place like any other point. */
  const diamondPath = (p: { px: number; py: number; diamond: { lowerPy: number; upperPy: number } }, height: number): string =>
    'M' + [[p.px, p.diamond.upperPy], [p.px + height / 2, p.py], [p.px, p.diamond.lowerPy], [p.px - height / 2, p.py]].map(([x, y]) => { const q = orient.toScreen(x, y); return `${n2(q.x)},${n2(q.y)}`; }).join('L') + 'Z';
  const symbolAttrs = (st: ChartStyle, d: string, borderWidth: number) =>
    [['d', d], ['fill', st.symbolColor], ['fill-opacity', st.symbolFillOpacity < 1 ? st.symbolFillOpacity : undefined], ['stroke', st.symbolBorderColor], ['stroke-width', borderWidth], ['stroke-opacity', st.symbolBorderOpacity < 1 ? st.symbolBorderOpacity : undefined]] as const;

  /** The shapes of one layer; each has an id made from its layer (and the observation it draws), the same whatever the style. */
  const elementsOf = (layer: LayerSpec): SceneElement[] => {
    const s = layer.binding ? seriesOf.get(layer.binding.seriesId) : undefined;
    if (!s) return [];
    const named = (e: SceneElement, ...part: Array<string | number>): SceneElement => ({ ...e, id: svgId(layer.id, ...part) });
    // The look of the data set, with what this part was given of its own over it (the same object when it was given none).
    const st = partStyle(chart, layer.id, s.style);
    switch (layer.kind) {
      case 'bars':
        return s.bars.map((b): SceneElement => {
          const hit = { kind: 'bar' as const, groupId: s.groupId, objectId: b.id };
          const mark = (e: SceneElement) => named(e, b.obsId ?? b.id);
          if (!b.dist) {
            return mark(el('rect', [['x', n2(b.x)], ['y', n2(b.y)], ['width', n2(b.width)], ['height', n2(b.height)], ['fill', st.barFillMode === 'none' || !st.showBars ? 'none' : st.barFill], ['fill-opacity', st.barOpacity < 1 ? st.barOpacity : undefined], ['stroke', st.barBorderWidthPt > 0 && st.showBars ? st.barBorderColor : 'none'], ['stroke-width', st.barBorderWidthPt], ['stroke-opacity', st.barBorderOpacity < 1 ? st.barBorderOpacity : undefined]], { hit }));
          }
          return mark(el('g', [['fill', 'none']], {
            children: [
              ...(b.dist.rect ? [el('rect', [['x', n2(b.x)], ['y', n2(b.y)], ['width', n2(b.width)], ['height', n2(b.height)], ['fill', st.showBars && st.barFillMode !== 'none' ? st.barFill : 'none'], ['fill-opacity', st.barOpacity < 1 ? st.barOpacity : undefined], ['stroke', st.showBars && st.barBorderWidthPt > 0 ? st.barBorderColor : 'none'], ['stroke-width', st.barBorderWidthPt], ['stroke-opacity', st.barBorderOpacity < 1 ? st.barBorderOpacity : undefined]], { hit })] : []),
              ...(b.dist.outline && st.showBars ? [el('path', [['d', b.dist.outline], ['fill', st.barFillMode === 'none' ? 'none' : st.barFill], ['fill-opacity', st.barOpacity < 1 ? st.barOpacity : undefined], ['stroke', st.barBorderColor], ['stroke-width', st.barBorderWidthPt], ['stroke-opacity', st.barBorderOpacity < 1 ? st.barBorderOpacity : undefined], ['stroke-linejoin', 'round']], { hit })] : []),
              ...b.dist.lines.map((l) => el('path', [['d', l.d], ['stroke', l.color], ['stroke-width', l.strokeWidth], ['stroke-opacity', l.opacity < 1 ? l.opacity : undefined], ['stroke-dasharray', l.dash], ['stroke-linecap', 'butt']], { hit })),
            ],
          }));
        });
      case 'meanLine':
        return st.showMeanLine
          ? s.bars.flatMap((b) => (b.centerLine ? [named(el('path', [['d', `M${n2(b.centerLine.x1)},${n2(b.centerLine.y)}H${n2(b.centerLine.x2)}`], ['fill', 'none'], ['stroke', st.lineColor], ['stroke-width', st.lineWidthPt], ['stroke-opacity', st.lineOpacity < 1 ? st.lineOpacity : undefined], ['stroke-linecap', 'butt']], { hit: { kind: 'meanLine', groupId: s.groupId, objectId: b.id } }), b.obsId ?? b.id)] : []))
          : [];
      case 'line': {
        if (!st.showLines || s.linePath === '') return [];
        const pattern = linePattern(st);
        return [
          named(el('g', [], {
            children: [
              el('path', [['d', s.linePath], ['fill', 'none'], ['stroke', st.lineColor], ['stroke-width', st.lineWidthPt], ['stroke-opacity', st.lineOpacity < 1 ? st.lineOpacity : undefined], ['stroke-dasharray', pattern.strokeDasharray], ['stroke-linecap', pattern.strokeLinecap], ['stroke-linejoin', 'round']], { hit: { kind: 'line', groupId: s.groupId } }),
              // A glow around the line while its series is selected.
              el('path', [['data-editor-only', 'true'], ['d', s.linePath], ['fill', 'none'], ['stroke', SELECT_COLOR], ['stroke-opacity', 0.35], ['stroke-width', st.lineWidthPt + 10], ['stroke-linecap', 'round'], ['pointer-events', 'none']], { whenSelected: s.groupId }),
            ],
          })),
        ];
      }
      case 'errorBars':
        return s.errorPath !== '' ? [named(el('path', [['d', s.errorPath], ['fill', 'none'], ['stroke', st.errorColor], ['stroke-width', st.errorLineWidthPt], ['stroke-opacity', st.errorOpacity < 1 ? st.errorOpacity : undefined], ['stroke-linecap', 'butt']], { hit: { kind: 'error', groupId: s.groupId } }))] : [];
      case 'points':
        return st.showSymbols ? s.points.map((p) => named(el('path', symbolAttrs(st, p.diamond ? diamondPath({ ...p, diamond: p.diamond }, st.symbolSizePt) : symbolPath(st.symbolShape, at(p).x, at(p).y, st.symbolSizePt, st.symbolBorderWidthPt), st.symbolBorderWidthPt), { hit: { kind: 'point', groupId: s.groupId, objectId: p.id } }), p.obsId ?? p.id)) : [];
      case 'rawPoints':
        return s.dots.map((p) => named(el('path', symbolAttrs(st, symbolPath(p.shape ?? st.symbolShape, at(p).x, at(p).y, st.symbolSizePt, p.shape ? Math.max(st.symbolBorderWidthPt, 2) : st.symbolBorderWidthPt), p.shape ? Math.max(st.symbolBorderWidthPt, 2) : st.symbolBorderWidthPt), { hit: { kind: 'point', groupId: s.groupId, objectId: p.id } }), p.id));
      default:
        return [];
    }
  };

  // The layers in drawing order; the ones that follow each other in the same pass are one run.
  const out = drawLayerPasses(model.layers, PASS, hidden, orient, elementsOf);

  // The frame round the bars of the selected series (the editor only).
  const selection = turned(
    orient,
    series.flatMap((s) =>
      s.bars
        .filter((b) => b.width > 0)
        .map((b) => el('rect', [['data-editor-only', 'true'], ['x', n2(b.x - 3)], ['y', n2(b.y - 3)], ['width', n2(b.width + 6)], ['height', n2(b.height + 6)], ['fill', 'none'], ['stroke', SELECT_COLOR], ['stroke-width', 2.4], ['stroke-dasharray', '6 4'], ['pointer-events', 'none']], { whenSelected: s.groupId })),
    ),
  );
  return [el('g', [['clip-path', 'url(#plot-clip)']], { children: [...out, ...selection] })];
}

/** The labels of the bars of a grouped chart as scene elements, as `compileColumnLabels` does for columns: per series, outside labels first, then inside ones. */
function compileGroupedLabels(chart: Chart, model: GroupedModel): SceneElement[] {
  const hidden = new Set(chart.hiddenLayerIds);
  const seriesOf = new Map(model.series.map((s) => [s.groupId, s]));
  const shown = model.layers.flatMap((l) => {
    const s = l.kind === 'labels' && l.binding && !hidden.has(l.id) ? seriesOf.get(l.binding.seriesId) : undefined;
    return s ? [{ layer: l, s }] : [];
  });
  return [
    ...(chart.barLabels.show === 'none' ? [] : shown.flatMap(({ layer, s }) => s.bars.flatMap((b) => (b.label ? [barLabelElement(b.label, chart.barLabels, chart.textColor, model.orient, svgId(layer.id, b.obsId ?? b.id, 'out'))] : [])))),
    ...shown.flatMap(({ layer, s }) => s.bars.flatMap((b) => (b.insideLabel ? [insideBarLabelElement(b.insideLabel, chart.barLabels.sizePt, model.orient, svgId(layer.id, b.obsId ?? b.id, 'in'))] : []))),
  ];
}

/** The chrome of a chart of grouped or contingency bars or lines. */
export function compileGroupedScene(chart: Chart, model: GroupedModel): ChromeScene {
  return compileCategoryChrome(chart, {
    widthPt: model.widthPt,
    heightPt: model.heightPt,
    layout: model.layout,
    orient: model.orient,
    y: model.y,
    yScale: model.yScale,
    y2: null,
    // Grouped by series: one tick and name for each column of each group; otherwise one for each category.
    categories: model.axisColumns ?? model.categories.map((cat) => ({ key: cat.row, centerX: cat.centerX, label: cat.label })),
    // A reference line that is hidden by its layer is not drawn.
    // The names of the factors: a rule under each cluster of bars, and its name centred below it.
    extraFront: [
    ...model.factorLabels.flatMap((f) => [
      el('path', [['d', `M${n2(f.x1 + 1)},${n2(f.y + 1)}H${n2(f.x2 - 1)}`], ['fill', 'none'], ['stroke', chart.axisColor], ['stroke-width', 1], ['stroke-opacity', chart.axisOpacity < 1 ? chart.axisOpacity : undefined]]),
      el('text', [['x', n2((f.x1 + f.x2) / 2)], ['y', n2(f.y + 2 + chart.xAxis.tickFontSizePt * 0.9)], ['text-anchor', 'middle'], ['font-size', n2(f.fontPt)], ['font-weight', chart.xAxis.tickBold ? 'bold' : undefined], ['fill', chart.textColor]], { text: f.text }),
    ]),
    ],
    references: referenceLinesOf(chart, { family: 'grouped', model }).placed.filter((l) => !chart.hiddenLayerIds.includes(`${l.line.id}:referenceLine`)),
    keysOf: (it, w) => {
      const s = model.series[model.legendSeries[it.index]];
      const st = s.style;
      // The line and the symbol of a key are drawn in the look their layers were given.
      const marks = legendKeyStyle(chart, s.groupId, st);
      // Bars are a filled key; lines are the line and the symbol; a chart of dots only (bars off, symbols on) has the dot alone, with no bar to stand for.
      const dotsOnly = !model.asLines && !st.showBars && st.showSymbols;
      const keys = dotsOnly
        ? lineAndSymbolKeys({ ...marks, showLines: false }, it.x, it.y, w)
        : !model.asLines
        ? [el('rect', [['x', n2(it.x)], ['y', n2(it.y - 10)], ['width', w], ['height', 20], ['fill', st.barFill], ['stroke', st.barBorderWidthPt > 0 ? st.barBorderColor : 'none'], ['stroke-width', st.barBorderWidthPt], ['stroke-opacity', st.barBorderOpacity < 1 ? st.barBorderOpacity : undefined]])]
        : lineAndSymbolKeys(marks, it.x, it.y, w);
      return { groupId: s.groupId, keys };
    },
  });
}

/** What a grouped or contingency chart is drawn from, in order: the chrome behind the data, the marks, the labels of the bars, the chrome in front, then the annotations. */
export function groupedDrawing(chart: Chart, model: GroupedModel): ChartDrawing {
  const scene = model.scene ?? compileGroupedScene(chart, model);
  return {
    widthPt: model.widthPt,
    heightPt: model.heightPt,
    sections: [
      { nodes: scene.defs },
      { nodes: scene.back },
      { nodes: scene.marks ?? compileGroupedMarks(chart, model) },
      { nodes: compileGroupedLabels(chart, model) },
      { nodes: scene.front },
      { annotations: visibleAnnotations(chart.annotations, chart.hiddenLayerIds), drawings: chart.drawings, place: annotationPlacer({ family: 'grouped', model }, model.widthPt, model.heightPt).place },
    ],
  };
}
