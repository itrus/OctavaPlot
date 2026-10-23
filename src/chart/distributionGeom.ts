import type { DistributionOptions, Id } from '../model/types';
import { n2 } from '../model/units';
import type { BoxSummary, DensityProfile } from '../stats/distribution';
import { quantile6, sortedFinite } from '../stats/distribution';

/** The median is drawn this much heavier than the other lines (spec 10.1 P: 1.5 against 1; a little less here, the lines are thicker). */
const MEDIAN_RATIO = 1.3;

/** A line of a box or a violin: median, whiskers, caps, quartile lines. */
interface DistLine {
  id: string;
  d: string;
  color: string;
  strokeWidth: number;
  /** Dash pattern, absent = solid. */
  dash?: string;
}

/** What is drawn for one data set of a box plot or a violin, in chart pt. */
export interface DistGeom {
  kind: 'box' | 'violin';
  /** Box: the rectangle from the upper to the lower quartile. */
  rect: { x: number; y: number; width: number; height: number } | null;
  /** Violin: the outline as path data. */
  outline: string | null;
  lines: DistLine[];
  /** Box with 4 or more values; only the median and the range below that; a violin with no density shows its values only. */
  shape: 'box' | 'range' | 'violin' | 'points';
  /** Why a violin shows less than a density, for a notice; null when nothing is missing. */
  note: string | null;
}

interface Common {
  groupId: Id;
  centerX: number;
  toY: (v: number) => number;
  opts: DistributionOptions;
  lineColor: string;
  lineWidthPt: number;
}

const finite = (...v: number[]): boolean => v.every(Number.isFinite);
const hline = (x0: number, x1: number, y: number) => `M${n2(x0)},${n2(y)}H${n2(x1)}`;
const vline = (x: number, y0: number, y1: number) => `M${n2(x)},${n2(y0)}V${n2(y1)}`;

/** The box of one data set: rectangle, median, whiskers and caps (spec 10.1). Nothing for a data set with no values. */
export function buildBox(c: Common & { width: number; summary: BoxSummary | null }): DistGeom | null {
  const s = c.summary;
  if (!s) return null;
  const { toY, centerX, lineColor, lineWidthPt, opts } = c;
  const half = c.width / 2;
  const id = `${c.groupId}:box`;
  const lines: DistLine[] = [];
  const med = toY(s.median);
  const cap = (v: number) => hline(centerX - half * 0.5, centerX + half * 0.5, toY(v));
  if (s.shape === 'box') {
    const q1 = toY(s.q1);
    const q3 = toY(s.q3);
    const lo = toY(s.whiskerLow);
    const hi = toY(s.whiskerHigh);
    if (!finite(q1, q3, lo, hi, med)) return null;
    lines.push({ id: `${id}:whisker-hi`, d: vline(centerX, q3, hi) + cap(s.whiskerHigh), color: lineColor, strokeWidth: lineWidthPt });
    lines.push({ id: `${id}:whisker-lo`, d: vline(centerX, q1, lo) + cap(s.whiskerLow), color: lineColor, strokeWidth: lineWidthPt });
    if (opts.showMedian) lines.push({ id: `${id}:median`, d: hline(centerX - half, centerX + half, med), color: lineColor, strokeWidth: lineWidthPt * MEDIAN_RATIO });
    return { kind: 'box', rect: { x: centerX - half, y: Math.min(q1, q3), width: c.width, height: Math.abs(q1 - q3) }, outline: null, lines, shape: 'box', note: null };
  }
  // Fewer than 4 values: the range as a line with caps, and the median across it.
  const lo = toY(s.min);
  const hi = toY(s.max);
  if (!finite(lo, hi, med)) return null;
  lines.push({ id: `${id}:range`, d: vline(centerX, lo, hi) + cap(s.min) + cap(s.max), color: lineColor, strokeWidth: lineWidthPt });
  if (opts.showMedian) lines.push({ id: `${id}:median`, d: hline(centerX - half * 0.6, centerX + half * 0.6, med), color: lineColor, strokeWidth: lineWidthPt * MEDIAN_RATIO });
  return { kind: 'box', rect: null, outline: null, lines, shape: 'range', note: null };
}

/**
 * A floating bar of one data set: a rectangle from the smallest to the largest value, with a line at the centre
 * (the mean or the median of the summary settings) across it.
 */
export function buildFloating(c: Common & { width: number; summary: BoxSummary | null; centre: number | null }): DistGeom | null {
  const s = c.summary;
  if (!s) return null;
  const lo = c.toY(s.min);
  const hi = c.toY(s.max);
  if (!finite(lo, hi)) return null;
  const half = c.width / 2;
  const lines: DistLine[] = [];
  const mid = c.centre === null ? NaN : c.toY(c.centre);
  if (c.opts.showMedian && Number.isFinite(mid)) lines.push({ id: `${c.groupId}:floating:centre`, d: hline(c.centerX - half, c.centerX + half, mid), color: c.lineColor, strokeWidth: c.lineWidthPt * MEDIAN_RATIO });
  return { kind: 'box', rect: { x: c.centerX - half, y: Math.min(lo, hi), width: c.width, height: Math.abs(lo - hi) }, outline: null, lines, shape: 'box', note: null };
}

/** Linear interpolation of the half-width profile at a value of the axis. */
function widthAt(profile: DensityProfile, widths: readonly number[], v: number): number {
  const xs = profile.v;
  if (v <= xs[0]) return widths[0];
  const last = xs.length - 1;
  if (v >= xs[last]) return widths[last];
  let lo = 0;
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (xs[mid] <= v) lo = mid;
    else hi = mid;
  }
  const t = (v - xs[lo]) / (xs[hi] - xs[lo]);
  return widths[lo] + t * (widths[hi] - widths[lo]);
}

/**
 * The violin of one data set: a mirrored outline of the density, with the median and the quartiles across it (spec 10.2).
 * `widths` are the half-widths from 0 to 1 of `profile` (see normaliseProfiles); without a density the data set is
 * drawn as its median only, and `note` says why.
 */
export function buildViolin(c: Common & { halfWidth: number; profile: DensityProfile | null; widths: readonly number[] | null; values: ReadonlyArray<number | null | undefined> }): DistGeom | null {
  const sorted = sortedFinite(c.values);
  if (sorted.length === 0) return null;
  const { toY, centerX, lineColor, lineWidthPt, opts } = c;
  const id = `${c.groupId}:violin`;
  const lines: DistLine[] = [];
  const median = quantile6(sorted, 0.5);
  if (!c.profile || !c.widths) {
    const why = sorted.length < 3 ? 'has fewer than 3 values' : 'has no spread';
    const med = toY(median);
    if (opts.showMedian && Number.isFinite(med)) lines.push({ id: `${id}:median`, d: hline(centerX - c.halfWidth * 0.4, centerX + c.halfWidth * 0.4, med), color: lineColor, strokeWidth: lineWidthPt * MEDIAN_RATIO });
    return { kind: 'violin', rect: null, outline: null, lines, shape: 'points', note: `a density cannot be drawn: it ${why}; its values are shown as they are` };
  }
  const { profile, widths } = c;
  const right: string[] = [];
  const left: string[] = [];
  for (let i = 0; i < profile.v.length; i++) {
    const y = toY(profile.v[i]);
    if (!Number.isFinite(y)) continue;
    right.push(`${n2(centerX + c.halfWidth * widths[i])},${n2(y)}`);
    left.push(`${n2(centerX - c.halfWidth * widths[i])},${n2(y)}`);
  }
  if (right.length < 2) return null;
  const outline = `M${right.join('L')}L${left.reverse().join('L')}Z`;
  const across = (v: number) => {
    const y = toY(v);
    const w = c.halfWidth * widthAt(profile, widths, v);
    return Number.isFinite(y) ? hline(centerX - w, centerX + w, y) : '';
  };
  if (opts.showQuartiles) {
    for (const [name, p] of [['q1', 0.25], ['q3', 0.75]] as const) {
      const d = across(quantile6(sorted, p));
      if (d) lines.push({ id: `${id}:${name}`, d, color: lineColor, strokeWidth: lineWidthPt, dash: '4 3' });
    }
  }
  if (opts.showMedian) {
    const d = across(median);
    if (d) lines.push({ id: `${id}:median`, d, color: lineColor, strokeWidth: lineWidthPt * MEDIAN_RATIO });
  }
  return { kind: 'violin', rect: null, outline, lines, shape: 'violin', note: null };
}
