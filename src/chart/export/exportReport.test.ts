import { describe, expect, it } from 'vitest';
import { buildExportReport, EXPORT_LIMITS, type ExportReportInput, checkFonts, parseFontFamilies, checkGlyphs } from './exportReport';
import { createExampleProject } from '../../model/defaults';
import { addAnnotation } from '../../state/commands';
import { buildAnyModel, chartTexts } from '../anyModel';
import { drawingTexts } from '../shared/scene/sceneText';

const input = (patch: Partial<ExportReportInput> = {}): ExportReportInput => ({
  name: 'Graph 1',
  widthPx: 640,
  heightPx: 480,
  format: 'png',
  dpi: 300,
  fontFamilies: ['Arial, Helvetica, sans-serif'],
  isFontAvailable: () => true,
  warnings: [],
  ...patch,
});

describe('buildExportReport', () => {
  it('gives the size in px, pt and mm, and the pixels of the raster at the resolution', () => {
    const r = buildExportReport(input());
    expect(r.size).toEqual({ px: { width: 640, height: 480 }, pt: { width: 480, height: 360 }, mm: { width: 169.33, height: 127 } });
    expect(r.raster).toEqual({ width: 2000, height: 1500, megapixels: 3, exceedsCanvasLimit: false });
    expect(r.format).toBe('png');
    expect(r.dpi).toBe(300);
  });
  it('has the chart pixels at 96 dpi', () => {
    expect(buildExportReport(input({ dpi: 96 })).raster).toEqual({ width: 640, height: 480, megapixels: 0.31, exceedsCanvasLimit: false });
  });
  it('has the chart pixels and no resolution for the PNG of a graph, which is given none', () => {
    const r = buildExportReport(input({ dpi: undefined }));
    expect(r.raster).toEqual({ width: 640, height: 480, megapixels: 0.31, exceedsCanvasLimit: false });
    expect(r.dpi).toBeNull();
  });
  it('has no raster and no resolution for an SVG', () => {
    const r = buildExportReport(input({ format: 'svg', widthPx: 100000 }));
    expect(r.raster).toBeNull();
    expect(r.dpi).toBeNull();
    expect(r.size.px.width).toBe(100000);
  });
  it('has no raster and no resolution for a PDF either: it is vector', () => {
    const r = buildExportReport(input({ format: 'pdf', dpi: 150 }));
    expect(r.raster).toBeNull();
    expect(r.dpi).toBeNull();
  });
  it('says when the canvas limit is exceeded, with the limits of fitsCanvas', () => {
    const exceeds = (widthPx: number, heightPx: number) => buildExportReport(input({ widthPx, heightPx })).raster?.exceedsCanvasLimit;
    expect(exceeds(5000, 100)).toBe(false); // 15625 px wide
    expect(exceeds(5200, 100)).toBe(true); // 16250 px wide: over the side limit
    expect(exceeds(5100, 4300)).toBe(true); // 15938 x 13438 px: over the area limit
    expect(exceeds(5000, 3200)).toBe(false);
  });
  it('checks the fonts of every list asked for, once each', () => {
    const r = buildExportReport(input({ fontFamilies: ["'Times New Roman', Times, serif", 'Arial, sans-serif', 'Arial, sans-serif'], isFontAvailable: (f) => f !== 'Times New Roman' }));
    expect(r.fonts.map((f) => f.requested)).toEqual(["'Times New Roman', Times, serif", 'Arial, sans-serif']);
    expect(r.fonts[0]).toMatchObject({ used: 'Times', missing: ['Times New Roman'], replacedBy: 'Times' });
    expect(r.fonts[1]).toMatchObject({ used: 'Arial', missing: [], replacedBy: null });
  });
  it('passes the model warnings through in their order', () => {
    const r = buildExportReport(input({ warnings: ['b', 'a', 'b'] }));
    expect(r.warnings).toEqual(['b', 'a', 'b']);
  });
  it('always lists the known limits', () => {
    const r = buildExportReport(input());
    expect(r.limits).toEqual([...EXPORT_LIMITS]);
    expect(r.limits.join(' ')).toMatch(/PDF is vector.*standard fonts/);
    expect(r.limits.join(' ')).toMatch(/not embedded in an SVG/);
    expect(r.limits.join(' ')).toMatch(/PNG.*resolution/);
  });
  it('keeps its keys in a fixed order and survives a JSON round trip', () => {
    const r = buildExportReport(input({ warnings: ['w'] }));
    expect(Object.keys(r)).toEqual(['name', 'format', 'dpi', 'size', 'raster', 'fonts', 'glyphs', 'glyphGroups', 'warnings', 'limits']);
    expect(Object.keys(r.size)).toEqual(['px', 'pt', 'mm']);
    expect(Object.keys(r.raster!)).toEqual(['width', 'height', 'megapixels', 'exceedsCanvasLimit']);
    expect(Object.keys(r.fonts[0])).toEqual(['requested', 'families', 'used', 'missing', 'replacedBy']);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(JSON.stringify(buildExportReport(input({ warnings: ['w'] })))).toBe(JSON.stringify(r));
  });
});

const has = (...names: string[]) => (family: string) => names.includes(family);

describe('parseFontFamilies', () => {
  it('splits a CSS list and takes the quotes off', () => {
    expect(parseFontFamilies("Arial, Helvetica, sans-serif")).toEqual(['Arial', 'Helvetica', 'sans-serif']);
    expect(parseFontFamilies(`'Times New Roman', "Noto Serif", serif`)).toEqual(['Times New Roman', 'Noto Serif', 'serif']);
  });
  it('keeps a comma inside quotes and drops empty entries', () => {
    expect(parseFontFamilies(`"Foo, Bar", , Baz,`)).toEqual(['Foo, Bar', 'Baz']);
  });
  it('gives nothing for an empty list', () => {
    expect(parseFontFamilies('')).toEqual([]);
    expect(parseFontFamilies('  ')).toEqual([]);
  });
});

describe('checkFonts', () => {
  it('reports the first available family as the one in use', () => {
    const r = checkFonts('Arial, Helvetica, sans-serif', has('Arial', 'Helvetica'));
    expect(r.families).toEqual([
      { family: 'Arial', status: 'available' },
      { family: 'Helvetica', status: 'available' },
      { family: 'sans-serif', status: 'generic' },
    ]);
    expect(r.used).toBe('Arial');
    expect(r.missing).toEqual([]);
    expect(r.replacedBy).toBeNull();
  });
  it('reports the fallback that will be used when the first families are missing', () => {
    const r = checkFonts("'Times New Roman', Times, serif", has('Times'));
    expect(r.families.map((f) => f.status)).toEqual(['missing', 'available', 'generic']);
    expect(r.used).toBe('Times');
    expect(r.missing).toEqual(['Times New Roman']);
    expect(r.replacedBy).toBe('Times');
  });
  it('falls back to the generic family when nothing is installed', () => {
    const r = checkFonts('Verdana, Geneva, sans-serif', has());
    expect(r.used).toBe('sans-serif');
    expect(r.missing).toEqual(['Verdana', 'Geneva']);
    expect(r.replacedBy).toBe('sans-serif');
  });
  it('counts the generic names as available without asking, in any case', () => {
    const asked: string[] = [];
    const r = checkFonts('SERIF, system-ui, ui-sans-serif, cursive, monospace', (f) => (asked.push(f), false));
    expect(asked).toEqual([]);
    expect(r.families.every((f) => f.status === 'generic')).toBe(true);
    expect(r.used).toBe('SERIF');
    expect(r.replacedBy).toBeNull();
  });
  it('handles an empty list', () => {
    expect(checkFonts('', has())).toEqual({ requested: '', families: [], used: null, missing: [], replacedBy: null });
  });
  it('reports a list with only missing fonts as having no font in use', () => {
    const r = checkFonts('Nope', has());
    expect(r.used).toBeNull();
    expect(r.replacedBy).toBeNull();
    expect(r.missing).toEqual(['Nope']);
  });
});

const only = (...have: string[]) => (_family: string, char: string) => have.includes(char);

describe('checkGlyphs', () => {
  it('looks up only characters outside basic Latin, once each, and counts them', () => {
    const asked: string[] = [];
    const r = checkGlyphs(['Dose (µg/mL)', 'α = 0.05, α'], 'Arial', (_f, c) => (asked.push(c), false));
    expect(asked.sort()).toEqual(['µ', 'α']);
    expect(r.checked).toBe(2);
    expect(r.missing).toEqual([
      { char: 'µ', codePoint: 'U+00B5', count: 1 },
      { char: 'α', codePoint: 'U+03B1', count: 2 },
    ]);
  });
  it('reports nothing when the font has them all, with Greek letters and sub- and superscripts looked up', () => {
    const r = checkGlyphs(['H₂O', 'x²', 'β'], 'Arial', only('₂', '²', 'β'));
    expect(r).toEqual({ font: 'Arial', checked: 3, missing: [], skipped: null });
    expect(checkGlyphs(['H₂O', 'x²'], 'Arial', only('²')).missing.map((m) => m.codePoint)).toEqual(['U+2082']);
  });
  it('does not look up spaces, controls or zero-width characters', () => {
    expect(checkGlyphs(['a b c​d\u0085'], 'Arial', () => false).checked).toBe(0);
  });
  it('says why it did not look when there is no font or only a generic one', () => {
    expect(checkGlyphs(['α'], null, () => false)).toMatchObject({ font: null, missing: [], skipped: expect.stringMatching(/No font/) });
    expect(checkGlyphs(['α'], 'sans-serif', () => false)).toMatchObject({ missing: [], skipped: expect.stringMatching(/generic/) });
  });
});

describe('the glyphs in the export report', () => {
  const base = { name: 'g', widthPx: 100, heightPx: 100, format: 'svg' as const, dpi: 96, fontFamilies: ['Arial, sans-serif'], isFontAvailable: () => true, warnings: [] };
  it('are checked in the font in use, and null when the texts are not known', () => {
    expect(buildExportReport(base).glyphs).toBeNull();
    const r = buildExportReport({ ...base, texts: ['α'], hasGlyph: (f) => f !== 'Arial' });
    expect(r.glyphs).toMatchObject({ font: 'Arial', missing: [{ char: 'α' }] });
    expect(buildExportReport({ ...base, isFontAvailable: () => false, texts: ['α'], hasGlyph: () => true }).glyphs?.skipped).toMatch(/generic/);
  });
});

describe('the texts of a drawing', () => {
  it('hold the titles, labels and annotations, line by line', () => {
    const p0 = createExampleProject();
    const p = addAnnotation(p0.charts[0].id, { id: 'n1', text: 'α = 0.05\nsecond line', xFrac: 0.1, yFrac: 0.1, fontSizePt: 12, color: '#000000', opacity: 1 })(p0);
    const chart = p.charts[0];
    const texts = chartTexts(chart, buildAnyModel(chart, p.dataTables[0]));
    expect(texts).toEqual(expect.arrayContaining(['α = 0.05', 'second line']));
    expect(texts.length).toBeGreaterThan(5);
    expect(drawingTexts({ widthPt: 1, heightPt: 1, sections: [{ nodes: [] }] })).toEqual([]);
  });
});
