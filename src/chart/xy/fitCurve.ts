import type { FitSettings } from '../../model/types';
import { n2 } from '../../model/units';
import { cachedFit } from '../../model/project/curveFit';
import { fitModelById, isFailure, type FitParam, type FitResult } from '../../stats/fit';
import { inBreak, onAxis, polylinesThroughBreaks } from '../shared/axes/axisScale';
import type { YAxisScale } from '../shared/axes/scales';

/** The fitted curve of one XY series, ready to draw (spec 17). */

/** Number of points a curve is drawn with. */
const SAMPLES = 160;
/** A drawn position beyond this is cut off: the plot clips it anyway, and a huge number only bloats the path. */
const FAR = 1e6;

export interface FitSummary {
  modelLabel: string;
  formula: string;
  params: FitParam[];
  n: number;
  df: number;
  rSquared: number | null;
  converged: boolean;
  message: string | null;
}

export interface FittedCurve {
  /** Path data of the curve (empty when there is none), and of the band around it. */
  path: string;
  bandPath: string;
  summary: FitSummary | null;
  /** Why there is no curve; null when there is one. */
  failure: string | null;
}

const NO_FIT: FittedCurve = { path: '', bandPath: '', summary: null, failure: null };

export { fitStats } from '../../model/project/curveFit';

export interface FitRun {
  result: FitResult | null;
  failure: string | null;
  /** Range of X of the data used. */
  xRange: [number, number] | null;
}

/** Fit one series from its observations (every replicate counts as a point). */
export function runFit(obs: ReadonlyArray<{ x: number; y: number }>, fit: FitSettings): FitRun {
  if (fit.model === 'none') return { result: null, failure: null, xRange: null };
  const r = cachedFit(obs, { ...fit, model: fit.model });
  if (isFailure(r)) return { result: null, failure: r.message, xRange: null };
  const xs = obs.map((p) => p.x);
  return { result: r, failure: null, xRange: [xs.reduce((m, v) => (v < m ? v : m), Infinity), xs.reduce((m, v) => (v > m ? v : m), -Infinity)] };
}

/** Where the curve is calculated: evenly along the axis (evenly in its logarithm on a log axis). */
function sampleXs(lo: number, hi: number, log: boolean): number[] {
  if (!(hi > lo)) return [lo];
  const useLog = log && lo > 0;
  const [a, b] = useLog ? [Math.log(lo), Math.log(hi)] : [lo, hi];
  return Array.from({ length: SAMPLES }, (_, i) => {
    const t = a + ((b - a) * i) / (SAMPLES - 1);
    return useLog ? Math.exp(t) : t;
  });
}

/** The Y values the curve takes over the range of the data, so the axis can be made to hold it. */
export function curveYValues(run: FitRun): number[] {
  const { result, xRange } = run;
  if (!result || !xRange) return [];
  return sampleXs(xRange[0], xRange[1], false).map((x) => result.predict(x)).filter(Number.isFinite);
}

interface Mappers {
  xAxis: YAxisScale;
  yAxis: YAxisScale;
  xScale: (v: number) => number;
  yScale: (v: number) => number;
}

const placed = (v: number) => Number.isFinite(v) && Math.abs(v) < FAR;

/** Draw the fit: the curve and the band around it. */
export function drawFit(run: FitRun, fit: FitSettings, m: Mappers): FittedCurve {
  if (run.failure) return { ...NO_FIT, failure: run.failure };
  const { result, xRange } = run;
  if (!result || !xRange) return NO_FIT;
  const model = fitModelById(result.model);
  const summary: FitSummary = {
    modelLabel: model.label,
    formula: model.formula,
    params: result.params,
    n: result.n,
    df: result.df,
    rSquared: result.rSquared,
    converged: result.converged,
    message: result.message,
  };
  const [lo, hi] = fit.extend ? m.xAxis.domain : xRange;
  const xs = sampleXs(lo, hi, !!m.xAxis.log).filter((x) => onAxis(m.xAxis, x) && (!model.positiveX || x > 0) && (!model.nonNegativeX || x >= 0));

  let path = '';
  let bandPath = '';
  let band: Array<{ px: number; up: number; down: number }> = [];
  const flush = () => {
    if (band.length >= 2) {
      bandPath += band.map((q, i) => `${i === 0 ? 'M' : 'L'}${n2(q.px)},${n2(q.up)}`).join('');
      bandPath += [...band].reverse().map((q) => `L${n2(q.px)},${n2(q.down)}`).join('') + 'Z';
    }
    band = [];
  };
  const seq: Array<{ x: number; y: number } | null> = [];
  for (const x of xs) {
    const y = result.predict(x);
    const px = m.xScale(x);
    const py = m.yScale(y);
    if (!onAxis(m.yAxis, y) || !placed(px) || !placed(py)) {
      seq.push(null);
      flush();
      continue;
    }
    seq.push({ x, y });
    // Over a gap of a broken axis the band ends, as the curve does.
    if (inBreak(m.xAxis, x) || inBreak(m.yAxis, y)) {
      flush();
      continue;
    }
    if (fit.band === 'none') continue;
    const h = result.halfWidth(x, fit.band, fit.level);
    // A band end with no position (below 0 on a log axis) ends the band there rather than bending it.
    if (h !== null && onAxis(m.yAxis, y - h) && placed(m.yScale(y + h)) && placed(m.yScale(y - h))) band.push({ px, up: m.yScale(y + h), down: m.yScale(y - h) });
    else flush();
  }
  flush();
  // The curve is cut in data coordinates where it crosses a gap of a broken axis.
  path = polylinesThroughBreaks(seq, m.xAxis, m.yAxis)
    .map((part) => part.map((q, i) => `${i === 0 ? 'M' : 'L'}${n2(m.xScale(q.x))},${n2(m.yScale(q.y))}`).join(''))
    .join('');
  return { path, bandPath, summary, failure: null };
}

/** A fitted number for reading: four significant digits. */
const fitNumber = (v: number): string => (Number.isFinite(v) ? String(Number(v.toPrecision(4))) : '–');

/** "8 points, 6 degrees of freedom": what the fit rests on (no degrees of freedom are named when none are left). */
export const fitCountLine = (s: FitSummary): string => `${s.n} points${s.df > 0 ? `, ${s.df} degrees of freedom` : ''}`;

/**
 * The fitted parameters of every series as plain text, to be placed on the graph and edited there: the name of the series,
 * a line for each parameter with its interval, R², and the number of points and degrees of freedom; one block after another.
 */
export function fitParametersText(series: ReadonlyArray<{ label: string; fit?: { summary: FitSummary | null } }>, level: number): string {
  return series
    .flatMap((s) => (s.fit?.summary ? [s.label, ...fitLines(s.fit.summary, level), fitCountLine(s.fit.summary)] : []))
    .join('\n');
}

/** The lines written for one fit: "EC50 = 51.2 (95% CI 40.1 to 62.3)" for each parameter, then R². */
export function fitLines(s: FitSummary, level: number): string[] {
  const pct = `${Number((level * 100).toPrecision(3))}%`;
  const lines = s.params.map((p) => `${p.name} = ${fitNumber(p.value)}${p.lower !== null && p.upper !== null ? ` (${pct} CI ${fitNumber(p.lower)} to ${fitNumber(p.upper)})` : ''}`);
  if (s.rSquared !== null) lines.push(`R² = ${fitNumber(s.rSquared)}`);
  return lines;
}
