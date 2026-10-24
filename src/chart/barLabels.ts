import type { BarLabels } from '../model/types';
import { formatLabelValue } from './labels';

/** A text drawn beside a bar: the value or the sample size, above the bar and its error bar (below a bar that points down). */
export interface BarLabelGeom {
  id: string;
  /** Centre of the text; `y` is its baseline. */
  x: number;
  y: number;
  text: string;
  /** The bar points up (towards smaller y) from its baseline: on a horizontal chart the text then goes to the right of its end. */
  up: boolean;
}

export const BAR_LABEL_LIMITS = { sizePt: { min: 8, max: 96 }, decimals: { min: 0, max: 10 } } as const;

/** Gap between the end of the bar (or its error bar) and the text, pt. */
const GAP_PT = 6;

/** The text of a label, or null when labels are off or there is nothing to show. */
export function barLabelText(cfg: BarLabels, value: number | null, n: number | null): string | null {
  if (cfg.show === 'none') return null;
  const raw = cfg.show === 'n' ? n : value;
  if (raw === null || !Number.isFinite(raw)) return null;
  let body = cfg.show === 'n' ? String(Math.round(raw)) : formatLabelValue(raw, cfg.decimals);
  if (body === '') return null;
  if (cfg.thousands) body = body.replace(/^(-?)(\d+)/, (_, sign: string, digits: string) => sign + digits.replace(/\B(?=(\d{3})+(?!\d))/g, ','));
  return cfg.prefix + body + cfg.suffix;
}

/**
 * Where the label goes: beyond the end of the bar away from its baseline. `yEnd` is the end of the bar, `yFar` the end
 * of its error bar (or the same as `yEnd`), `yBase` the baseline; all in chart pt, y growing downwards.
 */
export function placeBarLabel(cfg: BarLabels, x: number, yEnd: number, yFar: number, yBase: number): { x: number; y: number; up: boolean } {
  const pointsUp = yEnd <= yBase;
  if (pointsUp) return { x, y: Math.min(yEnd, yFar) - GAP_PT, up: true };
  return { x, y: Math.max(yEnd, yFar) + GAP_PT + cfg.sizePt * 0.8, up: false };
}
