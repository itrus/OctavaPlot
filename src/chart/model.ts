import { scaleLinear, scaleLog } from 'd3';
import { BAR_PALETTE } from '../model/defaults';
import { paletteById } from '../model/palettes';
import { isPatternInvisible, resolveBarFill, type FillSpec } from '../model/fill';
import { rowTitleAt } from '../model/rows';
import { resolveSummary } from '../model/summary';
import { resolveStyle } from '../model/style';
import type { AxisBinding, Chart, ChartStyle, DataTable, Id, SymbolShape } from '../model/types';
import { chartPx2Pt, n2 } from '../model/units';
import { statsFor, summarize, type GroupStats, type GroupSummary, type Notice } from '../stats/summary';
import { AXIS_NAME, AXIS_TAG, axisConfigFor, axisNotices, bindingOf, populateAxes, type RangeRow } from './axes';
import { buildErrorBar, clippedEndpointCount, clippedEndpointMessage, type ErrorBarGeom } from './errorGeometry';
import { countMarks, patternMarks, type PatternMarks, type Point, type Rect } from './hatch';
import { computeLayout, type Layout } from './layout';
import { anyLabelsRequested, buildPointLabels, emptyPointLabelModel, labelWarnings, type PointLabelModel } from './labels';
import { memoFor } from '../stats/memo';
import { boxSummary, densityProfile, normaliseProfiles, sortedFinite, type BoxSummary, type DensityProfile } from '../stats/distribution';
import { supportsHorizontal } from '../model/chartTypes';
import { barLabelText, placeBarLabel, type BarLabelGeom } from './barLabels';
import { buildBox, buildFloating, buildViolin, type DistGeom } from './distributionGeom';
import { columnLayout } from './columns';
import { axisMapper, onAxis, resolveAxis } from './axisScale';
import type { YAxisScale } from './scales';

/**
 * Chart model: the pure, React-free pipeline
 *   summaries -> Y scale -> layout -> geometry
 * `buildChartModel` returns everything the SVG drawing layer needs.
 */

export interface BarGeom {
  id: Id;
  groupId: Id;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  opacity: number;
  stroke: string;
  strokeWidth: number;
  /** Resolved fill (mode, pattern and its physical sizes); the legacy fields above stay as they were. */
  fillSpec: FillSpec;
  /** Pattern lattice anchor: bar centre x, baseline pixel of the group's own axis. */
  anchor: Point;
  /** Bar rectangle intersected with the plot area; null when empty. */
  bounds: Rect | null;
  /** Pattern marks, only in pattern mode with bounds. */
  marks: PatternMarks | null;
}

interface PointGeom {
  id: Id;
  groupId: Id;
  /** Observation ID for raw points; `${groupId}:mean` for mean markers. */
  observationId: Id | null;
  row: number;
  value: number;
  cx: number;
  cy: number;
  shape: SymbolShape;
  size: number;
  color: string;
  /** Opacity of the inside of the symbol. */
  fillOpacity: number;
  borderColor: string;
  borderWidth: number;
}

interface LineGeom {
  id: Id;
  groupId: Id;
  d: string;
  color: string;
  strokeWidth: number;
}

export interface GroupGeom {
  groupId: Id;
  name: string;
  label: string;
  summary: GroupSummary;
  /** Value axis this data set is drawn against; every value of the group uses that axis's scale. */
  axis: AxisBinding;
  /** Centre and interval from the summary settings; the only source of centre and endpoints. */
  stats: GroupStats;
  /** stats.centre: what bars, mean markers, mean lines and connectors are drawn at. */
  centreValue: number | null;
  style: ChartStyle;
  /** Left edge and width of the category slot. */
  slotX: number;
  slotWidth: number;
  centerX: number;
  bar: BarGeom | null;
  errorBar: ErrorBarGeom | null;
  points: PointGeom[];
  meanLine: LineGeom | null;
  /** Segment from this group's centre to the next group's centre. */
  connector: LineGeom | null;
  /** Value or sample size written above the bar (or error bar), when the chart asks for it. */
  barLabel: BarLabelGeom | null;
  /** Box plot or violin of the data set (those chart types only). */
  dist: DistGeom | null;
}

/**
 * A horizontal column chart is built as a vertical one (categories along x, values along y) in a "virtual" plotting region
 * `virtual` whose width is the height of the real one and whose height is its width; `toScreen` turns a point of that
 * drawing into a point of the real region `real` (a quarter turn with a flip: lengths and angles between lines stay).
 */
export interface Orientation {
  horizontal: boolean;
  real: Rect;
  virtual: Rect;
  /** Position on the page of a point of the virtual drawing. */
  toScreen: (x: number, y: number) => { x: number; y: number };
  /** The SVG matrix that does the same to a whole group of shapes. */
  matrix: string | null;
}

/** The line joining the values of one row (a subject) in the data sets that have one. */
interface PairLine {
  id: Id;
  row: number;
  d: string;
  color: string;
  strokeWidth: number;
}

export interface ChartModel {
  widthPt: number;
  heightPt: number;
  layout: Layout;
  orient: Orientation;
  y: YAxisScale;
  yScale: (v: number) => number;
  /** Right value axis; null while no data set is bound to it (stored y2Axis settings are then ignored). */
  y2: YAxisScale | null;
  y2Scale: ((v: number) => number) | null;
  /** Bars and points whose value lies strictly outside their axis range (nothing is excluded). */
  clipped: Record<AxisBinding, { bars: number; points: number }>;
  groups: GroupGeom[];
  /** Paired plots: the line of each subject across the data sets, in the virtual drawing like every other shape. */
  pairLines: PairLine[];
  /** Index into `groups` of each legend entry, in legend order. */
  legendGroups: number[];
  /** Point labels; always present, empty while none is requested. They never affect ranges, summaries or layout. */
  labels: PointLabelModel;
  warnings: string[];
}

/** Intersection of two rectangles; null when it has no area. */
export function intersectRects(a: Rect, b: Rect): Rect | null {
  const x0 = Math.max(a.x, b.x);
  const y0 = Math.max(a.y, b.y);
  const x1 = Math.min(a.x + a.width, b.x + b.width);
  const y1 = Math.min(a.y + a.height, b.y + b.height);
  return x1 > x0 && y1 > y0 ? { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } : null;
}

export const displayName = (chart: Chart, groupId: Id, fallback: string): string => {
  const custom = chart.displayNames[groupId];
  return custom !== undefined && custom.trim() !== '' ? custom : fallback;
};

/** Deterministic pseudo-random in [0,1) from a string (FNV-1a hash -> mulberry32). */
export function hash01(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Notices about the interval; shown only while the error bars are shown (unless the summary was rejected). */
const SPREAD_NOTICE_CODES: ReadonlySet<Notice['code']> = new Set(['n-too-small', 'coverage', 'too-large', 'level-range', 'interval-invalid']);
const isSpreadNotice = (n: Notice, stats: GroupStats): boolean =>
  SPREAD_NOTICE_CODES.has(n.code) || (n.code === 'nonfinite' && stats.centre !== null);

export function buildChartModel(chart: Chart, table: DataTable): ChartModel {
  const widthPt = chartPx2Pt(chart.widthPx);
  const heightPt = chartPx2Pt(chart.heightPx);
  const layer = chart.layers[0];
  const warnings: string[] = [];
  // Horizontal columns: the right-hand axis does not exist there, and the data sets all sit on the one value axis.
  const horizontal = chart.orientation === 'horizontal' && supportsHorizontal(chart.type);

  // 1. Statistical summaries + resolved styles (independent of presentation settings).
  const rows = table.groups.map((group) => {
    const summary = summarize(group.observations.map((o) => o.value));
    // The observations array itself is the cache key, so style-only edits reuse the GroupStats.
    const stats = statsFor(group.observations, resolveSummary(layer, group.id));
    const style = resolveStyle(chart, layer, group);
    const name = displayName(chart, group.id, group.name);
    return { group, summary, stats, style, name, binding: horizontal ? ('primary' as AxisBinding) : bindingOf(style) };
  });

  // Calculation notices. Visual warning (spec 21.5 L1462) for unavailable statistics, blocking (L1460)
  // for the internal interval guard; informational notices (ties, stored spread not allowed) stay out (L1463).
  for (const r of rows) {
    for (const n of r.stats.notices) {
      if (n.severity === 'informational') continue;
      if (isSpreadNotice(n, r.stats) && !r.style.showErrorBars && !r.stats.rejected) continue;
      warnings.push(`${r.name}: ${n.message}`);
    }
  }

  // Box plots and violins work on the raw values: on a log axis only the ones above 0 count (the rest are reported).
  const isDist = chart.type === 'box' || chart.type === 'violin' || chart.type === 'floating';
  const opts = chart.distribution;
  let offAxis = 0;
  const distPre = rows.map((r) => {
    if (!isDist) return null;
    const logAxis = axisConfigFor(chart, r.binding).scale !== 'linear';
    const all = r.group.observations.map((o) => o.value);
    const values = logAxis ? all.filter((v) => v === null || v > 0) : all;
    offAxis += all.filter((v) => v !== null && Number.isFinite(v) && logAxis && v <= 0).length;
    // The box and the density depend on the values and a few settings only: kept while the observations stay the same.
    const calc = memoFor(r.group.observations, JSON.stringify([chart.type, logAxis, opts.whisker, opts.tukeyK, opts.smoothing, opts.bandwidth, opts.trim]), () => ({
      summary: (chart.type === 'box' ? boxSummary(values, opts.whisker, opts.tukeyK) : chart.type === 'floating' ? boxSummary(values, 'minmax') : null) as BoxSummary | null,
      profile: (chart.type === 'violin' ? densityProfile(values, { smoothing: opts.smoothing, bandwidth: opts.bandwidth, trim: opts.trim }) : null) as DensityProfile | null,
      sorted: sortedFinite(values),
    }));
    const { summary, profile, sorted } = calc;
    const show: number[] = [];
    if (summary && chart.type === 'floating') show.push(summary.min, summary.max);
    else if (summary) show.push(summary.whiskerLow, summary.whiskerHigh, summary.q1, summary.q3, ...(r.style.showSymbols ? (opts.points === 'all' ? [summary.min, summary.max] : opts.points === 'outside' ? summary.outliers : []) : []));
    if (chart.type === 'violin') {
      if (profile) show.push(profile.v[0], profile.v[profile.v.length - 1]);
      else show.push(...sorted);
      if (opts.points === 'all' && r.style.showSymbols && sorted.length) show.push(sorted[0], sorted[sorted.length - 1]);
    }
    return { values, summary, profile, sorted, show };
  });
  const violinWidths = isDist && chart.type === 'violin' ? normaliseProfiles(distPre.map((d) => d?.profile ?? null), opts.normalisation) : [];

  // 2. One value axis per binding, each ranged from its own data sets only. The right axis exists only
  // while a data set is bound to it (spec 6.2 L363); with none it is the old single pool.
  const rangeRows: RangeRow[] = rows.map((r, i) => ({
    binding: r.binding,
    stats: r.stats,
    style: r.style,
    values: r.group.observations.map((o) => o.value),
    ...(distPre[i] ? { override: distPre[i]!.show } : {}),
  }));
  const pools = populateAxes(rangeRows, chart.type);
  const dual = pools.secondaryInUse;
  const tickCountHint = Math.max(3, Math.min(10, Math.round(horizontal ? widthPt / 60 : heightPt / 50)));
  const axisScaleFor = (binding: AxisBinding): YAxisScale => {
    const config = axisConfigFor(chart, binding);
    const pool = pools[binding];
    // Only the left axis can be broken: the data of the right one share its clip.
    return resolveAxis(
      {
        values: pool.values,
        includeZero: pool.hasBars && config.scale === 'linear',
        min: config.min,
        max: config.max,
        majorInterval: config.majorInterval,
        tickCountHint,
      },
      binding === 'secondary' ? { ...config, breaks: [] } : config,
    );
  };
  const y = axisScaleFor('primary');
  const y2 = dual ? axisScaleFor('secondary') : null;
  // Scale warnings name their axis only when two axes are in use.
  const prefixFor = (binding: AxisBinding): string => (dual ? `${AXIS_NAME[binding]}: ` : '');
  warnings.push(...y.warnings.map((w) => prefixFor('primary') + w));
  if (y2) warnings.push(...y2.warnings.map((w) => prefixFor('secondary') + w));

  // Data sets listed in the legend: all except those the user hid one by one.
  const hidden = new Set(chart.legend.hiddenGroupIds);
  const legendGroups = rows.flatMap((r, i) => (hidden.has(r.group.id) ? [] : [i]));
  const legendRows = legendGroups.map((i) => rows[i]);

  // 3. Layout.
  const layout = computeLayout({
    fontFamily: chart.fontFamily,
    titleOffsetPt: chart.titleOffsetPt,
    widthPt,
    heightPt,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    // Horizontal: the numbers run along the bottom (the value axis settings) and the data set names down the left.
    xAxis: horizontal ? chart.yAxis : chart.xAxis,
    yAxis: horizontal ? chart.xAxis : chart.yAxis,
    legend: chart.legend,
    // Legend labels only carry the axis tag; category labels and data set names do not.
    legendLabels: legendRows.map((r) => r.name + AXIS_TAG[r.binding]),
    categoryLabels: horizontal ? [] : rows.map((r) => r.name),
    yTickLabels: horizontal ? rows.map((r) => r.name) : y.ticks.map(y.tickLabel),
    y2Axis: y2 ? chart.y2Axis : undefined,
    y2TickLabels: y2 ? y2.ticks.map(y2.tickLabel) : undefined,
  });
  warnings.push(...layout.warnings);
  // Pattern warnings are spliced in here, after the layout warnings and before the axis notices.
  const patternWarningsAt = warnings.length;

  // 4. Scales: one per axis; geometry below always uses its own group's.
  // The geometry below is made in the virtual region (the real one when vertical); see Orientation.
  const real = layout.plot;
  const plot: Rect = horizontal ? { x: real.x, y: real.y, width: real.height, height: real.width } : real;
  const orient: Orientation = horizontal
    ? {
        horizontal,
        real,
        virtual: plot,
        toScreen: (x, y) => ({ x: real.x + (plot.y + plot.height - y), y: real.y + (x - plot.x) }),
        matrix: `matrix(0 1 -1 0 ${n2(real.x + plot.y + plot.height)} ${n2(real.y - plot.x)})`,
      }
    : { horizontal, real, virtual: real, toScreen: (x, y) => ({ x, y }), matrix: null };
  const linearFor = (scale: YAxisScale) => {
    // A broken axis: the stretches are laid out one after the other, with a gap between.
    if (scale.segments) return axisMapper(scale, plot.y + plot.height, -plot.height);
    // Reversed: the low end of the domain is drawn at the top. A log axis has no position for 0 or less (NaN).
    const range = scale.reverse ? [plot.y, plot.y + plot.height] : [plot.y + plot.height, plot.y];
    if (scale.log) {
      const logScale = scaleLog().base(scale.log).domain(scale.domain).range(range);
      return (v: number) => (v > 0 ? logScale(v) : NaN);
    }
    const linear = scaleLinear().domain(scale.domain).range(range);
    return (v: number) => linear(v);
  };
  const yScale = linearFor(y);
  const y2Scale = y2 ? linearFor(y2) : null;
  const axisOf = (binding: AxisBinding) => {
    const scale = binding === 'secondary' && y2 && y2Scale ? y2 : y;
    const toY = scale === y ? yScale : (y2Scale as (v: number) => number);
    // Bars start at zero when it is visible, else at the nearest domain edge.
    // Bars start at the baseline (0 unless set) when it is visible, else at the nearest domain edge.
    const baseline = Math.min(Math.max(scale.log ? 0 : (chart.bars.baseline ?? 0), scale.domain[0]), scale.domain[1]);
    return { scale, toY, baseline };
  };
  const cols = columnLayout(plot, table.groups.map((g) => g.id), chart.bars, chart.groupGaps);
  const bw = cols.bw;
  const slotStep = cols.step;

  // A label above (or, for a bar pointing down, below) the bar and its error bar.
  const columnLabel = (id: string, x: number, centre: number | null, yCentre: number | null, yBase: number, err: ErrorBarGeom | null, n: number, dots: PointGeom[]): BarLabelGeom | null => {
    const text = barLabelText(chart.barLabels, centre, n);
    if (text === null || yCentre === null || !Number.isFinite(yCentre) || !Number.isFinite(yBase)) return null;
    // Beyond the error bar and the dots of the raw values, so the text does not sit on top of them.
    const dotTop = Math.min(Infinity, ...dots.map((p) => p.cy - p.size / 2));
    const dotBottom = Math.max(-Infinity, ...dots.map((p) => p.cy + p.size / 2));
    const far = yCentre <= yBase ? Math.min(err?.top ?? yCentre, dotTop) : Math.max(err?.bottom ?? yCentre, dotBottom);
    const pos = placeBarLabel(chart.barLabels, x, yCentre, far, yBase);
    return { id: `${id}:label`, ...pos, text };
  };

  // 5. Geometry. Values with no position on a log axis (0 or less) are left out and counted.
  const groups: GroupGeom[] = rows.map(({ group, summary, stats, style, name, binding }, gi) => {
    const { scale, toY, baseline } = axisOf(binding);
    const x0 = cols.x(group.id) ?? plot.x;
    const centerX = x0 + bw / 2;
    const slotX = x0 - (slotStep - bw) / 2;
    const centre = stats.centre;
    const yCentre = centre === null ? null : toY(centre);

    // Bar: from baseline (0 when visible, else the nearest domain edge) to the centre.
    let bar: BarGeom | null = null;
    if (!isDist && style.showBars && centre !== null && yCentre !== null && Number.isFinite(yCentre)) {
      const yBase = toY(baseline);
      const fillSpec = resolveBarFill(style);
      const rect: Rect = { x: x0, y: Math.min(yCentre, yBase), width: bw, height: Math.abs(yBase - yCentre) };
      const anchor: Point = { x: centerX, y: yBase };
      const bounds = intersectRects(rect, plot);
      const marks = fillSpec.mode === 'pattern' && bounds ? patternMarks(fillSpec.pattern, bounds, anchor, fillSpec.spacingPt) : null;
      bar = {
        id: `${group.id}:bar`,
        groupId: group.id,
        x: x0,
        y: Math.min(yCentre, yBase),
        width: bw,
        height: Math.abs(yBase - yCentre),
        fill: style.barFill,
        opacity: style.barOpacity,
        stroke: style.barBorderColor,
        strokeWidth: style.barBorderWidthPt,
        fillSpec,
        anchor,
        bounds,
        marks,
      };
    }

    // Error bar: independent of bars and symbols; endpoints come only from the interval (spec 9.2 L679).
    const errorBar = isDist ? null : buildErrorBar({ groupId: group.id, centerX, stats, style, yScale: toY, domain: scale.domain, log: !!scale.log });

    // Symbols: raw observations (bar overlay / scatter) or the mean marker (mean chart).
    const points: PointGeom[] = [];
    if (!isDist && style.showSymbols) {
      if (chart.type === 'mean') {
        if (centre !== null && yCentre !== null && Number.isFinite(yCentre)) {
          points.push({
            id: `${group.id}:mean`,
            groupId: group.id,
            observationId: null,
            row: -1,
            value: centre,
            cx: centerX,
            cy: yCentre,
            shape: style.symbolShape,
            size: style.symbolSizePt,
            color: style.symbolColor,
            fillOpacity: style.symbolFillOpacity,
            borderColor: style.symbolBorderColor,
            borderWidth: style.symbolBorderWidthPt,
          });
        }
      } else {
        group.observations.forEach((o, row) => {
          if (o.value === null || !Number.isFinite(o.value)) return;
          if (!onAxis(scale, o.value)) {
            offAxis++;
            return;
          }
          const ps = resolveStyle(chart, layer, group, o.id);
          // The dots of a paired plot stay on the line of their column: a subject's line would not meet them otherwise.
          const offset = chart.jitter.enabled && chart.type !== 'paired' ? (hash01(o.id) - 0.5) * chart.jitter.widthFraction * bw : 0;
          points.push({
            id: o.id,
            groupId: group.id,
            observationId: o.id,
            row,
            value: o.value,
            cx: centerX + offset,
            cy: toY(o.value),
            shape: ps.symbolShape,
            size: ps.symbolSizePt,
            color: ps.symbolColor,
            fillOpacity: ps.symbolFillOpacity,
            borderColor: ps.symbolBorderColor,
            borderWidth: ps.symbolBorderWidthPt,
          });
        });
      }
    }

    // Box plot or violin: the body and lines from the raw values, the dots by the distribution options.
    let dist: DistGeom | null = null;
    const pre = distPre[gi];
    if (pre) {
      const common = { groupId: group.id, centerX, toY, opts, lineColor: style.lineColor, lineWidthPt: style.lineWidthPt };
      const slotWidth = slotStep;
      if (chart.type === 'box') {
        dist = buildBox({ ...common, width: slotWidth * opts.boxWidth, summary: pre.summary });
      } else if (chart.type === 'floating') {
        dist = buildFloating({ ...common, width: bw, summary: pre.summary, centre });
      } else {
        dist = buildViolin({ ...common, halfWidth: (slotWidth * opts.violinWidth) / 2, profile: pre.profile, widths: violinWidths[gi] ?? null, values: pre.values });
      }
      if (dist && style.showBars && dist.rect) {
        const fillSpec = resolveBarFill(style);
        const rect: Rect = dist.rect;
        const anchor: Point = { x: centerX, y: rect.y + rect.height };
        const bounds = intersectRects(rect, plot);
        const marks = fillSpec.mode === 'pattern' && bounds ? patternMarks(fillSpec.pattern, bounds, anchor, fillSpec.spacingPt) : null;
        bar = { id: `${group.id}:bar`, groupId: group.id, x: rect.x, y: rect.y, width: rect.width, height: rect.height, fill: style.barFill, opacity: style.barOpacity, stroke: style.barBorderColor, strokeWidth: style.barBorderWidthPt, fillSpec, anchor, bounds, marks };
      }
      const wantDot = (v: number): boolean => {
        if (!style.showSymbols) return false;
        if (opts.points === 'all') return true;
        if (opts.points === 'outside' && chart.type === 'box') return !!pre.summary && (v < pre.summary.whiskerLow || v > pre.summary.whiskerHigh);
        return false;
      };
      const dotWidth = chart.type === 'floating' ? bw : dist?.kind === 'box' ? slotWidth * opts.boxWidth : slotWidth * opts.violinWidth;
      // With no density the values themselves are the picture of a violin.
      const showAll = chart.type === 'violin' && dist?.shape === 'points';
      group.observations.forEach((o, row) => {
        if (o.value === null || !Number.isFinite(o.value) || !onAxis(scale, o.value)) return;
        if (!showAll && !wantDot(o.value)) return;
        const ps = resolveStyle(chart, layer, group, o.id);
        const offset = chart.jitter.enabled ? (hash01(o.id) - 0.5) * chart.jitter.widthFraction * dotWidth : 0;
        points.push({ id: o.id, groupId: group.id, observationId: o.id, row, value: o.value, cx: centerX + offset, cy: toY(o.value), shape: ps.symbolShape, size: ps.symbolSizePt, color: ps.symbolColor, fillOpacity: ps.symbolFillOpacity, borderColor: ps.symbolBorderColor, borderWidth: ps.symbolBorderWidthPt });
      });
      if (opts.showMean && pre.summary) {
        const my = toY(pre.summary.mean);
        if (Number.isFinite(my)) points.push({ id: `${group.id}:mean`, groupId: group.id, observationId: null, row: -1, value: pre.summary.mean, cx: centerX, cy: my, shape: 'plus', size: style.symbolSizePt, color: style.symbolColor, fillOpacity: style.symbolFillOpacity, borderColor: style.symbolBorderColor, borderWidth: Math.max(style.symbolBorderWidthPt, 1) });
      }
      if (dist?.note) warnings.push(`${name}: ${dist.note}.`);
    }

    let meanLine: LineGeom | null = null;
    if ((chart.type === 'scatter' || chart.type === 'paired') && style.showMeanLine && yCentre !== null && Number.isFinite(yCentre)) {
      const half = bw * 0.3;
      meanLine = {
        id: `${group.id}:meanline`,
        groupId: group.id,
        d: `M${centerX - half},${yCentre}H${centerX + half}`,
        color: style.lineColor,
        strokeWidth: style.lineWidthPt,
      };
    }

    return {
      groupId: group.id,
      name: group.name,
      label: name,
      summary,
      axis: binding,
      stats,
      centreValue: centre,
      style,
      slotX,
      slotWidth: slotStep,
      centerX,
      bar,
      errorBar,
      points,
      meanLine,
      connector: null,
      barLabel: isDist ? null : columnLabel(group.id, centerX, centre, yCentre, toY(baseline), errorBar, stats.n, points),
      dist,
    };
  });

  // Paired plots: each row of the table is a subject; its values are joined across the data sets, left to right. A data
  // set without a value for the subject breaks the line there unless the chart bridges it (the values either side are
  // joined; nothing is made up for the missing one). A line needs two values.
  const pairLines: PairLine[] = [];
  if (chart.type === 'paired' && groups[0]?.style.showLines) {
    const rowsSeen = new Set<number>();
    for (const g of groups) for (const p of g.points) if (p.observationId !== null) rowsSeen.add(p.row);
    const first = groups[0]?.style;
    for (const row of [...rowsSeen].sort((x, y) => x - y)) {
      let d = '';
      let segments = 0;
      let joined = false;
      for (const g of groups) {
        const p = g.points.find((q) => q.row === row && q.observationId !== null);
        if (!p || !Number.isFinite(p.cy)) {
          if (!chart.pairs.bridge) joined = false;
          continue;
        }
        d += `${joined ? 'L' : 'M'}${n2(p.cx)},${n2(p.cy)}`;
        if (joined) segments++;
        joined = true;
      }
      if (segments > 0 && first) pairLines.push({ id: `pair:${row}`, row, d, color: first.lineColor, strokeWidth: first.lineWidthPt });
    }
  }

  // Connecting segments (mean chart): a data set without a centre breaks the line, and so does a
  // neighbour on the other axis (P: the segment would join values of different units); those are counted.
  let skippedConnectors = 0;
  if (chart.type === 'mean') {
    for (let i = 0; i < groups.length - 1; i++) {
      const a = groups[i];
      const b = groups[i + 1];
      if (!a.style.showLines || a.centreValue === null || b.centreValue === null) continue;
      if (!onAxis(axisOf(a.axis).scale, a.centreValue) || !onAxis(axisOf(b.axis).scale, b.centreValue)) continue;
      if (a.axis !== b.axis) {
        skippedConnectors++;
        continue;
      }
      const { toY } = axisOf(a.axis);
      a.connector = {
        id: `${a.groupId}:line`,
        groupId: a.groupId,
        d: `M${a.centerX},${toY(a.centreValue)}L${b.centerX},${toY(b.centreValue)}`,
        color: a.style.lineColor,
        strokeWidth: a.style.lineWidthPt,
      };
    }
  }

  // Visual warnings (spec 21.5 L1462) for pattern fills that draw nothing or are too dense.
  const patternWarnings: string[] = [];
  for (const g of groups) {
    const { bar } = g;
    if (!bar || bar.fillSpec.mode !== 'pattern') continue;
    if (isPatternInvisible(bar.fillSpec)) {
      patternWarnings.push(`Pattern on ${g.label} has the same colour as its background.`);
    }
    const { marks, bounds, fillSpec } = bar;
    if (marks?.kind === 'none' && bounds) {
      patternWarnings.push(`Pattern on ${g.label} needs ${countMarks(fillSpec.pattern, bounds, bar.anchor, fillSpec.spacingPt)} marks; increase the spacing.`);
    } else if (!marks || marks.count === 0) {
      patternWarnings.push(`Pattern spacing on ${g.label} is larger than the bar; no pattern marks fit.`);
    }
  }
  // Point labels come last in the geometry: they read the finished symbols and change nothing.
  let labels = emptyPointLabelModel();
  if (horizontal && anyLabelsRequested(chart)) warnings.push('Point labels are not available on horizontal charts yet.');
  if (!horizontal && anyLabelsRequested(chart)) {
    labels = buildPointLabels({
      type: chart.type,
      groups: groups.map((g) => {
        const group = table.groups.find((t) => t.id === g.groupId);
        return {
          groupId: g.groupId,
          points: g.points.map((p) => ({
            id: p.id,
            cx: p.cx,
            cy: p.cy,
            size: p.size,
            value: p.value,
            rowTitle: p.observationId === null ? '' : rowTitleAt(table, p.row),
            style: group && p.observationId !== null ? resolveStyle(chart, layer, group, p.observationId) : g.style,
          })),
        };
      }),
      plot,
      chart: { width: widthPt, height: heightPt },
    });
  }
  if (offAxis > 0) patternWarnings.push(`${offAxis} value${offAxis === 1 ? ' is' : 's are'} 0 or less on a log axis and ${offAxis === 1 ? 'is' : 'are'} not drawn.`);
  warnings.splice(patternWarningsAt, 0, ...patternWarnings, ...labelWarnings(labels.report));

  // Two-axis setup notices (silent with one axis).
  warnings.push(
    ...axisNotices({
      y: chart.yAxis,
      y2: chart.y2Axis,
      legendVisible: chart.legend.visible,
      pools,
      skippedConnectors,
    }),
  );

  // Clipped marks and truncated baselines, per axis. Counts are strict (a value on the limit is inside)
  // and nothing is excluded from the drawing. Visual warnings (spec 21.5 L1462).
  const clipped: ChartModel['clipped'] = { primary: { bars: 0, points: 0 }, secondary: { bars: 0, points: 0 } };
  const barsOnAxis: Record<AxisBinding, boolean> = { primary: false, secondary: false };
  for (const g of groups) {
    const [lo, hi] = [...axisOf(g.axis).scale.domain].sort((a, b) => a - b);
    const outside = (v: number) => v < lo || v > hi;
    if (g.bar && !g.dist) {
      barsOnAxis[g.axis] = true;
      if (g.centreValue !== null && outside(g.centreValue)) clipped[g.axis].bars++;
    }
    for (const p of g.points) if (outside(p.value)) clipped[g.axis].points++;
  }
  const axesShown: AxisBinding[] = dual ? ['primary', 'secondary'] : ['primary'];
  const plural = (n: number, one: string, many: string) => (n === 1 ? `1 ${one}` : `${n} ${many}`);
  for (const binding of axesShown) {
    const { bars, points } = clipped[binding];
    if (bars > 0) warnings.push(`${prefixFor(binding)}${plural(bars, 'bar extends', 'bars extend')} beyond the axis range and ${bars === 1 ? 'is' : 'are'} clipped.`);
    if (points > 0) warnings.push(`${prefixFor(binding)}${plural(points, 'point lies', 'points lie')} outside the axis range and ${points === 1 ? 'is' : 'are'} clipped.`);
    const { baseline, scale } = axisOf(binding);
    const wanted = chart.bars.baseline ?? 0;
    if (barsOnAxis[binding] && baseline !== wanted && !scale.log) {
      warnings.push(`${prefixFor(binding)}The axis range excludes ${wanted === 0 ? 'zero' : String(wanted)}, so bars start at ${scale.tickLabel(baseline)} instead of ${wanted === 0 ? 'zero' : String(wanted)}.`);
    } else if (barsOnAxis[binding] && scale.log) {
      warnings.push(`${prefixFor(binding)}On a log axis bars start at the lowest value of the axis (${scale.tickLabel(baseline)}), since zero has no position.`);
    }
  }

  // Visual warning (spec 21.5 L1462): drawn error-bar ends outside the axis range.
  const clippedMessage = clippedEndpointMessage(clippedEndpointCount(groups.flatMap((g) => (g.errorBar ? [g.errorBar] : []))));
  if (clippedMessage) warnings.push(clippedMessage);

  // Visual warning (spec 21.5 L1462, palette exhausted): data sets past the palette reuse a bar colour.
  const paletteColors = paletteById(chart.paletteId)?.colors ?? BAR_PALETTE;
  const reused = groups.filter((g) => {
    const index = table.groups.find((t) => t.id === g.groupId)?.paletteIndex ?? 0;
    return g.style.showBars && index >= paletteColors.length && g.style.barFill === paletteColors[index % paletteColors.length];
  }).length;
  if (reused > 0) {
    warnings.push(
      `The bar fill palette has ${paletteColors.length} colours; ${reused} data set${reused === 1 ? '' : 's'} reuse a colour already in use.`,
    );
  }

  return { widthPt, heightPt, layout, orient, y, yScale, y2, y2Scale, clipped, groups, pairLines, legendGroups, labels, warnings: [...new Set(warnings)] };
}
