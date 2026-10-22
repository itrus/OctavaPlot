/**
 * Unit helpers. The chart's internal unit is the typographic point (pt):
 * 1 in = 25.4 mm = 72 pt, and 1 CSS px = 0.75 pt at the nominal 96 px/in.
 * The SVG viewBox is expressed in pt, so every stroke width, font size and
 * symbol extent in the renderer is a physical quantity in pt, independent of
 * chart dimensions.
 */
export const PT_PER_INCH = 72;
export const MM_PER_INCH = 25.4;
export const CSS_PX_PER_INCH = 96;

export const mmToPt = (mm: number): number => (mm * PT_PER_INCH) / MM_PER_INCH;
export const ptToMm = (pt: number): number => (pt * MM_PER_INCH) / PT_PER_INCH;
export const ptToPx = (pt: number): number => (pt * CSS_PX_PER_INCH) / PT_PER_INCH;
export const pxToPt = (px: number): number => (px * PT_PER_INCH) / CSS_PX_PER_INCH;
export const mmToPx = (mm: number): number => ptToPx(mmToPt(mm));

/** Compact number for SVG attributes (avoids float noise in exported files). */
export const n2 = (v: number): string => String(Math.round(v * 100) / 100);
