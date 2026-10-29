import { chartFamily } from '../../../model/graph/chartTypes';
import type { Chart, ReferenceLine, ShadedRegion } from '../../../model/types';
import type { YAxisScale } from '../axes/scales';
import { extent, n2 } from '../../../model/units';
import { dataGaps, polylinesThroughBreaks } from '../axes/axisScale';

/** A reference line ready to draw: a path across the plotting region, and where its label goes. */
export interface PlacedReferenceLine {
  id: string;
  d: string;
  /** Text at the end of the line; empty when the line has none. */
  label: string;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'end';
  line: ReferenceLine;
}

type AxisFacts = Pick<YAxisScale, 'domain' | 'log' | 'segments' | 'reverse'>;

interface Place {
  /** Position along the plotting region of the value of each axis; a line of an axis that has no map is not drawn. */
  xMap?: (v: number) => number;
  yMap?: (v: number) => number;
  xAxis?: AxisFacts;
  yAxis?: AxisFacts;
  plot: { x: number; y: number; width: number; height: number };
  /** The value axis is the horizontal one (a horizontal column chart): its lines are vertical. */
  valueAxisHorizontal?: boolean;
}

export const insideAxis = (axis: AxisFacts, v: number): boolean => {
  if (!Number.isFinite(v) || (axis.log && !(v > 0))) return false;
  const [lo, hi] = extent(axis.domain);
  if (v < lo || v > hi) return false;
  // A value inside a gap of a broken axis has no place on it.
  return !dataGaps(axis).some(([a, b]) => v > a && v < b);
};

/** Points of an oblique line on an axis that is not linear (the line bends there); the line is straight between them. */
const CURVE_STEPS = 200;

/**
 * The runs of the line y = a + b x that lie inside the plot, in data units: the stretch of X where Y is inside the range of its axis
 * and X inside its own, cut where it meets a gap of a broken axis. On a log axis the line is sampled (it is a curve there, a straight one
 * only for the identity line and for the other lines through the origin of a log-log plot); the ends are exact.
 */
export function obliqueRuns(a: number, b: number, xAxis: AxisFacts, yAxis: AxisFacts): Array<Array<{ x: number; y: number }>> {
  const [xLo, xHi] = extent(xAxis.domain);
  const [yLo, yHi] = extent(yAxis.domain);
  let lo = xLo;
  let hi = xHi;
  if (b === 0) {
    if (!(a >= yLo && a <= yHi)) return [];
  } else {
    const [u, v] = [(yLo - a) / b, (yHi - a) / b];
    lo = Math.max(lo, Math.min(u, v));
    hi = Math.min(hi, Math.max(u, v));
  }
  if (!(hi > lo) || !Number.isFinite(lo) || !Number.isFinite(hi)) return [];
  const bent = !!xAxis.log || !!yAxis.log;
  const at = (t: number) => (xAxis.log ? lo * (hi / lo) ** t : lo + (hi - lo) * t);
  const seq = Array.from({ length: bent ? CURVE_STEPS + 1 : 2 }, (_, i) => {
    const x = at(i / (bent ? CURVE_STEPS : 1));
    return { x, y: a + b * x };
  });
  return polylinesThroughBreaks(seq, xAxis, yAxis);
}

/**
 * Where each reference line is drawn, and why some are not: a line whose value lies outside the axis range, inside a gap of a
 * broken axis, or at or below 0 on a log axis is left out and reported (never moved to the edge).
 */
function placeReferenceLines(lines: readonly ReferenceLine[], place: Place): { placed: PlacedReferenceLine[]; skipped: ReferenceLine[]; unsupported: ReferenceLine[] } {
  const placed: PlacedReferenceLine[] = [];
  const skipped: ReferenceLine[] = [];
  // A line of an axis the chart does not have (an X line on a column chart) is not drawn, and is told apart from one out of range.
  const unsupported: ReferenceLine[] = [];
  const { plot } = place;
  for (const line of lines) {
    if (line.slope !== undefined) {
      // An oblique line needs both axes; one that crosses the plot nowhere is left out and reported, as a line at a value is.
      if (!place.xMap || !place.yMap || !place.xAxis || !place.yAxis) {
        unsupported.push(line);
        continue;
      }
      const runs = obliqueRuns(line.intercept ?? 0, line.slope, place.xAxis, place.yAxis).filter((r) => r.length > 1);
      if (runs.length === 0) {
        skipped.push(line);
        continue;
      }
      const d = runs.map((r) => r.map((q, i) => `${i === 0 ? 'M' : 'L'}${n2(place.xMap!(q.x))},${n2(place.yMap!(q.y))}`).join('')).join('');
      const end = runs[runs.length - 1][runs[runs.length - 1].length - 1];
      placed.push({ id: line.id, d, label: line.showLabel ? line.label : '', labelX: place.xMap(end.x) - 6, labelY: place.yMap(end.y) - 6, anchor: 'end', line });
      continue;
    }
    const onX = line.axis === 'x';
    const map = onX ? place.xMap : place.yMap;
    const axis = onX ? place.xAxis : place.yAxis;
    if (!map || !axis) {
      unsupported.push(line);
      continue;
    }
    if (!insideAxis(axis, line.value)) {
      skipped.push(line);
      continue;
    }
    const at = map(line.value);
    if (!Number.isFinite(at)) {
      skipped.push(line);
      continue;
    }
    // The line is vertical when it is at an X value, or at a value of a horizontal value axis.
    const vertical = onX || !!place.valueAxisHorizontal;
    const d = vertical ? `M${n2(at)},${n2(plot.y)}V${n2(plot.y + plot.height)}` : `M${n2(plot.x)},${n2(at)}H${n2(plot.x + plot.width)}`;
    placed.push({
      id: line.id,
      d,
      label: line.showLabel ? line.label : '',
      labelX: vertical ? at + 6 : plot.x + plot.width - 6,
      labelY: vertical ? plot.y + 20 : at - 6,
      anchor: vertical ? 'start' : 'end',
      line,
    });
  }
  return { placed, skipped, unsupported };
}

/** A shaded region ready to draw: its rectangles across the plotting region (more than one when a broken axis cuts it), and where its label goes. */
export interface PlacedRegion {
  id: string;
  rects: Array<{ x: number; y: number; width: number; height: number }>;
  label: string;
  labelX: number;
  labelY: number;
  anchor: 'start' | 'end';
  region: ShadedRegion;
}

/**
 * The pieces of the band between two values that lie on the axis: inside its range, outside the gaps of a broken axis. A limit that has no place
 * on a log axis (0 or less) reaches to the edge of the axis, as the band covers everything on that side. Empty when nothing is left.
 */
export function regionSpans(from: number, to: number, axis: AxisFacts): Array<[number, number]> {
  const [lo, hi] = [Math.min(from, to), Math.max(from, to)];
  const [dLo, dHi] = extent(axis.domain);
  const [a, b] = [Math.max(lo, dLo), Math.min(hi, dHi)];
  if (!(b > a)) return [];
  let spans: Array<[number, number]> = [[a, b]];
  for (const [g0, g1] of dataGaps(axis)) spans = spans.flatMap(([s0, s1]) => (s1 <= g0 || s0 >= g1 ? [[s0, s1] as [number, number]] : [[s0, Math.min(s1, g0)] as [number, number], [Math.max(s0, g1), s1] as [number, number]].filter(([p, q]) => q > p)));
  return spans;
}

/**
 * Where the shaded regions of the chart are drawn (XY charts): each is cut to the axis range and to the stretches a broken axis keeps; one with
 * nothing left (outside the range, inside a gap, or from a value to the same value) is left out and reported, never moved.
 */
export function regionsOf(chart: Chart, any: ModelOfFamily): { placed: PlacedRegion[]; skipped: ShadedRegion[] } {
  const none = { placed: [] as PlacedRegion[], skipped: [] as ShadedRegion[] };
  if (chart.regions.length === 0 || chartFamily(chart.type) !== 'xy' || (any.family !== 'xy' && any.family !== 'survival' && any.family !== 'histogram')) return none;
  const m = any.model;
  const { plot } = m.layout;
  const placed: PlacedRegion[] = [];
  const skipped: ShadedRegion[] = [];
  for (const region of chart.regions) {
    const onX = region.axis === 'x';
    const [map, axis] = onX ? [m.xScale, m.x] : [m.yScale, m.y];
    const rects = regionSpans(region.from, region.to, axis).flatMap(([s0, s1]) => {
      const [p0, p1] = [map(s0), map(s1)];
      if (!Number.isFinite(p0) || !Number.isFinite(p1)) return [];
      const [lo, hi] = [Math.min(p0, p1), Math.max(p0, p1)];
      return [onX ? { x: lo, y: plot.y, width: hi - lo, height: plot.height } : { x: plot.x, y: lo, width: plot.width, height: hi - lo }];
    });
    if (rects.length === 0) {
      skipped.push(region);
      continue;
    }
    // The label stands inside the first piece, at the start of the band along its length.
    const first = rects[0];
    placed.push({ id: region.id, rects, label: region.showLabel ? region.label : '', labelX: onX ? first.x + 4 : plot.x + plot.width - 6, labelY: onX ? plot.y + 20 : first.y + 20, anchor: onX ? 'start' : 'end', region });
  }
  return { placed, skipped };
}

/** Notices for regions that were left out. */
export function regionNotices(skipped: readonly ShadedRegion[]): string[] {
  const s = skipped.length;
  return s > 0 ? [`${s} shaded region${s === 1 ? ' is' : 's are'} empty, outside the axis range or in a gap of a broken axis and ${s === 1 ? 'is' : 'are'} not drawn.`] : [];
}

/** Notices for lines that were left out. */
export function referenceLineNotices(r: { skipped: readonly ReferenceLine[]; unsupported: readonly ReferenceLine[] }): string[] {
  const out: string[] = [];
  const s = r.skipped.length;
  if (s > 0) out.push(`${s} reference line${s === 1 ? ' is' : 's are'} outside the axis range (or in a gap of a broken axis) and ${s === 1 ? 'is' : 'are'} not drawn.`);
  const u = r.unsupported.length;
  if (u > 0) out.push(`${u} reference line${u === 1 ? ' is' : 's are'} at a value of an axis this chart does not have, and ${u === 1 ? 'is' : 'are'} not drawn.`);
  return out;
}

/** What the placing of lines needs of an XY-shaped model (XY, survival, histogram) ... */
interface XyShaped {
  xScale: (v: number) => number;
  yScale: (v: number) => number;
  x: AxisFacts;
  y: AxisFacts;
  layout: { plot: { x: number; y: number; width: number; height: number } };
}

/** ... and of a model over categories (columns, grouped bars): a value axis that may run across. */
interface CategoryShaped {
  orient: { horizontal: boolean; toScreen: (x: number, y: number) => { x: number; y: number } };
  yScale: (v: number) => number;
  y: AxisFacts;
  layout: { plot: { x: number; y: number; width: number; height: number } };
}

/** The model of a chart of a family that can have reference lines (the others carry no axes to put them on). */
export type ModelOfFamily =
  | { family: 'column' | 'grouped'; model: CategoryShaped }
  | { family: 'xy' | 'survival' | 'histogram'; model: XyShaped }
  | { family: 'pie' | 'heatmap'; model: unknown };

/** Where the reference lines of the chart are drawn on its model, and the notices for the ones that cannot be. */
export function referenceLinesOf(chart: Chart, any: ModelOfFamily) {
  const lines = chart.referenceLines;
  const none = { placed: [], skipped: [], unsupported: [] as typeof lines };
  if (lines.length === 0) return none;
  switch (any.family) {
    case 'xy':
    case 'survival':
    case 'histogram':
      return placeReferenceLines(lines, { xMap: any.model.xScale, yMap: any.model.yScale, xAxis: any.model.x, yAxis: any.model.y, plot: any.model.layout.plot });
    case 'column':
    case 'grouped': {
      const m = any.model;
      const horizontal = m.orient.horizontal;
      return placeReferenceLines(lines, { yMap: horizontal ? (v) => m.orient.toScreen(0, m.yScale(v)).x : m.yScale, yAxis: m.y, plot: m.layout.plot, valueAxisHorizontal: horizontal });
    }
    default:
      return placeReferenceLines(lines, { plot: { x: 0, y: 0, width: 0, height: 0 } });
  }
}

