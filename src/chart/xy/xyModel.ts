import { isXyChartType } from '../../model/graph/chartTypes';
import { layerLook, layersOf, type LayerKind, type LayerSpec } from '../../model/graph/layers';
import { resolveStyle, dataLayer } from '../../model/graph/style';
import { legendEntries } from '../../model/graph/legendEntries';
import { resolveSummary } from '../../model/graph/summary';
import { layoutOf, xySeries } from '../../model/table/tableLayout';
import { NO_FIT_SETTINGS } from '../../model/options/fitOptions';
import type { Chart, ChartStyle, DataTable, FitSettings, Id, LayerStyle } from '../../model/types';
import { chartPx2Pt, n2 } from '../../model/units';
import { summaryOf, type GroupStats } from '../../stats/summary';
import { buildErrorBar, clippedEndpointCount, errorEndValues } from '../shared/parts/errorGeometry';
import { computeLayout, type Layout } from '../shared/parts/layout';
import { curveYValues, drawFit, runFit, type FittedCurve } from './fitCurve';
import { type Scene } from '../shared/scene/scene';
import { axisMapper, inBreak, onAxis, polylinesThroughBreaks, resolveAxis } from '../shared/axes/axisScale';
import type { YAxisScale } from '../shared/axes/scales';
import { displayName } from '../shared/parts/names';
import { suppliedStats } from '../../model/table/suppliedStats';
import { attachLazyScene } from './xyScene';

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

/** One replicate of a row, drawn on its own (the individual-values layer). */
interface XyRawPoint {
  /** Observation ID of the replicate: its stable identity. */
  id: Id;
  row: number;
  x: number;
  y: number;
  px: number;
  py: number;
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
  /** Every replicate on its own, when the individual-values layer is on (a table of replicates only). */
  rawPoints?: XyRawPoint[];
  /** SVG path data of the connecting line: one subpath per run of consecutive valid rows (a missing value breaks it). A spikes chart has its stems here instead. */
  linePath: string;
  /** Area charts: the closed polygons between the baseline and the line, one for each run; absent for the other types. */
  areaPath?: string;
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
  /** How the fit curve and its band are drawn: the series' line look, or what the layers were given of their own. */
  fitCurveLook?: LayerStyle;
  fitBandLook?: LayerStyle;
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
  /** The data layers as shapes: what the drawing, the export and the editor's hit-testing are made from. */
  scene?: Scene;
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

/**
 * Model of an XY chart. The table's first column is X; the other columns form the Y series (one column each, or blocks
 * of replicate / supplied-summary sub-columns). Rows with a missing X or Y are not drawn (missing is never zero); a
 * missing Y breaks the connecting line rather than bridging it.
 */
export function buildXyModel(chart: Chart, table: DataTable, fit: FitSettings = NO_FIT_SETTINGS): XyModel {
  if (!isXyChartType(chart.type) || table.groups.length === 0) throw new Error('buildXyModel needs an XY chart on an XY table');
  const [W, H] = [chartPx2Pt(chart.widthPx), chartPx2Pt(chart.heightPx)];
  const layer = dataLayer(chart);
  const layout = layoutOf(table);
  const warnings: string[] = [];
  const fromBaseline = chart.type === 'xySpikes' || chart.type === 'xyArea';
  const xs = table.groups[0].observations.map((o) => o.value);

  // 1. Per series and row: the centre and, where there is a spread, its stats.
  const raw = xySeries(table).map((s, i) => {
    const style = resolveStyle(chart, layer, { id: s.id, paletteIndex: s.columns[0].seriesSlot ?? i });
    const spec = resolveSummary(layer, s.id);
    const pts: Array<{ id: Id; row: number; x: number; y: number; stats: GroupStats | null }> = [];
    // What a curve is fitted to: every replicate on its own, or the single Y or entered mean of each row.
    const obs: Array<{ x: number; y: number }> = [];
    // Each replicate as it is, for the individual-values layer.
    const rawObs: Array<{ id: Id; row: number; x: number; y: number }> = [];
    // The X of each row that has an X but no Y: it is not drawn, and breaks a line joined in ascending X where it falls.
    const gapXs: Array<{ row: number; x: number }> = [];
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
        if (x !== null) {
          values.forEach((v, k) => {
            if (v === null || !Number.isFinite(v)) return;
            obs.push({ x, y: v });
            if (style.showRawPoints) rawObs.push({ id: s.columns[k].observations[row].id, row, x, y: v });
          });
        }
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
        if (x !== null) gapXs.push({ row, x });
        continue;
      }
      if (layout.kind !== 'replicates') obs.push({ x, y });
      pts.push({ id: s.columns[0].observations[row].id, row, x, y, stats });
    }
    if (noError > 0) warnings.push(`${s.name}: ${noError} row${noError === 1 ? ' has' : 's have'} a mean but no usable error, so no error bar is drawn there.`);
    return { s, style, pts, gapXs, rawObs, skipped, meaning, label: displayName(chart, s.id, s.name), fitRun: runFit(obs, fit) };
  });

  // 2. Scales from every drawn value, error bar ends included, so manual limits clip but never exclude.
  // Each layer says whether its values are part of the range (see rangeContribution in model/graph/layers.ts); a part with no layer counts.
  const layerList = layersOf(chart, table);
  const counts = (kind: LayerKind, seriesId: Id): boolean => layerList.find((l) => l.id === `${seriesId}:${kind}`)?.rangeContribution ?? true;
  const allX = raw.flatMap((r) => [...(counts('points', r.s.id) ? r.pts.map((p) => p.x) : []), ...(counts('rawPoints', r.s.id) ? r.rawObs.map((o) => o.x) : [])]);
  // A fitted curve is part of the data the axis holds (its band is not: a wide band is cut off by the plot).
  const allY = raw.flatMap((r) => [
    ...(counts('points', r.s.id) ? r.pts.map((p) => p.y) : []),
    ...(counts('errorBars', r.s.id) ? r.pts.flatMap((p) => (p.stats ? errorEndValues(p.stats, r.style.showErrorBars, r.style.errorDirection) : [])) : []),
    ...(counts('fitCurve', r.s.id) ? curveYValues(r.fitRun) : []),
    ...(counts('rawPoints', r.s.id) ? r.rawObs.map((o) => o.y) : []),
  ]);
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
    // Spikes and areas stand on a baseline of 0: it is always in range, as for bars.
    includeZero: chart.yAxis.scale === 'linear' && (fromBaseline || nearZero(allY)),
    min: chart.yAxis.min,
    max: chart.yAxis.max,
    majorInterval: chart.yAxis.majorInterval,
    tickCountHint: Math.max(3, Math.min(10, Math.round(H / 100))),
  }, chart.yAxis);
  warnings.push(...xAxis.warnings.map((w) => w.replace(/^Y /, 'X ').replace(/ Y limit/, ' X limit')));
  warnings.push(...yAxis.warnings);

  // 3. Layout (title, axis titles, legend) with no category labels: the X axis carries numbers.
  const legendSeries = legendEntries(chart.legend, raw.map((r) => r.s.id));
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
  // Values inside an omitted range of a broken axis, and error bars with an end inside one: not drawn, and counted.
  let inGap = 0;
  let gapErrorBars = 0;
  const series: XySeries[] = raw.map((r) => {
    // A point with no position on a log axis (X or Y at or below 0) is left out and counted.
    const drawn = r.pts.filter((p) => onAxis(xAxis, p.x) && onAxis(yAxis, p.y));
    offAxis += r.pts.length - drawn.length;
    // A value inside a gap of a broken axis has no place on it: it is not drawn, and the line is cut at the gap's edge.
    const points: XyPoint[] = drawn.filter((p) => !inBreak(xAxis, p.x) && !inBreak(yAxis, p.y)).map((p) => ({ ...p, px: xScale(p.x), py: yScale(p.y) }));
    // Individual values are placed like the points: none where a log axis or a break gives them no position.
    const rawOnAxis = r.rawObs.filter((o) => onAxis(xAxis, o.x) && onAxis(yAxis, o.y));
    const rawPoints: XyRawPoint[] = rawOnAxis.filter((o) => !inBreak(xAxis, o.x) && !inBreak(yAxis, o.y)).map((o) => ({ ...o, px: xScale(o.x), py: yScale(o.y) }));
    inGap += drawn.length - points.length + (r.style.showRawPoints ? rawOnAxis.length - rawPoints.length : 0);
    // A run ends where a row between two drawn points is missing (Y or X), so a gap is a gap in the line.
    // Joined in ascending X instead, a row with an X but no drawable Y (empty, or off a log axis) cuts the line at its sorted place; a row with no X is not there at all.
    const seq: Array<{ x: number; y: number } | null> = [];
    if (chart.lineConnect === 'x') {
      const drawnRows = new Set(drawn.map((p) => p.row));
      const visits = [...drawn.map((p) => ({ row: p.row, x: p.x, at: { x: p.x, y: p.y } as { x: number; y: number } | null })), ...r.gapXs.map((g) => ({ ...g, at: null })), ...r.pts.filter((p) => !drawnRows.has(p.row)).map((p) => ({ row: p.row, x: p.x, at: null }))];
      visits.sort((a, b) => a.x - b.x || a.row - b.row);
      for (const v of visits) if (v.at !== null || (seq.length > 0 && seq[seq.length - 1] !== null)) seq.push(v.at);
    } else {
      let prevRow = -2;
      for (const p of drawn) {
        if (p.row !== prevRow + 1) seq.push(null);
        seq.push({ x: p.x, y: p.y });
        prevRow = p.row;
      }
    }
    const runs = polylinesThroughBreaks(seq, xAxis, yAxis);
    const outline = runs.map((part) => part.map((q, i) => `${i === 0 ? 'M' : 'L'}${n2(xScale(q.x))},${n2(yScale(q.y))}`).join('')).join('');
    // The baseline: 0, or the nearest edge of the axis when 0 is out of range (a log axis has no 0).
    const baseY = yScale(Math.min(Math.max(0, yAxis.domain[0]), yAxis.domain[1]));
    // A spike is a stem from the baseline to its point; an area is closed down to the baseline at both ends of each run.
    const d = chart.type === 'xySpikes' ? points.map((p) => `M${n2(p.px)},${n2(baseY)}L${n2(p.px)},${n2(p.py)}`).join('') : outline;
    const areaPath = chart.type === 'xyArea'
      ? runs.filter((part) => part.length > 0).map((part) => `${part.map((q, i) => `${i === 0 ? `M${n2(xScale(q.x))},${n2(baseY)}L` : 'L'}${n2(xScale(q.x))},${n2(yScale(q.y))}`).join('')}L${n2(xScale(part[part.length - 1].x))},${n2(baseY)}Z`).join('')
      : undefined;
    // Error bars: one stem with caps per point that has an interval, built by the same code as the category charts.
    let errorPath = '';
    let errorMeaning: string | null = null;
    for (const p of points) {
      if (!p.stats) continue;
      // An end inside an omitted range would be drawn at the edge of the gap, as if that were its value: the bar is not drawn then.
      if (errorEndValues(p.stats, r.style.showErrorBars, r.style.errorDirection).some((v) => inBreak(yAxis, v))) {
        gapErrorBars++;
        continue;
      }
      const bar = buildErrorBar({ groupId: r.s.id, centerX: p.px, stats: p.stats, style: r.style, yScale, domain: yAxis.domain, log: !!yAxis.log });
      if (!bar) continue;
      errorPath += bar.d;
      errorMeaning = r.meaning ?? bar.meaning;
      clipped += clippedEndpointCount([bar]);
    }
    const fitted = fit.model === 'none' ? undefined : drawFit(r.fitRun, fit, { xAxis, yAxis, xScale, yScale });
    if (fitted?.failure) warnings.push(`${r.label}: no curve was fitted. ${fitted.failure}`);
    else if (fitted?.summary?.message) warnings.push(`${r.label}: ${fitted.summary.message}`);
    return { groupId: r.s.id, label: r.label, style: r.style, points, linePath: d, ...(areaPath !== undefined ? { areaPath } : {}), errorPath, errorMeaning, skipped: r.skipped, ...(r.style.showRawPoints ? { rawPoints } : {}), fit: fitted, fitCurveLook: layerLook(chart, `${r.s.id}:fitCurve`, r.style), fitBandLook: layerLook(chart, `${r.s.id}:fitBand`, r.style) };
  });
  if (offAxis > 0) warnings.push(`${offAxis} point${offAxis === 1 ? ' has' : 's have'} a value of 0 or less on a log axis and ${offAxis === 1 ? 'is' : 'are'} not drawn.`);
  if (inGap > 0) warnings.push(`${inGap} value${inGap === 1 ? ' lies' : 's lie'} inside an omitted range of the axis and ${inGap === 1 ? 'is' : 'are'} not drawn.`);
  if (gapErrorBars > 0) warnings.push(`${gapErrorBars} error bar${gapErrorBars === 1 ? ' has' : 's have'} an end inside an omitted range of the axis and ${gapErrorBars === 1 ? 'is' : 'are'} not drawn.`);
  if (clipped > 0) warnings.push(clipped === 1 ? '1 error bar end lies outside the axis range and is clipped.' : `${clipped} error bar ends lie outside the axis range and are clipped.`);
  const skippedTotal = series.reduce((n, s) => n + s.skipped, 0);
  if (skippedTotal > 0) warnings.push(`${skippedTotal} row${skippedTotal === 1 ? ' has' : 's have'} an X or Y value missing and ${skippedTotal === 1 ? 'is' : 'are'} not drawn.`);
  if (allX.length === 0) warnings.push('Enter numbers in the X column and in at least one Y column to see the chart.');

  const model: XyModel = { widthPt: W, heightPt: H, layout: layoutOut, x: xAxis, y: yAxis, xScale, yScale, series, legendSeries, warnings: [...new Set(warnings)], fit, layers: layerList };
  attachLazyScene(chart, model);
  return model;
}
