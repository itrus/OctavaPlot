import { format, precisionFixed } from 'd3';
import { logBaseOf } from '../../../model/graph/axis';
import { extent } from '../../../model/units';
import type { AxisBreak, AxisConfig } from '../../../model/types';
import { clean, MAX_TICKS_PER_AXIS, resolveYAxis, type YAxisInput, type YAxisScale } from './scales';

/**
 * Numeric axes by their settings (spec 6.1, 6.3, 6.4): linear or log, reversed or not, minor ticks and the way
 * the numbers are written. The plain linear resolver stays in scales.ts; this wraps it.
 */

/** The axis settings the scale depends on. */
type AxisScaleSettings = Pick<AxisConfig, 'scale' | 'reverse' | 'minorTicks' | 'numberFormat' | 'decimals' | 'thousands' | 'prefix' | 'suffix'> & { breaks?: AxisBreak[]; tickFontSizePt?: number };

const EPS = 1e-9;

/** Writes axis numbers by the format settings; `step` is the distance between major ticks on a linear axis (null on a log axis). */
export function makeFormatter(cfg: AxisScaleSettings, step: number | null): (v: number) => string {
  const group = cfg.thousands ? ',' : '';
  let body: (v: number) => string;
  if (cfg.numberFormat === 'scientific') {
    const f = format(cfg.decimals === null ? '.3~e' : `.${cfg.decimals}e`);
    body = (v) => f(v);
  } else if (cfg.numberFormat === 'fixed') {
    const p = cfg.decimals ?? Math.min(8, precisionFixed(Math.abs(step ?? 1) || 1));
    const f = format(`${group}.${p}f`);
    body = (v) => f(v);
  } else if (step === null) {
    // Automatic on a log axis: whole powers of the base, in plain digits unless very large or very small.
    const sci = format('.3~e');
    const grouped = format(`${group}.12~f`);
    body = (v) => (v !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-4) ? sci(v) : cfg.thousands ? grouped(v) : String(clean(v)));
  } else {
    const abs = Math.abs(step);
    if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) {
      const f = format('.3~e');
      body = (v) => f(v);
    } else {
      const f = format(`${group}.${Math.min(8, precisionFixed(abs || 1))}f`);
      body = (v) => f(v);
    }
  }
  return (v) => cfg.prefix + body(v).replace('−', '-') + cfg.suffix;
}

/** Positions of the minor ticks of a linear axis: `perInterval` of them between two major ticks, across the whole domain. */
export function linearMinorTicks(domain: readonly [number, number], majors: readonly number[], perInterval: number): number[] {
  if (perInterval <= 0 || majors.length < 2) return [];
  const step = majors[1] - majors[0];
  if (!(step > 0)) return [];
  const sub = step / (perInterval + 1);
  const lo = Math.min(domain[0], domain[1]);
  const hi = Math.max(domain[0], domain[1]);
  const first = Math.floor((lo - majors[0]) / sub - EPS);
  const out: number[] = [];
  for (let i = first; out.length < 4000; i++) {
    const v = clean(majors[0] + i * sub);
    if (v > hi + sub * EPS) break;
    if (v < lo - sub * EPS) continue;
    const n = (v - majors[0]) / step;
    if (Math.abs(n - Math.round(n)) >= EPS) out.push(v);
  }
  return out;
}

/** Minor ticks of a base 10 log axis: 2 to 9 times each power of ten inside the domain. */
export function logMinorTicks(domain: readonly [number, number]): number[] {
  const lo = Math.min(domain[0], domain[1]);
  const hi = Math.max(domain[0], domain[1]);
  if (!(lo > 0)) return [];
  const out: number[] = [];
  for (let k = Math.floor(Math.log10(lo)); k <= Math.ceil(Math.log10(hi)) && out.length < 4000; k++) {
    for (let m = 2; m <= 9; m++) {
      const v = clean(m * 10 ** k);
      if (v >= lo * (1 - EPS) && v <= hi * (1 + EPS)) out.push(v);
    }
  }
  return out;
}

/** A log axis: positive values only, limits at whole powers of the base unless set by hand. */
function resolveLogAxis(input: YAxisInput, cfg: AxisScaleSettings, base: number): YAxisScale {
  const warnings: string[] = [];
  const logb = (v: number) => Math.log(v) / Math.log(base);
  const positive = input.values.filter((v) => Number.isFinite(v) && v > 0);
  let { min, max } = input;
  if (min !== null && !(min > 0)) {
    warnings.push('A log axis needs a minimum above 0; using the automatic minimum.');
    min = null;
  }
  if (max !== null && !(max > 0)) {
    warnings.push('A log axis needs a maximum above 0; using the automatic maximum.');
    max = null;
  }
  if (min !== null && max !== null && min >= max) {
    warnings.push('The minimum must be below the maximum; using automatic limits.');
    min = null;
    max = null;
  }
  let lo: number;
  let hi: number;
  if (positive.length === 0) {
    warnings.push('A log axis needs values above 0; there are none to show.');
    lo = 1;
    hi = base;
  } else {
    const [pLo, pHi] = extent(positive);
    lo = base ** Math.floor(logb(pLo) + EPS);
    hi = base ** Math.ceil(logb(pHi) - EPS);
    if (!(hi > lo)) hi = lo * base;
  }
  lo = min ?? lo;
  hi = max ?? hi;
  if (!(hi > lo)) {
    warnings.push('A manual limit conflicts with the data range; using automatic limits.');
    lo = base ** Math.floor(logb(lo));
    hi = lo * base;
  }
  lo = clean(lo);
  hi = clean(hi);

  // Major ticks: whole powers of the base, every `interval` powers.
  let interval = input.majorInterval;
  if (interval !== null && !(Number.isInteger(interval) && interval >= 1)) {
    warnings.push('The major tick interval of a log axis is a whole number of powers; using automatic ticks.');
    interval = null;
  }
  const k0 = Math.ceil(logb(lo) - EPS);
  const k1 = Math.floor(logb(hi) + EPS);
  const stepPowers = interval ?? Math.max(1, Math.ceil((k1 - k0 + 1) / Math.max(2, input.tickCountHint)));
  const ticks: number[] = [];
  for (let k = k0; k <= k1 && ticks.length < MAX_TICKS_PER_AXIS; k += stepPowers) ticks.push(clean(base ** k));
  const minorTicks = cfg.minorTicks > 0 && base === 10 && stepPowers === 1 ? logMinorTicks([lo, hi]) : [];
  return { domain: [lo, hi], ticks, tickLabel: makeFormatter(cfg, null), warnings, minorTicks, log: base, reverse: cfg.reverse };
}

/** Resolve one numeric axis by its input and its settings. */
export function resolveAxis(input: YAxisInput, cfg: AxisScaleSettings): YAxisScale {
  const base = logBaseOf(cfg.scale);
  if (base !== null) return resolveLogAxis(input, cfg, base);
  const lin = resolveYAxis(input);
  const step = lin.ticks.length > 1 ? lin.ticks[1] - lin.ticks[0] : Math.abs(lin.domain[1] - lin.domain[0]) || 1;
  const minor = linearMinorTicks(lin.domain, lin.ticks, cfg.minorTicks);
  const segments = cfg.reverse ? null : segmentsOf(lin.domain, cfg.breaks ?? []);
  const shared = { ...lin, tickLabel: makeFormatter(cfg, step), log: null, reverse: cfg.reverse };
  if (!segments) return { ...shared, minorTicks: minor };
  // Ticks only where there is axis; a stretch of axis too short for a tick gets its end values as ticks.
  const inside = (v: number) => segments.some((s) => v >= s.lo - EPS * (s.hi - s.lo) && v <= s.hi + EPS * (s.hi - s.lo));
  const ticks = lin.ticks.filter(inside);
  for (const s of segments) if (!ticks.some((t) => t >= s.lo - EPS && t <= s.hi + EPS)) ticks.push(clean(s.lo), clean(s.hi));
  return { ...shared, ticks: [...new Set(ticks)].sort((a, b) => a - b), minorTicks: minor.filter(inside), segments, gapPt: Math.max(BREAK_GAP_PT, (cfg.tickFontSizePt ?? 0) * 1.3) };
}

/** Room between two stretches of a broken axis, pt (spec 6.6 asks for 6 pt; drawn at 12 pt). */
export const BREAK_GAP_PT = 12;

/**
 * The stretches of a domain that are left when the breaks are taken out, or null when there is nothing to break (no break
 * falls inside the domain, or the breaks would leave nothing).
 */
export function segmentsOf(domain: readonly [number, number], breaks: readonly AxisBreak[]): Array<{ lo: number; hi: number }> | null {
  const lo = Math.min(domain[0], domain[1]);
  const hi = Math.max(domain[0], domain[1]);
  const gaps = breaks
    .map((b) => ({ from: Math.max(b.from, lo), to: Math.min(b.to, hi) }))
    .filter((g) => g.to > g.from)
    .sort((a, b) => a.from - b.from);
  if (gaps.length === 0) return null;
  const out: Array<{ lo: number; hi: number }> = [];
  let at = lo;
  for (const g of gaps) {
    if (g.from > at) out.push({ lo: at, hi: g.from });
    at = Math.max(at, g.to);
  }
  if (hi > at) out.push({ lo: at, hi });
  return out.length >= 2 ? out : null;
}

interface PlacedSegment {
  lo: number;
  hi: number;
  /** Where the low and the high end of the stretch are along the axis, pt. */
  p0: number;
  p1: number;
}

/** The stretches of a broken axis placed along it: lengths in proportion to their ranges, a fixed gap between. */
function placeSegments(scale: Pick<YAxisScale, 'segments' | 'gapPt'>, origin: number, span: number): PlacedSegment[] | null {
  const segs = scale.segments;
  if (!segs || segs.length < 2) return null;
  const dir = span < 0 ? -1 : 1;
  const total = Math.abs(span);
  const gap = Math.min(scale.gapPt ?? BREAK_GAP_PT, (total * 0.15) / (segs.length - 1));
  const usable = total - gap * (segs.length - 1);
  const range = segs.reduce((a, s) => a + (s.hi - s.lo), 0);
  let at = origin;
  return segs.map((s) => {
    const length = (usable * (s.hi - s.lo)) / range;
    const placed = { lo: s.lo, hi: s.hi, p0: at, p1: at + dir * length };
    at = placed.p1 + dir * gap;
    return placed;
  });
}

/** The pieces of axis that are drawn, as ranges along it (low to high, pt); null for an axis without breaks. */
export function axisPieces(scale: Pick<YAxisScale, 'segments' | 'gapPt'>, origin: number, span: number): Array<[number, number]> | null {
  return placeSegments(scale, origin, span)?.map((s) => [Math.min(s.p0, s.p1), Math.max(s.p0, s.p1)] as [number, number]) ?? null;
}

/** Where the gaps of a broken axis are, as ranges along it (pt). */
export function axisGaps(scale: Pick<YAxisScale, 'segments' | 'gapPt'>, origin: number, span: number): Array<[number, number]> {
  const placed = placeSegments(scale, origin, span);
  if (!placed) return [];
  return placed.slice(0, -1).map((s, i) => {
    const [a, b] = [s.p1, placed[i + 1].p0];
    return [Math.min(a, b), Math.max(a, b)] as [number, number];
  });
}

/** True when the value has a position on the axis: any finite value on a linear axis, only values above 0 on a log one. */
export const onAxis = (scale: Pick<YAxisScale, 'log'>, v: number): boolean => Number.isFinite(v) && (!scale.log || v > 0);

/**
 * Position of a value along an axis that starts at `origin` and runs `span` (negative for a Y axis, which runs up):
 * the low end of the domain sits at the origin, or at the far end when the axis is reversed. A value with no
 * position (at or below 0 on a log axis) gives NaN.
 */
export function axisMapper(scale: Pick<YAxisScale, 'domain' | 'log' | 'reverse' | 'segments' | 'gapPt'>, origin: number, span: number): (v: number) => number {
  const placed = scale.log || scale.reverse ? null : placeSegments(scale, origin, span);
  if (placed) {
    const last = placed.length - 1;
    return (v) => {
      if (!Number.isFinite(v)) return NaN;
      const at = (s: PlacedSegment) => s.p0 + ((v - s.lo) / (s.hi - s.lo)) * (s.p1 - s.p0);
      if (v <= placed[0].hi) return at(placed[0]);
      if (v >= placed[last].lo) return at(placed[last]);
      for (let i = 0; i < last; i++) {
        const [a, b] = [placed[i], placed[i + 1]];
        if (v >= a.lo && v <= a.hi) return at(a);
        // Inside a gap a value has no place: it goes to the nearer end, so what is drawn there is cut off by the gap.
        if (v > a.hi && v < b.lo) return v - a.hi <= b.lo - v ? a.p1 : b.p0;
      }
      return at(placed[last]);
    };
  }
  const [d0, d1] = scale.domain;
  const start = scale.reverse ? origin + span : origin;
  const length = scale.reverse ? -span : span;
  if (scale.log) {
    const l0 = Math.log(d0);
    const l1 = Math.log(d1);
    return (v) => (v > 0 ? start + ((Math.log(v) - l0) / (l1 - l0)) * length : NaN);
  }
  return (v) => start + ((v - d0) / (d1 - d0)) * length;
}

/** The stretches of data values that a broken axis leaves out, in data units; none for an unbroken, log or reversed axis. */
export function dataGaps(scale: Pick<YAxisScale, 'segments' | 'log' | 'reverse'>): Array<[number, number]> {
  const segs = scale.segments;
  if (!segs || segs.length < 2 || scale.log || scale.reverse) return [];
  return segs.slice(0, -1).map((s, i) => [s.hi, segs[i + 1].lo] as [number, number]);
}

/** True when the value lies strictly inside a gap of the axis: it has no place there and is not drawn. */
export const inBreak = (scale: Pick<YAxisScale, 'segments' | 'log' | 'reverse'>, v: number): boolean => dataGaps(scale).some(([a, b]) => v > a && v < b);

/** True when a value can be drawn on the axis: it has a position (not 0 or less on a log axis) and is not inside an omitted range. */
export const placeable = (scale: Pick<YAxisScale, 'segments' | 'log' | 'reverse'>, v: number): boolean => onAxis(scale, v) && !inBreak(scale, v);

interface DataPoint {
  x: number;
  y: number;
}

/** The parts of the segment p0-p1 (as ranges of t in 0..1) that lie outside every gap of both axes. */
function retainedRanges(p0: DataPoint, p1: DataPoint, xGaps: ReadonlyArray<[number, number]>, yGaps: ReadonlyArray<[number, number]>): Array<[number, number]> {
  const forbidden: Array<[number, number]> = [];
  const forbid = (v0: number, v1: number, gaps: ReadonlyArray<[number, number]>) => {
    for (const [a, b] of gaps) {
      if (v0 === v1) {
        if (v0 > a && v0 < b) forbidden.push([0, 1]);
        continue;
      }
      const ta = (a - v0) / (v1 - v0);
      const tb = (b - v0) / (v1 - v0);
      forbidden.push([Math.min(ta, tb), Math.max(ta, tb)]);
    }
  };
  forbid(p0.x, p1.x, xGaps);
  forbid(p0.y, p1.y, yGaps);
  forbidden.sort((a, b) => a[0] - b[0]);
  const out: Array<[number, number]> = [];
  let at = 0;
  for (const [a, b] of forbidden) {
    if (b <= at) continue;
    if (a > at) out.push([at, Math.min(a, 1)]);
    at = Math.max(at, b);
    if (at >= 1) break;
  }
  if (at < 1) out.push([at, 1]);
  return out.filter(([a, b]) => b > a);
}

/**
 * The lines through a sequence of data points (null ends a line), cut in data coordinates where they cross the gaps of
 * broken axes: each cut lies exactly on the edge of a gap, so the relationship drawn is the one in the data. Points inside a
 * gap are not part of any line. Each returned line is a list of data points.
 */
export function polylinesThroughBreaks(seq: ReadonlyArray<DataPoint | null>, xAxis: Pick<YAxisScale, 'segments' | 'log' | 'reverse'>, yAxis: Pick<YAxisScale, 'segments' | 'log' | 'reverse'>): DataPoint[][] {
  const xGaps = dataGaps(xAxis);
  const yGaps = dataGaps(yAxis);
  const hidden = (p: DataPoint) => xGaps.some(([a, b]) => p.x > a && p.x < b) || yGaps.some(([a, b]) => p.y > a && p.y < b);
  const at = (p0: DataPoint, p1: DataPoint, t: number): DataPoint => (t <= 0 ? p0 : t >= 1 ? p1 : { x: p0.x + t * (p1.x - p0.x), y: p0.y + t * (p1.y - p0.y) });
  const parts: DataPoint[][] = [];
  let cur: DataPoint[] | null = null;
  let prev: DataPoint | null = null;
  for (const item of seq) {
    if (item === null) {
      prev = null;
      cur = null;
      continue;
    }
    if (prev === null) {
      cur = hidden(item) ? null : [item];
      if (cur) parts.push(cur);
      prev = item;
      continue;
    }
    const ranges = retainedRanges(prev, item, xGaps, yGaps);
    if (ranges.length === 0) cur = null;
    for (const [ta, tb] of ranges) {
      const a = at(prev, item, ta);
      const b = at(prev, item, tb);
      if (ta === 0 && cur) cur.push(b);
      else {
        cur = [a, b];
        parts.push(cur);
      }
      if (tb < 1) cur = null;
    }
    prev = item;
  }
  return parts;
}

/** Path data for lines cut by polylinesThroughBreaks: one stroke for each run of two points or more, Y mapped from data to the page. */
export function pathOfRuns(runs: ReadonlyArray<ReadonlyArray<DataPoint>>, toY: (v: number) => number, fmt: (v: number) => number | string = (v) => v): string {
  return runs
    .filter((run) => run.length >= 2)
    .map((run) => run.map((p, i) => `${i === 0 ? 'M' : 'L'}${fmt(p.x)},${fmt(toY(p.y))}`).join(''))
    .join('');
}
