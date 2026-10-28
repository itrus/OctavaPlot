import { cachedCalc, peekCalc, type CalcIdentity } from '../../stats/calcCache';
import { shouldDeferFit } from '../../stats/fitEngine';
import { deferredFitResult } from '../../stats/fitService';
import { FIT_ALGORITHM_VERSION, fitCurve, fitModelById, isFailure, type FitFailure, type FitModelId, type FitResult } from '../../stats/fit';
import { withoutExcluded } from '../table/exclusion';
import { layoutOf, xySeries } from '../table/tableLayout';
import type { Analysis, DataTable, Id } from '../types';
import { suppliedStats } from '../table/suppliedStats';

/** The Results of a curve fit: the numbers of each Y series of an XY table, as a sheet that can be shown, selected and copied. */

/** One row of a results sheet: a label and one cell for each column. */
interface SheetRow {
  key: string;
  label: string;
  cells: string[];
  /** The same cells at full precision, for copying and files; the cells are rounded for the screen. */
  exact?: string[];
  /** A gap between groups of rows. */
  blank?: boolean;
  indent?: boolean;
}

export interface Sheet {
  corner: string;
  columns: Array<{ id: Id; label: string }>;
  rows: SheetRow[];
}

/** What a curve is fitted to, for each Y series: every replicate on its own, or the single Y or entered mean of each row. */
export function fitObservations(source: DataTable): Array<{ id: Id; label: string; obs: Array<{ x: number; y: number }> }> {
  const table = withoutExcluded(source);
  if (table.kind !== 'xy' || table.groups.length === 0) return [];
  const layout = layoutOf(table);
  const xs = table.groups[0].observations.map((o) => o.value);
  return xySeries(table).map((s) => {
    const obs: Array<{ x: number; y: number }> = [];
    for (let row = 0; row < table.rowCount; row++) {
      const x = xs[row];
      if (x === null || x === undefined || !Number.isFinite(x)) continue;
      const values = s.columns.map((c) => c.observations[row]?.value ?? null);
      if (layout.kind === 'single') {
        if (values[0] !== null && Number.isFinite(values[0])) obs.push({ x, y: values[0] });
      } else if (layout.kind === 'replicates') {
        for (const v of values) if (v !== null && Number.isFinite(v)) obs.push({ x, y: v });
      } else {
        const centre = suppliedStats(layout.format, values)?.stats.centre;
        if (centre !== null && centre !== undefined && Number.isFinite(centre)) obs.push({ x, y: centre });
      }
    }
    return { id: s.id, label: s.name, obs };
  });
}

/** How many fits were actually calculated (not taken from the cache); for the tests. */
export const fitStats = { calculated: 0 };

type Obs = ReadonlyArray<{ x: number; y: number }>;
type FitInput = { model: FitModelId; degree?: number; level: number };
/** The numbers of a set of observations as one list, made once for each array so the cache can know it by identity. */
const flatOf = new WeakMap<Obs, number[]>();

/** What a fit is keyed by: the points, model, degree where it matters, level and algorithm version (the same for every path that makes it). */
function fitIdentity(obs: Obs, fit: FitInput): CalcIdentity {
  let data = flatOf.get(obs);
  if (!data) {
    data = [];
    for (const p of obs) data.push(p.x, p.y);
    flatOf.set(obs, data);
  }
  // The degree matters only to a polynomial, and the fit clamps it: write it as the fit reads it.
  const degree = fit.model === 'polynomial' ? Math.min(6, Math.max(2, Math.round(fit.degree ?? 2))) : null;
  return { kind: 'fit', algorithm: FIT_ALGORITHM_VERSION, data, method: fit.model, params: [degree], level: fit.level };
}

/**
 * A fit kept by its identity. The graph, the export and the Results sheet all ask here (or find what `deferredFit` left), so one fit
 * of the same data is calculated once; a style or axis edit never gets here. This is the reference: it always calculates on the
 * calling thread when the result is not kept.
 */
export function cachedFit(obs: Obs, fit: FitInput): FitResult | FitFailure {
  return cachedCalc<FitResult | FitFailure>(fitIdentity(obs, fit), () => {
    fitStats.calculated++;
    return fitCurve(obs, { model: fit.model, degree: fit.degree, level: fit.level });
  });
}

/** A fit that may still be on its way: the result, or pending (the fit is being made off the main thread). */
export type FitStatus = { state: 'ready'; value: FitResult | FitFailure } | { state: 'pending' };

/**
 * The fit for the screen. The result if it is kept; a small fit is calculated on the spot (see `shouldDeferFit`); otherwise the fit
 * is started in the worker and the answer is pending until `fitsVersion` changes. `slot` names who is waiting (a series of a
 * graph), so that asking for other inputs cancels the fit for the old ones. Never returns an old fit for other inputs.
 */
export function deferredFit(obs: Obs, fit: FitInput, slot: string): FitStatus {
  const id = fitIdentity(obs, fit);
  const kept = peekCalc<FitResult | FitFailure>(id);
  if (kept !== undefined) return { state: 'ready', value: kept };
  if (!shouldDeferFit(fit.model, obs.length)) return { state: 'ready', value: cachedFit(obs, fit) };
  const value = deferredFitResult(id, slot, () => ({ data: Float64Array.from(id.data as number[]), model: fit.model, degree: fit.degree, level: fit.level }));
  return value === undefined ? { state: 'pending' } : { state: 'ready', value };
}

/** Six significant digits for the screen. */
const num = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(Number(v.toPrecision(6))));
/** The number as it is held (shortest text that reads back as the same double), for copying and files. */
const full = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(v));

/** The fits of every series of the table with the model and level of the analysis. */
function fitsOf(table: DataTable, analysis: Pick<Analysis, 'model' | 'degree' | 'level'>): Array<{ id: Id; label: string; result: FitResult | null; failure: string | null }> {
  const model = analysis.model ?? 'linear';
  return fitObservations(table).map((s) => {
    const r = cachedFit(s.obs, { model, degree: analysis.degree, level: analysis.level });
    return isFailure(r) ? { id: s.id, label: s.label, result: null, failure: r.message } : { id: s.id, label: s.label, result: r, failure: null };
  });
}

export function curveFitSheet(table: DataTable, analysis: Analysis): Sheet {
  const model = fitModelById(analysis.model ?? 'linear');
  const fits = fitsOf(table, analysis);
  const pct = `${Number((analysis.level * 100).toPrecision(3))}%`;
  const each = (f: (r: FitResult) => string, otherwise = ''): string[] => fits.map((x) => (x.result ? f(x.result) : otherwise));
  /** A row of numbers: rounded for the screen, whole for copying. */
  const numbers = (key: string, label: string, pick: (r: FitResult) => number | null | undefined, indent = false): SheetRow => ({ key, label, indent, cells: each((r) => num(pick(r))), exact: each((r) => full(pick(r))) });
  const gap = (key: string): SheetRow => ({ key, label: '', cells: fits.map(() => ''), blank: true });
  const rows: SheetRow[] = [
    { key: 'equation', label: 'Equation', cells: fits.map(() => model.formula) },
    gap('g1'),
    { key: 'n', label: 'Number of points', cells: each((r) => String(r.n)) },
    { key: 'df', label: 'Degrees of freedom', cells: each((r) => String(r.df)) },
    numbers('r2', 'R squared', (r) => r.rSquared),
    numbers('ss', 'Sum of squares', (r) => r.rss),
    numbers('syx', 'Sy.x (residual SD)', (r) => r.sigma),
    { key: 'conv', label: 'Converged', cells: each((r) => (r.converged ? 'Yes' : 'No')) },
    gap('g2'),
  ];
  const names = fits.find((f) => f.result)?.result?.params.map((p) => p.name) ?? model.paramNames(analysis.degree ?? 2);
  names.forEach((name, i) => {
    rows.push(numbers(`p${i}`, name, (r) => r.params[i]?.value));
    rows.push(numbers(`p${i}se`, 'Std. error', (r) => r.params[i]?.se, true));
    rows.push(numbers(`p${i}lo`, `${pct} CI lower limit`, (r) => r.params[i]?.lower, true));
    rows.push(numbers(`p${i}hi`, `${pct} CI upper limit`, (r) => r.params[i]?.upper, true));
  });
  rows.push(gap('g3'));
  rows.push({ key: 'notes', label: 'Notes', cells: fits.map((f) => f.failure ?? f.result?.message ?? '') });
  return { corner: `Curve fit: ${model.label}`, columns: fits.map((f) => ({ id: f.id, label: f.label })), rows };
}
