/**
 * Unit helpers. Chart sizes are stored and shown in CSS pixels; the renderer's internal unit is the
 * typographic point (pt): 1 in = 72 pt, and 1 CSS px = 0.75 pt at the nominal 96 px/in.
 * The SVG viewBox is expressed in pt, so every stroke width, font size and
 * symbol extent in the renderer is a physical quantity in pt, independent of
 * chart dimensions.
 */
export const PT_PER_INCH = 72;
export const CSS_PX_PER_INCH = 96;

export const ptToPx = (pt: number): number => (pt * CSS_PX_PER_INCH) / PT_PER_INCH;
/**
 * Charts are drawn at twice the size their pixel dimensions suggest: the SVG viewBox is half the chart's size
 * in pt, so every font, line, symbol and margin (all in pt) comes out 2x larger on the page and in exports.
 */
export const CHART_DRAW_SCALE = 2;
export const chartPx2Pt = (px: number): number => pxToPt(px) / CHART_DRAW_SCALE;
export const pxToPt = (px: number): number => (px * PT_PER_INCH) / CSS_PX_PER_INCH;

/** Compact number for SVG attributes (avoids float noise in exported files). */
export const n2 = (v: number): string => String(Math.round(v * 100) / 100);
