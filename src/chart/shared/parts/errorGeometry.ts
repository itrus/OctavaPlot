/**
 * Error-bar geometry (spec 9.2). Pure: endpoints come only from GroupStats.interval and are mapped
 * through the axis scale one by one, never as a transformed error length (spec 9.2 L679).
 */

import type { ChartStyle, ErrorDirection, Id } from '../../../model/types';
import { describeSpread } from '../../../stats/describe';
import type { GroupStats } from '../../../stats/summary';

export interface ErrorBarGeom {
  id: Id;
  groupId: Id;
  /** SVG path data: stem + caps. */
  d: string;
  color: string;
  strokeWidth: number;
  opacity: number;
  /** What the bar shows, e.g. "SD" or "SD (positive side only)". One-sided display is not a one-sided calculation (spec 9.2 L667). */
  meaning: string;
  /** True when a drawn end lies strictly outside the axis domain. */
  clippedUpper: boolean;
  clippedLower: boolean;
  /** Highest and lowest drawn point of the bar in chart pt (y grows downwards): where a label can sit beyond it. */
  top: number;
  bottom: number;
}

export type ErrorBarStyle = Pick<
  ChartStyle,
  'showErrorBars' | 'errorDirection' | 'errorCap' | 'errorCapWidthPt' | 'errorLineWidthPt' | 'errorColor' | 'errorOpacity'
>;

export interface ErrorBarInput {
  groupId: Id;
  centerX: number;
  stats: GroupStats;
  style: ErrorBarStyle;
  yScale: (v: number) => number;
  /** Axis domain in data units; either order. */
  domain: readonly [number, number];
  /** A log axis: an end at or below 0 has no position, so it is drawn at the low end of the domain and counted as clipped. */
  log?: boolean;
}

/** Spreads whose interval is built around the centre; range, IQR and median CI are not. */
function isCentreBased(stats: GroupStats): boolean {
  switch (stats.effectiveSpread) {
    case 'sd':
    case 'sem':
    case 'gsd':
      return true;
    case 'ci':
      return stats.centreKind !== 'median';
    default:
      return false;
  }
}

/**
 * Interval endpoints that may be drawn, or null. Defensive guard (blocking, spec 21.5 L1460): the
 * calculation should never produce these, so a failure is an internal error. Absolute endpoints
 * need lower <= upper; centre-based spreads also need the centre inside (spec 9.2 L679).
 */
function usableEnds(stats: GroupStats): { centre: number; lower: number; upper: number } | null {
  const { centre, interval } = stats;
  if (centre === null || !Number.isFinite(centre)) return null;
  if (interval.status !== 'ok' || stats.effectiveSpread === 'none') return null;
  const { lower, upper } = interval;
  if (lower === null || upper === null || !Number.isFinite(lower) || !Number.isFinite(upper)) return null;
  if (!(lower <= upper)) return null;
  if (isCentreBased(stats)) {
    const slack = Math.max(Math.abs(lower), Math.abs(upper), Math.abs(centre)) * 1e-12;
    if (centre < lower - slack || centre > upper + slack) return null;
  }
  return { centre, lower, upper };
}

/**
 * Data values the axis must show for one data set, in the order centre, upper, lower. Finite only.
 * Hidden error bars contribute only the centre.
 */
export function rangeValuesFor(stats: GroupStats, shown: boolean, direction: ErrorDirection): number[] {
  const values: number[] = [];
  if (stats.centre !== null && Number.isFinite(stats.centre)) values.push(stats.centre);
  return [...values, ...errorEndValues(stats, shown, direction)];
}

/** The ends of the error bar that the axis has to hold: none when it is not shown or has no usable interval. */
export function errorEndValues(stats: GroupStats, shown: boolean, direction: ErrorDirection): number[] {
  if (!shown) return [];
  const ends = usableEnds(stats);
  if (!ends) return [];
  return [...(direction !== 'negative' ? [ends.upper] : []), ...(direction !== 'positive' ? [ends.lower] : [])];
}

/** Null when the bar is hidden, has no centre or interval, fails the consistency guard, or maps to non-finite pixels. */
export function buildErrorBar(input: ErrorBarInput): ErrorBarGeom | null {
  const { groupId, centerX, stats, style, yScale: mapY, domain, log } = input;
  if (!style.showErrorBars) return null;
  const ends = usableEnds(stats);
  if (!ends) return null;
  if (log && !(ends.centre > 0)) return null;
  const floor = Math.min(domain[0], domain[1]);
  const yScale = log ? (v: number) => mapY(v > 0 ? v : floor) : mapY;

  const drawUpper = style.errorDirection !== 'negative';
  const drawLower = style.errorDirection !== 'positive';
  const yCentre = yScale(ends.centre);
  // Each endpoint is mapped separately (spec 9.2 L679); asymmetric intervals stay asymmetric.
  const hi = drawUpper ? yScale(ends.upper) : yCentre;
  const lo = drawLower ? yScale(ends.lower) : yCentre;
  if (![centerX, hi, lo].every(Number.isFinite)) return null;

  const half = style.errorCap === 'bar' ? style.errorCapWidthPt / 2 : 0;
  let d = `M${centerX},${hi}V${lo}`;
  if (half > 0) {
    if (drawUpper) d += `M${centerX - half},${hi}H${centerX + half}`;
    if (drawLower) d += `M${centerX - half},${lo}H${centerX + half}`;
  }

  const dMin = Math.min(domain[0], domain[1]);
  const dMax = Math.max(domain[0], domain[1]);
  const outside = (v: number) => v < dMin || v > dMax;
  const side = style.errorDirection === 'positive' ? ' (positive side only)' : style.errorDirection === 'negative' ? ' (negative side only)' : '';

  return {
    id: `${groupId}:error`,
    groupId,
    d,
    color: style.errorColor,
    strokeWidth: style.errorLineWidthPt,
    opacity: style.errorOpacity,
    meaning: `${describeSpread(stats.effectiveSpread, stats.confidenceLevel, stats.centreKind)}${side}`,
    clippedUpper: drawUpper && outside(ends.upper),
    clippedLower: drawLower && outside(ends.lower),
    top: Math.min(hi, lo, yCentre),
    bottom: Math.max(hi, lo, yCentre),
  };
}

/** The half-length of an error bar of X that was entered: a number from 0 up, else null (an empty cell is no bar; a negative or non-numeric one is an entry error, see isBadXError). */
export const usableXError = (v: number | null | undefined): number | null => (v === null || v === undefined || !Number.isFinite(v) || v < 0 ? null : v);

/** An error entered that cannot be a half-length: not empty, and negative or not a number. Its bar is not drawn and the notice counts it. */
export const isBadXError = (v: number | null | undefined): boolean => v !== null && v !== undefined && usableXError(v) === null;

/** The values of X an error bar of X reaches, in the order lower, upper; only the sides the direction draws. */
export function xErrorEndValues(x: number, half: number, direction: ErrorDirection): number[] {
  return [...(direction !== 'positive' ? [x - half] : []), ...(direction !== 'negative' ? [x + half] : [])];
}

export interface XErrorBarInput {
  groupId: Id;
  /** The centre of the bar along X (data units) and its place across, chart pt. */
  x: number;
  centerY: number;
  /** The half-length entered, usable (see usableXError). */
  half: number;
  style: ErrorBarStyle;
  xScale: (v: number) => number;
  /** Axis domain in data units; either order. */
  domain: readonly [number, number];
  /** A log axis: a lower end at or below 0 has no position, so it is drawn at the low end of the domain and counted as clipped. */
  log?: boolean;
}

/**
 * The error bar of X of one point: a stem along X with a cap at each drawn end, built as the bars of Y are (each end is mapped
 * on its own, so a bar on a log axis stays asymmetric). Null when the bars are hidden, the half-length is 0 or the bar has no place.
 */
export function buildXErrorBar(input: XErrorBarInput): Pick<ErrorBarGeom, 'id' | 'groupId' | 'd' | 'clippedUpper' | 'clippedLower'> | null {
  const { groupId, x, centerY, half: length, style, xScale: mapX, domain, log } = input;
  if (!style.showErrorBars || !(length > 0)) return null;
  if (log && !(x > 0)) return null;
  const floor = Math.min(domain[0], domain[1]);
  const xScale = log ? (v: number) => mapX(v > 0 ? v : floor) : mapX;
  const drawUpper = style.errorDirection !== 'negative';
  const drawLower = style.errorDirection !== 'positive';
  const at = xScale(x);
  const [hi, lo] = [drawUpper ? xScale(x + length) : at, drawLower ? xScale(x - length) : at];
  if (![centerY, hi, lo].every(Number.isFinite)) return null;
  const cap = style.errorCap === 'bar' ? style.errorCapWidthPt / 2 : 0;
  let d = `M${lo},${centerY}H${hi}`;
  if (cap > 0) {
    if (drawUpper) d += `M${hi},${centerY - cap}V${centerY + cap}`;
    if (drawLower) d += `M${lo},${centerY - cap}V${centerY + cap}`;
  }
  const [dMin, dMax] = [Math.min(domain[0], domain[1]), Math.max(domain[0], domain[1])];
  const outside = (v: number) => v < dMin || v > dMax;
  return { id: `${groupId}:xerror`, groupId, d, clippedUpper: drawUpper && outside(x + length), clippedLower: drawLower && outside(x - length) };
}

/** Drawn error-bar ends that lie outside the axis domain. */
export function clippedEndpointCount(bars: ReadonlyArray<Pick<ErrorBarGeom, 'clippedUpper' | 'clippedLower'>>): number {
  let count = 0;
  for (const b of bars) count += (b.clippedUpper ? 1 : 0) + (b.clippedLower ? 1 : 0);
  return count;
}

/** Visual warning (spec 21.5 L1462): truthful geometry plus the affected count. Null when nothing is clipped. */
export function clippedEndpointMessage(count: number): string | null {
  if (count <= 0) return null;
  return count === 1
    ? '1 error bar end lies outside the axis range and is clipped.'
    : `${count} error bar ends lie outside the axis range and are clipped.`;
}
