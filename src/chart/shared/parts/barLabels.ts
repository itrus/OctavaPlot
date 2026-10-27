import type { FillSpec } from '../../../model/graph/fill';
import type { BarLabels, InsideBarLabel } from '../../../model/types';
import { contrastColour, overColour } from './contrast';
import { formatLabelValue } from './labels';
import { measureText } from './text';

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

/** The text of the label inside the bar, or null when there is none to draw. */
export function insideLabelText(cfg: BarLabels, value: number | null, n: number | null): string | null {
  return cfg.inside ? barLabelText({ ...cfg, show: cfg.inside.show }, value, n) : null;
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

/** A label inside a bar. `x` is the centre across the bar; `y` the text baseline (vertical bars) or the edge the text starts from (horizontal ones). */
export interface InsideLabelGeom {
  id: string;
  x: number;
  y: number;
  text: string;
  /** Vertical bars: always middle. Horizontal bars: the end of the text that touches `y`, upright on the screen. */
  anchor: 'start' | 'middle' | 'end';
  color: string;
}

/** Clear space between the text and the edges of the bar it sits in, pt. */
const INSIDE_PAD_PT = 3;

/** The colour the bar is seen as: its fill (or its pattern's background) at its opacity over the page. */
export function barSeenColour(fill: FillSpec, page: string): string {
  const own = fill.mode === 'solid' ? fill.solidColor : fill.mode === 'pattern' ? fill.background : null;
  return own === null ? page : overColour(own, fill.opacity, page);
}

export interface InsideLabelInput {
  id: string;
  /** The group (and category) the bar belongs to, for the note. */
  owner: string;
  cfg: BarLabels;
  inside: InsideBarLabel;
  /** Text of the label, from `barLabelText`. */
  text: string;
  fontFamily: string;
  /** Centre and width of the bar, and the end and the baseline of its visible part (chart pt, y downwards). */
  x: number;
  width: number;
  yEnd: number;
  yBase: number;
  horizontal: boolean;
  fill: FillSpec;
  /** The colour of the page behind the bar. */
  page: string;
}

/**
 * The label inside one bar, put against its end or its baseline, or none and the reason when the text does not fit
 * (the size is never changed to make it fit).
 */
export function placeInsideBarLabel(i: InsideLabelInput): { label: InsideLabelGeom | null; warning: string | null } {
  const s = i.cfg.sizePt;
  const textWidth = measureText(i.text, s, false, false, i.fontFamily);
  const length = Math.abs(i.yBase - i.yEnd);
  // Across the bar the text is as high as its size (upright text on a horizontal bar) or as long as it is; along it, the other way round.
  const needAcross = (i.horizontal ? s : textWidth) + 2 * INSIDE_PAD_PT;
  const needAlong = (i.horizontal ? textWidth : s) + 2 * INSIDE_PAD_PT;
  const fail = (what: string, need: number, have: number) => ({ label: null, warning: `The label inside the bar of ${i.owner} is not drawn: the bar is too ${what} for "${i.text}" at ${s} pt (it needs ${Math.ceil(need)} pt, the bar has ${Math.floor(have)} pt).` });
  if (i.width < needAcross) return fail(i.horizontal ? 'thin' : 'narrow', needAcross, i.width);
  if (length < needAlong) return fail('short', needAlong, length);
  // Direction (in y) from the edge the text sits against towards the inside of the bar.
  const towardsBase = i.yBase >= i.yEnd ? 1 : -1;
  const atEnd = i.inside.position === 'end';
  const edge = atEnd ? i.yEnd : i.yBase;
  const inward = atEnd ? towardsBase : -towardsBase;
  const color = i.inside.color ?? contrastColour(barSeenColour(i.fill, i.page));
  const id = `${i.id}:label-in`;
  if (!i.horizontal) {
    // The text box runs from 0.8 size above the baseline to 0.2 below it, like the label beyond the end.
    const top = inward > 0 ? edge + INSIDE_PAD_PT : edge - INSIDE_PAD_PT - s;
    return { label: { id, x: i.x, y: top + s * 0.8, text: i.text, anchor: 'middle', color }, warning: null };
  }
  // The value axis runs the other way on the screen: more y is further left.
  return { label: { id, x: i.x, y: edge + inward * INSIDE_PAD_PT, text: i.text, anchor: inward > 0 ? 'end' : 'start', color }, warning: null };
}
