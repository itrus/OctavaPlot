import { FIT_MODELS } from '../../stats/fit';
import { bool, clamp, oneOf, record } from '../sanitize';
import type { Analysis, ChartFit, FitSettings, Id } from '../types';

/** Settings of fitted curves (spec 17): what a chart shows of a curve fit, and how a curve fit is read from its analysis. */

export const FIT_LIMITS = { degree: { min: 2, max: 6 }, level: { min: 0.5, max: 0.999 } } as const;

const BANDS: ReadonlyArray<ChartFit['band']> = ['none', 'confidence', 'prediction'];
export const FIT_MODEL_IDS = FIT_MODELS.map((m) => m.id);

/** What a chart shows of a fit, from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeFit(raw: unknown, base: ChartFit): ChartFit {
  const f = record(raw);
  return {
    analysisId: typeof f.analysisId === 'string' && f.analysisId !== '' ? f.analysisId : f.analysisId === null ? null : base.analysisId,
    band: oneOf(BANDS, f.band, base.band),
    extend: bool(f.extend, base.extend),
    showParameters: bool(f.showParameters, base.showParameters),
  };
}

/** The degree of a polynomial, kept within what is fitted. */
export const sanitizeDegree = (v: unknown, fallback: number): number => Math.round(clamp(v, FIT_LIMITS.degree.min, FIT_LIMITS.degree.max, fallback));

/** Fit settings that draw nothing. */
export const NO_FIT_SETTINGS: FitSettings = { model: 'none', degree: 2, band: 'none', level: 0.95, extend: false, showParameters: false };

/** The curve a chart draws: its choices with the model and level of the analysis it points to (none when there is no such analysis). */
export function resolveFit(fit: ChartFit, analyses: ReadonlyArray<Analysis>, dataTableId: Id): FitSettings {
  const a = analyses.find((x) => x.id === fit.analysisId && x.kind === 'curvefit' && x.dataTableId === dataTableId);
  if (!a || !a.model) return { ...NO_FIT_SETTINGS, band: fit.band, extend: fit.extend, showParameters: fit.showParameters };
  return { model: a.model, degree: a.degree ?? 2, band: fit.band, level: a.level, extend: fit.extend, showParameters: fit.showParameters };
}
