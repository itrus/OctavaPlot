import { chartPx2Pt } from '../../model/units';
import { checkFonts, type FontCheck } from './fontCheck';
import { checkGlyphs, type GlyphCheck } from './glyphCheck';
import { exportPixels, fitsCanvas } from './pngDpi';

type ReportFormat = 'svg' | 'png' | 'pdf';

/** What cannot be promised about an export, whatever the graph. Fixed texts, shown and copied as they are. */
export const EXPORT_LIMITS = [
  'PDF holds a raster picture at the chosen resolution, not vector shapes.',
  'Fonts are not embedded in an SVG: a computer without the font draws another one.',
  'A PNG records its resolution (dpi), but the physical size depends on the program that places it.',
] as const;

export interface ExportReportInput {
  name: string;
  /** Size of the drawing in CSS pixels (96 px = 1 in). */
  widthPx: number;
  heightPx: number;
  format: ReportFormat;
  /** Resolution of a PNG or PDF; ignored for SVG. */
  dpi: number;
  /** The font-family lists the drawing asks for (CSS syntax); each is checked once. */
  fontFamilies: readonly string[];
  isFontAvailable: (family: string) => boolean;
  /** Every text of the drawing (see drawingTexts), to look the characters up in the font; absent or null when they are not known (a page layout). */
  texts?: readonly string[] | null;
  /** For a page of several fonts: the texts with the font-family list each is written in (a page layout; see layoutTextGroups). Each group is checked in the first available family of its list. */
  textGroups?: ReadonlyArray<{ fontFamily: string; texts: readonly string[] }>;
  /** Whether a font has a character; asked only for characters outside basic Latin. */
  hasGlyph?: (family: string, char: string) => boolean;
  /** What the model says it could not draw or clipped, as it words it. */
  warnings: readonly string[];
  /** The print width the graph is checked against, mm; null = none. */
  printWidthMm: number | null;
  printWarnings: readonly string[];
}

interface Size {
  width: number;
  height: number;
}

/** What an export will make, and what may go wrong with it, for one graph or page. Plain data: its key order is fixed. */
export interface ExportReport {
  name: string;
  format: ReportFormat;
  /** Null for SVG, which has no resolution. */
  dpi: number | null;
  size: { px: Size; pt: Size; mm: Size };
  /** The pixels of the PNG or of the picture in a PDF; null for SVG. */
  raster: { width: number; height: number; megapixels: number; exceedsCanvasLimit: boolean } | null;
  fonts: FontCheck[];
  /** Characters of the texts that the font in use does not have; null when the texts are not known. */
  glyphs: GlyphCheck | null;
  /** The same check for each font of a page (one entry for each font-family list that writes texts); empty for a graph. */
  glyphGroups: GlyphCheck[];
  warnings: string[];
  printWidthMm: number | null;
  printWarnings: string[];
  limits: string[];
}

const round = (v: number, digits: number): number => Math.round(v * 10 ** digits) / 10 ** digits;

export function buildExportReport(input: ExportReportInput): ExportReport {
  const { widthPx, heightPx } = input;
  const mm = (px: number) => round((px * 25.4) / 96, 2);
  const fonts = [...new Set(input.fontFamilies)].map((list) => checkFonts(list, input.isFontAvailable));
  const groups = input.textGroups ?? [];
  const pixels = input.format === 'svg' ? null : exportPixels({ widthPx, heightPx }, input.dpi);
  return {
    name: input.name,
    format: input.format,
    dpi: pixels ? input.dpi : null,
    size: {
      px: { width: round(widthPx, 2), height: round(heightPx, 2) },
      pt: { width: round(chartPx2Pt(widthPx), 2), height: round(chartPx2Pt(heightPx), 2) },
      mm: { width: mm(widthPx), height: mm(heightPx) },
    },
    raster: pixels && { width: pixels.width, height: pixels.height, megapixels: round((pixels.width * pixels.height) / 1e6, 2), exceedsCanvasLimit: !fitsCanvas(pixels.width, pixels.height) },
    fonts,
    // The characters are looked up in the font the drawing is made in: the first list is the chart's own.
    glyphs: input.texts && input.hasGlyph ? checkGlyphs(input.texts, fonts[0]?.used ?? null, input.hasGlyph) : null,
    glyphGroups: input.hasGlyph ? groups.map((g) => checkGlyphs(g.texts, checkFonts(g.fontFamily, input.isFontAvailable).used, input.hasGlyph!)) : [],
    warnings: [...input.warnings],
    printWidthMm: input.printWidthMm,
    printWarnings: [...input.printWarnings],
    limits: [...EXPORT_LIMITS],
  };
}
