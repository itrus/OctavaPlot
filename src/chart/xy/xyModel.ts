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
import { AUTO_BAR_GAP_PCT } from '../../model/options/columnOptions';
import { suppliedStats } from '../../model/table/suppliedStats';
import { hasSubjects } from '../../model/table/subjects';
import { offsetStepOf, offsetTable } from '../../model/table/offset';
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
  /** Bubbles: the diameter of the symbol in pt (its area follows the size in the table); absent: the series' symbol size. */
  diameterPt?: number;
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
  /** Offset traces: the sentence written on the figure that discloses the offset; absent for the other chart types. */
  offsetNote?: string;
  /** The curve fit drawn, with its settings (none when the chart has no curve fit). */
  fit: FitSettings;
  /** How many series wait for a fit that is being made off the main thread: they are drawn without curve, band and numbers until it is done. */
  fitsPending?: number;
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
export function buildXyModel(chart: Chart, tableIn: DataTable, fit: FitSettings = NO_FIT_SETTINGS, options: { deferFits?: boolean } = {}): XyModel {
  if (!isXyChartType(chart.type) || tableIn.groups.length === 0) throw new Error('buildXyModel needs an XY chart on an XY table');
  // Offset traces: the chart is built from a copy of the table in which trace i is lifted by i steps (the table itself never changes).
  const isOffset = chart.type === 'xyOffset';
  const offsetStep = isOffset ? offsetStepOf(chart.traceOffset, tableIn) : 0;
  const table = isOffset ? offsetTable(tableIn, offsetStep) : tableIn;
  const [W, H] = [chartPx2Pt(chart.widthPx), chartPx2Pt(chart.heightPx)];
  const layer = dataLayer(chart);
  const layout = layoutOf(table);
  const warnings: string[] = [];
  const isBubble = chart.type === 'xyBubble';
  const isVector = chart.type === 'xyVector';
  const fromBaseline = chart.type === 'xySpikes' || chart.type === 'xyArea' || chart.type === 'xyBars';
  const isBars = chart.type === 'xyBars';
  const xs = table.groups[0].observations.map((o) => o.value);

  // 1. Per series and row: the centre and, where there is a spread, its stats.
  const raw = xySeries(table).map((s, i) => {
    const style = resolveStyle(chart, layer, { id: s.id, paletteIndex: s.columns[0].seriesSlot ?? i });
    const spec = resolveSummary(layer, s.id);
    const pts: Array<{ id: Id; row: number; x: number; y: number; stats: GroupStats | null; size: number | null; dx: number | null; dy: number | null }> = [];
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
      // A sized table: the second column of the series is the size of the bubble (kept apart from Y, and no replicate).
      const size = layout.kind === 'sized' ? values[1] : null;
      // A vector table: the step of the arrow that starts at (X, Y), in the second and third column of the series.
      const dx = layout.kind === 'vector' ? values[1] : null;
      const dy = layout.kind === 'vector' ? values[2] : null;
      if (layout.kind === 'single' || layout.kind === 'sized' || layout.kind === 'vector') y = values[0];
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
      pts.push({ id: s.columns[0].observations[row].id, row, x, y, stats, size, dx, dy });
    }
    if (noError > 0) warnings.push(`${s.name}: ${noError} row${noError === 1 ? ' has' : 's have'} a mean but no usable error, so no error bar is drawn there.`);
    return { s, style, pts, gapXs, rawObs, skipped, meaning, label: displayName(chart, s.id, s.name), fitRun: runFit(obs, fit, options.deferFits ? `${chart.id}:${s.id}` : undefined) };
  });

  // 2. Scales from every drawn value, error bar ends included, so manual limits clip but never exclude.
  // Each layer says whether its values are part of the range (see rangeContribution in model/graph/layers.ts); a part with no layer counts.
  const layerList = layersOf(chart, table);
  const counts = (kind: LayerKind, seriesId: Id): boolean => layerList.find((l) => l.id === `${seriesId}:${kind}`)?.rangeContribution ?? true;
  // Bars at numeric X: the slot of an X is the smallest distance between two X values of the chart (one X: a fifth of its size, or 1);
  // the bars of the series fill the slot less the gap, side by side, and the axis holds their edges.
  const distinctX = [...new Set(raw.flatMap((r) => r.pts.map((p) => p.x)))].sort((a, b) => a - b);
  const slot = distinctX.length > 1 ? Math.min(...distinctX.slice(1).map((x, i) => x - distinctX[i])) : Math.abs(distinctX[0] ?? 0) * 0.2 || 1;
  // The space between bars is a percent of a bar's width, as for the columns: the bars fill the slot less that space.
  const barsWidth = slot / (1 + (chart.bars.gapPct ?? AUTO_BAR_GAP_PCT) / 100);
  const barWidth = barsWidth / Math.max(1, raw.length);
  // Vectors: the end of an arrow (X + dX, Y + dY), when both steps are numbers and not both 0; the axes hold the ends as well as the starts.
  const tipOf = (p: { x: number; y: number; dx: number | null; dy: number | null }): { x: number; y: number } | null =>
    p.dx !== null && p.dy !== null && Number.isFinite(p.dx) && Number.isFinite(p.dy) && (p.dx !== 0 || p.dy !== 0) ? { x: p.x + p.dx, y: p.y + p.dy } : null;
  const allX = raw.flatMap((r) => [
    ...(counts('points', r.s.id) ? r.pts.map((p) => p.x) : []),
    ...(counts('rawPoints', r.s.id) ? r.rawObs.map((o) => o.x) : []),
    ...(isVector && counts('line', r.s.id) ? r.pts.flatMap((p) => { const t = tipOf(p); return t ? [t.x] : []; }) : []),
    ...(isBars && counts('bars', r.s.id) ? r.pts.flatMap((p) => [p.x - barsWidth / 2, p.x + barsWidth / 2]) : []),
  ]);
  // A fitted curve is part of the data the axis holds (its band is not: a wide band is cut off by the plot).
  const allY = raw.flatMap((r) => [
    ...(counts('points', r.s.id) ? r.pts.map((p) => p.y) : []),
    ...(counts('errorBars', r.s.id) ? r.pts.flatMap((p) => (p.stats ? errorEndValues(p.stats, r.style.showErrorBars, r.style.errorDirection) : [])) : []),
    ...(isVector && counts('line', r.s.id) ? r.pts.flatMap((p) => { const t = tipOf(p); return t ? [t.y] : []; }) : []),
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
    // Offset traces: a row of its own under the X axis title for the sentence that tells the offset (inside the plot it could lie on a trace).
    extraBottomPt: isOffset ? chart.yAxis.tickFontSizePt * 1.8 : 0,
    yTickLabels: yAxis.ticks.map(yAxis.tickLabel),
  });
  warnings.push(...layoutOut.warnings);

  const { plot } = layoutOut;
  const xScale = axisMapper(xAxis, plot.x, plot.width);
  const yScale = axisMapper(yAxis, plot.y + plot.height, -plot.height);

  // Bubbles: the area of a bubble follows its size, so the diameter follows the square root of the size; the largest bubble of the chart is
  // the symbol size of its series. A point with no size (empty, 0 or less, not a number) is not a bubble and is not drawn, and counted.
  const validSize = (v: number | null): v is number => v !== null && Number.isFinite(v) && v > 0;
  const largest = isBubble ? Math.max(0, ...raw.flatMap((r) => r.pts.map((p) => p.size).filter(validSize))) : 0;
  const sized = layout.kind === 'sized';
  let noSize = 0;
  if (isVector && layout.kind !== 'vector') warnings.push('Vectors need a step for each point: make the data table with the layout "Y, dX and dY" (New Table, XY).');
  if (isBubble && !sized) warnings.push('Bubbles need a size for each point: make the data table with the layout "Y and size" (New Table, XY). Until then every bubble has the symbol size.');

  // 4. Geometry.
  if (chart.lineConnect === 'subject' && !hasSubjects(table)) warnings.push('Lines are drawn for each subject, but no value has a subject: name the subjects in the data table (Subject…).');
  let clipped = 0;
  let offAxis = 0;
  // Values inside an omitted range of a broken axis, and error bars with an end inside one: not drawn, and counted.
  let inGap = 0;
  let gapErrorBars = 0;
  // Vectors that cannot be drawn: a step missing, no length, or an end where the axis has no place.
  let noComponent = 0;
  let noLength = 0;
  let tipOut = 0;
  const series: XySeries[] = raw.map((r, si) => {
    // A point with no position on a log axis (X or Y at or below 0) is left out and counted.
    const sizedOk = (p: { size: number | null }) => !(isBubble && sized) || validSize(p.size);
    noSize += isBubble && sized ? r.pts.filter((p) => !validSize(p.size)).length : 0;
    const drawn = r.pts.filter((p) => onAxis(xAxis, p.x) && onAxis(yAxis, p.y) && sizedOk(p));
    offAxis += r.pts.length - drawn.length;
    // A value inside a gap of a broken axis has no place on it: it is not drawn, and the line is cut at the gap's edge.
    const points: XyPoint[] = drawn.filter((p) => !inBreak(xAxis, p.x) && !inBreak(yAxis, p.y)).map(({ size, dx: _dx, dy: _dy, ...p }) => ({ ...p, px: xScale(p.x), py: yScale(p.y), ...(isBubble && sized && validSize(size) && largest > 0 ? { diameterPt: r.style.symbolSizePt * Math.sqrt(size / largest) } : {}) }));
    // Individual values are placed like the points: none where a log axis or a break gives them no position.
    const rawOnAxis = r.rawObs.filter((o) => onAxis(xAxis, o.x) && onAxis(yAxis, o.y));
    const rawPoints: XyRawPoint[] = rawOnAxis.filter((o) => !inBreak(xAxis, o.x) && !inBreak(yAxis, o.y)).map((o) => ({ ...o, px: xScale(o.x), py: yScale(o.y) }));
    inGap += drawn.length - points.length + (r.style.showRawPoints ? rawOnAxis.length - rawPoints.length : 0);
    // A run ends where a row between two drawn points is missing (Y or X), so a gap is a gap in the line.
    // Joined in ascending X instead, a row with an X but no drawable Y (empty, or off a log axis) cuts the line at its sorted place; a row with no X is not there at all.
    const seq: Array<{ x: number; y: number } | null> = [];
    if (chart.lineConnect === 'subject') {
      // One run for each subject, in order of first appearance, joined from the lowest X to the highest. A point with no subject is not joined to anything.
      const column = r.s.columns[0].observations;
      const bySubject = new Map<string, typeof drawn>();
      let loose = 0;
      for (const p of drawn) {
        const subject = column[p.row]?.subject ?? '';
        if (subject === '') loose++;
        else bySubject.set(subject, [...(bySubject.get(subject) ?? []), p]);
      }
      for (const list of bySubject.values()) {
        seq.push(null);
        for (const p of [...list].sort((a, b) => a.x - b.x || a.row - b.row)) seq.push({ x: p.x, y: p.y });
      }
      if (loose > 0 && bySubject.size > 0) warnings.push(`${r.label}: ${loose} point${loose === 1 ? ' has' : 's have'} no subject and ${loose === 1 ? 'is' : 'are'} not joined by a line.`);
    } else if (chart.lineConnect === 'x') {
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
    // Vectors: the shaft from (X, Y) to its end and an open head of two strokes, one path; the head is 4 line widths long (at least 5 pt, at most half the shaft).
    let arrowPath = '';
    if (isVector) {
      for (const p of drawn) {
        if (inBreak(xAxis, p.x) || inBreak(yAxis, p.y)) continue;
        if (p.dx === null || p.dy === null || !Number.isFinite(p.dx) || !Number.isFinite(p.dy)) {
          noComponent++;
          continue;
        }
        const tip = tipOf(p);
        if (!tip) {
          noLength++;
          continue;
        }
        if (!onAxis(xAxis, tip.x) || !onAxis(yAxis, tip.y) || inBreak(xAxis, tip.x) || inBreak(yAxis, tip.y)) {
          tipOut++;
          continue;
        }
        const [x0, y0, x1, y1] = [xScale(p.x), yScale(p.y), xScale(tip.x), yScale(tip.y)];
        const length = Math.hypot(x1 - x0, y1 - y0);
        if (!(length > 0)) continue;
        const head = Math.min(Math.max(5, 4 * r.style.lineWidthPt), length * 0.5);
        const direction = Math.atan2(y1 - y0, x1 - x0);
        const wing = (side: number) => `${n2(x1 - head * Math.cos(direction + side * 0.45))},${n2(y1 - head * Math.sin(direction + side * 0.45))}`;
        arrowPath += `M${n2(x0)},${n2(y0)}L${n2(x1)},${n2(y1)}M${wing(1)}L${n2(x1)},${n2(y1)}L${wing(-1)}`;
      }
    }
    const d = isVector ? arrowPath : chart.type === 'xySpikes' ? points.map((p) => `M${n2(p.px)},${n2(baseY)}L${n2(p.px)},${n2(p.py)}`).join('') : outline;
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
    // Bars at numeric X: from the baseline (0, or the one set for the bars; the nearest edge of the axis when it is out of range) up to Y.
    // A bar whose edge falls in an omitted range is one rectangle, trimmed by the plot clip, as for the columns.
    const baseline = Math.min(Math.max(chart.bars.baseline ?? 0, yAxis.domain[0]), yAxis.domain[1]);
    const bars: HistBar[] | undefined = isBars
      ? points.flatMap((p) => {
          const left = p.x - barsWidth / 2 + si * barWidth;
          const [pa, pb] = [xScale(left), xScale(left + barWidth)];
          const [top, base] = [yScale(p.y), yScale(baseline)];
          if (![pa, pb, top, base].every(Number.isFinite)) return [];
          return [{ id: p.id, x: Math.min(pa, pb), y: Math.min(top, base), width: Math.abs(pb - pa), height: Math.abs(base - top), bin: [left, left + barWidth] as [number, number], count: p.stats?.n ?? 1, value: p.y }];
        })
      : undefined;
    return { groupId: r.s.id, label: r.label, style: r.style, points, ...(bars ? { bars } : {}), linePath: d, ...(areaPath !== undefined ? { areaPath } : {}), errorPath, errorMeaning, skipped: r.skipped, ...(r.style.showRawPoints ? { rawPoints } : {}), fit: fitted, fitCurveLook: layerLook(chart, `${r.s.id}:fitCurve`, r.style), fitBandLook: layerLook(chart, `${r.s.id}:fitBand`, r.style) };
  });
  if (noComponent > 0) warnings.push(`${noComponent} vector${noComponent === 1 ? ' lacks' : 's lack'} dX or dY and ${noComponent === 1 ? 'is' : 'are'} not drawn.`);
  if (noLength > 0) warnings.push(`${noLength} vector${noLength === 1 ? ' has' : 's have'} no length (dX and dY are 0) and ${noLength === 1 ? 'is' : 'are'} not drawn.`);
  if (tipOut > 0) warnings.push(`${tipOut} vector${tipOut === 1 ? ' ends' : 's end'} where the axis has no place (a log axis or an omitted range) and ${tipOut === 1 ? 'is' : 'are'} not drawn.`);
  if (noSize > 0) warnings.push(`${noSize} point${noSize === 1 ? ' has' : 's have'} no size above 0 and ${noSize === 1 ? 'is' : 'are'} not drawn as ${noSize === 1 ? 'a bubble' : 'bubbles'}.`);
  if (offAxis > 0) warnings.push(`${offAxis} point${offAxis === 1 ? ' has' : 's have'} a value of 0 or less on a log axis and ${offAxis === 1 ? 'is' : 'are'} not drawn.`);
  if (inGap > 0) warnings.push(`${inGap} value${inGap === 1 ? ' lies' : 's lie'} inside an omitted range of the axis and ${inGap === 1 ? 'is' : 'are'} not drawn.`);
  if (gapErrorBars > 0) warnings.push(`${gapErrorBars} error bar${gapErrorBars === 1 ? ' has' : 's have'} an end inside an omitted range of the axis and ${gapErrorBars === 1 ? 'is' : 'are'} not drawn.`);
  if (clipped > 0) warnings.push(clipped === 1 ? '1 error bar end lies outside the axis range and is clipped.' : `${clipped} error bar ends lie outside the axis range and are clipped.`);
  const skippedTotal = series.reduce((n, s) => n + s.skipped, 0);
  if (skippedTotal > 0) warnings.push(`${skippedTotal} row${skippedTotal === 1 ? ' has' : 's have'} an X or Y value missing and ${skippedTotal === 1 ? 'is' : 'are'} not drawn.`);
  if (allX.length === 0) warnings.push('Enter numbers in the X column and in at least one Y column to see the chart.');

  // Offset traces: the Y axis does not show the values of the traces, so the offset is told (on the figure and here).
  const offsetNote = isOffset ? `Traces offset by ${yAxis.tickLabel(offsetStep)}` : undefined;
  if (isOffset) warnings.push(`${offsetNote}: the Y axis does not show the values of the traces${chart.yAxis.visible ? '' : '; the scale bar does'}.`);
  const model: XyModel = { widthPt: W, heightPt: H, layout: layoutOut, x: xAxis, y: yAxis, xScale, yScale, series, legendSeries, ...(offsetNote ? { offsetNote } : {}), warnings: [...new Set(warnings)], fit, fitsPending: series.filter((q) => q.fit?.pending).length, layers: layerList };
  attachLazyScene(chart, model);
  return model;
}
