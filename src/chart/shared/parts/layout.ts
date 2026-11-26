import { legendKeyWidthPt } from '../../../model/graph/look';
import { numberStartPt } from '../../../model/graph/axis';
import { FONT_FAMILY } from '../../../model/defaults';
import type { AxisConfig, Chart, LegendConfig, PlotMargins } from '../../../model/types';
import { legendColumns, legendOffset } from '../../../model/graph/legendEntries';
import { measureText } from './text';
import { chartFamily, supportsHorizontal } from '../../../model/graph/chartTypes';

/** Layout constants in pt (spec section 20 starting tokens). */
const OUTER_MARGIN = 14;
export const X_TICK_LABEL_GAP = 5.6;
export const Y_TICK_LABEL_GAP = 6;
export const AXIS_TITLE_GAP = 16.8;
const LEGEND_KEY_WIDTH = 36;
const LEGEND_KEY_GAP = 10;
const LEGEND_ITEM_GAP = 28;
const MIN_PLOT = 48;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LegendItemLayout {
  index: number;
  x: number;
  /** Vertical centre of the row. */
  y: number;
  label: string;
}

interface LegendLayout {
  rect: Rect;
  items: LegendItemLayout[];
  fontSizePt: number;
}

export interface Layout {
  plot: Rect;
  title: { x: number; y: number; fontSizePt: number } | null;
  legend: LegendLayout | null;
  /** X tick labels rotated -45 degrees when they would overlap. */
  xTickRotated: boolean;
  xTitle: { x: number; y: number } | null;
  yTitle: { x: number; y: number } | null;
  y2Title: { x: number; y: number } | null;
  /** Band reserved below the X title (above a bottom legend): top y and height, pt; null when none was asked for. */
  extraBottom: { y: number; height: number } | null;
  /** Band reserved under the category labels (the names of the factors of grouped bars): top y and height, pt; null when none was asked for. */
  categoryRow: { y: number; height: number } | null;
  /** Where the labels of reference lines stand outside the plotting box: the x of the left and right ones (their text ends / starts there) and the baseline y of the top and bottom ones. */
  refLabel: { left: number; right: number; top: number; bottom: number };
  warnings: string[];
}

export interface LayoutInput {
  widthPt: number;
  heightPt: number;
  title: { text: string; fontSizePt: number } | null;
  xAxis: AxisConfig;
  yAxis: AxisConfig;
  legend: LegendConfig;
  legendLabels: string[];
  categoryLabels: string[];
  yTickLabels: string[];
  /** Right (secondary) value axis; absent or hidden reserves no space. */
  y2Axis?: AxisConfig;
  y2TickLabels?: string[];
  /** Height in pt to reserve under the X axis title, for a table of numbers under the plot. */
  extraBottomPt?: number;
  /** Height in pt to reserve under the category labels, for a second row of names. */
  categoryRowPt?: number;
  /** Font of the chart's text (for measuring) and the extra distance of the chart title from the top edge. */
  fontFamily?: string;
  titleOffsetPt?: number;
  /** The numbers of a value axis that runs along the bottom (a horizontal bar chart), first to last: the first and the last stand at the ends of the axis, and half of each hangs out over the plot, so room is kept for it. */
  xNumberLabels?: string[];
  /** The numbers along a numeric bottom axis (their widths matter when the labels are turned by hand). */
  xTickTexts?: string[];
  /** Room outside the plot for the labels of reference lines, pt (see referenceLabelRoom). */
  refLabelRoom?: { left: number; right: number; top: number; bottom: number };
  /**
   * The least room on each side of the plot, pt: a page layout gives it so that the plots of a row or column line up. The plot
   * shrinks; titles and legends stay at the edges of the graph, as they would without it.
   */
  marginFloorPt?: PlotMargins;
}

/** The space kept between the end of a number on the axis and the edge of the image, pt. */
const END_LABEL_GAP = 4;

const hasText = (s: string): boolean => s.trim().length > 0;

function layoutLegendRows(
  keyWidth: number,
  labels: string[],
  fontSize: number,
  availableWidth: number,
  family: string,
): { rows: number[][]; rowHeight: number; widths: number[] } {
  const widths = labels.map((l) => keyWidth + LEGEND_KEY_GAP + measureText(l, fontSize, false, false, family));
  const rows: number[][] = [];
  let current: number[] = [];
  let used = 0;
  widths.forEach((w, i) => {
    const needed = current.length === 0 ? w : used + LEGEND_ITEM_GAP + w;
    if (current.length > 0 && needed > availableWidth) {
      rows.push(current);
      current = [i];
      used = w;
    } else {
      current.push(i);
      used = needed;
    }
  });
  if (current.length > 0) rows.push(current);
  return { rows, rowHeight: fontSize * 1.55, widths };
}

/**
 * The entries in rows of `columns`, one entry after the other along each row. Each column is as wide as its widest entry, so the
 * entries stand in lines; `colX` is where each column starts from the left of the legend, and `width` the whole legend.
 */
function layoutLegendGrid(widths: number[], columns: number, rowHeight: number): { rows: number[][]; rowHeight: number; widths: number[]; colX: number[]; width: number } {
  const count = Math.min(columns, widths.length);
  const rows: number[][] = [];
  for (let i = 0; i < widths.length; i += count) rows.push(widths.slice(i, i + count).map((_, k) => i + k));
  const colWidths = Array.from({ length: count }, (_, c) => Math.max(...rows.flatMap((r) => (r[c] === undefined ? [] : [widths[r[c]]]))));
  const colX = colWidths.map((_, c) => colWidths.slice(0, c).reduce((a, w) => a + w + LEGEND_ITEM_GAP, 0));
  return { rows, rowHeight, widths, colX, width: colX[count - 1] + colWidths[count - 1] };
}

/**
 * The room the labels of the chart's reference lines need outside the plotting box: a horizontal line's label stands to its right (or
 * left), a vertical line's above (or below) the plot. A line without a visible label, an oblique line (its label stays at its end, inside)
 * and a line of an axis the chart does not have ask for none.
 */
function referenceLabelRoom(chart: Chart): { left: number; right: number; top: number; bottom: number } {
  const room = { left: 0, right: 0, top: 0, bottom: 0 };
  const family = chartFamily(chart.type);
  if (chart.referenceLines.length === 0 || family === 'pie' || family === 'heatmap') return room;
  const fs = chart.yAxis.tickFontSizePt;
  const turned = (family === 'column' || family === 'grouped') && chart.orientation === 'horizontal' && supportsHorizontal(chart.type);
  for (const l of chart.referenceLines) {
    if (!l.showLabel || l.slope !== undefined || l.label.trim() === '') continue;
    if ((family === 'column' || family === 'grouped') && l.axis === 'x') continue;
    const vertical = l.axis === 'x' || turned;
    const start = l.labelAt === 'start';
    if (vertical) {
      const side = start ? 'bottom' : 'top';
      room[side] = Math.max(room[side], fs * 1.25 + 6);
    } else {
      const side = start ? 'left' : 'right';
      room[side] = Math.max(room[side], measureText(l.label, fs, false, false, chart.fontFamily) + 12);
    }
  }
  return room;
}

/** The layout of a chart: its font, title, axes and legend are taken from it; `rest` adds what the chart type knows and may override any of them. */
export function chartLayout(chart: Chart, widthPt: number, heightPt: number, rest: Omit<LayoutInput, 'widthPt' | 'heightPt' | 'title' | 'xAxis' | 'yAxis' | 'legend' | 'fontFamily' | 'titleOffsetPt'> & Partial<LayoutInput>): Layout {
  return computeLayout({
    fontFamily: chart.fontFamily,
    titleOffsetPt: chart.titleOffsetPt,
    widthPt,
    heightPt,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    xAxis: chart.xAxis,
    yAxis: chart.yAxis,
    legend: chart.legend,
    refLabelRoom: referenceLabelRoom(chart),
    marginFloorPt: chart.layoutMarginsPt,
    ...rest,
  });
}

export function computeLayout(input: LayoutInput): Layout {
  const { widthPt: W, heightPt: H, xAxis, yAxis, legend } = input;
  const warnings: string[] = [];
  const M = OUTER_MARGIN;
  const ff = input.fontFamily ?? FONT_FAMILY;
  const keyWidth = legendKeyWidthPt(legend.keyShape);

  const showLegend = legend.visible && input.legendLabels.length > 0;
  const legendFont = legend.fontSizePt;

  // ---- Top stack: title, optional top legend.
  let top = M;
  let titleLayout: Layout['title'] = null;
  if (input.title && hasText(input.title.text)) {
    const fs = input.title.fontSizePt;
    top += input.titleOffsetPt ?? 0;
    titleLayout = { x: 0, y: top + fs * 0.9, fontSizePt: fs };
    top += fs * 1.2 + 12;
  }

  // ---- Legend sizing.
  let legendRows: ReturnType<typeof layoutLegendRows> | null = null;
  let legendGrid: ReturnType<typeof layoutLegendGrid> | null = null;
  let legendWidth = 0;
  let legendHeight = 0;
  const legendCols = legendColumns(legend);
  if (showLegend) {
    if (legendCols > 1) {
      // Entries in rows of that many columns, measured from the real text.
      const widths = input.legendLabels.map((l) => keyWidth + LEGEND_KEY_GAP + measureText(l, legendFont, false, false, ff));
      legendGrid = layoutLegendGrid(widths, legendCols, legendFont * 1.55);
      legendRows = legendGrid;
      legendWidth = legendGrid.width;
      legendHeight = legendGrid.rows.length * legendGrid.rowHeight;
    } else if (legend.position === 'right') {
      legendRows = {
        rows: input.legendLabels.map((_, i) => [i]),
        rowHeight: legendFont * 1.55,
        widths: input.legendLabels.map((l) => keyWidth + LEGEND_KEY_GAP + measureText(l, legendFont, false, false, ff)),
      };
      legendWidth = Math.max(...legendRows.widths);
      legendHeight = legendRows.rows.length * legendRows.rowHeight;
    } else {
      legendRows = layoutLegendRows(keyWidth, input.legendLabels, legendFont, W - 2 * M, ff);
      legendHeight = legendRows.rows.length * legendRows.rowHeight;
      legendWidth = Math.max(
        ...legendRows.rows.map((r) => r.reduce((a, i) => a + legendRows!.widths[i], 0) + LEGEND_ITEM_GAP * (r.length - 1)),
      );
    }
  }
  let legendTop = 0;
  if (showLegend && legend.position === 'top') {
    legendTop = top;
    top += legendHeight + 12;
  }
  const room = input.refLabelRoom ?? { left: 0, right: 0, top: 0, bottom: 0 };
  // Labels of reference lines above the plot stand between the title (and a top legend) and the plot.
  const refTop = top + room.top - 4;
  top += room.top;
  let bottom = M;
  let legendBottomY = 0;
  if (showLegend && legend.position === 'bottom') {
    legendBottomY = H - M - legendHeight;
    bottom += legendHeight + 12;
  }
  let right = M;
  if (showLegend && legend.position === 'right') right += legendWidth + 20;

  // ---- Right: secondary Y axis ticks, tick labels and title, outside the legend.
  const y2Visible = !!input.y2Axis && input.y2Axis.visible;
  const y2TitleVisible = y2Visible && input.y2Axis!.titleVisible && hasText(input.y2Axis!.title);
  let y2Block = 0;
  if (y2Visible) {
    const y2 = input.y2Axis!;
    const widest = Math.max(0, ...(input.y2TickLabels ?? []).map((l) => measureText(l, y2.tickFontSizePt, y2.tickBold, false, ff)));
    y2Block = numberStartPt(y2) + Y_TICK_LABEL_GAP + widest;
    if (y2TitleVisible) y2Block += AXIS_TITLE_GAP + y2.titleOffsetPt + y2.titleFontSizePt * 1.2;
  }
  right += y2Block + room.right;

  // ---- Left: Y axis title, tick labels, ticks.
  let left = M;
  const yTitleVisible = yAxis.visible && yAxis.titleVisible && hasText(yAxis.title);
  if (yTitleVisible) left += yAxis.titleFontSizePt * 1.2 + AXIS_TITLE_GAP + yAxis.titleOffsetPt;
  // Labels of reference lines to the left of the plot stand between the Y title and the numbers.
  const refLeft = left + room.left - 6;
  left += room.left;
  if (yAxis.visible) {
    const widest = Math.max(0, ...input.yTickLabels.map((l) => measureText(l, yAxis.tickFontSizePt, yAxis.tickBold, false, ff)));
    // Numbers turned by hand take the width of the turned text.
    const turn = ((yAxis.tickAngle ?? 0) * Math.PI) / 180;
    const across = yAxis.tickAngle !== undefined ? Math.abs(Math.cos(turn)) * widest + Math.abs(Math.sin(turn)) * yAxis.tickFontSizePt * 1.1 : widest;
    left += across + Y_TICK_LABEL_GAP + numberStartPt(yAxis);
  }

  // ---- The numbers along the bottom end at the edges of the plot: the last (100 on a scale to 100) needs half its width beyond the plot, and the first half before it.
  if (xAxis.visible && input.xNumberLabels && input.xNumberLabels.length > 0) {
    const half = (l: string) => measureText(l, xAxis.tickFontSizePt, xAxis.tickBold, false, ff) / 2;
    const ends = input.xNumberLabels;
    right = Math.max(right, half(ends[ends.length - 1]) + END_LABEL_GAP);
    left = Math.max(left, half(ends[0]) + END_LABEL_GAP);
  }
  // The room a page layout asks for, so that this plot's sides line up with its neighbours'.
  const floor = input.marginFloorPt;
  if (floor) {
    left = Math.max(left, floor.left);
    right = Math.max(right, floor.right);
  }
  // Where the labels of reference lines to the right of the plot start: past the right axis, whatever else made the margin larger.
  const refRight = W - right + y2Block + 6;

  // ---- Bottom: X tick labels, ticks, X title. Rotation decided after plot width is known.
  const xTitleVisible = xAxis.visible && xAxis.titleVisible && hasText(xAxis.title);
  const xTitleBlock = xTitleVisible ? xAxis.titleFontSizePt * 1.2 + AXIS_TITLE_GAP + xAxis.titleOffsetPt : 0;
  // Labels turned by hand: the height they take depends on the angle and on the longest text (the names, or the numbers of a numeric axis).
  const manualX = xAxis.tickAngle;
  const bottomTexts = manualX !== undefined && input.categoryLabels.length === 0 ? input.xTickTexts ?? input.xNumberLabels ?? [] : input.categoryLabels;
  const labelWidths = bottomTexts.map((l) => measureText(l, xAxis.tickFontSizePt, xAxis.tickBold, false, ff));
  const maxLabelWidth = Math.max(0, ...labelWidths);
  const manualRad = ((manualX ?? 0) * Math.PI) / 180;
  const tickLabelBlock = (rotated: boolean): number =>
    xAxis.visible
      ? numberStartPt(xAxis) +
        X_TICK_LABEL_GAP +
        (manualX !== undefined
          ? Math.abs(Math.sin(manualRad)) * maxLabelWidth + (0.1 + Math.abs(Math.cos(manualRad))) * xAxis.tickFontSizePt
          : rotated ? maxLabelWidth * Math.SQRT1_2 + xAxis.tickFontSizePt * Math.SQRT1_2 : xAxis.tickFontSizePt * 1.1)
      : 0;

  const plotWidthFor = () => W - left - right;
  const slot = plotWidthFor() / Math.max(1, input.categoryLabels.length);
  const xTickRotated = xAxis.visible && (manualX !== undefined ? manualX !== 0 : maxLabelWidth > slot * 0.92);

  const extra = input.extraBottomPt && input.extraBottomPt > 0 ? input.extraBottomPt : 0;
  const categoryRow = input.categoryRowPt && input.categoryRowPt > 0 && xAxis.visible ? input.categoryRowPt : 0;
  bottom += tickLabelBlock(xTickRotated) + xTitleBlock + extra + categoryRow + room.bottom;
  if (floor) {
    top = Math.max(top, floor.top);
    bottom = Math.max(bottom, floor.bottom);
  }

  let plot: Rect = { x: left, y: top, width: W - left - right, height: H - top - bottom };
  if (plot.width < MIN_PLOT || plot.height < MIN_PLOT) {
    warnings.push('The chart is too small for its labels and legend; enlarge the chart or reduce font sizes.');
    plot = { x: left, y: top, width: Math.max(MIN_PLOT, plot.width), height: Math.max(MIN_PLOT, plot.height) };
  }

  if (titleLayout) titleLayout.x = plot.x + plot.width / 2;

  const xTitle = xTitleVisible
    ? { x: plot.x + plot.width / 2, y: H - M - (showLegend && legend.position === 'bottom' ? legendHeight + 12 : 0) - extra - xAxis.titleFontSizePt * 0.25 }
    : null;
  const yTitle = yTitleVisible ? { x: M + yAxis.titleFontSizePt * 0.9, y: plot.y + plot.height / 2 } : null;

  const y2Title = y2TitleVisible
    ? { x: plot.x + plot.width + y2Block - input.y2Axis!.titleFontSizePt * 0.3, y: plot.y + plot.height / 2 }
    : null;

  let legendLayout: LegendLayout | null = null;
  if (showLegend && legendRows) {
    const items: LegendItemLayout[] = [];
    let rect: Rect;
    if (legendGrid) {
      const grid = legendGrid;
      const y0 = legend.position === 'right' ? plot.y + Math.max(0, (plot.height - legendHeight) / 2) : legend.position === 'top' ? legendTop : legendBottomY;
      const x0 = legend.position === 'right' ? W - M - legendWidth : plot.x + (plot.width - legendWidth) / 2;
      rect = { x: x0, y: y0, width: legendWidth, height: legendHeight };
      grid.rows.forEach((row, r) => row.forEach((i, c) => items.push({ index: i, x: x0 + grid.colX[c], y: y0 + (r + 0.5) * grid.rowHeight, label: input.legendLabels[i] })));
    } else if (legend.position === 'right') {
      rect = {
        x: W - M - legendWidth,
        y: plot.y + Math.max(0, (plot.height - legendHeight) / 2),
        width: legendWidth,
        height: legendHeight,
      };
      legendRows.rows.forEach((row, r) =>
        row.forEach((i) => items.push({ index: i, x: rect.x, y: rect.y + (r + 0.5) * legendRows!.rowHeight, label: input.legendLabels[i] })),
      );
    } else {
      const y0 = legend.position === 'top' ? legendTop : legendBottomY;
      rect = { x: plot.x + (plot.width - legendWidth) / 2, y: y0, width: legendWidth, height: legendHeight };
      legendRows.rows.forEach((row, r) => {
        const rowWidth = row.reduce((a, i) => a + legendRows!.widths[i], 0) + LEGEND_ITEM_GAP * (row.length - 1);
        let x = plot.x + (plot.width - rowWidth) / 2;
        for (const i of row) {
          items.push({ index: i, x, y: y0 + (r + 0.5) * legendRows!.rowHeight, label: input.legendLabels[i] });
          x += legendRows!.widths[i] + LEGEND_ITEM_GAP;
        }
      });
    }
    // A shift set by the user moves the legend only: the room it takes (and so the plot) stays as it was.
    const { x: dx, y: dy } = legendOffset(legend);
    if (dx !== 0 || dy !== 0) {
      rect = { ...rect, x: rect.x + dx, y: rect.y + dy };
      for (const it of items) {
        it.x += dx;
        it.y += dy;
      }
      if (rect.x < 0 || rect.y < 0 || rect.x + rect.width > W || rect.y + rect.height > H) warnings.push('The legend has been moved partly outside the chart.');
    }
    legendLayout = { rect, items, fontSizePt: legendFont };
  }

  const extraBottom = extra > 0 ? { y: H - M - (showLegend && legend.position === 'bottom' ? legendHeight + 12 : 0) - extra, height: extra } : null;
  const refBottom = plot.y + plot.height + tickLabelBlock(xTickRotated) + categoryRow + room.bottom - 4;
  return { refLabel: { left: refLeft, right: refRight, top: refTop, bottom: refBottom }, plot, title: titleLayout, legend: legendLayout, xTickRotated, xTitle, yTitle, y2Title, extraBottom, categoryRow: categoryRow > 0 ? { y: plot.y + plot.height + tickLabelBlock(xTickRotated), height: categoryRow } : null, warnings };
}

/** The size of a legend key: its width, the gap to the name, and its height (the largest a symbol is drawn in a key, so that a large dot or bubble does not cover the name beside it). */
export const LEGEND_KEY = { width: LEGEND_KEY_WIDTH, gap: LEGEND_KEY_GAP, height: 20 };

/** Width of a legend colour key: 36 pt for a rectangle, 20 pt for a square. */
export const keyWidthOf = (legend: Pick<LegendConfig, 'keyShape'>): number => legendKeyWidthPt(legend.keyShape);
