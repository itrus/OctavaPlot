import { meanOf, neumaierSum, scaledMoments, sdOf } from './moments';
import { medianCiRank, studentTQuantileUpper } from './special';
import { quantileType6 } from './summary';

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
    q1: quantileType6(sorted, 0.25),
    median: quantileType6(sorted, 0.5),
    q3: quantileType6(sorted, 0.75),
    max: sorted[n - 1],
    range: sorted[n - 1] - sorted[0],
    p10: quantileType6(sorted, 0.1),
    p90: quantileType6(sorted, 0.9),
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
    { key: 'p10', label: '10% Percentile', value: (d) => d.p10 },
    { key: 'p90', label: '90% Percentile', value: (d) => d.p90 },
    blank('b3'),
    { key: 'medianCiHead', label: `${L} CI of median` },
    { key: 'medianCoverage', label: 'Actual confidence level', indent: true, format: 'percent', value: (d) => (d.medianCoverage === null ? null : d.medianCoverage * 100) },
    { key: 'medianLo', label: 'Lower confidence limit', indent: true, value: (d) => d.medianCi?.lower ?? null },
    { key: 'medianHi', label: 'Upper confidence limit', indent: true, value: (d) => d.medianCi?.upper ?? null },
    blank('b4'),
    { key: 'mean', label: 'Mean', value: (d) => d.mean },
    { key: 'sd', label: 'Std. Deviation', value: (d) => d.sd },
    { key: 'sem', label: 'Std. Error of Mean', value: (d) => d.sem },
    blank('b5'),
    { key: 'meanLo', label: `Lower ${L} CI of mean`, value: (d) => d.meanCi?.lower ?? null },
    { key: 'meanHi', label: `Upper ${L} CI of mean`, value: (d) => d.meanCi?.upper ?? null },
    blank('b6'),
    { key: 'cv', label: 'Coefficient of variation', format: 'percent', value: (d) => d.cv },
    blank('b7'),
    { key: 'geo', label: 'Geometric mean', value: (d) => d.geoMean },
    { key: 'geoSd', label: 'Geometric SD factor', value: (d) => d.geoSdFactor },
    blank('b8'),
    { key: 'geoLo', label: `Lower ${L} CI of geo. mean`, value: (d) => d.geoMeanCi?.lower ?? null },
    { key: 'geoHi', label: `Upper ${L} CI of geo. mean`, value: (d) => d.geoMeanCi?.upper ?? null },
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
