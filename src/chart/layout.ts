import type { AxisConfig, LegendConfig } from '../model/types';
import { measureText } from './text';

/** Layout constants in pt (spec section 20 starting tokens). */
export const OUTER_MARGIN = 7;
export const TICK_LENGTH = 5.6;
export const X_TICK_LABEL_GAP = 2.8;
export const Y_TICK_LABEL_GAP = 3;
export const AXIS_TITLE_GAP = 8.4;
export const LEGEND_KEY_WIDTH = 18;
const LEGEND_KEY_GAP = 5;
const LEGEND_ITEM_GAP = 14;
const MIN_PLOT = 24;

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

export interface LegendLayout {
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
}

const hasText = (s: string): boolean => s.trim().length > 0;

function layoutLegendRows(
  labels: string[],
  fontSize: number,
  availableWidth: number,
): { rows: number[][]; rowHeight: number; widths: number[] } {
  const widths = labels.map((l) => LEGEND_KEY_WIDTH + LEGEND_KEY_GAP + measureText(l, fontSize));
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

export function computeLayout(input: LayoutInput): Layout {
  const { widthPt: W, heightPt: H, xAxis, yAxis, legend } = input;
  const warnings: string[] = [];
  const M = OUTER_MARGIN;

  const showLegend = legend.visible && input.legendLabels.length > 0;
  const legendFont = legend.fontSizePt;

  // ---- Top stack: title, optional top legend.
  let top = M;
  let titleLayout: Layout['title'] = null;
  if (input.title && hasText(input.title.text)) {
    const fs = input.title.fontSizePt;
    titleLayout = { x: 0, y: top + fs * 0.9, fontSizePt: fs };
    top += fs * 1.2 + 6;
  }

  // ---- Legend sizing.
  let legendRows: ReturnType<typeof layoutLegendRows> | null = null;
  let legendWidth = 0;
  let legendHeight = 0;
  if (showLegend) {
    if (legend.position === 'right') {
      legendRows = {
        rows: input.legendLabels.map((_, i) => [i]),
        rowHeight: legendFont * 1.55,
        widths: input.legendLabels.map((l) => LEGEND_KEY_WIDTH + LEGEND_KEY_GAP + measureText(l, legendFont)),
      };
      legendWidth = Math.max(...legendRows.widths);
      legendHeight = legendRows.rows.length * legendRows.rowHeight;
    } else {
      legendRows = layoutLegendRows(input.legendLabels, legendFont, W - 2 * M);
      legendHeight = legendRows.rows.length * legendRows.rowHeight;
      legendWidth = Math.max(
        ...legendRows.rows.map((r) => r.reduce((a, i) => a + legendRows!.widths[i], 0) + LEGEND_ITEM_GAP * (r.length - 1)),
      );
    }
  }
  let legendTop = 0;
  if (showLegend && legend.position === 'top') {
    legendTop = top;
    top += legendHeight + 6;
  }
  let bottom = M;
  let legendBottomY = 0;
  if (showLegend && legend.position === 'bottom') {
    legendBottomY = H - M - legendHeight;
    bottom += legendHeight + 6;
  }
  let right = M;
  if (showLegend && legend.position === 'right') right += legendWidth + 10;

  // ---- Right: secondary Y axis ticks, tick labels and title, outside the legend.
  const y2Visible = !!input.y2Axis && input.y2Axis.visible;
  const y2TitleVisible = y2Visible && hasText(input.y2Axis!.title);
  let y2Block = 0;
  if (y2Visible) {
    const y2 = input.y2Axis!;
    const widest = Math.max(0, ...(input.y2TickLabels ?? []).map((l) => measureText(l, y2.tickFontSizePt, true)));
    y2Block = TICK_LENGTH + Y_TICK_LABEL_GAP + widest;
    if (y2TitleVisible) y2Block += AXIS_TITLE_GAP + y2.titleFontSizePt * 1.2;
  }
  right += y2Block;

  // ---- Left: Y axis title, tick labels, ticks.
  let left = M;
  const yTitleVisible = yAxis.visible && hasText(yAxis.title);
  if (yTitleVisible) left += yAxis.titleFontSizePt * 1.2 + AXIS_TITLE_GAP;
  if (yAxis.visible) {
    const widest = Math.max(0, ...input.yTickLabels.map((l) => measureText(l, yAxis.tickFontSizePt, true)));
    left += widest + Y_TICK_LABEL_GAP + TICK_LENGTH;
  }

  // ---- Bottom: X tick labels, ticks, X title. Rotation decided after plot width is known.
  const xTitleVisible = xAxis.visible && hasText(xAxis.title);
  const xTitleBlock = xTitleVisible ? xAxis.titleFontSizePt * 1.2 + AXIS_TITLE_GAP : 0;
  const labelWidths = input.categoryLabels.map((l) => measureText(l, xAxis.tickFontSizePt, true));
  const maxLabelWidth = Math.max(0, ...labelWidths);
  const tickLabelBlock = (rotated: boolean): number =>
    xAxis.visible
      ? TICK_LENGTH +
        X_TICK_LABEL_GAP +
        (rotated ? maxLabelWidth * Math.SQRT1_2 + xAxis.tickFontSizePt * Math.SQRT1_2 : xAxis.tickFontSizePt * 1.1)
      : 0;

  const plotWidthFor = () => W - left - right;
  const slot = plotWidthFor() / Math.max(1, input.categoryLabels.length);
  const xTickRotated = xAxis.visible && maxLabelWidth > slot * 0.92;

  const extra = input.extraBottomPt && input.extraBottomPt > 0 ? input.extraBottomPt : 0;
  bottom += tickLabelBlock(xTickRotated) + xTitleBlock + extra;

  let plot: Rect = { x: left, y: top, width: W - left - right, height: H - top - bottom };
  if (plot.width < MIN_PLOT || plot.height < MIN_PLOT) {
    warnings.push('The chart is too small for its labels and legend; enlarge the chart or reduce font sizes.');
    plot = { x: left, y: top, width: Math.max(MIN_PLOT, plot.width), height: Math.max(MIN_PLOT, plot.height) };
  }

  if (titleLayout) titleLayout.x = plot.x + plot.width / 2;

  const xTitle = xTitleVisible
    ? { x: plot.x + plot.width / 2, y: H - M - (showLegend && legend.position === 'bottom' ? legendHeight + 6 : 0) - extra - xAxis.titleFontSizePt * 0.25 }
    : null;
  const yTitle = yTitleVisible ? { x: M + yAxis.titleFontSizePt * 0.9, y: plot.y + plot.height / 2 } : null;

  const y2Title = y2TitleVisible
    ? { x: plot.x + plot.width + y2Block - input.y2Axis!.titleFontSizePt * 0.3, y: plot.y + plot.height / 2 }
    : null;

  let legendLayout: LegendLayout | null = null;
  if (showLegend && legendRows) {
    const items: LegendItemLayout[] = [];
    let rect: Rect;
    if (legend.position === 'right') {
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
    legendLayout = { rect, items, fontSizePt: legendFont };
  }

  const extraBottom = extra > 0 ? { y: H - M - (showLegend && legend.position === 'bottom' ? legendHeight + 6 : 0) - extra, height: extra } : null;
  return { plot, title: titleLayout, legend: legendLayout, xTickRotated, xTitle, yTitle, y2Title, extraBottom, warnings };
}

export const LEGEND_KEY = { width: LEGEND_KEY_WIDTH, gap: LEGEND_KEY_GAP };
