import { scaleBand, scaleLinear } from 'd3';
import { BAR_PALETTE } from '../model/defaults';
import { isPatternInvisible, resolveBarFill, type FillSpec } from '../model/fill';
import { rowTitleAt } from '../model/rows';
import { resolveSummary } from '../model/summary';
import { resolveStyle } from '../model/style';
import type { AxisBinding, Chart, ChartStyle, DataTable, Id, SymbolShape } from '../model/types';
import { mmToPt } from '../model/units';
import { statsFor, summarize, type GroupStats, type GroupSummary, type Notice } from '../stats/summary';
import { AXIS_NAME, AXIS_TAG, axisConfigFor, axisNotices, bindingOf, populateAxes, type RangeRow } from './axes';
import { buildErrorBar, clippedEndpointCount, clippedEndpointMessage, type ErrorBarGeom } from './errorGeometry';
import { countMarks, patternMarks, type PatternMarks, type Point, type Rect } from './hatch';
import { computeLayout, type Layout } from './layout';
import { anyLabelsRequested, buildPointLabels, emptyPointLabelModel, labelWarnings, type PointLabelModel } from './labels';
import { resolveYAxis, type YAxisScale } from './scales';

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

export interface PointGeom {
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
  borderColor: string;
  borderWidth: number;
}

export interface LineGeom {
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
}

export interface ChartModel {
  widthPt: number;
  heightPt: number;
  layout: Layout;
  y: YAxisScale;
  yScale: (v: number) => number;
  /** Right value axis; null while no data set is bound to it (stored y2Axis settings are then ignored). */
  y2: YAxisScale | null;
  y2Scale: ((v: number) => number) | null;
  /** Bars and points whose value lies strictly outside their axis range (nothing is excluded). */
  clipped: Record<AxisBinding, { bars: number; points: number }>;
  groups: GroupGeom[];
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
  const widthPt = mmToPt(chart.widthMm);
  const heightPt = mmToPt(chart.heightMm);
  const layer = chart.layers[0];
  const warnings: string[] = [];

  // 1. Statistical summaries + resolved styles (independent of presentation settings).
  const rows = table.groups.map((group) => {
    const summary = summarize(group.observations.map((o) => o.value));
    // The observations array itself is the cache key, so style-only edits reuse the GroupStats.
    const stats = statsFor(group.observations, resolveSummary(layer, group.id));
    const style = resolveStyle(chart, layer, group);
    const name = displayName(chart, group.id, group.name);
    return { group, summary, stats, style, name, binding: bindingOf(style) };
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

  // 2. One value axis per binding, each ranged from its own data sets only. The right axis exists only
  // while a data set is bound to it (spec 6.2 L363); with none it is the old single pool.
  const rangeRows: RangeRow[] = rows.map((r) => ({
    binding: r.binding,
    stats: r.stats,
    style: r.style,
    values: r.group.observations.map((o) => o.value),
  }));
  const pools = populateAxes(rangeRows, chart.type);
  const dual = pools.secondaryInUse;
  const tickCountHint = Math.max(3, Math.min(10, Math.round(heightPt / 50)));
  const axisScaleFor = (binding: AxisBinding): YAxisScale => {
    const config = axisConfigFor(chart, binding);
    const pool = pools[binding];
    return resolveYAxis({
      values: pool.values,
      includeZero: pool.hasBars,
      min: config.min,
      max: config.max,
      majorInterval: config.majorInterval,
      tickCountHint,
    });
  };
  const y = axisScaleFor('primary');
  const y2 = dual ? axisScaleFor('secondary') : null;
  // Scale warnings name their axis only when two axes are in use.
  const prefixFor = (binding: AxisBinding): string => (dual ? `${AXIS_NAME[binding]}: ` : '');
  warnings.push(...y.warnings.map((w) => prefixFor('primary') + w));
  if (y2) warnings.push(...y2.warnings.map((w) => prefixFor('secondary') + w));

  // 3. Layout.
  const layout = computeLayout({
    widthPt,
    heightPt,
    title: chart.showTitle ? { text: chart.title, fontSizePt: chart.titleFontSizePt } : null,
    xAxis: chart.xAxis,
    yAxis: chart.yAxis,
    legend: chart.legend,
    // Legend labels only carry the axis tag; category labels and data set names do not.
    legendLabels: rows.map((r) => r.name + AXIS_TAG[r.binding]),
    categoryLabels: rows.map((r) => r.name),
    yTickLabels: y.ticks.map(y.tickLabel),
    y2Axis: y2 ? chart.y2Axis : undefined,
    y2TickLabels: y2 ? y2.ticks.map(y2.tickLabel) : undefined,
  });
  warnings.push(...layout.warnings);
  // Pattern warnings are spliced in here, after the layout warnings and before the axis notices.
  const patternWarningsAt = warnings.length;

  // 4. Scales: one per axis; geometry below always uses its own group's.
  const { plot } = layout;
  const linearFor = (scale: YAxisScale) => {
    const linear = scaleLinear().domain(scale.domain).range([plot.y + plot.height, plot.y]);
    return (v: number) => linear(v);
  };
  const yScale = linearFor(y);
  const y2Scale = y2 ? linearFor(y2) : null;
  const axisOf = (binding: AxisBinding) => {
    const scale = binding === 'secondary' && y2 && y2Scale ? y2 : y;
    const toY = scale === y ? yScale : (y2Scale as (v: number) => number);
    // Bars start at zero when it is visible, else at the nearest domain edge.
    const baseline = Math.min(Math.max(0, scale.domain[0]), scale.domain[1]);
    return { scale, toY, baseline };
  };
  const band = scaleBand<string>()
    .domain(table.groups.map((g) => g.id))
    .range([plot.x, plot.x + plot.width])
    .paddingInner(0.3)
    .paddingOuter(0.2);
  const bw = band.bandwidth();
  const slotStep = band.step();

  // 5. Geometry.
  const groups: GroupGeom[] = rows.map(({ group, summary, stats, style, name, binding }) => {
    const { scale, toY, baseline } = axisOf(binding);
    const x0 = band(group.id) ?? plot.x;
    const centerX = x0 + bw / 2;
    const slotX = x0 - (slotStep - bw) / 2;
    const centre = stats.centre;
    const yCentre = centre === null ? null : toY(centre);

    // Bar: from baseline (0 when visible, else the nearest domain edge) to the centre.
    let bar: BarGeom | null = null;
    if (style.showBars && centre !== null && yCentre !== null) {
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
    const errorBar = buildErrorBar({ groupId: group.id, centerX, stats, style, yScale: toY, domain: scale.domain });

    // Symbols: raw observations (bar overlay / scatter) or the mean marker (mean chart).
    const points: PointGeom[] = [];
    if (style.showSymbols) {
      if (chart.type === 'mean') {
        if (centre !== null && yCentre !== null) {
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
            borderColor: style.symbolBorderColor,
            borderWidth: style.symbolBorderWidthPt,
          });
        }
      } else {
        group.observations.forEach((o, row) => {
          if (o.value === null || !Number.isFinite(o.value)) return;
          const ps = resolveStyle(chart, layer, group, o.id);
          const offset = chart.jitter.enabled ? (hash01(o.id) - 0.5) * chart.jitter.widthFraction * bw : 0;
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
            borderColor: ps.symbolBorderColor,
            borderWidth: ps.symbolBorderWidthPt,
          });
        });
      }
    }

    let meanLine: LineGeom | null = null;
    if (chart.type === 'scatter' && style.showMeanLine && yCentre !== null) {
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
    };
  });

  // Connecting segments (mean chart): a data set without a centre breaks the line, and so does a
  // neighbour on the other axis (P: the segment would join values of different units); those are counted.
  let skippedConnectors = 0;
  if (chart.type === 'mean') {
    for (let i = 0; i < groups.length - 1; i++) {
      const a = groups[i];
      const b = groups[i + 1];
      if (!a.style.showLines || a.centreValue === null || b.centreValue === null) continue;
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
  if (anyLabelsRequested(chart)) {
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
    if (g.bar) {
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
    if (barsOnAxis[binding] && baseline !== 0) {
      warnings.push(`${prefixFor(binding)}The axis range excludes zero, so bars start at ${scale.tickLabel(baseline)} instead of zero.`);
    }
  }

  // Visual warning (spec 21.5 L1462): drawn error-bar ends outside the axis range.
  const clippedMessage = clippedEndpointMessage(clippedEndpointCount(groups.flatMap((g) => (g.errorBar ? [g.errorBar] : []))));
  if (clippedMessage) warnings.push(clippedMessage);

  // Visual warning (spec 21.5 L1462, palette exhausted): data sets past the palette reuse a bar colour.
  const reused = groups.filter((g) => {
    const index = table.groups.find((t) => t.id === g.groupId)?.paletteIndex ?? 0;
    return g.style.showBars && index >= BAR_PALETTE.length && g.style.barFill === BAR_PALETTE[index % BAR_PALETTE.length];
  }).length;
  if (reused > 0) {
    warnings.push(
      `The bar fill palette has ${BAR_PALETTE.length} colours; ${reused} data set${reused === 1 ? '' : 's'} reuse a colour already in use.`,
    );
  }

  return { widthPt, heightPt, layout, y, yScale, y2, y2Scale, clipped, groups, labels, warnings: [...new Set(warnings)] };
}
