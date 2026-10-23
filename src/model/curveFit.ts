import { suppliedStats } from '../chart/xyModel';
import { fitCurve, fitModelById, isFailure, type FitResult } from '../stats/fit';
import { layoutOf, xySeries } from './tableLayout';
import type { Analysis, DataTable, Id } from './types';

/** The Results of a curve fit: the numbers of each Y series of an XY table, as a sheet that can be shown, selected and copied. */

/** One row of a results sheet: a label and one cell for each column. */
export interface SheetRow {
  key: string;
  label: string;
  cells: string[];
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
export function fitObservations(table: DataTable): Array<{ id: Id; label: string; obs: Array<{ x: number; y: number }> }> {
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

/** Six significant digits: enough to copy into another program without the rounding of the screen showing. */
const num = (v: number | null | undefined): string => (v === null || v === undefined || !Number.isFinite(v) ? '' : String(Number(v.toPrecision(6))));

/** The fits of every series of the table with the model and level of the analysis. */
export function fitsOf(table: DataTable, analysis: Pick<Analysis, 'model' | 'degree'>): Array<{ id: Id; label: string; result: FitResult | null; failure: string | null }> {
  const model = analysis.model ?? 'linear';
  return fitObservations(table).map((s) => {
    const r = fitCurve(s.obs, { model, degree: analysis.degree });
    return isFailure(r) ? { id: s.id, label: s.label, result: null, failure: r.message } : { id: s.id, label: s.label, result: r, failure: null };
  });
}

export function curveFitSheet(table: DataTable, analysis: Analysis): Sheet {
  const model = fitModelById(analysis.model ?? 'linear');
  const fits = fitsOf(table, analysis);
  const pct = `${Number((analysis.level * 100).toPrecision(3))}%`;
  const each = (f: (r: FitResult) => string, otherwise = ''): string[] => fits.map((x) => (x.result ? f(x.result) : otherwise));
  const gap = (key: string): SheetRow => ({ key, label: '', cells: fits.map(() => ''), blank: true });
  const rows: SheetRow[] = [
    { key: 'equation', label: 'Equation', cells: fits.map(() => model.formula) },
    gap('g1'),
    { key: 'n', label: 'Number of points', cells: each((r) => String(r.n)) },
    { key: 'df', label: 'Degrees of freedom', cells: each((r) => String(r.df)) },
    { key: 'r2', label: 'R squared', cells: each((r) => num(r.rSquared)) },
    { key: 'ss', label: 'Sum of squares', cells: each((r) => num(r.rss)) },
    { key: 'syx', label: 'Sy.x (residual SD)', cells: each((r) => num(r.sigma)) },
    { key: 'conv', label: 'Converged', cells: each((r) => (r.converged ? 'Yes' : 'No')) },
    gap('g2'),
  ];
  const names = fits.find((f) => f.result)?.result?.params.map((p) => p.name) ?? model.paramNames(analysis.degree ?? 2);
  names.forEach((name, i) => {
    rows.push({ key: `p${i}`, label: name, cells: each((r) => num(r.params[i]?.value)) });
    rows.push({ key: `p${i}se`, label: 'Std. error', indent: true, cells: each((r) => num(r.params[i]?.se)) });
    rows.push({ key: `p${i}lo`, label: `${pct} CI lower limit`, indent: true, cells: each((r) => num(r.params[i]?.lower)) });
    rows.push({ key: `p${i}hi`, label: `${pct} CI upper limit`, indent: true, cells: each((r) => num(r.params[i]?.upper)) });
  });
  rows.push(gap('g3'));
  rows.push({ key: 'notes', label: 'Notes', cells: fits.map((f) => f.failure ?? f.result?.message ?? '') });
  return { corner: `Curve fit: ${model.label}`, columns: fits.map((f) => ({ id: f.id, label: f.label })), rows };
}
