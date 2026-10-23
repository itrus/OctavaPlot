import { bool, clamp, oneOf, record } from './sanitize';
import type { FitSettings } from './types';

/** Settings of fitted curves (spec 17). */

export const FIT_LIMITS = { degree: { min: 2, max: 6 }, level: { min: 0.5, max: 0.999 } } as const;

const MODELS: ReadonlyArray<FitSettings['model']> = ['none', 'linear', 'polynomial', 'exp_decay', 'exp_association', 'exp_two_phase', 'gaussian_peak', 'hyperbola', 'hill_4pl', 'asymmetric_5pl'];
const BANDS: ReadonlyArray<FitSettings['band']> = ['none', 'confidence', 'prediction'];

/** Fit settings from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeFit(raw: unknown, base: FitSettings): FitSettings {
  const f = record(raw);
  const { degree, level } = FIT_LIMITS;
  return {
    model: oneOf(MODELS, f.model, base.model),
    degree: Math.round(clamp(f.degree, degree.min, degree.max, base.degree)),
    band: oneOf(BANDS, f.band, base.band),
    level: clamp(f.level, level.min, level.max, base.level),
    extend: bool(f.extend, base.extend),
    showParameters: bool(f.showParameters, base.showParameters),
  };
}
