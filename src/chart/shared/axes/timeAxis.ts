import { utcDay, utcHour, utcMinute, utcMonday, utcMonth, utcSecond, utcYear, type TimeInterval } from 'd3';
import { extent } from '../../../model/units';
import type { AxisBreak, AxisConfig } from '../../../model/types';
import { civilFromDays, formatTimeCell, UNIT_SECONDS, type TimeColumn } from '../../../util/timeColumn';
import { segmentsOf, BREAK_GAP_PT } from './axisScale';
import { clean, MAX_TICKS_PER_AXIS, type YAxisInput, type YAxisScale } from './scales';

/**
 * Axes of dates, times and durations (contract section 17). The values are numbers in the unit of their column (days, seconds, or the unit
 * of a duration); this resolves the range, the ticks and the labels, and returns the same `YAxisScale` as a numeric axis, so the geometry
 * of an axis (the position of a value, reversal, breaks) is the one that already exists.
 *
 * Dates and times: ticks fall on calendar boundaries in UTC (the first of a year or month, a Monday, midnight, a full hour, minute or
 * second), never at an even number of days from some start. Durations are not a calendar: ticks are multiples of 1, 2, 5, 10, 15 or 30
 * seconds, minutes or hours, or of 1, 2, 5 days times a power of ten, counted from zero. The scale is always linear: a log axis does not
 * apply (the caller says so), and nothing here is rounded to a month length.
 */

/** The axis settings a time axis depends on. */
type TimeAxisSettings = Pick<AxisConfig, 'reverse' | 'minorTicks'> & { breaks?: AxisBreak[]; tickFontSizePt?: number };

type Level = 'second' | 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

interface Step {
  level: Level;
  /** How many of the level between two ticks. */
  every: number;
  /** About how long that is, seconds (a month and a year are the mean lengths); only for choosing between steps. */
  seconds: number;
  interval: TimeInterval;
}

const MEAN_MONTH = 2629746;
const MEAN_YEAR = 31556952;

const everyOf = (i: { every: (k: number) => TimeInterval | null }, k: number): TimeInterval => i.every(k) as TimeInterval;

/** The calendar steps, from fine to coarse. A step of days is 1 only: every second day would restart at each month's end. */
const CALENDAR_STEPS: readonly Step[] = [
  ...[1, 2, 5, 10, 15, 30].map((k): Step => ({ level: 'second', every: k, seconds: k, interval: everyOf(utcSecond, k) })),
  ...[1, 2, 5, 10, 15, 30].map((k): Step => ({ level: 'minute', every: k, seconds: 60 * k, interval: everyOf(utcMinute, k) })),
  ...[1, 2, 3, 6, 12].map((k): Step => ({ level: 'hour', every: k, seconds: 3600 * k, interval: everyOf(utcHour, k) })),
  { level: 'day', every: 1, seconds: 86400, interval: utcDay },
  { level: 'week', every: 1, seconds: 604800, interval: utcMonday },
  ...[1, 3, 6].map((k): Step => ({ level: 'month', every: k, seconds: MEAN_MONTH * k, interval: everyOf(utcMonth, k) })),
  ...[1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000].map((k): Step => ({ level: 'year', every: k, seconds: MEAN_YEAR * k, interval: everyOf(utcYear, k) })),
];

/** Characters of a label of each level (`2025-03-04 10:30:00` is the widest). */
const LABEL_CHARS: Record<Level, number> = { second: 19, minute: 16, hour: 16, day: 10, week: 10, month: 7, year: 4 };

/** Steps of a duration, in seconds: 1, 2, 5, 10, 15, 30 of a second, a minute and an hour (2, 3, 6, 12 hours), then 1, 2, 5 times a power of ten days. */
const DURATION_STEPS: readonly number[] = (() => {
  const out = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200];
  for (let p = 1; p <= 1e9; p *= 10) out.push(86400 * p, 86400 * 2 * p, 86400 * 5 * p);
  return out;
})();

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

/** The label a calendar tick of this level carries: the least that names the boundary, with the year always present. */
function calendarLabel(ms: number, level: Level): string {
  const d = new Date(ms);
  const day = civilFromDays(Math.floor(ms / 86400000));
  const date = `${pad(day.year, 4)}-${pad(day.month)}-${pad(day.day)}`;
  const clock = `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
  switch (level) {
    case 'year':
      return pad(day.year, 4);
    case 'month':
      return `${pad(day.year, 4)}-${pad(day.month)}`;
    case 'week':
    case 'day':
      return date;
    case 'hour':
    case 'minute':
      return `${date} ${clock}`;
    default:
      return `${date} ${clock}:${pad(d.getUTCSeconds())}`;
  }
}

/** A tick of a duration: `d` for whole-day steps, `h:mm` for steps of minutes, `h:mm:ss` below. */
function durationLabel(seconds: number, stepSeconds: number): string {
  const sign = seconds < 0 ? '-' : '';
  const s = Math.round(Math.abs(seconds));
  if (stepSeconds >= 86400) return `${sign}${s / 86400} d`;
  const [h, m, sec] = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60];
  return stepSeconds >= 60 ? `${sign}${h}:${pad(m)}` : `${sign}${h}:${pad(m)}:${pad(sec)}`;
}

/** The step nearest to the wanted spacing in the ratio sense, among those whose labels still fit; the coarsest when none do. */
function pickByNearest<T>(steps: readonly T[], span: number, count: number, maxCount: (s: T) => number, seconds: (s: T) => number): T {
  const target = span / Math.max(1, count);
  let best: T | null = null;
  let bestDistance = Infinity;
  for (const s of steps) {
    if (span / seconds(s) > maxCount(s)) continue;
    const distance = Math.abs(Math.log(seconds(s) / target));
    if (distance < bestDistance) {
      best = s;
      bestDistance = distance;
    }
  }
  return best ?? steps[steps.length - 1];
}

const DEFAULT_TICK_FONT_PT = 12;

/** The width in pt the labels of a step may take: the axis is about 120 pt for each tick the caller asked for. */
const labelRoom = (hint: number, chars: number, fontPt: number): number => Math.max(2, Math.floor((hint * 120) / (chars * 0.6 * fontPt + 16)));

/** Room on each side of a single value (nothing to measure a range by): a day, an hour, or one of the unit. */
const lone = (time: TimeColumn): number => (time.kind === 'date' ? 1 : time.kind === 'datetime' ? 3600 : 1);

/**
 * Resolve a date, time or duration axis. Limits set by hand are used as they are (in the unit of the column); a pair that cannot be
 * is ignored with a warning, as on a numeric axis. A major tick interval set by hand is not used (the ticks follow the calendar), and
 * minor ticks are drawn on duration axes only; both say so.
 */
export function resolveTimeAxis(input: YAxisInput, cfg: TimeAxisSettings, time: TimeColumn): YAxisScale {
  const warnings: string[] = [];
  if (input.majorInterval !== null) warnings.push('The major tick interval is not used on a date or time axis: ticks fall on calendar boundaries (on multiples of a round step for a duration).');
  if (cfg.minorTicks > 0 && time.kind !== 'duration') warnings.push('Minor ticks are not drawn on a date or time axis.');
  const finite = input.values.filter((v) => Number.isFinite(v));
  let { min, max } = input;
  if (min !== null && max !== null && min >= max) {
    warnings.push('X minimum must be below the maximum; using automatic limits.');
    min = null;
    max = null;
  }

  // Automatic range: the data and 5% each side, as on a numeric axis, then out to the ticks (below).
  let [lo, hi] = finite.length > 0 ? extent(finite) : [0, 1];
  if (finite.length === 0) {
    lo = time.kind === 'duration' ? 0 : lo;
    hi = lo + lone(time) * 2;
  } else if (lo === hi) {
    lo -= lone(time);
    hi += lone(time);
  } else {
    const pad5 = (hi - lo) * 0.05;
    lo -= pad5;
    hi += pad5;
  }

  const unitSeconds = UNIT_SECONDS[time.unit];
  const fontPt = cfg.tickFontSizePt ?? DEFAULT_TICK_FONT_PT;
  const hint = input.tickCountHint;
  const toMs = (v: number): number => v * unitSeconds * 1000;
  const fromMs = (ms: number): number => ms / (unitSeconds * 1000);

  /** The automatic domain with the limits set by hand; one limit that lies beyond the automatic other end gives no domain, so both go. */
  const limited = (auto: [number, number]): [number, number] => {
    const d0 = min ?? auto[0];
    const d1 = max ?? auto[1];
    if (d0 < d1) return [d0, d1];
    warnings.push('Manual X limit conflicts with the data range; using automatic limits.');
    return auto;
  };
  let domain: [number, number];
  let ticks: number[];
  let label: (v: number) => string;

  if (time.kind === 'duration') {
    const lowest = min ?? lo;
    const highest = max ?? hi;
    const span = Math.abs(highest - lowest) * unitSeconds;
    const step = pickByNearest(DURATION_STEPS, span, hint, (s) => labelRoom(hint, s >= 86400 ? 6 : s >= 60 ? 7 : 8, fontPt), (s) => s);
    const stepValue = step / unitSeconds;
    const auto: [number, number] = [clean(Math.floor(lo / stepValue + 1e-9) * stepValue), clean(Math.ceil(hi / stepValue - 1e-9) * stepValue)];
    domain = limited(auto);
    ticks = [];
    for (let k = Math.ceil(domain[0] / stepValue - 1e-9); ticks.length < MAX_TICKS_PER_AXIS; k++) {
      const v = clean(k * stepValue);
      if (v > domain[1] + stepValue * 1e-9) break;
      ticks.push(v);
    }
    const onStep = new Set(ticks);
    label = (v) => (onStep.has(v) ? durationLabel(v * unitSeconds, step) : formatTimeCell(v, time));
  } else {
    const lowest = min ?? lo;
    const highest = max ?? hi;
    const spanSeconds = Math.abs(toMs(highest) - toMs(lowest)) / 1000;
    const steps = time.kind === 'date' ? CALENDAR_STEPS.filter((s) => s.seconds >= 86400) : CALENDAR_STEPS;
    const step = pickByNearest(steps, spanSeconds, hint, (s) => labelRoom(hint, LABEL_CHARS[s.level], fontPt), (s) => s.seconds);
    const auto: [number, number] = [fromMs(step.interval.floor(new Date(toMs(lo))).getTime()), fromMs(step.interval.ceil(new Date(toMs(hi))).getTime())];
    domain = limited(auto);
    // Ticks are the boundaries inside the domain, the domain's own ends included when they are boundaries.
    const found = step.interval.range(new Date(toMs(domain[0])), new Date(toMs(domain[1]) + 1));
    ticks = found.slice(0, MAX_TICKS_PER_AXIS).map((d) => clean(fromMs(d.getTime())));
    const onStep = new Set(ticks);
    label = (v) => (onStep.has(v) ? calendarLabel(toMs(v), step.level) : formatTimeCell(v, time));
  }

  const minor = time.kind === 'duration' && cfg.minorTicks > 0 ? minorDuration(domain, ticks, cfg.minorTicks) : [];
  const segments = cfg.reverse ? null : segmentsOf(domain, cfg.breaks ?? []);
  const shared = { domain, tickLabel: label, warnings, log: null, reverse: cfg.reverse };
  if (!segments) return { ...shared, ticks, minorTicks: minor };
  // Ticks only where there is axis; a stretch too short for a tick gets its end values, written in full since they are not boundaries.
  const eps = 1e-9;
  const inside = (v: number) => segments.some((s) => v >= s.lo - eps * (s.hi - s.lo) && v <= s.hi + eps * (s.hi - s.lo));
  const kept = ticks.filter(inside);
  for (const s of segments) if (!kept.some((t) => t >= s.lo - eps && t <= s.hi + eps)) kept.push(s.lo, s.hi);
  return { ...shared, ticks: [...new Set(kept)].sort((a, b) => a - b), minorTicks: minor.filter(inside), segments, gapPt: Math.max(BREAK_GAP_PT, fontPt * 1.3) };
}

/** Minor ticks of a duration axis: `per` of them, evenly, between two major ticks. */
function minorDuration(domain: readonly [number, number], majors: readonly number[], per: number): number[] {
  if (majors.length < 2) return [];
  const step = majors[1] - majors[0];
  const sub = step / (per + 1);
  const out: number[] = [];
  for (let i = Math.floor((domain[0] - majors[0]) / sub); out.length < 4000; i++) {
    const v = clean(majors[0] + i * sub);
    if (v > domain[1] + sub * 1e-9) break;
    if (v < domain[0] - sub * 1e-9) continue;
    const n = (v - majors[0]) / step;
    if (Math.abs(n - Math.round(n)) >= 1e-9) out.push(v);
  }
  return out;
}
