/**
 * Bar fill model (spec 5.2 L288-295): mode, pattern, spacing, line width and
 * colours resolved from a style, plus the file sanitiser and the Inspector
 * state. Nothing here draws. Defaults and limits are P (spec 1.2 L57).
 * Imports only types, so defaults.ts can import this module.
 *
 * In pattern mode the solid fill colour (barFill) is ignored and
 * barPatternBackground is used instead (P).
 */

import type { ChartStyle, FillMode, FillPattern } from './types';

export const FILL_PATTERNS: readonly FillPattern[] = [
  'horizontal',
  'vertical',
  'diagonalUp',
  'diagonalDown',
  'crosshatch',
  'diagonalCrosshatch',
  'dots',
];

export const FILL_PATTERN_OPTIONS: ReadonlyArray<{ value: FillPattern; label: string }> = [
  { value: 'horizontal', label: 'Horizontal lines' },
  { value: 'vertical', label: 'Vertical lines' },
  { value: 'diagonalUp', label: 'Diagonal lines (rising)' },
  { value: 'diagonalDown', label: 'Diagonal lines (falling)' },
  { value: 'crosshatch', label: 'Crosshatch' },
  { value: 'diagonalCrosshatch', label: 'Diagonal crosshatch' },
  { value: 'dots', label: 'Dots' },
];

const FILL_MODES: readonly FillMode[] = ['none', 'solid', 'pattern'];

/** Resolver and Inspector limits (P). The file sanitiser keeps values outside them; the resolver clamps. */
export const FILL_LIMITS = {
  spacingPt: { min: 1, max: 50 },
  widthPt: { min: 0.1, max: 5 },
} as const;

/** Fallbacks used when a stored value is unusable (the defaults, P). */
const FALLBACK_SPACING_PT = 4;
const FALLBACK_WIDTH_PT = 0.5;
const LEGEND_KEY_MAX_SPACING_PT = 4;

/** Fully resolved fill: everything a renderer needs, all values valid. */
export interface FillSpec {
  mode: FillMode;
  /** Solid colour (barFill); meaningful for mode 'solid' only. */
  solidColor: string;
  pattern: FillPattern;
  spacingPt: number;
  /** Stroke width / dot diameter as stored (clamped), pt. */
  widthPt: number;
  /** Width actually drawn: min(widthPt, spacingPt), so marks never overlap their neighbours. */
  markWidthPt: number;
  /** Mark colour: barPatternColor, else the border colour. */
  patternColor: string;
  /** Pattern background; null = transparent. */
  background: string | null;
  /** 0..1. */
  opacity: number;
}

const HEX = /^#[0-9a-fA-F]{6}$/;
const isHex = (v: unknown): v is string => typeof v === 'string' && HEX.test(v);
const isPositive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

type FillStyleInput = Pick<
  ChartStyle,
  | 'barFill'
  | 'barOpacity'
  | 'barBorderColor'
  | 'barFillMode'
  | 'barPattern'
  | 'barPatternSpacingPt'
  | 'barPatternWidthPt'
  | 'barPatternColor'
  | 'barPatternBackground'
>;

/** Total: any stored value resolves to a valid FillSpec. */
export function resolveBarFill(style: FillStyleInput): FillSpec {
  const mode = FILL_MODES.includes(style.barFillMode) ? style.barFillMode : 'solid';
  const pattern = FILL_PATTERNS.includes(style.barPattern) ? style.barPattern : 'horizontal';
  const spacingPt = clamp(
    isPositive(style.barPatternSpacingPt) ? style.barPatternSpacingPt : FALLBACK_SPACING_PT,
    FILL_LIMITS.spacingPt.min,
    FILL_LIMITS.spacingPt.max,
  );
  const widthPt = clamp(
    isPositive(style.barPatternWidthPt) ? style.barPatternWidthPt : FALLBACK_WIDTH_PT,
    FILL_LIMITS.widthPt.min,
    FILL_LIMITS.widthPt.max,
  );
  const opacity = typeof style.barOpacity === 'number' && Number.isFinite(style.barOpacity) ? clamp(style.barOpacity, 0, 1) : 1;
  const border = isHex(style.barBorderColor) ? style.barBorderColor : '#000000';
  return {
    mode,
    solidColor: style.barFill,
    pattern,
    spacingPt,
    widthPt,
    markWidthPt: Math.min(widthPt, spacingPt),
    patternColor: isHex(style.barPatternColor) ? style.barPatternColor : border,
    background: isHex(style.barPatternBackground) ? style.barPatternBackground : null,
    opacity,
  };
}

/** Legend key fill: the 18x10 pt key is small, so spacing is capped at 4 pt and marks at half the spacing (P). */
export function legendKeyFill(fill: FillSpec): FillSpec {
  const spacingPt = Math.min(fill.spacingPt, LEGEND_KEY_MAX_SPACING_PT);
  return { ...fill, spacingPt, markWidthPt: Math.min(fill.markWidthPt, spacingPt / 2) };
}

/** True when a pattern fill would draw nothing visible (no opacity, or marks the colour of the background). */
export function isPatternInvisible(fill: FillSpec): boolean {
  if (fill.mode !== 'pattern') return false;
  if (fill.opacity <= 0) return true;
  return fill.background !== null && fill.background.toLowerCase() === fill.patternColor.toLowerCase();
}

const FILL_KEY_CHECKS: Record<string, (v: unknown) => boolean> = {
  barFillMode: (v) => typeof v === 'string' && (FILL_MODES as readonly string[]).includes(v),
  barPattern: (v) => typeof v === 'string' && (FILL_PATTERNS as readonly string[]).includes(v),
  // Only non-positive or non-finite values are invalid; values beyond the P limits are kept and clamped by the resolver.
  barPatternSpacingPt: isPositive,
  barPatternWidthPt: isPositive,
  barPatternColor: (v) => v === null || isHex(v),
  barPatternBackground: (v) => v === null || isHex(v),
};

/** Copy of a raw style object without its invalid fill keys; dropped lists the removed key names. */
export function sanitizeFillKeys(raw: Record<string, unknown>): { style: Record<string, unknown>; dropped: string[] } {
  const style = { ...raw };
  const dropped: string[] = [];
  for (const [key, valid] of Object.entries(FILL_KEY_CHECKS)) {
    if (!Object.prototype.hasOwnProperty.call(style, key)) continue;
    if (valid(style[key])) continue;
    delete style[key];
    dropped.push(key);
  }
  return { style, dropped };
}

/** Inspector state of the fill controls. */
export interface BarFillUi {
  mode: FillMode;
  /** Solid colour control: usable in solid mode only. */
  solidColorEnabled: boolean;
  /** Pattern, spacing, width, colour and background controls. */
  patternControlsEnabled: boolean;
  /** Why the controls are disabled, if they are. */
  note: string | null;
  spacingError: string | null;
  widthError: string | null;
  /** Visual warning for a pattern that draws nothing visible. */
  invisibleWarning: string | null;
}

const limitError = (label: string, v: number, lim: { min: number; max: number }): string | null =>
  !isPositive(v)
    ? `${label} must be a positive number.`
    : v < lim.min || v > lim.max
      ? `${label} is outside the P limit ${lim.min} to ${lim.max} pt and is clamped.`
      : null;

export function describeBarFillUi(style: FillStyleInput & Pick<ChartStyle, 'showBars'>): BarFillUi {
  const fill = resolveBarFill(style);
  if (!style.showBars) {
    return {
      mode: fill.mode,
      solidColorEnabled: false,
      patternControlsEnabled: false,
      note: 'Bars are hidden.',
      spacingError: null,
      widthError: null,
      invisibleWarning: null,
    };
  }
  const pattern = fill.mode === 'pattern';
  return {
    mode: fill.mode,
    solidColorEnabled: fill.mode === 'solid',
    patternControlsEnabled: pattern,
    note: pattern ? null : fill.mode === 'none' ? 'No fill: only the border is drawn.' : 'Choose Pattern to edit the pattern.',
    spacingError: pattern ? limitError('Spacing', style.barPatternSpacingPt, FILL_LIMITS.spacingPt) : null,
    widthError: pattern ? limitError('Line width', style.barPatternWidthPt, FILL_LIMITS.widthPt) : null,
    invisibleWarning: isPatternInvisible(fill) ? 'The pattern is not visible: its colour matches the background.' : null,
  };
}
