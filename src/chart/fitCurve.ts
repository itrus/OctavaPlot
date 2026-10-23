import type { FitSettings } from '../model/types';
import { n2 } from '../model/units';
import { fitCurve, fitModelById, isFailure, type FitParam, type FitResult } from '../stats/fit';
import { onAxis } from './axisScale';
import type { YAxisScale } from './scales';

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

export interface FitRun {
  result: FitResult | null;
  failure: string | null;
  /** Range of X of the data used. */
  xRange: [number, number] | null;
}

/** Fit one series from its observations (every replicate counts as a point). */
export function runFit(obs: ReadonlyArray<{ x: number; y: number }>, fit: FitSettings): FitRun {
  if (fit.model === 'none') return { result: null, failure: null, xRange: null };
  const r = fitCurve(obs, { model: fit.model, degree: fit.degree });
  if (isFailure(r)) return { result: null, failure: r.message, xRange: null };
  const xs = obs.map((p) => p.x);
  return { result: r, failure: null, xRange: [Math.min(...xs), Math.max(...xs)] };
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
  const xs = sampleXs(lo, hi, !!m.xAxis.log).filter((x) => onAxis(m.xAxis, x) && (!model.positiveX || x > 0));

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
  let pen = false;
  for (const x of xs) {
    const y = result.predict(x);
    const px = m.xScale(x);
    const py = m.yScale(y);
    if (!onAxis(m.yAxis, y) || !placed(px) || !placed(py)) {
      pen = false;
      flush();
      continue;
    }
    path += `${pen ? 'L' : 'M'}${n2(px)},${n2(py)}`;
    pen = true;
    if (fit.band === 'none') continue;
    const h = result.halfWidth(x, fit.band, fit.level);
    // A band end with no position (below 0 on a log axis) ends the band there rather than bending it.
    if (h !== null && onAxis(m.yAxis, y - h) && placed(m.yScale(y + h)) && placed(m.yScale(y - h))) band.push({ px, up: m.yScale(y + h), down: m.yScale(y - h) });
    else flush();
  }
  flush();
  return { path, bandPath, summary, failure: null };
}

/** A fitted number for reading: four significant digits. */
export const fitNumber = (v: number): string => (Number.isFinite(v) ? String(Number(v.toPrecision(4))) : '–');

/** The lines written for one fit: "EC50 = 51.2 (95% CI 40.1 to 62.3)" for each parameter, then R². */
export function fitLines(s: FitSummary, level: number): string[] {
  const pct = `${Number((level * 100).toPrecision(3))}%`;
  const lines = s.params.map((p) => `${p.name} = ${fitNumber(p.value)}${p.lower !== null && p.upper !== null ? ` (${pct} CI ${fitNumber(p.lower)} to ${fitNumber(p.upper)})` : ''}`);
  if (s.rSquared !== null) lines.push(`R² = ${fitNumber(s.rSquared)}`);
  return lines;
}
