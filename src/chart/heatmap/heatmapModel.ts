import { ticks as d3Ticks } from 'd3';
import { HEAT_PALETTES } from '../../model/options/heatmapOptions';
import { layersOf, type LayerSpec } from '../../model/graph/layers';
import { rowTitleAt } from '../../model/table/rows';
import { layoutOf, xySeries } from '../../model/table/tableLayout';
import { DEFAULT_SUMMARY } from '../../model/defaults';
import type { Chart, DataTable, Id } from '../../model/types';
import { chartPx2Pt } from '../../model/units';
import { matrixRange, normaliseMatrix, type Matrix } from '../../stats/matrix';
import { computeGroupStats } from '../../stats/summary';
import { contrastColour, paletteColour, scalePosition, type HeatScale } from './heatColours';
import { computeLayout, type Layout, type Rect } from '../shared/parts/layout';
import { compileHeatMarks } from './heatMarks';
import type { SceneElement } from '../shared/scene/sceneElement';
import { displayName } from '../shared/parts/names';
import { suppliedStats } from '../../model/table/suppliedStats';

interface HeatCell {
  id: Id;
  /** The observation of the series' first column in the row of the cell: what names the cell in the drawing, whatever happens to the order of the rows, and wherever a transposed map puts it. */
  obsId?: Id;
  /** The series (column of the table) behind the cell: what a click selects. */
  seriesId: Id;
  rowLabel: string;
  colLabel: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** The value that is coloured (after normalising); null = missing. */
  value: number | null;
  /** The value before normalising. */
  original: number | null;
  fill: string;
  text: string | null;
  textColour: string;
}

interface HeatBar {
  rect: Rect;
  lo: number;
  hi: number;
  diverging: boolean;
  /** Strips from the top (high) to the bottom (low). */
  strips: Array<{ y: number; height: number; fill: string }>;
  ticks: Array<{ value: number; y: number }>;
}

export interface HeatModel {
  widthPt: number;
  heightPt: number;
  layout: Layout;
  rows: string[];
  cols: string[];
  cells: HeatCell[];
  /** Where the labels go: the x of the left labels' right edge, and the y of the column labels. */
  rowLabelX: number;
  colLabelY: number;
  bar: HeatBar | null;
  warnings: string[];
  /** The layers the chart is drawn from, lowest first (see model/graph/layers.ts). */
  layers: LayerSpec[];
  /** The marks of the layers as scene elements, compiled when a drawing, an export or a hit test first asks for them; not enumerable. */
  marks?: SceneElement[];
}

/** Room taken at the right by the colour bar and its numbers, pt. */
const BAR_ROOM = 128;
const BAR_WIDTH = 24;
const STRIPS = 64;

const nice = (v: number): string => String(Number(v.toPrecision(3)));

/**
 * Model of a heat map of a grouped table: the categories (rows) against the series (columns), each cell coloured by its
 * value (the centre of replicates, or the entered value). Missing cells keep their own colour; nothing is shown as zero.
 */
export function buildHeatModel(chart: Chart, table: DataTable): HeatModel {
  const [W, H] = [chartPx2Pt(chart.widthPx), chartPx2Pt(chart.heightPx)];
  const o = chart.heatmap;
  const warnings: string[] = [];
  const layoutKind = layoutOf(table);
  const defs = xySeries(table);

  // 1. The matrix: categories down, series across; a cell is the centre of what the table holds for it.
  const categoryRows: number[] = [];
  for (let r = 0; r < table.rowCount; r++) {
    const hasValue = defs.some((s) => s.columns.some((c) => c.observations[r]?.value != null));
    if (rowTitleAt(table, r).trim() !== '' || hasValue) categoryRows.push(r);
  }
  const cellValue = (s: (typeof defs)[number], r: number): number | null => {
    const values = s.columns.map((c) => c.observations[r]?.value ?? null);
    if (layoutKind.kind === 'single') return values[0] !== null && Number.isFinite(values[0]) ? values[0] : null;
    if (layoutKind.kind === 'replicates') return computeGroupStats(values, { ...DEFAULT_SUMMARY, centre: o.summary, spread: 'none' }).centre;
    return suppliedStats(layoutKind.format, values)?.stats.centre ?? null;
  };
  const rowNames = categoryRows.map((r) => rowTitleAt(table, r).trim() || `Row ${r + 1}`);
  const colNames = defs.map((s) => displayName(chart, s.id, s.name));
  let matrix: Matrix = categoryRows.map((r) => defs.map((s) => cellValue(s, r)));
  let rowLabels = rowNames;
  let colLabels = colNames;
  // Transposing swaps the roles of rows and columns and the labels with them; cells keep their identity (spec 13.2).
  if (o.transpose) {
    matrix = defs.map((_, ci) => matrix.map((row) => row[ci]));
    rowLabels = colNames;
    colLabels = rowNames;
  }

  // 2. Normalising, then the colour range.
  const { values, undefinedCount } = normaliseMatrix(matrix, o.normalise, o.method);
  if (undefinedCount > 0) warnings.push(`${undefinedCount} cell${undefinedCount === 1 ? ' has' : 's have'} no ${o.method === 'zscore' ? 'z-score' : 'min-max value'} (their ${o.normalise === 'row' ? 'row' : 'column'} has no spread) and ${undefinedCount === 1 ? 'is' : 'are'} shown as missing.`);
  const range = matrixRange(values);
  const palette = HEAT_PALETTES.find((p) => p.value === o.palette)!;
  let lo = o.min ?? range?.[0] ?? 0;
  let hi = o.max ?? range?.[1] ?? 1;
  if (!(hi > lo)) {
    // A limit set by hand can collide with the other, automatic, end: the whole resolved range must be valid.
    warnings.push('The colour range limits conflict with the data (the minimum is not below the maximum); using the automatic range.');
    lo = range?.[0] ?? 0;
    hi = range?.[1] ?? 1;
    if (!(hi > lo)) [lo, hi] = [lo - 0.5, lo + 0.5];
  }
  const centre = o.centre ?? (o.normalise !== 'none' && o.method !== 'minmax' ? 0 : (lo + hi) / 2);
  const scale: HeatScale = { palette: o.palette, reverse: o.reverse, lo, hi, centre };
  const colourOf = (v: number) => paletteColour(o.palette, scalePosition(Math.min(hi, Math.max(lo, v)), scale, palette.diverging), o.reverse);
  if (!range) warnings.push('Enter numbers in the table to see the heat map.');
  const outside = values.flat().filter((v) => v !== null && (v < lo || v > hi)).length;
  if (outside > 0) warnings.push(`${outside} value${outside === 1 ? ' lies' : 's lie'} outside the colour range and ${outside === 1 ? 'is' : 'are'} drawn in the end colour.`);

  // 3. Layout: the labels need room; the colour bar takes a strip at the right.
  const showBar = o.colourbar && range !== null;
  const layout = computeLayout({
    fontFamily: chart.fontFamily,
    titleOffsetPt: chart.titleOffsetPt,
    widthPt: showBar ? W - BAR_ROOM : W,
    heightPt: H,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    xAxis: chart.xAxis,
    yAxis: chart.yAxis,
    legend: { ...chart.legend, visible: false },
    legendLabels: [],
    categoryLabels: colLabels,
    yTickLabels: rowLabels,
  });
  warnings.push(...layout.warnings);
  const { plot } = layout;
  const rows = rowLabels.length;
  const cols = colLabels.length;
  const cw = plot.width / Math.max(1, cols);
  const ch = plot.height / Math.max(1, rows);
  const gap = Math.min(o.cellGapPt, cw / 2, ch / 2);

  // 4. Cells.
  const cells: HeatCell[] = [];
  for (let ri = 0; ri < rows; ri++) {
    for (let ci = 0; ci < cols; ci++) {
      const v = values[ri]?.[ci] ?? null;
      const fill = v === null ? o.missingColour : colourOf(v);
      const series = o.transpose ? defs[ri] : defs[ci];
      const tableRow = categoryRows[o.transpose ? ci : ri];
      const text = v === null || !o.showValues ? null : o.decimals === null ? nice(v) : v.toFixed(o.decimals);
      cells.push({
        id: `cell:${ri}:${ci}`,
        obsId: series?.columns[0].observations[tableRow]?.id,
        seriesId: series?.id ?? '',
        rowLabel: rowLabels[ri],
        colLabel: colLabels[ci],
        x: plot.x + ci * cw + gap / 2,
        y: plot.y + ri * ch + gap / 2,
        width: Math.max(0, cw - gap),
        height: Math.max(0, ch - gap),
        value: v,
        original: matrix[ri]?.[ci] ?? null,
        fill,
        text,
        textColour: contrastColour(fill),
      });
    }
  }

  // 5. The colour bar: high at the top.
  let bar: HeatBar | null = null;
  if (showBar) {
    const rect: Rect = { x: plot.x + plot.width + 28, y: plot.y, width: BAR_WIDTH, height: plot.height };
    const strips = Array.from({ length: STRIPS }, (_, i) => {
      const frac = 1 - (i + 0.5) / STRIPS;
      const v = lo + frac * (hi - lo);
      return { y: rect.y + (i * rect.height) / STRIPS, height: rect.height / STRIPS + 0.6, fill: colourOf(v) };
    });
    const tickValues = d3Ticks(lo, hi, 5).filter((t) => t >= lo && t <= hi);
    bar = { rect, lo, hi, diverging: palette.diverging, strips, ticks: tickValues.map((value) => ({ value, y: rect.y + rect.height * (1 - (value - lo) / (hi - lo || 1)) })) };
  }

  const model: HeatModel = {
    widthPt: W,
    heightPt: H,
    layout,
    rows: rowLabels,
    cols: colLabels,
    cells,
    rowLabelX: plot.x,
    colLabelY: plot.y + plot.height,
    bar,
    warnings: [...new Set(warnings)],
    layers: layersOf(chart, table),
  };
  let marks: SceneElement[] | undefined;
  Object.defineProperty(model, 'marks', { enumerable: false, configurable: true, get: () => (marks ??= compileHeatMarks(chart, model)) });
  return model;
}
