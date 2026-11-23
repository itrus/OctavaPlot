/**
 * Statistical summaries. Pure functions of observation values: no dependence
 * on colours, symbol sizes, axis ranges or any other presentation setting.
 */

import type { CentreKind, Observation, SpreadKind, SummarySpec } from '../model/types';
import { cachedCalc } from './calcCache';
import { quantile6 } from './distribution';
import { meanOf, sdOf, neumaierSum, scaledMoments } from './moments';
import { medianCiRank, studentTQuantileUpper } from './special';

export interface GroupSummary {
  /** Number of valid (finite, non-missing) observations. */
  n: number;
  /** Arithmetic mean; null when n = 0. */
  mean: number | null;
  /** Sample standard deviation (n - 1 denominator); null when n < 2. */
  sd: number | null;
  /** Standard error of the mean, SD / sqrt(n); null when n < 2. */
  sem: number | null;
}

function validValues(values: ReadonlyArray<number | null | undefined>): number[] {
  const out: number[] = [];
  for (const v of values) {
    if (typeof v === 'number' && Number.isFinite(v)) out.push(v);
  }
  return out;
}

export function summarize(values: ReadonlyArray<number | null | undefined>): GroupSummary {
  const xs = validValues(values);
  const n = xs.length;
  if (n === 0) return { n, mean: null, sd: null, sem: null };

  const mean = meanOf(xs);
  if (n === 1) return { n, mean, sd: null, sem: null };

  const sd = sdOf(xs, mean);
  return { n, mean, sd, sem: sd / Math.sqrt(n) };
}

// ---------------------------------------------------------------------------
// Summary calculations (spec 9.1). Defaults and thresholds marked P are project choices.
// ---------------------------------------------------------------------------

/** Bump when a calculation changes so cached results are not reused. */
export const SUMMARY_ALGORITHM_VERSION = 1;

/** Spread options allowed per centre (spec 4.2 L229-231). */
export const SPREADS_BY_CENTRE: Record<CentreKind, readonly SpreadKind[]> = {
  mean: ['none', 'sd', 'sem', 'ci', 'range'],
  geometricMean: ['none', 'gsd', 'ci'],
  median: ['none', 'iqr', 'range', 'ci'],
};

/** Warning classes of spec 21.5 L1460-1463. */
type Severity = 'informational' | 'visual' | 'blocking';

type UnavailableCode =
  | 'n-too-small'
  | 'coverage'
  | 'too-large'
  | 'level-range'
  | 'nonfinite'
  | 'not-allowed';

/** A calculation message. Never contains group names; the caller adds context. */
export interface Notice {
  code: UnavailableCode | 'no-data' | 'invalid-omitted' | 'invalid-rejected' | 'interval-invalid' | 'ties';
  severity: Severity;
  message: string;
}

interface IntervalResult {
  /** none = no spread chosen; unavailable = chosen but not computable (or not allowed for the centre). */
  status: 'none' | 'ok' | 'unavailable';
  lower: number | null;
  upper: number | null;
  /** Achieved coverage; set for median CI only. */
  coverage: number | null;
  code: UnavailableCode | null;
}

export interface GroupStats {
  /** Valid observations used. */
  n: number;
  /** Observations that are null/undefined (never treated as zero). */
  missing: number;
  /** Non-finite values, plus non-positive values for the geometric mean. */
  invalid: number;
  centreKind: CentreKind;
  /** Stored spread; never rewritten. */
  spread: SpreadKind;
  /** The spread actually computed: stored spread when allowed for the centre, else none. */
  effectiveSpread: SpreadKind;
  /** The level of the interval; null when the spread is not a confidence interval (so a level edit finds the same cached result). */
  confidenceLevel: number | null;
  /** The only source of the centre value for drawing. */
  centre: number | null;
  /** The only source of interval endpoints for drawing. */
  interval: IntervalResult;
  /** True when the small-sample reject policy (P) removed the summary. */
  rejected: boolean;
  notices: Notice[];
}

export const SPREAD_NAME: Record<SpreadKind, string> = {
  none: 'None',
  sd: 'SD',
  sem: 'SEM',
  ci: 'CI',
  range: 'Range',
  iqr: 'IQR',
  gsd: 'Geometric SD',
};

const CENTRE_LOWER: Record<CentreKind, string> = {
  mean: 'mean',
  geometricMean: 'geometric mean',
  median: 'median',
};

export function effectiveSpreadOf(centre: CentreKind, spread: SpreadKind): SpreadKind {
  return SPREADS_BY_CENTRE[centre].includes(spread) ? spread : 'none';
}

/** Lower-case centre name for sentences. */
export function centreLower(centre: CentreKind): string {
  return CENTRE_LOWER[centre];
}

/** 0.95 -> "95%", 0.96875 -> "96.875%"; trailing zeros dropped. */
export function formatPercent(level: number): string {
  return `${Number((level * 100).toPrecision(12))}%`;
}

export function isValidConfidence(level: number): boolean {
  return typeof level === 'number' && level > 0 && level < 1;
}

function intervalLabel(centre: CentreKind, spread: SpreadKind): string {
  if (spread === 'ci') {
    const name = CENTRE_LOWER[centre];
    return `${name.charAt(0).toUpperCase()}${name.slice(1)} CI`;
  }
  return SPREAD_NAME[spread];
}

const NO_INTERVAL: IntervalResult = { status: 'none', lower: null, upper: null, coverage: null, code: null };

function unavailable(code: UnavailableCode): IntervalResult {
  return { status: 'unavailable', lower: null, upper: null, coverage: null, code };
}

function minN(spread: SpreadKind): number {
  return spread === 'iqr' ? 4 : 2;
}

/**
 * Centre and interval of one data set (spec 9.1). Order: classify, invalid policy, n = 0, centre
 * (compensated sum; logs for geometric; type-6 median), non-finite guard, spread.
 */
export function computeGroupStats(
  values: ReadonlyArray<number | null | undefined>,
  spec: SummarySpec,
): GroupStats {
  const geometric = spec.centre === 'geometricMean';
  const effective = effectiveSpreadOf(spec.centre, spec.spread);
  const xs: number[] = [];
  let missing = 0;
  let invalid = 0;
  for (const v of values) {
    if (v === null || v === undefined) missing += 1;
    else if (typeof v !== 'number' || !Number.isFinite(v) || (geometric && v <= 0)) invalid += 1;
    else xs.push(v);
  }
  const n = xs.length;
  const notices: Notice[] = [];
  const result = (centre: number | null, interval: IntervalResult, rejected = false): GroupStats => ({
    n,
    missing,
    invalid,
    centreKind: spec.centre,
    spread: spec.spread,
    effectiveSpread: effective,
    confidenceLevel: effective === 'ci' ? spec.confidenceLevel : null,
    centre,
    interval,
    rejected,
    notices,
  });

  if (invalid > 0) {
    const plural = invalid === 1 ? '' : 's';
    const what = geometric
      ? `${invalid} non-positive or non-finite value${plural}`
      : `${invalid} non-finite value${plural}`;
    if (spec.invalidPolicy === 'rejectGroup') {
      notices.push({
        code: 'invalid-rejected',
        severity: 'visual',
        message: `${what} found; the data set summary is not drawn (reject policy).`,
      });
      return result(null, NO_INTERVAL, true);
    }
    notices.push({
      code: 'invalid-omitted',
      severity: 'visual',
      message: `${what} omitted from the ${CENTRE_LOWER[spec.centre]}.`,
    });
  }
  if (n === 0) {
    notices.push({
      code: 'no-data',
      severity: 'visual',
      message: `No valid observations, so no ${CENTRE_LOWER[spec.centre]} can be drawn.`,
    });
    return result(null, NO_INTERVAL);
  }

  // Only the median, the range and the IQR read the sorted values.
  const needsSort = spec.centre === 'median' || effective === 'range' || effective === 'iqr';
  const sorted = needsSort ? sortAscending(xs) : xs;
  const logs = geometric ? xs.map((x) => Math.log(x)) : null;
  const logMean = logs ? meanOf(logs) : 0;
  const centre = geometric
    ? Math.exp(logMean)
    : spec.centre === 'median'
      ? quantile6(sorted, 0.5)
      : meanOf(xs);
  if (!Number.isFinite(centre)) {
    notices.push({
      code: 'nonfinite',
      severity: 'visual',
      message: `The ${CENTRE_LOWER[spec.centre]} is not a finite number; nothing is drawn.`,
    });
    return result(null, NO_INTERVAL);
  }

  // A stored spread that is not allowed for the centre is kept, but inactive.
  if (spec.spread !== 'none' && effective === 'none') {
    notices.push({
      code: 'not-allowed',
      severity: 'informational',
      message: `${SPREAD_NAME[spec.spread]} is not available for the ${CENTRE_LOWER[spec.centre]}; no error bar is drawn.`,
    });
    return result(centre, unavailable('not-allowed'));
  }
  if (effective === 'none') return result(centre, NO_INTERVAL);

  const label = intervalLabel(spec.centre, effective);
  const level = spec.confidenceLevel;
  const fail = (code: UnavailableCode, message: string, small: boolean): GroupStats => {
    // P semantics: reject hides the data set summary marks and keeps the raw points.
    if (small && spec.smallSamplePolicy === 'reject') {
      notices.push({
        code,
        severity: 'visual',
        message: `${message} The data set summary is not drawn (reject policy).`,
      });
      return result(null, unavailable(code), true);
    }
    notices.push({ code, severity: 'visual', message });
    return result(centre, unavailable(code));
  };
  const levelMessage = 'The confidence level must be greater than 0% and less than 100%; no interval is drawn.';

  if (effective === 'ci' && !isValidConfidence(level)) return fail('level-range', levelMessage, false);
  if (n < minN(effective)) {
    return fail('n-too-small', `${label} is undefined for n = ${n}; no error bar is drawn.`, true);
  }

  let lower: number;
  let upper: number;
  let coverage: number | null = null;
  let centreBased = true;
  switch (effective) {
    case 'sd':
    case 'sem': {
      const sd = sdOf(xs, centre);
      const h = effective === 'sd' ? sd : sd / Math.sqrt(n);
      lower = centre - h;
      upper = centre + h;
      break;
    }
    case 'gsd': {
      const lsd = sdOf(logs!, logMean);
      lower = Math.exp(logMean - lsd);
      upper = Math.exp(logMean + lsd);
      break;
    }
    case 'range':
      lower = sorted[0];
      upper = sorted[n - 1];
      centreBased = false;
      break;
    case 'iqr':
      lower = quantile6(sorted, 0.25);
      upper = quantile6(sorted, 0.75);
      centreBased = false;
      break;
    default: {
      // Confidence interval.
      if (spec.centre === 'median') {
        centreBased = false;
        const rank = medianCiRank(n, level);
        if (!rank.available) {
          if (rank.reason === 'too-large') {
            return fail('too-large', `The exact median CI is not computed for n = ${n}; no error bar is drawn.`, false);
          }
          if (rank.reason === 'invalid-level') return fail('level-range', levelMessage, false);
          return fail(
            'coverage',
            `The ${formatPercent(level)} median CI is unavailable: the widest finite interval (min-max) covers only ${formatPercent(rank.widestCoverage ?? 0)}.`,
            true,
          );
        }
        lower = sorted[rank.k - 1];
        upper = sorted[n - rank.k];
        coverage = rank.coverage;
        // Ties can make the interval conservative (spec 9.1 L656).
        if (sorted.some((v, i) => i > 0 && v === sorted[i - 1])) {
          notices.push({
            code: 'ties',
            severity: 'informational',
            message: 'Tied values can make the median CI conservative.',
          });
        }
        break;
      }
      const t = studentTQuantileUpper((1 - level) / 2, n - 1);
      if (!Number.isFinite(t)) {
        return fail('level-range', 'The confidence level cannot be resolved to a t multiplier; no interval is drawn.', false);
      }
      if (logs) {
        const h = t * (sdOf(logs, logMean) / Math.sqrt(n));
        lower = Math.exp(logMean - h);
        upper = Math.exp(logMean + h);
      } else {
        const h = t * (sdOf(xs, centre) / Math.sqrt(n));
        lower = centre - h;
        upper = centre + h;
      }
    }
  }

  if (!Number.isFinite(lower) || !Number.isFinite(upper)) {
    return fail('nonfinite', `${label} is not finite; no error bar is drawn.`, false);
  }
  // Defensive guard, spec 9.2 L679: endpoints ordered; centre inside only for centre-based spreads.
  if (lower > upper || (centreBased && !(lower <= centre && centre <= upper))) {
    notices.push({
      code: 'interval-invalid',
      severity: 'blocking',
      message: `Internal error: ${label} endpoints are inconsistent; no error bar is drawn.`,
    });
    return result(centre, unavailable('nonfinite'));
  }
  return result(centre, { status: 'ok', lower, upper, coverage, code: null });
}

const SMALL_SUMMARY = 64;

/** The values as the cache identity wants them (a missing value as null), made once for each array object. */
const cacheDataOf = new WeakMap<object, Array<number | null>>();
function cacheData(values: ReadonlyArray<number | null | undefined>): Array<number | null> {
  let data = cacheDataOf.get(values);
  if (!data) {
    data = values.map((v) => (v === undefined || v === null ? null : v));
    cacheDataOf.set(values, data);
  }
  return data;
}

/** A sorted copy, through a typed array (a numeric sort without a comparison function call for each pair). */
function sortAscending(xs: readonly number[]): number[] {
  return Array.from(Float64Array.from(xs).sort());
}

/** The settings that affect a summary: the same for every way of asking for one. */
function summaryParams(spec: SummarySpec): { method: string; params: Array<string | number | null>; level: number | null } {
  const effective = effectiveSpreadOf(spec.centre, spec.spread);
  return {
    method: `${spec.centre}/${spec.spread}`,
    params: [spec.invalidPolicy, effective === 'none' ? null : spec.smallSamplePolicy],
    level: effective === 'ci' ? spec.confidenceLevel : null,
  };
}

/**
 * computeGroupStats kept by its identity (the values, the settings that affect the result and the algorithm version), so
 * a style edit that rebuilds a chart does not calculate the same summary again. The result is shared: do not change it.
 */
export function summaryOf(values: ReadonlyArray<number | null | undefined>, spec: SummarySpec): GroupStats {
  // Below this many values the calculation is quicker than hashing the data for the cache.
  if (values.length < SMALL_SUMMARY) return computeGroupStats(values, spec);
  const { method, params, level } = summaryParams(spec);
  const data = cacheData(values);
  return cachedCalc({ kind: 'summary', algorithm: SUMMARY_ALGORITHM_VERSION, data, method, params, level }, () => computeGroupStats(values, spec));
}

/** The values of an observation list, made once for each list object (a cache lookup does not walk the data again). */
const valuesOf = new WeakMap<ReadonlyArray<Observation>, Array<number | null>>();

/** Cached computeGroupStats keyed by only the settings that affect the result. */
export function statsFor(observations: ReadonlyArray<Observation>, spec: SummarySpec): GroupStats {
  let values = valuesOf.get(observations);
  if (!values) {
    values = observations.map((o) => o.value);
    valuesOf.set(observations, values);
  }
  return summaryOf(values, spec);
}

/** An interval, or null when it cannot be computed. */
interface Interval {
  lower: number;
  upper: number;
}

/**
 * Descriptive statistics of one column of values (a "column analysis"). Every field is null when it cannot be
 * computed from the values (too few, or the wrong sign for a geometric mean); it is never a stand-in
 * number. Missing cells are not zero: they are left out and counted separately.
 */
export interface Descriptive {
  /** Valid numbers used. */
  n: number;
  /** Empty cells among the cells given (a table keeps spare empty rows, so this is not shown as a result). */
  missing: number;
  min: number | null;
  q1: number | null;
  median: number | null;
  q3: number | null;
  max: number | null;
  range: number | null;
  p10: number | null;
  p90: number | null;
  /** Exact order-statistic interval of the median, and the coverage actually achieved (spec 9.1). */
  medianCi: Interval | null;
  medianCoverage: number | null;
  mean: number | null;
  sd: number | null;
  sem: number | null;
  meanCi: Interval | null;
  /** Coefficient of variation, percent. */
  cv: number | null;
  geoMean: number | null;
  /** The multiplicative factor: exp of the SD of the logs. */
  geoSdFactor: number | null;
  geoMeanCi: Interval | null;
  /** Sample skewness G1 (needs 3 values). */
  skewness: number | null;
  /** Sample excess kurtosis G2 (needs 4 values). */
  kurtosis: number | null;
  sum: number | null;
}

/** t interval of the mean of `xs` (n >= 2) at `level`. */
function tInterval(xs: ReadonlyArray<number>, level: number): Interval | null {
  const n = xs.length;
  if (n < 2) return null;
  const m = meanOf(xs);
  const se = sdOf(xs, m) / Math.sqrt(n);
  const t = studentTQuantileUpper((1 - level) / 2, n - 1);
  return Number.isFinite(t) ? { lower: m - t * se, upper: m + t * se } : null;
}

/** Raise when the numbers describeValues gives change, so that no cached result of the old algorithm is shown. */
const DESCRIPTIVE_ALGORITHM_VERSION = 1;

/**
 * describeValues kept by its identity (the values and the level), for a caller that asks again and again about the same array of values
 * (a text of a graph with result tokens is drawn on every edit). The array must not be changed afterwards. Short lists are computed
 * directly, which is quicker than hashing them. The result is shared: do not change it.
 */
export function describeValuesCached(values: ReadonlyArray<number | null>, level = 0.95): Descriptive {
  if (values.length < 64) return describeValues(values, level);
  return cachedCalc({ kind: 'descriptive', algorithm: DESCRIPTIVE_ALGORITHM_VERSION, data: values, method: 'describe', level }, () => describeValues(values, level));
}

/** Descriptive statistics of `values` (nulls are missing), with confidence intervals at `level` (0 < level < 1). */
export function describeValues(values: ReadonlyArray<number | null | undefined>, level = 0.95): Descriptive {
  const xs: number[] = [];
  let missing = 0;
  for (const v of values) {
    if (v === null || v === undefined) missing++;
    else if (Number.isFinite(v)) xs.push(v);
  }
  const n = xs.length;
  const none: Descriptive = {
    n, missing, min: null, q1: null, median: null, q3: null, max: null, range: null, p10: null, p90: null, medianCi: null, medianCoverage: null,
    mean: null, sd: null, sem: null, meanCi: null, cv: null, geoMean: null, geoSdFactor: null, geoMeanCi: null, skewness: null, kurtosis: null, sum: null,
  };
  if (n === 0) return none;
  const sorted = [...xs].sort((a, b) => a - b);
  const mean = meanOf(xs);
  const sd = n >= 2 ? sdOf(xs, mean) : null;
  const ok = level > 0 && level < 1;

  // Median interval: the exact order-statistic rule; when the level cannot be reached, the widest coverage is reported.
  let medianCi: Interval | null = null;
  let medianCoverage: number | null = null;
  const rank = ok ? medianCiRank(n, level) : null;
  if (rank?.available) {
    medianCi = { lower: sorted[rank.k - 1], upper: sorted[n - rank.k] };
    medianCoverage = rank.coverage;
  } else if (rank && rank.widestCoverage !== null) medianCoverage = rank.widestCoverage;

  // Geometric mean: all values positive; the t interval of the logs, back-transformed.
  const positive = sorted[0] > 0;
  const logs = positive ? xs.map(Math.log) : [];
  const logMean = positive ? meanOf(logs) : null;
  const logCi = positive && ok ? tInterval(logs, level) : null;

  // Skewness and excess kurtosis with the usual small-sample corrections.
  let skewness: number | null = null;
  let kurtosis: number | null = null;
  const mo = n >= 3 ? scaledMoments(xs, mean) : null;
  if (mo && mo.m2 > 0) {
    skewness = (Math.sqrt(n * (n - 1)) / (n - 2)) * (mo.m3 / mo.m2 ** 1.5);
    if (n >= 4) kurtosis = ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * (mo.m4 / (mo.m2 * mo.m2) - 3) + 6);
  }

  return {
    ...none,
    min: sorted[0],
    q1: quantile6(sorted, 0.25),
    median: quantile6(sorted, 0.5),
    q3: quantile6(sorted, 0.75),
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    p10: quantile6(sorted, 0.1),
    p90: quantile6(sorted, 0.9),
    medianCi,
    medianCoverage,
    mean,
    sd,
    sem: sd === null ? null : sd / Math.sqrt(n),
    meanCi: ok ? tInterval(xs, level) : null,
    cv: sd !== null && mean !== 0 ? (sd / Math.abs(mean)) * 100 : null,
    geoMean: logMean === null ? null : Math.exp(logMean),
    geoSdFactor: positive && n >= 2 ? Math.exp(sdOf(logs, logMean as number)) : null,
    geoMeanCi: logCi ? { lower: Math.exp(logCi.lower), upper: Math.exp(logCi.upper) } : null,
    skewness,
    kurtosis,
    sum: neumaierSum(xs),
  };
}

/** One line of the results sheet. */
interface DescriptiveRow {
  key: string;
  label: string;
  /** Shown a little to the right, as a part of the block above it. */
  indent?: boolean;
  /** A blank spacer line. */
  blank?: boolean;
  /** How the number is written: a count, a percentage, or an ordinary number. */
  format?: 'count' | 'percent' | 'number';
  /** The value of a column on this row, or null for an empty cell. */
  value?: (d: Descriptive) => number | null;
}

const pct = (level: number) => `${Number((level * 100).toPrecision(6))}%`;

/** The rows of the descriptive statistics sheet, in the order of the familiar column analysis. */
export function descriptiveRows(level: number): DescriptiveRow[] {
  const L = pct(level);
  const blank = (key: string): DescriptiveRow => ({ key, label: '', blank: true });
  return [
    { key: 'n', label: 'Number of values', format: 'count', value: (d) => d.n },
    blank('b1'),
    { key: 'min', label: 'Minimum', value: (d) => d.min },
    { key: 'q1', label: '25% Percentile', value: (d) => d.q1 },
    { key: 'median', label: 'Median', value: (d) => d.median },
    { key: 'q3', label: '75% Percentile', value: (d) => d.q3 },
    { key: 'max', label: 'Maximum', value: (d) => d.max },
    { key: 'range', label: 'Range', value: (d) => d.range },
    blank('b2'),
    { key: 'mean', label: 'Mean', value: (d) => d.mean },
    { key: 'sd', label: 'Std. Deviation', indent: true, value: (d) => d.sd },
    { key: 'sem', label: 'Std. Error of Mean', indent: true, value: (d) => d.sem },
    { key: 'meanLo', label: `Lower ${L} CI of mean`, indent: true, value: (d) => d.meanCi?.lower ?? null },
    { key: 'meanHi', label: `Upper ${L} CI of mean`, indent: true, value: (d) => d.meanCi?.upper ?? null },
    { key: 'cv', label: 'Coefficient of variation', indent: true, format: 'percent', value: (d) => d.cv },
    blank('b7'),
    { key: 'geo', label: 'Geometric mean', value: (d) => d.geoMean },
    { key: 'geoSd', label: 'Geometric SD factor', indent: true, value: (d) => d.geoSdFactor },
    { key: 'geoLo', label: `Lower ${L} CI of geo. mean`, indent: true, value: (d) => d.geoMeanCi?.lower ?? null },
    { key: 'geoHi', label: `Upper ${L} CI of geo. mean`, indent: true, value: (d) => d.geoMeanCi?.upper ?? null },
    blank('b9'),
    { key: 'skew', label: 'Skewness', value: (d) => d.skewness },
    { key: 'kurt', label: 'Kurtosis', value: (d) => d.kurtosis },
    blank('b10'),
    { key: 'sum', label: 'Sum', value: (d) => d.sum },
  ];
}

/** Text of a result: five significant digits, no trailing zeros; a percentage with its sign; empty when not available. */
export function formatResult(v: number | null, format: DescriptiveRow['format'] = 'number'): string {
  if (v === null || !Number.isFinite(v)) return '';
  if (format === 'count') return String(v);
  const text = String(Number(v.toPrecision(5)));
  return format === 'percent' ? `${text}%` : text;
}
