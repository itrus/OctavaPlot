import { ticks as d3Ticks } from 'd3';
import { HEAT_STATISTICS, isDiverging } from '../../model/options/heatmapOptions';
import { layersOf, type LayerSpec } from '../../model/graph/layers';
import { rowTitleAt } from '../../model/table/rows';
import { layoutOf, xySeries } from '../../model/table/tableLayout';
import { DEFAULT_SUMMARY } from '../../model/defaults';
import type { Chart, DataTable, HeatmapOptions, Id } from '../../model/types';
import { chartPx2Pt } from '../../model/units';
import { cellStatistic, matrixRange, normaliseMatrix, type CellResult, type Matrix, type Unavailable } from '../../stats/matrix';
import { computeGroupStats } from '../../stats/summary';
import { contrastColour, scaleColour, type HeatScale } from './heatColours';
import { computeLayout, type Layout, type Rect } from '../shared/parts/layout';
import { compileHeatMarks } from './heatMarks';
import type { SceneElement } from '../shared/scene/sceneElement';
import { displayName } from '../shared/parts/names';
import { suppliedStats, suppliedStatistic } from '../../model/table/suppliedStats';

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
  /** The name of what the colours stand for; null while it is the plain mean (the colour bar then has no title). */
  title: string | null;
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
  /** What the cells show, as the colour bar and the tooltip name it: "SD", or "Row z-score of mean" when normalised. */
  valueName: string;
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

type StatisticOnly = Exclude<HeatmapOptions['summary'], 'mean' | 'median'>;
const NORMALISE_NAME = { zscore: 'z-score', minmax: 'min-max', centre: 'centred' } as const;

/** One warning for each reason cells have no value for the statistic, with how many cells and why. */
function unavailableWarnings(counts: ReadonlyMap<Unavailable, number>, summary: HeatmapOptions['summary']): string[] {
  const name = HEAT_STATISTICS.find((x) => x.value === summary)!.name;
  const reasons: Record<Unavailable, string> = {
    few: `fewer than 2 values, so their ${name} is not available`,
    nonpositive: 'a value that is not above zero, so their geometric mean is not available',
    zeroMean: 'a mean of zero, so their %CV is not available',
    supplied: `been entered as calculated values that do not give their ${name}`,
  };
  return [...counts].map(([reason, n]) => `${n} cell${n === 1 ? ' has' : 's have'} ${reasons[reason]}.`);
}

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
  // The mean and the median are the group summary; the other statistics come from stats/matrix.ts (or, for entered values, suppliedStats.ts).
  const centreOnly = o.summary === 'mean' || o.summary === 'median';
  const unavailable = new Map<Unavailable, number>();
  const cellValue = (s: (typeof defs)[number], r: number): number | null => {
    const values = s.columns.map((c) => c.observations[r]?.value ?? null);
    let result: CellResult;
    if (layoutKind.kind === 'single' || layoutKind.kind === 'sized' || layoutKind.kind === 'vector') {
      const v = values[0] !== null && Number.isFinite(values[0]) ? values[0] : null;
      result = centreOnly || v === null ? { value: v, unavailable: null } : cellStatistic(values, o.summary as StatisticOnly);
    } else if (layoutKind.kind === 'replicates') {
      result = centreOnly ? { value: computeGroupStats(values, { ...DEFAULT_SUMMARY, centre: o.summary as 'mean' | 'median', spread: 'none' }).centre, unavailable: null } : cellStatistic(values, o.summary as StatisticOnly);
    } else {
      result = centreOnly ? { value: suppliedStats(layoutKind.format, values)?.stats.centre ?? null, unavailable: null } : suppliedStatistic(layoutKind.format, values, o.summary as StatisticOnly);
    }
    if (result.unavailable) unavailable.set(result.unavailable, (unavailable.get(result.unavailable) ?? 0) + 1);
    return result.value;
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

  warnings.push(...unavailableWarnings(unavailable, o.summary));

  // 2. Normalising, then the colour range.
  const { values, undefinedCount } = normaliseMatrix(matrix, o.normalise, o.method);
  if (undefinedCount > 0) warnings.push(`${undefinedCount} cell${undefinedCount === 1 ? ' has' : 's have'} no ${o.method === 'zscore' ? 'z-score' : 'min-max value'} (their ${o.normalise === 'row' ? 'row' : 'column'} has no spread) and ${undefinedCount === 1 ? 'is' : 'are'} shown as missing.`);
  const stat = HEAT_STATISTICS.find((x) => x.value === o.summary)!;
  const valueName = o.normalise === 'none' ? stat.name : `${o.normalise === 'row' ? 'Row' : 'Column'} ${NORMALISE_NAME[o.method]} of ${stat.lower}`;
  const range = matrixRange(values);
  const diverging = isDiverging(o);
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
  const scale: HeatScale = { palette: o.palette, reverse: o.reverse, lo, hi, centre, custom: o.customColours };
  const colourOf = (v: number) => scaleColour(v, scale, diverging);
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
    bar = { rect, lo, hi, diverging, strips, ticks: tickValues.map((value) => ({ value, y: rect.y + rect.height * (1 - (value - lo) / (hi - lo || 1)) })), title: o.summary === 'mean' && o.normalise === 'none' ? null : valueName };
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
    valueName,
    warnings: [...new Set(warnings)],
    layers: layersOf(chart, table),
  };
  let marks: SceneElement[] | undefined;
  Object.defineProperty(model, 'marks', { enumerable: false, configurable: true, get: () => (marks ??= compileHeatMarks(chart, model)) });
  return model;
}
