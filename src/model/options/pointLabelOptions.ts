import type { ChartStyle, ChartType, PointLabelSource } from '../types';
import { isHex } from '../sanitize';

export const LABEL_FONT_LIMITS = { min: 8, max: 40 } as const;
export const LABEL_OFFSET_LIMITS = { min: -400, max: 400 } as const;
export const LABEL_DECIMALS_LIMITS = { min: 0, max: 10 } as const;
export const LABEL_AUTO_COLOR = '#000000';

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Mean markers summarise a data set, so only the value source applies. */
export function effectiveLabelSource(type: ChartType, source: PointLabelSource): PointLabelSource {
  return type === 'mean' ? 'value' : source;
}

/** Fix invalid label keys; returns the same object when everything is valid. */
export function sanitizeLabelStyle<T extends ChartStyle>(style: T): T {
  const out: T = { ...style };
  const num = (v: unknown, fallback: number, lo: number, hi: number) =>
    typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) : fallback;
  out.pointLabelFontSizePt = num(
    style.pointLabelFontSizePt,
    22,
    LABEL_FONT_LIMITS.min,
    LABEL_FONT_LIMITS.max,
  );
  out.pointLabelOffsetXPt = num(style.pointLabelOffsetXPt, 0, LABEL_OFFSET_LIMITS.min, LABEL_OFFSET_LIMITS.max);
  out.pointLabelOffsetYPt = num(style.pointLabelOffsetYPt, 0, LABEL_OFFSET_LIMITS.min, LABEL_OFFSET_LIMITS.max);
  const c = style.pointLabelColor;
  if (c !== null && !isHex(c)) out.pointLabelColor = null;
  const d = style.pointLabelDecimals;
  if (d !== null) {
    out.pointLabelDecimals =
      typeof d === 'number' && Number.isFinite(d)
        ? clamp(Math.round(d), LABEL_DECIMALS_LIMITS.min, LABEL_DECIMALS_LIMITS.max)
        : null;
  }
  const keys = Object.keys(out) as Array<keyof T>;
  return keys.every((k) => out[k] === style[k]) ? style : out;
}

