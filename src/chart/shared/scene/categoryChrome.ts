import { linePattern } from '../model/look';
import type { Chart } from '../model/types';
import { n2 } from '../model/units';
import { axisGaps, axisPieces } from './axisScale';
import { crossingPosition } from './axisTicks';
import { backgroundElements, categoryAxisElements, frameElement, gridElements, legendElements, numericAxisElements, plotClipElement, referenceLineElements, scaleBarElement, secondaryAxisElements, titleElements } from './chrome';
import { keyMarkElement } from './fillElements';
import type { GroupedModel } from './groupedModel';
import type { Layout, LegendItemLayout } from './layout';
import type { ChartModel, Orientation } from './model';
import { referenceLinesOf, type PlacedReferenceLine } from './referenceLines';
import type { ChromeScene } from './scene';
import { el, type SceneElement } from './sceneElement';
import type { YAxisScale } from './scales';
import { symbolPath } from './symbols';

/**
 * The chrome of the charts over categories (bars, dots and means of columns; bars and lines of grouped and contingency
 * tables): what is behind the data and what is in front of it. Both kinds are drawn in the vertical drawing of the model and
 * turned into place for horizontal columns, and both have the same value axis, category axis, titles and legend.
 */
interface CategoryChromeInput {
  widthPt: number;
  heightPt: number;
  layout: Layout;
  orient: Orientation;
  y: YAxisScale;
  yScale: (v: number) => number;
  /** The right-hand Y axis, when one is drawn (columns only). */
  y2: { scale: YAxisScale; map: (v: number) => number } | null;
  categories: ReadonlyArray<{ key: string | number; centerX: number; label: string }>;
  references: readonly PlacedReferenceLine[];
  /** The key of one legend entry: what is drawn at the item's place and width, and the data set a click on it selects. */
  keysOf: (item: LegendItemLayout, keyWidth: number) => { groupId: string; keys: SceneElement[] };
}

function compileCategoryChrome(chart: Chart, c: CategoryChromeInput): ChromeScene {
  const { widthPt: W, heightPt: H, layout, orient, y, yScale, y2, categories } = c;
  const { plot } = layout;
  const xa = chart.xAxis;
  const ya = chart.yAxis;
  const y2a = chart.y2Axis;
  const horizontal = orient.horizontal;
  const bottom = plot.y + plot.height;
  const right = plot.x + plot.width;
  const valueX = (t: number) => orient.toScreen(0, yScale(t)).x;
  const categoryY = (cx: number) => orient.toScreen(cx, 0).y;
  // A broken value axis: the pieces of axis that are drawn, and where the gaps are, on the page.
  const valueOrigin = horizontal ? orient.virtual.y + orient.virtual.height : bottom;
  const valueSpan = horizontal ? -orient.virtual.height : -plot.height;
  const valuePieces = axisPieces(y, valueOrigin, valueSpan);
  const valueGaps = axisGaps(y, valueOrigin, valueSpan);
  const onPage = (ranges: Array<[number, number]>): Array<[number, number]> => (horizontal ? ranges.map(([a, b]) => [orient.toScreen(0, b).x, orient.toScreen(0, a).x] as [number, number]) : ranges);
  const clipX = horizontal && valuePieces ? onPage(valuePieces) : null;
  const clipY = horizontal ? null : valuePieces;
  // Where the category axis crosses the value axis (default: the low end); the numbers stay where they are.
  const categoryAxisY = crossingPosition(chart.origin.y, y, yScale, bottom);
  const categoryAxisX = crossingPosition(chart.origin.y, y, valueX, plot.x);
  const axis = { chart, plot };

  const back = [
    ...backgroundElements(chart, W, H, plot),
    ...(ya.visible
      ? horizontal
        ? gridElements({ dir: 'v', grid: chart.grid, major: y.ticks, minor: y.minorTicks ?? [], showMajor: ya.showGrid, showMinor: ya.showMinorGrid, at: valueX, from: plot.y, to: bottom })
        : gridElements({ dir: 'h', grid: chart.grid, major: y.ticks, minor: y.minorTicks ?? [], showMajor: ya.showGrid, showMinor: ya.showMinorGrid, at: yScale, from: plot.x, to: right })
      : []),
    // Right gridlines: dashed when the left grid is also drawn, so the two sets stay distinguishable.
    ...(y2 ? gridElements({ dir: 'h', grid: chart.grid, major: y2.scale.ticks, minor: y2.scale.minorTicks ?? [], showMajor: y2a.showGrid, showMinor: y2a.showMinorGrid, at: y2.map, from: plot.x, to: right, fallbackDash: ya.visible && ya.showGrid ? '3 3' : undefined }) : []),
    ...referenceLineElements(c.references, ya.tickFontSizePt),
  ];
  const valueAxis = horizontal
    ? numericAxisElements({ ...axis, name: 'y', cfg: ya, scale: y, along: 'x', crossing: bottom, pieces: clipX, gaps: onPage(valueGaps), map: valueX })
    : numericAxisElements({ ...axis, name: 'y', cfg: ya, scale: y, along: 'y', crossing: plot.x, pieces: valuePieces, gaps: valueGaps, map: yScale });
  const front = [
    ...valueAxis,
    ...(!horizontal && y2 ? secondaryAxisElements({ chart, cfg: y2a, scale: y2.scale, map: y2.map, plot }) : []),
    ...categoryAxisElements({ ...axis, cfg: xa, items: categories, horizontal, crossing: horizontal ? categoryAxisX : categoryAxisY, categoryY, rotated: layout.xTickRotated }),
    ...[frameElement(chart, plot, ya.lineWidthPt), scaleBarElement(chart, ya, horizontal ? 'x' : 'y', y, horizontal ? valueX : yScale, plot)].flatMap((e) => (e ? [e] : [])),
    ...titleElements(chart, layout, horizontal ? ya : xa, horizontal ? xa : ya, y2 ? y2a : null),
    ...legendElements(chart, layout, c.keysOf),
  ];
  return { defs: [plotClipElement(plot, clipX, clipY)], back, front };
}

/** The line and the symbol that stand for a data set in the legend. */
function lineAndSymbolKeys(style: ChartModel['groups'][number]['style'], x: number, y: number, w: number): SceneElement[] {
  const out: SceneElement[] = [];
  if (style.showLines) {
    const pattern = linePattern(style);
    out.push(el('path', [['d', `M${n2(x)},${n2(y)}H${n2(x + w)}`], ['stroke', style.lineColor], ['stroke-width', style.lineWidthPt], ['stroke-opacity', style.lineOpacity < 1 ? style.lineOpacity : undefined], ['stroke-dasharray', pattern.strokeDasharray], ['stroke-linecap', pattern.strokeLinecap], ['fill', 'none']]));
  }
  if (style.showSymbols) {
    out.push(el('path', [['d', symbolPath(style.symbolShape, x + w / 2, y, style.symbolSizePt)], ['fill', style.symbolColor], ['fill-opacity', style.symbolFillOpacity < 1 ? style.symbolFillOpacity : undefined], ['stroke', style.symbolBorderColor], ['stroke-width', style.symbolBorderWidthPt], ['stroke-opacity', style.symbolBorderOpacity < 1 ? style.symbolBorderOpacity : undefined]]));
  }
  return out;
}

/** The chrome of a chart of columns (bar, scatter, mean, box, violin, floating, paired). */
export function compileCategoryScene(chart: Chart, model: ChartModel): ChromeScene {
  const y2a = chart.y2Axis;
  // model.y2 is null while no data set is bound to the right axis; a hidden right axis draws nothing.
  const y2 = model.y2 && model.y2Scale && y2a.visible ? { scale: model.y2, map: model.y2Scale } : null;
  return compileCategoryChrome(chart, {
    widthPt: model.widthPt,
    heightPt: model.heightPt,
    layout: model.layout,
    orient: model.orient,
    y: model.y,
    yScale: model.yScale,
    y2,
    categories: model.groups.map((g) => ({ key: g.groupId, centerX: g.centerX, label: g.label })),
    references: referenceLinesOf(chart, { family: 'category', model }).placed,
    keysOf: (it, w) => {
      const g = model.groups[model.legendGroups[it.index]];
      // A bar is a filled key; the others are the line and the symbol, together in a group.
      return { groupId: g.groupId, keys: g.style.showBars ? [keyMarkElement(g.style, it.x, it.y, chart.id, g.groupId, w)] : [el('g', [], { children: lineAndSymbolKeys(g.style, it.x, it.y, w) })] };
    },
  });
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
    categories: model.categories.map((cat) => ({ key: cat.row, centerX: cat.centerX, label: cat.label })),
    references: referenceLinesOf(chart, { family: 'grouped', model }).placed,
    keysOf: (it, w) => {
      const s = model.series[model.legendSeries[it.index]];
      const st = s.style;
      // Bars are a filled key; lines are the line and the symbol.
      const keys = !model.asLines
        ? [el('rect', [['x', n2(it.x)], ['y', n2(it.y - 10)], ['width', w], ['height', 20], ['fill', st.barFill], ['stroke', st.barBorderWidthPt > 0 ? st.barBorderColor : 'none'], ['stroke-width', st.barBorderWidthPt], ['stroke-opacity', st.barBorderOpacity < 1 ? st.barBorderOpacity : undefined]])]
        : lineAndSymbolKeys(st, it.x, it.y, w);
      return { groupId: s.groupId, keys };
    },
  });
}
