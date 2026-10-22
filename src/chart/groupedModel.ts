import { rowTitleAt } from '../model/rows';
import { isGroupedChartType } from '../model/chartTypes';
import { resolveStyle } from '../model/style';
import { resolveSummary } from '../model/summary';
import { layoutOf, xySeries } from '../model/tableLayout';
import type { Chart, ChartStyle, DataTable, Id } from '../model/types';
import { chartPx2Pt } from '../model/units';
import { computeGroupStats, type GroupStats } from '../stats/summary';
import { buildErrorBar, clippedEndpointCount, rangeValuesFor } from './errorGeometry';
import { computeLayout, type Layout } from './layout';
import { displayName, hash01 } from './model';
import { resolveYAxis, type YAxisScale } from './scales';
import { suppliedStats } from './xyModel';

/** How the bars of a cluster are arranged: side by side, stacked as counts, or stacked as shares of the row total. */
export type Arrangement = 'side' | 'stacked' | 'percent';

export interface GroupedCategory {
  /** Table row of the category. */
  row: number;
  label: string;
  /** Centre of the category's slot, in chart pt. */
  centerX: number;
}

export interface GroupedBar {
  /** Stable identity: the series and the table row. */
  id: Id;
  row: number;
  categoryIndex: number;
  /** Value drawn: the centre, the count, or the percentage. */
  value: number;
  /** Rectangle in chart pt. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** The summary behind the value (replicates or entered), null for a single value. */
  stats: GroupStats | null;
  /** Counts of a contingency row: the share this bar is of its row. */
  count?: number;
}

export interface GroupedPoint {
  id: Id;
  row: number;
  px: number;
  py: number;
  value: number;
  stats: GroupStats | null;
}

export interface GroupedSeries {
  groupId: Id;
  label: string;
  style: ChartStyle;
  bars: GroupedBar[];
  /** Lines over categories (groupedLine). */
  points: GroupedPoint[];
  /** Individual replicate values drawn over the bars (groupedBar with replicates, when symbols are on). */
  dots: GroupedPoint[];
  linePath: string;
  errorPath: string;
  errorMeaning: string | null;
}

export interface GroupedModel {
  widthPt: number;
  heightPt: number;
  layout: Layout;
  arrangement: Arrangement;
  asLines: boolean;
  categories: GroupedCategory[];
  y: YAxisScale;
  yScale: (v: number) => number;
  series: GroupedSeries[];
  /** Index into `series` of each legend entry. */
  legendSeries: number[];
  warnings: string[];
}

/** Share of a category's slot taken by its cluster of bars. */
const CLUSTER_FRACTION = 0.8;
const n2 = (v: number): string => String(Math.round(v * 100) / 100);

const arrangementOf = (type: Chart['type']): Arrangement => (type === 'contingencyStacked' ? 'stacked' : type === 'contingencyPercent' ? 'percent' : 'side');

/**
 * Model of grouped and contingency charts. The categories are the rows of the table that hold something; the series
 * are its blocks of columns. A grouped table gives each (series, category) a value from one cell, from replicates, or
 * from entered statistics; a contingency table gives a count, shown as it is, stacked, or as a share of the row.
 */
export function buildGroupedModel(chart: Chart, table: DataTable): GroupedModel {
  if (!isGroupedChartType(chart.type)) throw new Error('buildGroupedModel needs a grouped or contingency chart');
  const [W, H] = [chartPx2Pt(chart.widthPx), chartPx2Pt(chart.heightPx)];
  const layer = chart.layers[0];
  const layout = layoutOf(table);
  const arrangement = arrangementOf(chart.type);
  const asLines = chart.type === 'groupedLine';
  const contingency = table.kind === 'contingency';
  const warnings: string[] = [];
  const seriesDefs = xySeries(table);
  const labelOfRow = (r: number) => rowTitleAt(table, r).trim() || `row ${r + 1}`;

  // 1. Categories: rows with a title or any value.
  const categoryRows: number[] = [];
  for (let r = 0; r < table.rowCount; r++) {
    const hasValue = seriesDefs.some((s) => s.columns.some((c) => c.observations[r]?.value !== null && c.observations[r]?.value !== undefined));
    if (rowTitleAt(table, r).trim() !== '' || hasValue) categoryRows.push(r);
  }

  // 2. Per series and category: value and summary.
  const rowTotals = categoryRows.map((r) => seriesDefs.reduce((sum, s) => sum + Math.max(0, s.columns[0].observations[r]?.value ?? 0), 0));
  let negative = 0;
  const noError: string[] = [];
  const raw = seriesDefs.map((s, si) => {
    const style = resolveStyle(chart, layer, { id: s.id, paletteIndex: si });
    const spec = resolveSummary(layer, s.id);
    let meaning: string | null = null;
    const cells = categoryRows.map((r, ci) => {
      const values = s.columns.map((c) => c.observations[r]?.value ?? null);
      let value: number | null = null;
      let stats: GroupStats | null = null;
      if (contingency) {
        const v = values[0];
        if (v !== null && v < 0) negative++;
        value = v === null || v < 0 ? null : v;
        if (value !== null && arrangement === 'percent') value = rowTotals[ci] > 0 ? (value / rowTotals[ci]) * 100 : null;
      } else if (layout.kind === 'single') value = values[0];
      else if (layout.kind === 'replicates') {
        stats = computeGroupStats(values, spec);
        value = stats.centre;
        if (value !== null && stats.effectiveSpread !== 'none' && stats.interval.status === 'unavailable') noError.push(`${s.name}, ${labelOfRow(r)}`);
      } else {
        const supplied = suppliedStats(layout.format, values);
        if (supplied) {
          stats = supplied.stats;
          value = stats.centre;
          meaning = supplied.meaning;
          if (stats.interval.status !== 'ok') noError.push(`${s.name}, ${labelOfRow(r)}`);
        }
      }
      // The replicate values themselves, with the observation each came from, for the dots over the bars.
      const reps = layout.kind === 'replicates' && !contingency ? s.columns.flatMap((c) => (c.observations[r]?.value === null || c.observations[r] === undefined ? [] : [{ id: c.observations[r].id, value: c.observations[r].value as number }])) : [];
      return { row: r, ci, value, stats, count: contingency ? (values[0] ?? undefined) : undefined, reps };
    });
    return { s, style, cells, meaning, label: displayName(chart, s.id, s.name) };
  });
  if (noError.length > 0) warnings.push(`No error bar for ${noError.length} value${noError.length === 1 ? '' : 's'} (${noError.slice(0, 3).join('; ')}${noError.length > 3 ? '; ...' : ''}): the error is missing or negative, or there are too few replicates.`);
  if (negative > 0) warnings.push(`${negative} count${negative === 1 ? ' is' : 's are'} negative and not drawn: counts cannot be below zero.`);

  // 3. The value axis: bars start at zero; stacked values are summed; percent is 0 to 100 unless set by hand.
  const stackedTotals = categoryRows.map((_, ci) => raw.reduce((sum, r) => sum + (r.cells[ci].value ?? 0), 0));
  // Individual values are shown over bars of replicates, not over lines or counts.
  const showDots = (style: ChartStyle) => chart.type === 'groupedBar' && layout.kind === 'replicates' && style.showSymbols;
  const allY =
    arrangement === 'side'
      ? raw.flatMap((r) => r.cells.flatMap((c) => (c.value === null ? [] : [...(c.stats ? rangeValuesFor(c.stats, r.style.showErrorBars, r.style.errorDirection) : [c.value]), ...(showDots(r.style) ? c.reps.map((x) => x.value) : [])])))
      : stackedTotals;
  const tickCountHint = Math.max(3, Math.min(10, Math.round(H / 50)));
  const yAxis = resolveYAxis({
    values: arrangement === 'percent' ? [0, 100] : allY,
    includeZero: !asLines || allY.every((v) => v >= 0),
    min: chart.yAxis.min ?? (arrangement === 'percent' ? 0 : null),
    max: chart.yAxis.max ?? (arrangement === 'percent' ? 100 : null),
    majorInterval: chart.yAxis.majorInterval,
    tickCountHint,
  });
  warnings.push(...yAxis.warnings);

  // 4. Layout with the category labels along the X axis.
  const legendSeries = raw.map((_, i) => i).filter((i) => !chart.legend.hiddenGroupIds.includes(raw[i].s.id));
  const labels = categoryRows.map((r) => rowTitleAt(table, r).trim() || `Row ${r + 1}`);
  const lay = computeLayout({
    widthPt: W,
    heightPt: H,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    xAxis: chart.xAxis,
    yAxis: chart.yAxis,
    legend: chart.legend,
    legendLabels: legendSeries.map((i) => raw[i].label),
    categoryLabels: labels,
    yTickLabels: yAxis.ticks.map(yAxis.tickLabel),
  });
  warnings.push(...lay.warnings);
  const { plot } = lay;
  const [y0, y1] = yAxis.domain;
  const yScale = (v: number) => plot.y + plot.height - ((v - y0) / (y1 - y0)) * plot.height;
  const slot = plot.width / Math.max(1, categoryRows.length);
  const categories: GroupedCategory[] = categoryRows.map((row, i) => ({ row, label: labels[i], centerX: plot.x + slot * (i + 0.5) }));
  if (categoryRows.length === 0) warnings.push('Enter a category name or values in the table to see the chart.');

  // 5. Geometry.
  const nSeries = Math.max(1, raw.length);
  const cluster = slot * CLUSTER_FRACTION;
  const baseline = Math.min(Math.max(0, y0), y1);
  const stackBase = new Array<number>(categoryRows.length).fill(0);
  let clipped = 0;
  const series: GroupedSeries[] = raw.map((r, si) => {
    const bars: GroupedBar[] = [];
    const points: GroupedPoint[] = [];
    const dots: GroupedPoint[] = [];
    let linePath = '';
    let errorPath = '';
    let errorMeaning: string | null = null;
    let prevCi = -2;
    for (const cell of r.cells) {
      if (cell.value === null) continue;
      const cat = categories[cell.ci];
      const id = `${r.s.id}:${cell.row}`;
      if (asLines) {
        const px = cat.centerX;
        const py = yScale(cell.value);
        points.push({ id, row: cell.row, px, py, value: cell.value, stats: cell.stats });
        linePath += `${cell.ci === prevCi + 1 ? 'L' : 'M'}${n2(px)},${n2(py)}`;
        prevCi = cell.ci;
        if (cell.stats) {
          const bar = buildErrorBar({ groupId: r.s.id, centerX: px, stats: cell.stats, style: r.style, yScale, domain: yAxis.domain });
          if (bar) {
            errorPath += bar.d;
            errorMeaning = r.meaning ?? bar.meaning;
            clipped += clippedEndpointCount([bar]);
          }
        }
        continue;
      }
      const stacked = arrangement !== 'side';
      const bw = stacked ? cluster * 0.75 : cluster / nSeries;
      const x = stacked ? cat.centerX - bw / 2 : cat.centerX - cluster / 2 + si * bw;
      let from = baseline;
      let to = cell.value;
      if (stacked) {
        from = stackBase[cell.ci];
        to = from + cell.value;
        stackBase[cell.ci] = to;
      }
      const yTop = yScale(Math.max(from, to));
      const yBottom = yScale(Math.min(from, to));
      bars.push({ id, row: cell.row, categoryIndex: cell.ci, value: cell.value, x, y: yTop, width: bw, height: Math.max(0, yBottom - yTop), stats: cell.stats, count: cell.count });
      if (showDots(r.style)) {
        // Spread across the bar's width by a fixed hash of the observation, so the picture is the same every time.
        const spread = chart.jitter.enabled ? bw * chart.jitter.widthFraction : 0;
        for (const rep of cell.reps) dots.push({ id: rep.id, row: cell.row, px: x + bw / 2 + (hash01(rep.id) - 0.5) * spread, py: yScale(rep.value), value: rep.value, stats: null });
      }
      if (cell.stats && !stacked) {
        const bar = buildErrorBar({ groupId: r.s.id, centerX: x + bw / 2, stats: cell.stats, style: r.style, yScale, domain: yAxis.domain });
        if (bar) {
          errorPath += bar.d;
          errorMeaning = r.meaning ?? bar.meaning;
          clipped += clippedEndpointCount([bar]);
        }
      }
    }
    return { groupId: r.s.id, label: r.label, style: r.style, bars, points, dots, linePath, errorPath, errorMeaning };
  });
  if (clipped > 0) warnings.push(clipped === 1 ? '1 error bar end lies outside the axis range and is clipped.' : `${clipped} error bar ends lie outside the axis range and are clipped.`);

  return { widthPt: W, heightPt: H, layout: lay, arrangement, asLines, categories, y: yAxis, yScale, series, legendSeries, warnings: [...new Set(warnings)] };
}
