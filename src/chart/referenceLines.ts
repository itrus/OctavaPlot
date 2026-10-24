import { dataGaps } from './axisScale';
import type { Chart, ReferenceLine } from '../model/types';
import { extent, n2 } from '../model/units';
import type { GroupedModel } from './groupedModel';
import type { ChartModel } from './model';
import type { YAxisScale } from './scales';
import type { XyModel } from './xyModel';

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

const insideAxis = (axis: AxisFacts, v: number): boolean => {
  if (!Number.isFinite(v) || (axis.log && !(v > 0))) return false;
  const [lo, hi] = extent(axis.domain);
  if (v < lo || v > hi) return false;
  // A value inside a gap of a broken axis has no place on it.
  return !dataGaps(axis).some(([a, b]) => v > a && v < b);
};

/**
 * Where each reference line is drawn, and why some are not: a line whose value lies outside the axis range, inside a gap of a
 * broken axis, or at or below 0 on a log axis is left out and reported (never moved to the edge).
 */
export function placeReferenceLines(lines: readonly ReferenceLine[], place: Place): { placed: PlacedReferenceLine[]; skipped: ReferenceLine[]; unsupported: ReferenceLine[] } {
  const placed: PlacedReferenceLine[] = [];
  const skipped: ReferenceLine[] = [];
  // A line of an axis the chart does not have (an X line on a column chart) is not drawn, and is told apart from one out of range.
  const unsupported: ReferenceLine[] = [];
  const { plot } = place;
  for (const line of lines) {
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

/** Notices for lines that were left out. */
export function referenceLineNotices(r: { skipped: readonly ReferenceLine[]; unsupported: readonly ReferenceLine[] }): string[] {
  const out: string[] = [];
  const s = r.skipped.length;
  if (s > 0) out.push(`${s} reference line${s === 1 ? ' is' : 's are'} outside the axis range (or in a gap of a broken axis) and ${s === 1 ? 'is' : 'are'} not drawn.`);
  const u = r.unsupported.length;
  if (u > 0) out.push(`${u} reference line${u === 1 ? ' is' : 's are'} at a value of an axis this chart does not have, and ${u === 1 ? 'is' : 'are'} not drawn.`);
  return out;
}

/** The model of a chart of a family that can have reference lines (the others carry no axes to put them on). */
export type ModelOfFamily =
  | { family: 'category'; model: ChartModel }
  | { family: 'xy' | 'survival' | 'hist'; model: XyModel }
  | { family: 'grouped'; model: GroupedModel }
  | { family: 'whole' | 'heat'; model: unknown };

/** Where the reference lines of the chart are drawn on its model, and the notices for the ones that cannot be. */
export function referenceLinesOf(chart: Chart, any: ModelOfFamily) {
  const lines = chart.referenceLines;
  const none = { placed: [], skipped: [], unsupported: [] as typeof lines };
  if (lines.length === 0) return none;
  switch (any.family) {
    case 'xy':
    case 'survival':
    case 'hist':
      return placeReferenceLines(lines, { xMap: any.model.xScale, yMap: any.model.yScale, xAxis: any.model.x, yAxis: any.model.y, plot: any.model.layout.plot });
    case 'category':
    case 'grouped': {
      const m = any.model;
      const horizontal = m.orient.horizontal;
      return placeReferenceLines(lines, { yMap: horizontal ? (v) => m.orient.toScreen(0, m.yScale(v)).x : m.yScale, yAxis: m.y, plot: m.layout.plot, valueAxisHorizontal: horizontal });
    }
    default:
      return placeReferenceLines(lines, { plot: { x: 0, y: 0, width: 0, height: 0 } });
  }
}

