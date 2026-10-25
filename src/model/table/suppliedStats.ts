import type { GroupStats } from '../../stats/summary';
import type { SpreadKind, SummaryFormat } from '../types';
import { summaryFormatInfo } from './tableLayout';

const SUPPLIED_MEANING: Record<string, string> = {
  sd: 'SD (as entered)',
  sem: 'SEM (as entered)',
  cv: 'SD from the %CV entered',
  plusMinus: '+/- error as entered',
  limits: 'upper/lower limits as entered',
};

/**
 * Stats of one row of a "values already calculated" series: the mean (or median) entered, and an interval built from
 * the error entered. An error that is missing or negative leaves the point without an error bar.
 */
export function suppliedStats(format: SummaryFormat, values: ReadonlyArray<number | null>): { stats: GroupStats; meaning: string } | null {
  const info = summaryFormatInfo(format);
  const get = (name: string): number | null => {
    const i = info.columns.indexOf(name);
    const v = i >= 0 ? values[i] : null;
    return v === null || v === undefined || !Number.isFinite(v) ? null : v;
  };
  const mean = get('Mean');
  if (mean === null) return null;
  let lower: number | null = null;
  let upper: number | null = null;
  let spread: SpreadKind = 'none';
  if (info.error === 'limits') {
    upper = get('Upper');
    lower = get('Lower');
    if (lower !== null && upper !== null && lower <= upper) spread = 'range';
    else lower = upper = null;
  } else {
    const raw = info.error === 'sd' ? get('SD') : info.error === 'sem' ? get('SEM') : info.error === 'cv' ? get('%CV') : get('+/- error');
    // A %CV is relative to the mean: with a mean of 0 it fixes no SD, so there is no error to draw.
    const err = raw === null ? null : info.error === 'cv' ? (mean === 0 ? null : (Math.abs(mean) * raw) / 100) : raw;
    if (err !== null && err >= 0) {
      lower = mean - err;
      upper = mean + err;
      spread = info.error === 'sem' ? 'sem' : info.error === 'plusMinus' ? 'range' : 'sd';
    }
  }
  // N is a count of subjects: a positive whole number, else it is unknown (0) and not made up.
  const rawN = get('N');
  const n = rawN !== null && Number.isInteger(rawN) && rawN > 0 ? rawN : null;
  const stats: GroupStats = {
    n: n ?? 0,
    missing: 0,
    invalid: 0,
    centreKind: 'mean',
    spread,
    effectiveSpread: spread,
    confidenceLevel: 0.95,
    centre: mean,
    interval: { status: spread === 'none' ? 'none' : 'ok', lower, upper, coverage: null, code: null },
    rejected: false,
    notices: [],
  };
  return { stats, meaning: SUPPLIED_MEANING[info.error] };
}
