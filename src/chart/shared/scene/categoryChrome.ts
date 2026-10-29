import type { Orientation } from '../parts/orientation';
import type { YAxisScale } from '../axes/scales';
import type { PlacedReferenceLine } from './referenceLines';
import { LEGEND_KEY, type Layout, type LegendItemLayout } from '../parts/layout';
import { type SceneElement, el } from './sceneElement';
import type { Chart, ChartStyle } from '../../../model/types';
import type { ChromeScene } from './scene';
import { axisGaps, axisPieces } from '../axes/axisScale';
import { crossingPosition } from '../axes/axisTicks';
import { backgroundElements, categoryAxisElements, frameElement, gridElements, legendElements, numericAxisElements, plotClipElement, referenceLineElements, scaleBarElement, secondaryAxisElements, titleElements } from './chrome';
import { linePattern } from '../../../model/graph/look';
import { n2 } from '../../../model/units';
import { symbolPath } from '../parts/symbols';

/**
 * The chrome of the charts over categories (bars, dots and means of columns; bars and lines of grouped and contingency
 * tables): what is behind the data and what is in front of it. Both kinds are drawn in the vertical drawing of the model and
 * turned into place for horizontal columns, and both have the same value axis, category axis, titles and legend.
 */
export interface CategoryChromeInput {
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
  /** Shapes drawn with the category axis in front of the data (the names of the factors under their clusters of bars). */
  extraFront?: readonly SceneElement[];
  /** The key of one legend entry: what is drawn at the item's place and width, and the data set a click on it selects. */
  keysOf: (item: LegendItemLayout, keyWidth: number) => { groupId: string; keys: SceneElement[] };
}

export function compileCategoryChrome(chart: Chart, c: CategoryChromeInput): ChromeScene {
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
    ...(c.extraFront ?? []),
    ...[frameElement(chart, plot, ya.lineWidthPt), scaleBarElement(chart, ya, horizontal ? 'x' : 'y', y, horizontal ? valueX : yScale, plot)].flatMap((e) => (e ? [e] : [])),
    ...titleElements(chart, layout, horizontal ? ya : xa, horizontal ? xa : ya, y2 ? y2a : null),
    ...legendElements(chart, layout, c.keysOf),
  ];
  return { defs: [plotClipElement(plot, clipX, clipY)], back, front };
}

/** The line and the symbol that stand for a data set in the legend. */
export function lineAndSymbolKeys(style: ChartStyle, x: number, y: number, w: number): SceneElement[] {
  const out: SceneElement[] = [];
  if (style.showLines) {
    const pattern = linePattern(style);
    out.push(el('path', [['d', `M${n2(x)},${n2(y)}H${n2(x + w)}`], ['stroke', style.lineColor], ['stroke-width', style.lineWidthPt], ['stroke-opacity', style.lineOpacity < 1 ? style.lineOpacity : undefined], ['stroke-dasharray', pattern.strokeDasharray], ['stroke-linecap', pattern.strokeLinecap], ['fill', 'none']]));
  }
  if (style.showSymbols) {
    out.push(el('path', [['d', symbolPath(style.symbolShape, x + w / 2, y, Math.min(style.symbolSizePt, LEGEND_KEY.height))], ['fill', style.symbolColor], ['fill-opacity', style.symbolFillOpacity < 1 ? style.symbolFillOpacity : undefined], ['stroke', style.symbolBorderColor], ['stroke-width', style.symbolBorderWidthPt], ['stroke-opacity', style.symbolBorderOpacity < 1 ? style.symbolBorderOpacity : undefined]]));
  }
  return out;
}

