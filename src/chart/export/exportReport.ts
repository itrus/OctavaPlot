import { chartPx2Pt, pxToMm } from '../../model/units';
import { exportPixels, fitsCanvas, GRAPH_PNG_DPI } from './pngDpi';

type ReportFormat = 'svg' | 'png' | 'pdf';

/** What cannot be promised about an export, whatever the graph. Fixed texts, shown and copied as they are. */
export const EXPORT_LIMITS = [
  'A PDF is vector shapes and text, with no resolution. Its text is written in the standard fonts Helvetica, Times and Courier (Symbol for Greek letters and signs), the nearest to the font of the graph; they are not embedded, and a character none of them has is written as "?".',
  'Fonts are not embedded in an SVG: a computer without the font draws another one.',
  'A PNG records its resolution (dpi), but the physical size depends on the program that places it.',
] as const;

export interface ExportReportInput {
  name: string;
  /** Size of the drawing in CSS pixels (96 px = 1 in). */
  widthPx: number;
  heightPx: number;
  format: ReportFormat;
  /** Resolution of a PNG (a page layout's); ignored for SVG and PDF, which have none. Absent: a graph's PNG, at its own size (96 dpi) with no resolution to choose. */
  dpi?: number;
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
}

interface Size {
  width: number;
  height: number;
}

/** What an export will make, and what may go wrong with it, for one graph or page. Plain data: its key order is fixed. */
export interface ExportReport {
  name: string;
  format: ReportFormat;
  /** Null for SVG and PDF, which have no resolution, and for a graph's PNG, which has none to choose. */
  dpi: number | null;
  size: { px: Size; pt: Size; mm: Size };
  /** The pixels of the PNG; null for SVG and PDF. */
  raster: { width: number; height: number; megapixels: number; exceedsCanvasLimit: boolean } | null;
  fonts: FontCheck[];
  /** Characters of the texts that the font in use does not have; null when the texts are not known. */
  glyphs: GlyphCheck | null;
  /** The same check for each font of a page (one entry for each font-family list that writes texts); empty for a graph. */
  glyphGroups: GlyphCheck[];
  warnings: string[];
  limits: string[];
}

const round = (v: number, digits: number): number => Math.round(v * 10 ** digits) / 10 ** digits;

export function buildExportReport(input: ExportReportInput): ExportReport {
  const { widthPx, heightPx } = input;
  const mm = (px: number) => round(pxToMm(px), 2);
  const fonts = [...new Set(input.fontFamilies)].map((list) => checkFonts(list, input.isFontAvailable));
  const groups = input.textGroups ?? [];
  const pixels = input.format === 'png' ? exportPixels({ widthPx, heightPx }, input.dpi ?? GRAPH_PNG_DPI) : null;
  return {
    name: input.name,
    format: input.format,
    dpi: pixels && input.dpi !== undefined ? input.dpi : null,
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
    limits: [...EXPORT_LIMITS],
  };
}

/** Family names every browser resolves itself: a font check never calls them missing, and a glyph check cannot judge them (what is drawn is up to the system). */
const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded']);

type FontStatus = 'available' | 'missing' | 'generic';

export interface FontCheck {
  /** The CSS font-family list as the chart holds it. */
  requested: string;
  families: Array<{ family: string; status: FontStatus }>;
  /** The first family that is available (or generic): the one the browser draws with. Null when none is. */
  used: string | null;
  missing: string[];
  /** What is drawn instead when the first family of the list is missing; null when the first one is there. */
  replacedBy: string | null;
}

/** The family names of a CSS font-family list, without quotes ("Arial, 'Times New Roman'" gives Arial and Times New Roman). */
export function parseFontFamilies(list: string): string[] {
  const out: string[] = [];
  let current = '';
  let quote: string | null = null;
  const push = () => {
    const name = current.trim();
    if (name !== '') out.push(name);
    current = '';
  };
  for (const ch of list) {
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
    } else if (ch === '"' || ch === "'") quote = ch;
    else if (ch === ',') push();
    else current += ch;
  }
  push();
  return out;
}

/** Checks a font-family list. The availability test is a parameter: the browser one is in ui/export/browserFonts.ts, tests pass a fake. */
export function checkFonts(list: string, isAvailable: (family: string) => boolean): FontCheck {
  const families = parseFontFamilies(list).map((family) => ({
    family,
    status: (GENERIC.has(family.toLowerCase()) ? 'generic' : isAvailable(family) ? 'available' : 'missing') as FontStatus,
  }));
  const used = families.find((f) => f.status !== 'missing')?.family ?? null;
  const first = families[0];
  return {
    requested: list,
    families,
    used,
    missing: families.filter((f) => f.status === 'missing').map((f) => f.family),
    replacedBy: first?.status === 'missing' ? used : null,
  };
}

interface MissingGlyph {
  char: string;
  /** "U+03B1". */
  codePoint: string;
  /** How many times the character occurs in the texts of the drawing. */
  count: number;
}

export interface GlyphCheck {
  /** The font the characters were looked up in: the one the browser draws with. Null when none could be checked. */
  font: string | null;
  /** How many different characters outside basic Latin the texts hold (the ones that were looked up). */
  checked: number;
  /** Characters the font does not have: the browser draws each of them with another font, or with an empty box. */
  missing: MissingGlyph[];
  /** Why nothing was looked up (no font to ask, or a generic one); null when the check ran. */
  skipped: string | null;
}

const codePointText = (cp: number): string => `U+${cp.toString(16).toUpperCase().padStart(4, '0')}`;

/** Characters that are not looked up besides basic Latin: zero-width and line-separator characters and the byte-order mark. */
const INVISIBLE = new Set([0x200b, 0x200c, 0x200d, 0x200e, 0x200f, 0x2028, 0x2029, 0xfeff]);

/** Basic Latin (printable ASCII), the controls and every kind of space are not looked up: a font that lacks them is not usable at all. */
const isLookedUp = (char: string): boolean => {
  const cp = char.codePointAt(0)!;
  if (cp <= 0x7e) return false;
  if (cp >= 0x7f && cp <= 0x9f) return false;
  return !/\s/u.test(char) && !INVISIBLE.has(cp);
};

/**
 * Which characters of the texts a font does not have. The lookup is a parameter: the browser one is in ui/export/browserFonts.ts,
 * tests pass a fake. `font` is the family the drawing ends up in (`FontCheck.used`); a generic family, or none, cannot be asked.
 */
export function checkGlyphs(texts: readonly string[], font: string | null, hasGlyph: (family: string, char: string) => boolean): GlyphCheck {
  const counts = new Map<string, number>();
  for (const text of texts) for (const char of text) if (isLookedUp(char)) counts.set(char, (counts.get(char) ?? 0) + 1);
  if (font === null) return { font: null, checked: counts.size, missing: [], skipped: 'No font of the list is installed.' };
  if (GENERIC.has(font.toLowerCase())) return { font, checked: counts.size, missing: [], skipped: `${font} is a generic family: the system chooses the font for each character.` };
  const missing = [...counts]
    .filter(([char]) => !hasGlyph(font, char))
    .map(([char, count]) => ({ char, codePoint: codePointText(char.codePointAt(0)!), count }))
    .sort((a, b) => a.codePoint.localeCompare(b.codePoint));
  return { font, checked: counts.size, missing, skipped: null };
}
