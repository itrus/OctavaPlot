import { color, interpolateBlues, interpolateGreys, interpolateMagma, interpolateRgb, interpolateViridis } from 'd3';
import type { HeatPalette } from '../../model/types';

/** Colour scales of a heat map (spec 13.1), each from t = 0 (the low end) to t = 1 (the high end). */

const GREEN = '#00a651';
const RED = '#e8102a';
const BLACK = '#000000';
const greenToBlack = interpolateRgb(GREEN, BLACK);
const blackToRed = interpolateRgb(BLACK, RED);

const SCALES: Record<HeatPalette, (t: number) => string> = {
  viridis: interpolateViridis,
  magma: interpolateMagma,
  blue: (t) => interpolateBlues(0.05 + 0.9 * t),
  greenred: (t) => (t < 0.5 ? greenToBlack(t * 2) : blackToRed((t - 0.5) * 2)),
  grayscale: (t) => interpolateGreys(1 - t),
};

const toHex = (c: string): string => color(c)?.formatHex() ?? '#000000';

/** The colour at position t (0 to 1) of a palette; the palette runs the other way when `reverse`. */
export function paletteColour(palette: HeatPalette, t: number, reverse: boolean): string {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return toHex(SCALES[palette](reverse ? 1 - x : x));
}

export interface HeatScale {
  palette: HeatPalette;
  reverse: boolean;
  lo: number;
  hi: number;
  /** Diverging palettes: the value in the middle of the scale. */
  centre: number;
}

/** Position of a value on the scale, 0 to 1: linear, or in two halves round the centre of a diverging palette. */
export function scalePosition(v: number, s: HeatScale, diverging: boolean): number {
  if (!(s.hi > s.lo)) return 0.5;
  if (!diverging) return (v - s.lo) / (s.hi - s.lo);
  const c = Math.min(s.hi, Math.max(s.lo, s.centre));
  if (v <= c) return c > s.lo ? 0.5 * ((v - s.lo) / (c - s.lo)) : 0.5;
  return s.hi > c ? 0.5 + 0.5 * ((v - c) / (s.hi - c)) : 0.5;
}

/** Black or white, whichever reads better on this background colour (spec 13.2: against the colour as drawn). */
export function contrastColour(background: string): '#000000' | '#ffffff' {
  const c = color(background)?.rgb();
  if (!c) return '#000000';
  const lin = (u: number) => {
    const s = u / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  return luminance > 0.179 ? '#000000' : '#ffffff';
}
