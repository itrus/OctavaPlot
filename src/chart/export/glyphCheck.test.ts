import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { addAnnotation } from '../../state/commands';
import { buildAnyModel, chartTexts } from '../anyModel';
import { drawingTexts } from '../shared/scene/sceneText';
import { buildExportReport } from './exportReport';
import { checkGlyphs } from './glyphCheck';

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
  const base = { name: 'g', widthPx: 100, heightPx: 100, format: 'svg' as const, dpi: 96, fontFamilies: ['Arial, sans-serif'], isFontAvailable: () => true, warnings: [], printWidthMm: null, printWarnings: [] };
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
