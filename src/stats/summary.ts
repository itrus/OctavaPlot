/**
 * Statistical summaries. Pure functions of observation values: no dependence
 * on colours, symbol sizes, axis ranges or any other presentation setting.
 */

import type { CentreKind, Observation, SpreadKind, SummarySpec } from '../model/types';
import { cachedCalc } from './calcCache';
import { meanOf, sdOf } from './moments';
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

type ErrorKind = 'sd' | 'sem';

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

/** Error half-length for the chosen kind, or null when unavailable. */
export function errorValue(s: GroupSummary, kind: ErrorKind): number | null {
  return kind === 'sd' ? s.sd : s.sem;
}

/** Warning text when a statistic is undefined for a group, else null. */
export function undefinedStatWarning(
  groupName: string,
  s: GroupSummary,
  errorKind: ErrorKind | 'none',
): string | null {
  if (s.n === 0) return `${groupName}: no valid observations, so no mean can be drawn.`;
  if (errorKind !== 'none' && errorValue(s, errorKind) === null) {
    return `${groupName}: ${errorKind.toUpperCase()} is undefined for n = ${s.n}; no error bar is drawn.`;
  }
  return null;
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
  confidenceLevel: number;
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

/** Type-6 quantile of ascending values (spec 10.1 L704): position p(n+1), clamped to the ends. */
export function quantileType6(sorted: ReadonlyArray<number>, p: number): number {
  const n = sorted.length;
  const h = p * (n + 1);
  if (h <= 1) return sorted[0];
  if (h >= n) return sorted[n - 1];
  const lo = Math.floor(h);
  return sorted[lo - 1] + (h - lo) * (sorted[lo] - sorted[lo - 1]);
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
    confidenceLevel: spec.confidenceLevel,
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

  const sorted = [...xs].sort((a, b) => a - b);
  const logs = geometric ? xs.map((x) => Math.log(x)) : null;
  const logMean = logs ? meanOf(logs) : 0;
  const centre = geometric
    ? Math.exp(logMean)
    : spec.centre === 'median'
      ? quantileType6(sorted, 0.5)
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
      lower = quantileType6(sorted, 0.25);
      upper = quantileType6(sorted, 0.75);
      centreBased = false;
      break;
    default: {
      // Confidence interval.
      if (spec.centre === 'median') {
        centreBased = false;
        const rank = medianCiRank(n, level);
        if (!rank.available) {
          if (rank.reason === 'too-large') {
            return fail('too-large', `The exact median CI is not computed for n = ${n}; no error bar is drawn.`, true);
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
  const { method, params, level } = summaryParams(spec);
  const data = values.map((v) => (v === undefined || v === null ? null : v));
  return cachedCalc({ kind: 'summary', algorithm: SUMMARY_ALGORITHM_VERSION, data, method, params, level }, () => computeGroupStats(values, spec));
}

/** Cached computeGroupStats keyed by only the settings that affect the result. */
export function statsFor(observations: ReadonlyArray<Observation>, spec: SummarySpec): GroupStats {
  return summaryOf(
    observations.map((o) => o.value),
    spec,
  );
}
