import { color } from 'd3';

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

/** A colour at some opacity laid over an opaque one, as the colour the eye sees. */
export function overColour(top: string, opacity: number, under: string): string {
  const t = color(top)?.rgb();
  const u = color(under)?.rgb();
  if (!t || !u) return under;
  const a = Math.min(1, Math.max(0, opacity));
  const mix = (x: number, y: number) => Math.round(x * a + y * (1 - a));
  return `#${[mix(t.r, u.r), mix(t.g, u.g), mix(t.b, u.b)].map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}
