/**
 * Unit helpers. Chart sizes are stored and shown in CSS pixels; the renderer's internal unit is the
 * typographic point (pt): 1 in = 72 pt, and 1 CSS px = 0.75 pt at the nominal 96 px/in.
 * The SVG viewBox is expressed in pt, so every stroke width, font size and
 * symbol extent in the renderer is a physical quantity in pt, independent of
 * chart dimensions.
 */
const PT_PER_INCH = 72;
const CSS_PX_PER_INCH = 96;

/** The size of a chart in pt (the SVG viewBox) from its size in CSS pixels. */
export const chartPx2Pt = (px: number): number => (px * PT_PER_INCH) / CSS_PX_PER_INCH;

/** Compact number for SVG attributes (avoids float noise in exported files). */
export const n2 = (v: number): string => String(Math.round(v * 100) / 100);

/** Smallest and largest of a list without spreading it into arguments (which overflows the stack for very long lists). */
export function extent(values: readonly number[]): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (const v of values) {
    if (v < lo) lo = v;
    if (v > hi) hi = v;
  }
  return [lo, hi];
}
