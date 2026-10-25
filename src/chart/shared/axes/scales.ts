import { format, precisionFixed, ticks as d3Ticks } from 'd3';
import { extent } from '../model/units';

export interface YAxisInput {
  /** Every value that must be visible: means, valid error endpoints, raw points, etc. */
  values: number[];
  /** Bars need the zero baseline inside the domain. */
  includeZero: boolean;
  min: number | null;
  max: number | null;
  majorInterval: number | null;
  /** Approximate number of ticks wanted when the interval is automatic. */
  tickCountHint: number;
}

export interface YAxisScale {
  domain: [number, number];
  ticks: number[];
  tickLabel: (v: number) => string;
  warnings: string[];
  /** Minor tick positions (never the same as a major tick). */
  minorTicks?: number[];
  /** Base of a log scale (positions follow the logarithm); null or absent = linear. */
  log?: number | null;
  /** The axis is drawn the other way round: the largest value where the smallest was. */
  reverse?: boolean;
  /** Breaks: the stretches of the domain that are shown, from low to high; absent = one stretch. */
  segments?: Array<{ lo: number; hi: number }>;
  /** Room between two stretches of a broken axis, pt: at least the height of a number, so the numbers either side of a gap do not touch. */
  gapPt?: number;
}

/** A value rounded to 12 significant digits, so ticks do not carry floating point dust. */
export const clean = (v: number): number => Number(v.toPrecision(12));

function autoDomain(input: YAxisInput): [number, number] {
  const { values, includeZero } = input;
  if (values.length === 0) return [0, 1];
  let [lo, hi] = extent(values);
  if (includeZero) {
    lo = Math.min(lo, 0);
    hi = Math.max(hi, 0);
  }
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    return [lo - (includeZero && lo >= 0 ? 0 : pad), hi + pad];
  }
  const span = hi - lo;
  // 5% headroom beyond the data (not beyond the zero baseline).
  if (!includeZero || lo < 0) lo -= span * 0.05;
  if (!includeZero || hi > 0) hi += span * 0.05;
  return [lo, hi];
}

function niceDomain([lo, hi]: [number, number], interval: number | null, count: number): [number, number] {
  if (interval !== null) {
    return [clean(Math.floor(lo / interval + 1e-9) * interval), clean(Math.ceil(hi / interval - 1e-9) * interval)];
  }
  // d3.nice-equivalent using tick steps.
  const ticks = d3Ticks(lo, hi, count);
  if (ticks.length < 2) return [lo, hi];
  const step = ticks[1] - ticks[0];
  return [clean(Math.floor(lo / step + 1e-9) * step), clean(Math.ceil(hi / step - 1e-9) * step)];
}

function buildTicks(domain: [number, number], interval: number | null, count: number): { ticks: number[]; step: number } {
  const [d0, d1] = domain;
  if (interval !== null) {
    const out: number[] = [];
    const first = Math.ceil(d0 / interval - 1e-9);
    for (let i = first; out.length < 2000; i++) {
      const v = clean(i * interval);
      if (v > d1 + interval * 1e-9) break;
      out.push(v);
    }
    return { ticks: out, step: interval };
  }
  const t = d3Ticks(d0, d1, count).map(clean);
  return { ticks: t, step: t.length > 1 ? t[1] - t[0] : Math.abs(d1 - d0) || 1 };
}

function makeLabel(step: number): (v: number) => string {
  const abs = Math.abs(step);
  if (abs !== 0 && (abs >= 1e6 || abs < 1e-4)) {
    const f = format('.3~e');
    return (v) => f(v).replace('−', '-');
  }
  const p = Math.min(8, precisionFixed(abs || 1));
  const f = format(`.${p}f`);
  return (v) => f(v).replace('−', '-');
}

/** Most ticks one axis may draw; a smaller major interval falls back to automatic ticks. */
export const MAX_TICKS_PER_AXIS = 500;

/** Ticks an interval would draw across a span (the same stepping as buildTicks). */
const tickCountFor = (span: number, interval: number): number => Math.floor(span / interval + 1e-9) + 1;

/**
 * Resolve the linear Y scale. Manual limits override automatic ones; an
 * inconsistent manual pair is ignored with a warning (never silently inverted).
 */
export function resolveYAxis(input: YAxisInput): YAxisScale {
  const warnings: string[] = [];
  let { min, max } = input;
  let interval = input.majorInterval;

  if (interval !== null && !(Number.isFinite(interval) && interval > 0)) {
    warnings.push('Major tick interval must be positive; using automatic ticks.');
    interval = null;
  }
  if (min !== null && max !== null && min >= max) {
    warnings.push('Y minimum must be below the maximum; using automatic limits.');
    min = null;
    max = null;
  }

  // The domain follows the interval (it rounds outwards to it), so it is recomputed when the interval changes.
  let conflicted = false;
  const domainFor = (iv: number | null): [number, number] => {
    const auto = niceDomain(autoDomain(input), iv, input.tickCountHint);
    const d0 = min ?? auto[0];
    const d1 = max ?? auto[1];
    if (d0 >= d1) {
      // Only one manual limit was given and it collides with the automatic other end.
      if (!conflicted) warnings.push('Manual Y limit conflicts with the data range; using automatic limits.');
      conflicted = true;
      min = null;
      max = null;
      return auto;
    }
    return [d0, d1];
  };
  let [d0, d1] = domainFor(interval);

  // Guard against a tiny interval producing an unreasonable number of ticks; the automatic domain is
  // recomputed without the interval, so it is not left rounded outwards to a step that is no longer used.
  if (interval !== null && tickCountFor(d1 - d0, interval) > MAX_TICKS_PER_AXIS) {
    warnings.push('Major tick interval is too small for this range; using automatic ticks.');
    interval = null;
    [d0, d1] = domainFor(null);
  }

  const { ticks, step } = buildTicks([d0, d1], interval, input.tickCountHint);
  return { domain: [d0, d1], ticks, tickLabel: makeLabel(step), warnings };
}

/** What the edit-time validators know about the axis being edited. */
export interface AxisEditContext {
  min: number | null;
  max: number | null;
  majorInterval: number | null;
  /**
   * The resolved domain. It depends on the current major interval, so the validators below are APPROXIMATE
   * edit-time checks that can differ from the resolver by one interval; the resolver's fallback and its
   * warnings remain the authority.
   */
  domain: readonly [number, number];
  /** A log axis: the limits must be above 0 and the interval is a whole number of powers. */
  log?: number | null;
}

const fmtLimit = (v: number): string => String(Number(v.toPrecision(6)));

export function validateAxisMin(v: number, ctx: AxisEditContext): string | null {
  if (ctx.log && !(v > 0)) return 'Must be above 0 on a log axis.';
  const upper = ctx.max ?? ctx.domain[1];
  if (v < upper) return null;
  return `Must be below the ${ctx.max === null ? 'automatic ' : ''}maximum (${fmtLimit(upper)}).`;
}

export function validateAxisMax(v: number, ctx: AxisEditContext): string | null {
  if (ctx.log && !(v > 0)) return 'Must be above 0 on a log axis.';
  const lower = ctx.min ?? ctx.domain[0];
  if (v > lower) return null;
  return `Must be above the ${ctx.min === null ? 'automatic ' : ''}minimum (${fmtLimit(lower)}).`;
}

export function validateAxisInterval(v: number, ctx: AxisEditContext): string | null {
  if (!(v > 0)) return 'Must be greater than 0.';
  if (ctx.log) return Number.isInteger(v) ? null : 'On a log axis the interval is a whole number of powers (1, 2, 3...).';
  const span = ctx.domain[1] - ctx.domain[0];
  if (tickCountFor(span, v) > MAX_TICKS_PER_AXIS) {
    return `Too small for this range: it would draw more than ${MAX_TICKS_PER_AXIS} ticks.`;
  }
  return null;
}

/** The distance between the first two major ticks: in powers of the base on a log axis, in data units otherwise. */
export function majorStepOf(scale: Pick<YAxisScale, 'ticks' | 'log'>): number {
  const t = scale.ticks;
  if (t.length < 2) return 1;
  if (scale.log) return Math.max(1, Math.round(Math.log(t[1] / t[0]) / Math.log(scale.log)));
  return t[1] - t[0];
}
