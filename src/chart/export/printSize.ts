import { dataLayer } from '../../model/graph/style';
import type { Chart, ChartStyle } from '../../model/types';

/**
 * Guideline values for print, not verified against a specific journal: text smaller than 6 pt and lines thinner than 0.25 pt
 * are commonly reported as too small to read or to reproduce. Journals differ; check the author guidelines of yours.
 */
const MIN_TEXT_PT = 6;
const MIN_LINE_PT = 0.25;

/** How much the chart is scaled when it is printed `printWidthMm` wide: 1 means its own size (96 px = 25.4 mm). */
export const printScale = (chart: Pick<Chart, 'widthPx'>, printWidthMm: number): number => printWidthMm / ((chart.widthPx * 25.4) / 96);

/** A size below the limit, written so that it never rounds up to the limit it is below. */
function shown(pt: number, limit: number, digits: number): string {
  let s = pt.toFixed(digits);
  while (Number(s) >= limit && digits < 4) s = pt.toFixed(++digits);
  return s;
}

/** The sizes (pt, as set on the chart) of each kind of text and line the chart draws; the smallest of each kind is kept. */
function itemSizes(chart: Chart): { text: Map<string, number>; lines: Map<string, number> } {
  const text = new Map<string, number>();
  const lines = new Map<string, number>();
  const add = (into: Map<string, number>, item: string, pt: number) => {
    if (Number.isFinite(pt) && pt > 0) into.set(item, Math.min(into.get(item) ?? Infinity, pt));
  };
  if (chart.showTitle && chart.title.trim() !== '') add(text, 'Chart title', chart.titleFontSizePt);
  const layer = dataLayer(chart);
  const base: Partial<ChartStyle> = { ...chart.defaults, ...layer.style };
  // The y2 axis is drawn only while a data set is bound to it.
  const styles = [base, ...Object.values(layer.groupOverrides).map((o) => ({ ...base, ...o }))];
  const axes = [chart.xAxis, chart.yAxis, ...(styles.some((s) => s.axisBinding === 'secondary') ? [chart.y2Axis] : [])];
  for (const a of axes) {
    if (a.visible) {
      add(text, 'Tick labels', a.tickFontSizePt);
      add(lines, 'Axis lines', a.lineWidthPt);
    }
    if (a.titleVisible && a.title.trim() !== '') add(text, 'Axis titles', a.titleFontSizePt);
  }
  if (axes.some((a) => a.showGrid)) add(lines, 'Grid lines', chart.grid.widthPt);
  if (axes.some((a) => a.showMinorGrid)) add(lines, 'Grid lines', chart.grid.minorWidthPt);
  if (chart.legend.visible) add(text, 'Legend', chart.legend.fontSizePt);
  if (chart.barLabels.show !== 'none' || (chart.barLabels.inside && chart.barLabels.inside.show !== 'none')) add(text, 'Bar labels', chart.barLabels.sizePt);
  for (const a of chart.annotations) if (a.text.trim() !== '') add(text, 'Annotations', a.fontSizePt);
  for (const s of styles) {
    if (s.showPointLabels) add(text, 'Point labels', s.pointLabelFontSizePt ?? 0);
    if (s.showErrorBars) add(lines, 'Error bars', s.errorLineWidthPt ?? 0);
    if (s.showLines) add(lines, 'Lines', s.lineWidthPt ?? 0);
    if (s.showSymbols) add(lines, 'Symbol borders', s.symbolBorderWidthPt ?? 0);
    if (s.showBars) add(lines, 'Bar borders', s.barBorderWidthPt ?? 0);
  }
  for (const r of chart.referenceLines) add(lines, 'Reference lines', r.widthPt);
  return { text, lines };
}

/**
 * Notes on text and lines that would come out too small when the graph is printed at its target width (never a block).
 * Empty while the graph has no print width. Sizes are the chart's pt sizes times the scale of the print.
 */
export function printSizeWarnings(chart: Chart): string[] {
  const mm = chart.printWidthMm;
  if (mm === undefined) return [];
  const scale = printScale(chart, mm);
  const { text, lines } = itemSizes(chart);
  const out: string[] = [];
  for (const [item, pt] of text) {
    if (pt * scale < MIN_TEXT_PT) out.push(`${item} would print at ${shown(pt * scale, MIN_TEXT_PT, 1)} pt at ${mm} mm wide (smaller than ${MIN_TEXT_PT} pt)`);
  }
  for (const [item, pt] of lines) {
    if (pt * scale < MIN_LINE_PT) out.push(`${item} would print at ${shown(pt * scale, MIN_LINE_PT, 2)} pt at ${mm} mm wide (thinner than ${MIN_LINE_PT} pt)`);
  }
  return out;
}
