import { describe, expect, it } from 'vitest';
import { buildExportReport, EXPORT_LIMITS, type ExportReportInput } from './exportReport';

const input = (patch: Partial<ExportReportInput> = {}): ExportReportInput => ({
  name: 'Graph 1',
  widthPx: 640,
  heightPx: 480,
  format: 'png',
  dpi: 300,
  fontFamilies: ['Arial, Helvetica, sans-serif'],
  isFontAvailable: () => true,
  warnings: [],
  printWidthMm: null,
  printWarnings: [],
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
  it('has no raster and no resolution for an SVG', () => {
    const r = buildExportReport(input({ format: 'svg', widthPx: 100000 }));
    expect(r.raster).toBeNull();
    expect(r.dpi).toBeNull();
    expect(r.size.px.width).toBe(100000);
  });
  it('has a raster for a PDF too', () => {
    expect(buildExportReport(input({ format: 'pdf', dpi: 150 })).raster).toMatchObject({ width: 1000, height: 750 });
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
  it('passes the model warnings and the print-size warnings through in their order', () => {
    const r = buildExportReport(input({ warnings: ['b', 'a', 'b'], printWidthMm: 90, printWarnings: ['Tick labels would print at 4.6 pt at 90 mm wide (smaller than 6 pt)'] }));
    expect(r.warnings).toEqual(['b', 'a', 'b']);
    expect(r.printWidthMm).toBe(90);
    expect(r.printWarnings).toEqual(['Tick labels would print at 4.6 pt at 90 mm wide (smaller than 6 pt)']);
  });
  it('always lists the known limits', () => {
    const r = buildExportReport(input());
    expect(r.limits).toEqual([...EXPORT_LIMITS]);
    expect(r.limits.join(' ')).toMatch(/PDF.*raster/);
    expect(r.limits.join(' ')).toMatch(/not embedded in an SVG/);
    expect(r.limits.join(' ')).toMatch(/PNG.*resolution/);
  });
  it('keeps its keys in a fixed order and survives a JSON round trip', () => {
    const r = buildExportReport(input({ warnings: ['w'], printWidthMm: 140 }));
    expect(Object.keys(r)).toEqual(['name', 'format', 'dpi', 'size', 'raster', 'fonts', 'warnings', 'printWidthMm', 'printWarnings', 'limits']);
    expect(Object.keys(r.size)).toEqual(['px', 'pt', 'mm']);
    expect(Object.keys(r.raster!)).toEqual(['width', 'height', 'megapixels', 'exceedsCanvasLimit']);
    expect(Object.keys(r.fonts[0])).toEqual(['requested', 'families', 'used', 'missing', 'replacedBy']);
    expect(JSON.parse(JSON.stringify(r))).toEqual(r);
    expect(JSON.stringify(buildExportReport(input({ warnings: ['w'], printWidthMm: 140 })))).toBe(JSON.stringify(r));
  });
});
