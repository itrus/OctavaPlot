import { rowTitleAt } from '../model/rows';
import { isGroupedChartType, supportsHorizontal } from '../model/chartTypes';
import { resolveStyle } from '../model/style';
import { resolveSummary } from '../model/summary';
import { layoutOf, xySeries } from '../model/tableLayout';
import type { Chart, ChartStyle, DataTable, Id } from '../model/types';
import { chartPx2Pt, n2 } from '../model/units';
import { computeGroupStats, type GroupStats } from '../stats/summary';
import { buildErrorBar, clippedEndpointCount, rangeValuesFor } from './errorGeometry';
import { computeLayout, type Layout } from './layout';
import { displayName, hash01, type Orientation } from './model';
import { barLabelText, placeBarLabel, type BarLabelGeom } from './barLabels';
import { axisMapper, onAxis, resolveAxis } from './axisScale';
import type { YAxisScale } from './scales';
import { suppliedStats } from './xyModel';

/** How the bars of a cluster are arranged: side by side, stacked as counts, or stacked as shares of the row total. */
type Arrangement = 'side' | 'stacked' | 'percent';

interface GroupedCategory {
  /** Table row of the category. */
  row: number;
  label: string;
  /** Centre of the category's slot, in chart pt. */
  centerX: number;
}

interface GroupedBar {
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
  /** Value or sample size written above the bar, when the chart asks for it (side by side bars only). */
  label?: BarLabelGeom | null;
  /** Floating bars: the lower and upper value of the bar, and the line across it at the centre. */
  range?: [number, number];
  centerLine?: { x1: number; x2: number; y: number };
}

interface GroupedPoint {
  id: Id;
  row: number;
  px: number;
  py: number;
  value: number;
  stats: GroupStats | null;
}

interface GroupedSeries {
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
  /** Horizontal bars are built as vertical ones in a virtual region and turned into place (see Orientation in model.ts). */
  orient: Orientation;
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

const arrangementOf = (type: Chart['type']): Arrangement => (type === 'contingencyStacked' || type === 'groupedStacked' ? 'stacked' : type === 'contingencyPercent' ? 'percent' : 'side');

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
  const floating = chart.type === 'groupedFloating';
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
    const style = resolveStyle(chart, layer, { id: s.id, paletteIndex: s.columns[0].seriesSlot ?? si });
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
      // A floating bar spans the replicate values, or the interval of values entered as limits.
      let span: [number, number] | null = null;
      if (floating) {
        if (reps.length > 0) span = [Math.min(...reps.map((x) => x.value)), Math.max(...reps.map((x) => x.value))];
        else if (stats?.interval.status === 'ok' && stats.interval.lower !== null && stats.interval.upper !== null) span = [stats.interval.lower, stats.interval.upper];
      }
      return { row: r, ci, value, stats, count: contingency ? (values[0] ?? undefined) : undefined, reps, span };
    });
    return { s, style, cells, meaning, label: displayName(chart, s.id, s.name) };
  });
  if (noError.length > 0) warnings.push(`No error bar for ${noError.length} value${noError.length === 1 ? '' : 's'} (${noError.slice(0, 3).join('; ')}${noError.length > 3 ? '; ...' : ''}): the error is missing or negative, or there are too few replicates.`);
  if (negative > 0) warnings.push(`${negative} count${negative === 1 ? ' is' : 's are'} negative and not drawn: counts cannot be below zero.`);

  // 3. The value axis: bars start at zero; stacked values are summed; percent is 0 to 100 unless set by hand.
  // Positive parts pile up above the baseline and negative ones below it (spec 8.4); the axis shows both piles.
  const stackedTotals = categoryRows.flatMap((_, ci) => [raw.reduce((sum, r) => sum + Math.max(0, r.cells[ci].value ?? 0), 0), raw.reduce((sum, r) => sum + Math.min(0, r.cells[ci].value ?? 0), 0)]);
  // Individual values are shown over bars of replicates, not over lines or counts.
  const showDots = (style: ChartStyle) => (chart.type === 'groupedBar' || floating) && layout.kind === 'replicates' && style.showSymbols;
  const allY =
    arrangement === 'side'
      ? raw.flatMap((r) => r.cells.flatMap((c) => (c.value === null ? [] : floating ? (c.span ? [...c.span, c.value] : []) : [...(c.stats ? rangeValuesFor(c.stats, r.style.showErrorBars, r.style.errorDirection) : [c.value]), ...(showDots(r.style) ? c.reps.map((x) => x.value) : [])])))
      : stackedTotals;
  const horizontal = chart.orientation === 'horizontal' && supportsHorizontal(chart.type);
  const tickCountHint = Math.max(3, Math.min(10, Math.round(horizontal ? W / 60 : H / 50)));
  // Log scales suit values side by side or on lines, not stacked parts or percentages, so those stay linear.
  const axisCfg = arrangement === 'side' ? chart.yAxis : { ...chart.yAxis, scale: 'linear' as const, reverse: false };
  const yAxis = resolveAxis({
    values: arrangement === 'percent' ? [0, 100] : allY,
    includeZero: axisCfg.scale === 'linear' && (!asLines || allY.every((v) => v >= 0)),
    min: chart.yAxis.min ?? (arrangement === 'percent' ? 0 : null),
    max: chart.yAxis.max ?? (arrangement === 'percent' ? 100 : null),
    majorInterval: chart.yAxis.majorInterval,
    tickCountHint,
  }, axisCfg);
  warnings.push(...yAxis.warnings);

  // 4. Layout with the category labels along the X axis.
  const legendSeries = raw.map((_, i) => i).filter((i) => !chart.legend.hiddenGroupIds.includes(raw[i].s.id));
  const labels = categoryRows.map((r) => rowTitleAt(table, r).trim() || `Row ${r + 1}`);
  const lay = computeLayout({
    fontFamily: chart.fontFamily,
    titleOffsetPt: chart.titleOffsetPt,
    widthPt: W,
    heightPt: H,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    // Horizontal: the numbers run along the bottom (the value axis settings) and the category names down the left.
    xAxis: horizontal ? chart.yAxis : chart.xAxis,
    yAxis: horizontal ? chart.xAxis : chart.yAxis,
    legend: chart.legend,
    legendLabels: legendSeries.map((i) => raw[i].label),
    categoryLabels: horizontal ? [] : labels,
    yTickLabels: horizontal ? labels : yAxis.ticks.map(yAxis.tickLabel),
  });
  warnings.push(...lay.warnings);
  // The geometry below is made in the virtual region (the real one when vertical).
  const real = lay.plot;
  const plot = horizontal ? { x: real.x, y: real.y, width: real.height, height: real.width } : real;
  const orient: Orientation = horizontal
    ? { horizontal, real, virtual: plot, toScreen: (x, y) => ({ x: real.x + (plot.y + plot.height - y), y: real.y + (x - plot.x) }), matrix: `matrix(0 1 -1 0 ${n2(real.x + plot.y + plot.height)} ${n2(real.y - plot.x)})` }
    : { horizontal, real, virtual: real, toScreen: (x, y) => ({ x, y }), matrix: null };
  const [y0, y1] = yAxis.domain;
  const yScale = axisMapper(yAxis, plot.y + plot.height, -plot.height);
  const slot = plot.width / Math.max(1, categoryRows.length);
  const categories: GroupedCategory[] = categoryRows.map((row, i) => ({ row, label: labels[i], centerX: plot.x + slot * (i + 0.5) }));
  if (categoryRows.length === 0) warnings.push('Enter a category name or values in the table to see the chart.');

  // 5. Geometry.
  const nSeries = Math.max(1, raw.length);
  const cluster = slot * CLUSTER_FRACTION;
  const baseline = Math.min(Math.max(yAxis.log ? 0 : (chart.bars.baseline ?? 0), y0), y1);
  const stackUp = new Array<number>(categoryRows.length).fill(0);
  const stackDown = new Array<number>(categoryRows.length).fill(0);
  let clipped = 0;
  let offAxis = 0;
  let noSpan = 0;
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
      // A value with no position on a log axis (0 or less) is left out and counted.
      if (!onAxis(yAxis, cell.value)) {
        offAxis++;
        continue;
      }
      const cat = categories[cell.ci];
      const id = `${r.s.id}:${cell.row}`;
      if (asLines) {
        const px = cat.centerX;
        const py = yScale(cell.value);
        points.push({ id, row: cell.row, px, py, value: cell.value, stats: cell.stats });
        linePath += `${cell.ci === prevCi + 1 ? 'L' : 'M'}${n2(px)},${n2(py)}`;
        prevCi = cell.ci;
        if (cell.stats) {
          const bar = buildErrorBar({ groupId: r.s.id, centerX: px, stats: cell.stats, style: r.style, yScale, domain: yAxis.domain, log: !!yAxis.log });
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
      if (floating) {
        // A floating bar needs a lower and an upper value; a single value has none.
        if (!cell.span) {
          noSpan++;
          continue;
        }
        [from, to] = cell.span;
        if (!onAxis(yAxis, from) || !onAxis(yAxis, to)) {
          offAxis++;
          continue;
        }
      }
      if (stacked) {
        // A part is as high as its own value; positive values pile up from the baseline, negative ones down from it.
        const pile = cell.value < 0 ? stackDown : stackUp;
        from = pile[cell.ci];
        to = from + cell.value;
        pile[cell.ci] = to;
      }
      const pa = yScale(from);
      const pb = yScale(to);
      const yTop = Math.min(pa, pb);
      const yBottom = Math.max(pa, pb);
      const gbar: GroupedBar = { id, row: cell.row, categoryIndex: cell.ci, value: cell.value, x, y: yTop, width: bw, height: Math.max(0, yBottom - yTop), stats: cell.stats, count: cell.count };
      if (floating) {
        gbar.range = [from, to];
        gbar.centerLine = { x1: x, x2: x + bw, y: yScale(cell.value) };
      }
      bars.push(gbar);
      if (showDots(r.style)) {
        // Spread across the bar's width by a fixed hash of the observation, so the picture is the same every time.
        const spread = chart.jitter.enabled ? bw * chart.jitter.widthFraction : 0;
        for (const rep of cell.reps) if (onAxis(yAxis, rep.value)) dots.push({ id: rep.id, row: cell.row, px: x + bw / 2 + (hash01(rep.id) - 0.5) * spread, py: yScale(rep.value), value: rep.value, stats: null });
      }
      let errTop: number | null = null;
      let errBottom: number | null = null;
      if (cell.stats && !stacked && !floating) {
        const bar = buildErrorBar({ groupId: r.s.id, centerX: x + bw / 2, stats: cell.stats, style: r.style, yScale, domain: yAxis.domain, log: !!yAxis.log });
        if (bar) {
          errorPath += bar.d;
          errorMeaning = r.meaning ?? bar.meaning;
          clipped += clippedEndpointCount([bar]);
          errTop = bar.top;
          errBottom = bar.bottom;
        }
      }
      if (arrangement === 'side' && !floating) {
        const text = barLabelText(chart.barLabels, cell.value, cell.count ?? cell.stats?.n ?? null);
        const yBase = yScale(baseline);
        if (text !== null && Number.isFinite(pb) && Number.isFinite(yBase)) {
          const far = pb <= yBase ? (errTop ?? pb) : (errBottom ?? pb);
          gbar.label = { id: `${id}:label`, ...placeBarLabel(chart.barLabels, x + bw / 2, pb, far, yBase), text };
        }
      }
    }
    return { groupId: r.s.id, label: r.label, style: r.style, bars, points, dots, linePath, errorPath, errorMeaning };
  });
  if (offAxis > 0) warnings.push(`${offAxis} value${offAxis === 1 ? ' is' : 's are'} 0 or less on a log axis and ${offAxis === 1 ? 'is' : 'are'} not drawn.`);
  if (noSpan > 0) warnings.push(`${noSpan} value${noSpan === 1 ? ' has' : 's have'} no range to draw a floating bar from: enter replicates, or limits as the values already calculated.`);
  if (clipped > 0) warnings.push(clipped === 1 ? '1 error bar end lies outside the axis range and is clipped.' : `${clipped} error bar ends lie outside the axis range and are clipped.`);

  return { widthPt: W, heightPt: H, layout: lay, orient, arrangement, asLines, categories, y: yAxis, yScale, series, legendSeries, warnings: [...new Set(warnings)] };
}
