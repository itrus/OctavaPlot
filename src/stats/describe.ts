/**
 * Plain-language descriptions of summary settings and results. Pure; messages never contain
 * group names (the caller adds context).
 */

import type { CentreKind, SpreadKind, SummarySpec } from '../model/types';
import {
  SPREADS_BY_CENTRE,
  SPREAD_NAME,
  centreLower,
  effectiveSpreadOf,
  formatPercent,
  isValidConfidence,
  type GroupStats,
} from './summary';

export function centreName(centre: CentreKind): string {
  const s = centreLower(centre);
  return `${s.charAt(0).toUpperCase()}${s.slice(1)}`;
}

/** "95%"; an invalid level is shown as-is rather than hidden. */
export function percentLabel(level: number): string {
  return isValidConfidence(level) ? formatPercent(level) : String(level);
}

const SPREAD_OPTION_LABEL: Record<SpreadKind, string> = {
  none: 'None',
  sd: 'SD',
  sem: 'SEM',
  ci: 'Confidence interval',
  range: 'Min-max (range)',
  iqr: 'IQR (Q1 to Q3)',
  gsd: 'Geometric SD (factor)',
};

/** Spread choices offered for a centre (spec 4.2 L229-231). */
export function spreadOptions(centre: CentreKind): { value: SpreadKind; label: string }[] {
  return SPREADS_BY_CENTRE[centre].map((value) => ({ value, label: SPREAD_OPTION_LABEL[value] }));
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

/**
 * Effect of changing the centre on the stored spread. The spread is never rewritten; when it is
 * not allowed for the new centre it stays stored but inactive.
 */
export function centreChangeCompat(
  newCentre: CentreKind,
  spread: SpreadKind,
): { allowed: boolean; effectiveSpread: SpreadKind; note: string | null } {
  const effectiveSpread = effectiveSpreadOf(newCentre, spread);
  const allowed = effectiveSpread === spread;
  return {
    allowed,
    effectiveSpread,
    note: allowed
      ? null
      : `${SPREAD_NAME[spread]} is not available for the ${centreLower(newCentre)}; it stays selected but no error bar is drawn.`,
  };
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

// ---------------------------------------------------------------- Inspector helpers (S24)

/** Which sides of the centre are drawn (spec 9.2 L667). */
export const DIRECTION_HINT =
  'Which sides of the centre are drawn. Showing one side does not change the calculation; the interval is still two-sided.';

/** True when the stored spread is not allowed for the centre and so is inactive. */
export function staleSpread(centre: CentreKind, spread: SpreadKind): boolean {
  return effectiveSpreadOf(centre, spread) !== spread;
}

export interface SpreadSelectModel {
  value: SpreadKind;
  stale: boolean;
  options: { value: SpreadKind; label: string; disabled: boolean }[];
}

/**
 * Options of the "Error bar shows" select. A stale stored spread is kept as ONE disabled, selected
 * option so the control never shows a value other than the stored one (P deviation from spec 4.2
 * L229-231: the spread is not offered, only displayed). Callers and tests count enabled options only.
 */
export function spreadSelectModel(centre: CentreKind, spread: SpreadKind): SpreadSelectModel {
  const options = spreadOptions(centre).map((o) => ({ ...o, disabled: false }));
  const stale = staleSpread(centre, spread);
  if (stale) options.push({ value: spread, label: `${SPREAD_NAME[spread]} (not available for ${centreLower(centre)})`, disabled: true });
  return { value: spread, stale, options };
}

/** Explanation shown beside a stale spread; null when the spread is active. */
export function staleSpreadNote(centre: CentreKind, spread: SpreadKind): string | null {
  return centreChangeCompat(centre, spread).note;
}

const CENTRE_PLURAL: Record<CentreKind, string> = { mean: 'means', geometricMean: 'geometric means', median: 'medians' };

/** Group box titles that follow the centre: "Symbols (means)" for the mean chart, "Lines (median)" for the scatter line. */
export function centreTitles(centre: CentreKind, type: 'bar' | 'scatter' | 'mean'): { symbols: string; lines: string } {
  return {
    symbols: type === 'mean' ? `Symbols (${CENTRE_PLURAL[centre]})` : 'Symbols',
    lines: type === 'scatter' ? `Lines (${centreLower(centre)})` : 'Lines',
  };
}

export interface SummaryControlsState {
  effectiveSpread: SpreadKind;
  stale: boolean;
  /** True when no error bar can be drawn: switched off, or no active spread. */
  errorOff: boolean;
  /** Reason the Error bar shows select is disabled; null when enabled. */
  spreadReason: string | null;
  /** Reason the error bar appearance controls are disabled; null when enabled. */
  appearanceReason: string | null;
  confidenceEnabled: boolean;
  confidenceReason: string | null;
}

/** Which summary controls are usable, with the reason for each disabled one. */
export function describeSummaryControls(input: {
  showErrorBars: boolean;
  centre: CentreKind;
  spread: SpreadKind;
}): SummaryControlsState {
  const effectiveSpread = effectiveSpreadOf(input.centre, input.spread);
  const stale = effectiveSpread !== input.spread;
  const off = !input.showErrorBars;
  const appearanceReason = off
    ? 'Error bars are switched off.'
    : stale
      ? (staleSpreadNote(input.centre, input.spread) as string)
      : effectiveSpread === 'none'
        ? 'Choose what the error bars show first.'
        : null;
  const confidenceReason = off
    ? 'Error bars are switched off.'
    : effectiveSpread !== 'ci'
      ? 'Applies only when the error bar shows a confidence interval.'
      : null;
  return {
    effectiveSpread,
    stale,
    errorOff: appearanceReason !== null,
    spreadReason: off ? 'Error bars are switched off.' : null,
    appearanceReason,
    confidenceEnabled: confidenceReason === null,
    confidenceReason,
  };
}

export type ConfidenceParse =
  | { ok: true; level: number; hint: string | null }
  | { ok: false; error: string };

/** The confidence level field is a percentage: 0 < p < 100. A value of 1 or less is accepted with a hint. */
export function parseConfidencePercent(text: string): ConfidenceParse {
  const raw = text.trim().replace(/%$/, '').trim();
  const p = Number(raw);
  if (raw === '' || !Number.isFinite(p)) return { ok: false, error: 'Enter a percentage, for example 95.' };
  if (p <= 0 || p >= 100) return { ok: false, error: 'Must be greater than 0 and less than 100.' };
  const level = Number((p / 100).toPrecision(12));
  const hint = p <= 1 ? `Read as ${raw}%. Enter 95 for a 95% confidence level.` : null;
  return { ok: true, level, hint };
}

/** The level as the percentage text of the field: 0.95 -> "95". */
export function confidencePercentText(level: number): string {
  return String(Number((level * 100).toPrecision(12)));
}

/** "5 included, 1 missing, 2 invalid, 1 error bar end clipped". Missing and invalid are never called excluded. */
export function describeCounts(stats: GroupStats, clippedEnds = 0): string {
  const parts = [`${stats.n} included`];
  if (stats.missing > 0) parts.push(`${stats.missing} missing`);
  if (stats.invalid > 0) parts.push(`${stats.invalid} invalid`);
  if (clippedEnds > 0) parts.push(`${clippedEnds} error bar end${clippedEnds === 1 ? '' : 's'} clipped`);
  return parts.join(', ');
}

/** e.g. "Mean with SD", used only as a caption, never as a control label. */
export function summaryCaption(spec: SummarySpec, showErrorBars: boolean): string {
  const text = describeSummary(spec);
  if (showErrorBars || effectiveSpreadOf(spec.centre, spec.spread) === 'none') return text;
  return `${text} (error bars hidden)`;
}

const SPREAD_CODES: ReadonlyArray<string> = ['n-too-small', 'coverage', 'too-large', 'level-range', 'interval-invalid', 'ties', 'not-allowed'];

/** True for notices about the interval; the others are about the centre. */
const isIntervalNotice = (stats: GroupStats, n: GroupStats['notices'][number]): boolean =>
  SPREAD_CODES.includes(n.code) || (n.code === 'nonfinite' && stats.centre !== null);

/**
 * Caption lines under "Error bar shows". Global describes the setting; a data set adds the real
 * interval or why it is unavailable, then clipped ends. clippedMessage comes from the caller.
 */
export function intervalCaptionLines(input: {
  spec: SummarySpec;
  stats: GroupStats | null;
  showErrorBars: boolean;
  fmt: (v: number) => string;
  clippedMessage?: string | null;
}): string[] {
  const { spec, stats, showErrorBars, fmt } = input;
  const lines: string[] = [];
  const stale = staleSpreadNote(spec.centre, spec.spread);
  if (stats === null) {
    lines.push(stale ?? `Calculated per data set: ${describeSummary(spec)}.`);
  } else {
    if (stale) lines.push(stale);
    const { interval } = stats;
    if (interval.status === 'ok' && interval.lower !== null && interval.upper !== null) {
      const cov = interval.coverage !== null ? ` (achieved coverage ${formatPercent(interval.coverage)})` : '';
      lines.push(`${describeSummary(spec)}: ${fmt(interval.lower)} to ${fmt(interval.upper)}${cov}`);
    }
    for (const n of stats.notices) if (isIntervalNotice(stats, n) && n.code !== 'not-allowed') lines.push(n.message);
  }
  if (!showErrorBars && effectiveSpreadOf(spec.centre, spec.spread) !== 'none') lines.push('Error bars are hidden; the values are still in the tooltips.');
  if (input.clippedMessage) lines.push(input.clippedMessage);
  return lines;
}

/** Calculation messages about the centre itself (no data, invalid values). Informational notices are left out. */
export function centreNoticeLines(stats: GroupStats): string[] {
  return stats.notices.filter((n) => n.severity !== 'informational' && !isIntervalNotice(stats, n)).map((n) => n.message);
}

/** Text of a data set row in the Data Sets list: "n=5 · mean 3.2". */
export function datasetRowText(stats: GroupStats): string {
  const centre = stats.centre === null ? '' : ` · ${centreLower(stats.centreKind)} ${Number(stats.centre.toPrecision(4))}`;
  return `n=${stats.n}${centre}`;
}
