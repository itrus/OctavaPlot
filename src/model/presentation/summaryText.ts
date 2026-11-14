/**
 * Plain-language descriptions of summary settings and results. Pure; messages never contain
 * group names (the caller adds context).
 */

import type { CentreKind, SpreadKind, SummarySpec } from '../types';
import {
  SPREAD_NAME,
  centreLower,
  effectiveSpreadOf,
  formatPercent,
  isValidConfidence,
  type GroupStats,
} from '../../stats/summary';

export function centreName(centre: CentreKind): string {
  const s = centreLower(centre);
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/** "95%"; an invalid level is shown as-is rather than hidden. */
export function percentLabel(level: number): string {
  return isValidConfidence(level) ? formatPercent(level) : String(level);
}

/** Names a spread; range and IQR are never called a confidence interval. */
export function describeSpread(spread: SpreadKind, level: number, centre: CentreKind = 'mean'): string {
  switch (spread) {
    case 'none':
      return 'no spread';
    case 'sd':
      return 'SD';
    case 'sem':
      return 'SEM';
    case 'ci':
      return `${percentLabel(level)} confidence interval of the ${centreLower(centre)}`;
    case 'range':
      return 'range (min to max)';
    case 'iqr':
      return 'IQR (Q1 to Q3)';
    case 'gsd':
      return 'geometric SD (multiplicative factor)';
  }
}

/** e.g. "Mean with SD", "Median with 95% confidence interval of the median". Uses the effective spread. */
export function describeSummary(spec: SummarySpec): string {
  const spread = effectiveSpreadOf(spec.centre, spec.spread);
  if (spread === 'none') return centreName(spec.centre);
  return `${centreName(spec.centre)} with ${describeSpread(spread, spec.confidenceLevel, spec.centre)}`;
}

function intervalLine(stats: GroupStats, fmt: (v: number) => string, errorHidden: boolean): string | null {
  const { interval } = stats;
  if (interval.status !== 'ok' || interval.lower === null || interval.upper === null) return null;
  const name =
    stats.effectiveSpread === 'ci'
      ? `${percentLabel(stats.confidenceLevel)} CI`
      : stats.effectiveSpread === 'gsd'
        ? 'Geometric SD limits'
        : SPREAD_NAME[stats.effectiveSpread];
  const cov = interval.coverage !== null ? ` (achieved coverage ${formatPercent(interval.coverage)})` : '';
  const hidden = errorHidden ? ' (error bars hidden)' : '';
  return `${name}: ${fmt(interval.lower)} to ${fmt(interval.upper)}${cov}${hidden}`;
}

/**
 * Tooltip lines for one data set summary: n, centre, interval, then calculation notices.
 * hit = 'error' lists the interval before the centre.
 */
export function summaryTooltipLines(
  stats: GroupStats,
  fmt: (v: number) => string,
  opts: { hit?: 'centre' | 'error'; errorHidden?: boolean } = {},
): string[] {
  const lines: string[] = [`n = ${stats.n}`];
  const centre = stats.centre === null ? null : `${centreName(stats.centreKind)}: ${fmt(stats.centre)}`;
  const interval = intervalLine(stats, fmt, opts.errorHidden === true);
  const body = opts.hit === 'error' ? [interval, centre] : [centre, interval];
  for (const l of body) if (l !== null) lines.push(l);
  for (const notice of stats.notices) lines.push(notice.message);
  return lines;
}
