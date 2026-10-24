import { isXyChartType } from '../model/chartTypes';
import { layersAvailable, layersOf, type LayerSpec } from '../model/layers';
import { resolveStyle } from '../model/style';
import { resolveSummary } from '../model/summary';
import { layoutOf, summaryFormatInfo, xySeries } from '../model/tableLayout';
import { NO_FIT_SETTINGS } from '../model/fitOptions';
import type { Chart, ChartStyle, DataTable, FitSettings, Id, SpreadKind, SummaryFormat } from '../model/types';
import { chartPx2Pt, n2 } from '../model/units';
import { summaryOf, type GroupStats } from '../stats/summary';
import { buildErrorBar, clippedEndpointCount, rangeValuesFor } from './errorGeometry';
import { computeLayout, type Layout } from './layout';
import { curveYValues, drawFit, runFit, type FittedCurve } from './fitCurve';
import { displayName } from './model';
import { axisMapper, inBreak, onAxis, polylinesThroughBreaks, resolveAxis } from './axisScale';
import type { YAxisScale } from './scales';

/** One plotted point of an XY series: a single Y value, or the centre of replicate / supplied-summary values. */
export interface XyPoint {
  /** Observation ID of the series' first column at this row: the stable identity of the point. */
  id: Id;
  row: number;
  x: number;
  y: number;
  /** Position in chart pt. */
  px: number;
  py: number;
  /** The summary behind the point; null for a single Y value. */
  stats: GroupStats | null;
}

/** One bar of a histogram: its rectangle in chart pt, and the bin and value behind it. */
interface HistBar {
  id: Id;
  x: number;
  y: number;
  width: number;
  height: number;
  bin: [number, number];
  count: number;
  /** The height as plotted (count, fraction, percent or density). */
  value: number;
}

export interface XySeries {
  groupId: Id;
  label: string;
  style: ChartStyle;
  points: XyPoint[];
  /** SVG path data of the connecting line: one subpath per run of consecutive valid rows (a missing value breaks it). */
  linePath: string;
  /** Path data of all the error bars of the series (stems and caps); empty when there are none. */
  errorPath: string;
  /** What the error bars show, e.g. "SD"; null when there are none. */
  errorMeaning: string | null;
  /** Survival charts: the closed polygon of the confidence band; empty when there is none. */
  bandPath?: string;
  /** Histograms: the bars, one for each bin. */
  bars?: HistBar[];
  /** The fitted curve with its band and parameters; absent when no model is chosen. */
  fit?: FittedCurve;
  /** Rows that could not be drawn because X or Y is missing. */
  skipped: number;
}

/** The "number at risk" table under a survival plot: one row per group, one column per tick of the time axis. */
export interface AtRiskTable {
  /** X position of each column, chart pt. */
  xs: number[];
  times: number[];
  rows: Array<{ label: string; color: string; counts: number[] }>;
  /** Top of the table and height of a row, chart pt. */
  y0: number;
  rowHeight: number;
  fontSizePt: number;
}

export interface XyModel {
  widthPt: number;
  heightPt: number;
  layout: Layout;
  x: YAxisScale;
  y: YAxisScale;
  xScale: (v: number) => number;
  yScale: (v: number) => number;
  series: XySeries[];
  /** Index into `series` of each legend entry. */
  legendSeries: number[];
  /** Survival charts: the at-risk table, when asked for. */
  atRisk?: AtRiskTable | null;
  warnings: string[];
  /** The curve fit drawn, with its settings (none when the chart has no curve fit). */
  fit: FitSettings;
  /** The layers the chart is drawn from, lowest first; absent for the families that are not drawn from layers yet. */
  layers?: LayerSpec[];
}


/**
 * Automatic range: include zero when every value is non-negative and the smallest is close to it (within a quarter of
 * the largest), so a series that starts near 0 is not drawn floating above an axis that starts far below it. Data far
 * from zero keeps a range fitted to the data (spec 6.1: `axis.includeZero` is auto for XY charts).
 */
const nearZero = (values: number[]): boolean => {
  if (values.length === 0) return false;
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return lo >= 0 && lo <= 0.25 * hi;
};

const SUPPLIED_MEANING: Record<string, string> = {
  sd: 'SD (as entered)',
  sem: 'SEM (as entered)',
  cv: 'SD from the %CV entered',
  plusMinus: '+/- error as entered',
  limits: 'upper/lower limits as entered',
};

/**
 * Stats of one row of a "values already calculated" series: the mean (or median) entered, and an interval built from
 * the error entered. An error that is missing or negative leaves the point without an error bar.
 */
export function suppliedStats(format: SummaryFormat, values: ReadonlyArray<number | null>): { stats: GroupStats; meaning: string } | null {
  const info = summaryFormatInfo(format);
  const get = (name: string): number | null => {
    const i = info.columns.indexOf(name);
    const v = i >= 0 ? values[i] : null;
    return v === null || v === undefined || !Number.isFinite(v) ? null : v;
  };
  const mean = get('Mean');
  if (mean === null) return null;
  let lower: number | null = null;
  let upper: number | null = null;
  let spread: SpreadKind = 'none';
  if (info.error === 'limits') {
    upper = get('Upper');
    lower = get('Lower');
    if (lower !== null && upper !== null && lower <= upper) spread = 'range';
    else lower = upper = null;
  } else {
    const raw = info.error === 'sd' ? get('SD') : info.error === 'sem' ? get('SEM') : info.error === 'cv' ? get('%CV') : get('+/- error');
    // A %CV is relative to the mean: with a mean of 0 it fixes no SD, so there is no error to draw.
    const err = raw === null ? null : info.error === 'cv' ? (mean === 0 ? null : (Math.abs(mean) * raw) / 100) : raw;
    if (err !== null && err >= 0) {
      lower = mean - err;
      upper = mean + err;
      spread = info.error === 'sem' ? 'sem' : info.error === 'plusMinus' ? 'range' : 'sd';
    }
  }
  // N is a count of subjects: a positive whole number, else it is unknown (0) and not made up.
  const rawN = get('N');
  const n = rawN !== null && Number.isInteger(rawN) && rawN > 0 ? rawN : null;
  const stats: GroupStats = {
    n: n ?? 0,
    missing: 0,
    invalid: 0,
    centreKind: 'mean',
    spread,
    effectiveSpread: spread,
    confidenceLevel: 0.95,
    centre: mean,
    interval: { status: spread === 'none' ? 'none' : 'ok', lower, upper, coverage: null, code: null },
    rejected: false,
    notices: [],
  };
  return { stats, meaning: SUPPLIED_MEANING[info.error] };
}

/**
 * Model of an XY chart. The table's first column is X; the other columns form the Y series (one column each, or blocks
 * of replicate / supplied-summary sub-columns). Rows with a missing X or Y are not drawn (missing is never zero); a
 * missing Y breaks the connecting line rather than bridging it.
 */
export function buildXyModel(chart: Chart, table: DataTable, fit: FitSettings = NO_FIT_SETTINGS): XyModel {
  if (!isXyChartType(chart.type) || table.groups.length === 0) throw new Error('buildXyModel needs an XY chart on an XY table');
  const [W, H] = [chartPx2Pt(chart.widthPx), chartPx2Pt(chart.heightPx)];
  const layer = chart.layers[0];
  const layout = layoutOf(table);
  const warnings: string[] = [];
  const xs = table.groups[0].observations.map((o) => o.value);

  // 1. Per series and row: the centre and, where there is a spread, its stats.
  const raw = xySeries(table).map((s, i) => {
    const style = resolveStyle(chart, layer, { id: s.id, paletteIndex: s.columns[0].seriesSlot ?? i });
    const spec = resolveSummary(layer, s.id);
    const pts: Array<{ id: Id; row: number; x: number; y: number; stats: GroupStats | null }> = [];
    // What a curve is fitted to: every replicate on its own, or the single Y or entered mean of each row.
    const obs: Array<{ x: number; y: number }> = [];
    let skipped = 0;
    let meaning: string | null = null;
    let noError = 0;
    for (let row = 0; row < table.rowCount; row++) {
      const x = xs[row];
      const values = s.columns.map((c) => c.observations[row]?.value ?? null);
      const any = values.some((v) => v !== null);
      let y: number | null = null;
      let stats: GroupStats | null = null;
      if (layout.kind === 'single') y = values[0];
      else if (layout.kind === 'replicates') {
        if (x !== null) for (const v of values) if (v !== null && Number.isFinite(v)) obs.push({ x, y: v });
        stats = summaryOf(values, spec);
        y = stats.centre;
        if (y !== null && stats.effectiveSpread !== 'none' && stats.interval.status === 'unavailable') noError++;
      } else {
        const supplied = suppliedStats(layout.format, values);
        if (supplied) {
          stats = supplied.stats;
          y = stats.centre;
          meaning = supplied.meaning;
          if (stats.interval.status !== 'ok') noError++;
        }
      }
      if (x === null || y === null) {
        // A row with an X or a value that cannot be drawn is reported; a wholly empty row is just empty.
        if (x !== null || any) skipped++;
        continue;
      }
      if (layout.kind !== 'replicates') obs.push({ x, y });
      pts.push({ id: s.columns[0].observations[row].id, row, x, y, stats });
    }
    if (noError > 0) warnings.push(`${s.name}: ${noError} row${noError === 1 ? ' has' : 's have'} a mean but no usable error, so no error bar is drawn there.`);
    return { s, style, pts, skipped, meaning, label: displayName(chart, s.id, s.name), fitRun: runFit(obs, fit) };
  });

  // 2. Scales from every drawn value, error bar ends included, so manual limits clip but never exclude.
  const allX = raw.flatMap((r) => r.pts.map((p) => p.x));
  // A fitted curve is part of the data the axis holds (its band is not: a wide band is cut off by the plot).
  const allY = raw.flatMap((r) => [...r.pts.flatMap((p) => (p.stats ? rangeValuesFor(p.stats, r.style.showErrorBars, r.style.errorDirection) : [p.y])), ...curveYValues(r.fitRun)]);
  const xAxis = resolveAxis({
    values: allX,
    includeZero: chart.xAxis.scale === 'linear' && nearZero(allX),
    min: chart.xAxis.min,
    max: chart.xAxis.max,
    majorInterval: chart.xAxis.majorInterval,
    tickCountHint: Math.max(3, Math.min(10, Math.round(W / 120))),
  }, chart.xAxis);
  const yAxis = resolveAxis({
    values: allY,
    includeZero: chart.yAxis.scale === 'linear' && nearZero(allY),
    min: chart.yAxis.min,
    max: chart.yAxis.max,
    majorInterval: chart.yAxis.majorInterval,
    tickCountHint: Math.max(3, Math.min(10, Math.round(H / 100))),
  }, chart.yAxis);
  warnings.push(...xAxis.warnings.map((w) => w.replace(/^Y /, 'X ').replace(/ Y limit/, ' X limit')));
  warnings.push(...yAxis.warnings);

  // 3. Layout (title, axis titles, legend) with no category labels: the X axis carries numbers.
  const legendSeries = raw.map((_, i) => i).filter((i) => !chart.legend.hiddenGroupIds.includes(raw[i].s.id));
  const layoutOut = computeLayout({
    fontFamily: chart.fontFamily,
    titleOffsetPt: chart.titleOffsetPt,
    widthPt: W,
    heightPt: H,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    xAxis: chart.xAxis,
    yAxis: chart.yAxis,
    legend: chart.legend,
    legendLabels: legendSeries.map((i) => raw[i].label),
    categoryLabels: [],
    yTickLabels: yAxis.ticks.map(yAxis.tickLabel),
  });
  warnings.push(...layoutOut.warnings);

  const { plot } = layoutOut;
  const xScale = axisMapper(xAxis, plot.x, plot.width);
  const yScale = axisMapper(yAxis, plot.y + plot.height, -plot.height);

  // 4. Geometry.
  let clipped = 0;
  let offAxis = 0;
  const series: XySeries[] = raw.map((r) => {
    // A point with no position on a log axis (X or Y at or below 0) is left out and counted.
    const drawn = r.pts.filter((p) => onAxis(xAxis, p.x) && onAxis(yAxis, p.y));
    offAxis += r.pts.length - drawn.length;
    // A value inside a gap of a broken axis has no place on it: it is not drawn, and the line is cut at the gap's edge.
    const points: XyPoint[] = drawn.filter((p) => !inBreak(xAxis, p.x) && !inBreak(yAxis, p.y)).map((p) => ({ ...p, px: xScale(p.x), py: yScale(p.y) }));
    // A run ends where a row between two drawn points is missing (Y or X), so a gap is a gap in the line.
    const seq: Array<{ x: number; y: number } | null> = [];
    let prevRow = -2;
    for (const p of drawn) {
      if (p.row !== prevRow + 1) seq.push(null);
      seq.push({ x: p.x, y: p.y });
      prevRow = p.row;
    }
    const d = polylinesThroughBreaks(seq, xAxis, yAxis)
      .map((part) => part.map((q, i) => `${i === 0 ? 'M' : 'L'}${n2(xScale(q.x))},${n2(yScale(q.y))}`).join(''))
      .join('');
    // Error bars: one stem with caps per point that has an interval, built by the same code as the category charts.
    let errorPath = '';
    let errorMeaning: string | null = null;
    for (const p of points) {
      if (!p.stats) continue;
      const bar = buildErrorBar({ groupId: r.s.id, centerX: p.px, stats: p.stats, style: r.style, yScale, domain: yAxis.domain, log: !!yAxis.log });
      if (!bar) continue;
      errorPath += bar.d;
      errorMeaning = r.meaning ?? bar.meaning;
      clipped += clippedEndpointCount([bar]);
    }
    const fitted = fit.model === 'none' ? undefined : drawFit(r.fitRun, fit, { xAxis, yAxis, xScale, yScale });
    if (fitted?.failure) warnings.push(`${r.label}: no curve was fitted. ${fitted.failure}`);
    else if (fitted?.summary?.message) warnings.push(`${r.label}: ${fitted.summary.message}`);
    return { groupId: r.s.id, label: r.label, style: r.style, points, linePath: d, errorPath, errorMeaning, skipped: r.skipped, fit: fitted };
  });
  if (offAxis > 0) warnings.push(`${offAxis} point${offAxis === 1 ? ' has' : 's have'} a value of 0 or less on a log axis and ${offAxis === 1 ? 'is' : 'are'} not drawn.`);
  if (clipped > 0) warnings.push(clipped === 1 ? '1 error bar end lies outside the axis range and is clipped.' : `${clipped} error bar ends lie outside the axis range and are clipped.`);
  const skippedTotal = series.reduce((n, s) => n + s.skipped, 0);
  if (skippedTotal > 0) warnings.push(`${skippedTotal} row${skippedTotal === 1 ? ' has' : 's have'} an X or Y value missing and ${skippedTotal === 1 ? 'is' : 'are'} not drawn.`);
  if (allX.length === 0) warnings.push('Enter numbers in the X column and in at least one Y column to see the chart.');

  return { widthPt: W, heightPt: H, layout: layoutOut, x: xAxis, y: yAxis, xScale, yScale, series, legendSeries, warnings: [...new Set(warnings)], fit, layers: layersAvailable(chart) ? layersOf(chart, table) : undefined };
}
