import { color, interpolateRgb, piecewise } from 'd3';
import { HEAT_GRADIENTS } from '../../model/options/heatGradients';
import { DEFAULT_CUSTOM_COLOURS, isDiverging } from '../../model/options/heatmapOptions';
import type { HeatCustomColours, HeatPalette, HeatmapOptions } from '../../model/types';

/** Colour scales of a heat map (spec 13.1), each from t = 0 (the low end) to t = 1 (the high end): the stops are evenly spaced and joined in RGB. */

const SCALES = new Map(HEAT_GRADIENTS.map((p) => [p.value, piecewise(interpolateRgb, [...p.colors])]));

const toHex = (c: string): string => color(c)?.formatHex() ?? '#000000';

/** The colour at position t (0 to 1) of a palette; the palette runs the other way when `reverse`. 'custom' is the user's own colours (`custom`, the defaults when not given). */
export function paletteColour(palette: HeatPalette, t: number, reverse: boolean, custom: HeatCustomColours = DEFAULT_CUSTOM_COLOURS): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  const scale = palette === 'custom' ? piecewise(interpolateRgb, custom.mid === null ? [custom.low, custom.high] : [custom.low, custom.mid, custom.high]) : SCALES.get(palette)!;
  return toHex(scale(reverse ? 1 - x : x));
}

/** The settings that turn the scale on screen into an own scale that looks the same: its colours as drawn (reverse baked in), with a middle colour or not. */
export function seedCustom(o: HeatmapOptions, withMiddle: boolean): Pick<HeatmapOptions, 'palette' | 'reverse' | 'customColours'> {
  const at = (t: number) => paletteColour(o.palette, t, o.reverse, o.customColours);
  return { palette: 'custom', reverse: false, customColours: { low: at(0), mid: withMiddle ? at(0.5) : null, high: at(1) } };
}

/**
 * What editing one colour of the scale on screen changes: `low` and `high` are the ends as drawn, `mid` is the middle colour (null removes it).
 * A gradient first becomes an own scale (see `seedCustom`); an own scale keeps its reverse, so the end drawn at the low end may be stored as `high`.
 */
export function editScale(o: HeatmapOptions, slot: 'low' | 'mid' | 'high', colour: string | null): Pick<HeatmapOptions, 'palette' | 'reverse' | 'customColours'> {
  const base = o.palette === 'custom' ? { palette: o.palette, reverse: o.reverse, customColours: o.customColours } : seedCustom(o, isDiverging(o) || (slot === 'mid' && colour !== null));
  const stored = slot === 'mid' || !base.reverse ? slot : slot === 'low' ? 'high' : 'low';
  return { ...base, customColours: { ...base.customColours, [stored]: colour } };
}

export interface HeatScale {
  palette: HeatPalette;
  reverse: boolean;
  lo: number;
  hi: number;
  /** Diverging palettes: the value in the middle of the scale. */
  centre: number;
  /** The colours of the 'custom' scale. */
  custom: HeatCustomColours;
}

/** The colour of a value on the scale: its position (see `scalePosition`) read from the palette. */
export function scaleColour(v: number, s: HeatScale, diverging: boolean): string {
  return paletteColour(s.palette, scalePosition(Math.min(s.hi, Math.max(s.lo, v)), s, diverging), s.reverse, s.custom);
}

/** Position of a value on the scale, 0 to 1: linear, or in two halves round the centre of a diverging palette. */
export function scalePosition(v: number, s: Pick<HeatScale, 'lo' | 'hi' | 'centre'>, diverging: boolean): number {
  if (!(s.hi > s.lo)) return 0.5;
  if (!diverging) return (v - s.lo) / (s.hi - s.lo);
  const c = Math.min(s.hi, Math.max(s.lo, s.centre));
  if (v <= c) return c > s.lo ? 0.5 * ((v - s.lo) / (c - s.lo)) : 0.5;
  return s.hi > c ? 0.5 + 0.5 * ((v - c) / (s.hi - c)) : 0.5;
}

/** Moved to the shared parts so the labels inside bars use it too. */
export { contrastColour } from '../shared/parts/contrast';
