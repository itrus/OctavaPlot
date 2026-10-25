/**
 * Pure helpers for the Bars box fill controls (spec 5.2 L288-295): validation,
 * style patches and display text. No React here, so they are unit-tested.
 * Limits are P (spec 1.2 L57) and are labelled "P limit" in messages.
 */

import { FILL_LIMITS, FILL_PATTERN_OPTIONS, describeBarFillUi, resolveBarFill } from '../../../model/graph/fill';
import type { ChartStyle, FillPattern } from '../../../model/types';

type PatternStyle = Pick<ChartStyle, 'barPattern' | 'barBorderColor' | 'barPatternColor' | 'barPatternBackground'>;

/** The colour a "Background: None" switch restores (the default, P). */
export const DEFAULT_PATTERN_BACKGROUND = '#ffffff';

const isDotPattern = (pattern: FillPattern): boolean => pattern === 'dots';

/** Label of the width control: dots have a diameter, lines a width. */
export const widthLabel = (pattern: FillPattern): string => (isDotPattern(pattern) ? 'Dot diameter' : 'Line width');

const fmt = (v: number): string => String(Number(v.toPrecision(6)));

function limitMessage(label: string, v: number, lim: { min: number; max: number }): string | null {
  if (!Number.isFinite(v) || v <= 0) return `${label} must be a positive number.`;
  if (v < lim.min || v > lim.max) return `${label} must be between ${lim.min} and ${lim.max} pt (P limit).`;
  return null;
}

/** Spacing error: the P limit, then the cross rule (spacing is never below the mark width). */
export function spacingError(spacingPt: number, widthPt: number): string | null {
  const limit = limitMessage('Spacing', spacingPt, FILL_LIMITS.spacingPt);
  if (limit) return limit;
  if (Number.isFinite(widthPt) && spacingPt < widthPt) return `Spacing must be at least the mark width (${fmt(widthPt)} pt).`;
  return null;
}

/** Width error: the P limit, then the cross rule (the mark width never exceeds the spacing). */
export function widthError(widthPt: number, spacingPt: number, pattern: FillPattern): string | null {
  const label = widthLabel(pattern);
  const limit = limitMessage(label, widthPt, FILL_LIMITS.widthPt);
  if (limit) return limit;
  if (Number.isFinite(spacingPt) && widthPt > spacingPt) return `${label} must not exceed the spacing (${fmt(spacingPt)} pt).`;
  return null;
}

/** Fill pattern checkbox: on selects the pattern mode, off returns to solid. */
export function togglePatternPatch(on: boolean): Pick<ChartStyle, 'barFillMode'> {
  return { barFillMode: on ? 'pattern' : 'solid' };
}

/** Pattern color "= border": following clears the stored colour, unfollowing freezes the current border colour. */
export function followBorderPatch(follow: boolean, borderColor: string): Pick<ChartStyle, 'barPatternColor'> {
  return { barPatternColor: follow ? null : borderColor };
}

/** Background "None": transparent is null, switching it off restores the white default. */
export function backgroundNonePatch(none: boolean): Pick<ChartStyle, 'barPatternBackground'> {
  return { barPatternBackground: none ? null : DEFAULT_PATTERN_BACKGROUND };
}

export const followsBorder = (style: Pick<ChartStyle, 'barPatternColor'>): boolean => style.barPatternColor === null;

/** Colour shown in the (possibly disabled) Pattern color input. */
export const patternColorDisplay = (style: PatternStyle): string => resolveBarFill({ ...baseFill(style) }).patternColor;

/** Colour shown in the Background input; transparent shows the default it would restore. */
export const backgroundDisplay = (style: Pick<ChartStyle, 'barPatternBackground'>): string =>
  style.barPatternBackground ?? DEFAULT_PATTERN_BACKGROUND;

/** Resolver input from the pattern-related keys; unrelated keys take neutral values. */
function baseFill(style: PatternStyle) {
  return {
    barFill: '#000000',
    barOpacity: 1,
    barBorderColor: style.barBorderColor,
    barFillMode: 'pattern' as const,
    barPattern: style.barPattern,
    barPatternSpacingPt: 4,
    barPatternWidthPt: 0.5,
    barPatternColor: style.barPatternColor,
    barPatternBackground: style.barPatternBackground,
  };
}

const patternLabel = (pattern: FillPattern): string => FILL_PATTERN_OPTIONS.find((o) => o.value === pattern)?.label ?? pattern;

type NoteStyle = Parameters<typeof describeBarFillUi>[0];

/** Single line under the fill rows: why controls are disabled, else the invisible-pattern warning. */
export function fillRowNote(style: NoteStyle): string | null {
  const ui = describeBarFillUi(style);
  return ui.note ?? ui.invisibleWarning;
}

/** What opacity acts on in the current fill mode. */
export function opacityNote(style: Pick<ChartStyle, 'showBars' | 'barFillMode'>): string | null {
  if (!style.showBars) return null;
  if (style.barFillMode === 'none') return 'There is no fill, so opacity has no effect.';
  if (style.barFillMode === 'pattern') return 'Opacity applies to the pattern and its background, not to the border.';
  return null;
}

interface DatasetSwatch {
  background: string;
  /** CSS image drawn over the background for pattern fills, else null. */
  backgroundImage: string | null;
  borderColor: string;
  /** Tooltip hint, set for pattern and no-fill bars. */
  title: string | null;
}

/** Colour chip in the Data Sets list: the fill, with a hatch hint for patterns. */
export function datasetSwatch(
  style: Pick<
    ChartStyle,
    | 'showBars'
    | 'barFill'
    | 'barOpacity'
    | 'barBorderColor'
    | 'symbolColor'
    | 'barFillMode'
    | 'barPattern'
    | 'barPatternSpacingPt'
    | 'barPatternWidthPt'
    | 'barPatternColor'
    | 'barPatternBackground'
  >,
): DatasetSwatch {
  if (!style.showBars) return { background: style.symbolColor, backgroundImage: null, borderColor: style.barBorderColor, title: null };
  const fill = resolveBarFill(style);
  if (fill.mode === 'solid') return { background: style.barFill, backgroundImage: null, borderColor: style.barBorderColor, title: null };
  if (fill.mode === 'none') return { background: 'transparent', backgroundImage: null, borderColor: style.barBorderColor, title: 'No fill' };
  return {
    background: fill.background ?? 'transparent',
    backgroundImage: `repeating-linear-gradient(45deg, ${fill.patternColor} 0, ${fill.patternColor} 1px, transparent 1px, transparent 3px)`,
    borderColor: style.barBorderColor,
    title: `Pattern fill: ${patternLabel(fill.pattern)}`,
  };
}
