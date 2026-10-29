import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { defaultLayout } from '../../model/project/layout';
import type { Layout, LayoutLegend, Project } from '../../model/types';
import { buildExportReport } from './exportReport';
import { drawLayout, layoutTextGroups } from './layoutExport';

const project = (): Project => createExampleProject();
const page = (p: Project, over: Partial<Layout> = {}, panels: Array<string | null> = [p.charts[0].id, null]): Layout => ({ ...defaultLayout('l1', 'Page', { panels }), ...over });
const count = (haystack: string, needle: string): number => haystack.split(needle).length - 1;
const MASTER: LayoutLegend = { position: 'bottom', fontSizePt: 10, hideGraphLegends: true };
/** The master legend alone (it is written after the graphs and the labels). */
const masterOnly = (svg: string): string => svg.slice(svg.indexOf('<g id="master-legend">'));
/** The places of the entries of the master legend: translate(x y) scale(...) of each. */
const placesOf = (svg: string): Array<{ x: number; y: number }> => [...svg.matchAll(/<g transform="translate\(([-\d.]+) ([-\d.]+)\) scale\(/g)].map((m) => ({ x: Number(m[1]), y: Number(m[2]) }));

describe('rich text on a page', () => {
  it('writes the title with its scripts and Greek names as tspans, the shifts those of the graphs', () => {
    const p = project();
    const { svg } = drawLayout(page(p, { showTitle: true, title: 'H_{2}O at \\alpha = 0.05, x^{2}' }), p);
    // a subscript sinks 0.28 em at 70% of the size: 0.28 / 0.7 = 0.4 em of its own; the text after it returns by 0.28 em
    expect(svg).toContain('H<tspan font-size="70%" dy="0.4em">2</tspan><tspan dy="-0.28em">O at α = 0.05, x</tspan><tspan font-size="70%" dy="-0.571em">2</tspan>');
    expect(svg).not.toContain('\\alpha');
    expect(svg).not.toContain('_{');
  });
  it('leaves a title without markup exactly as typed, with only the XML characters escaped', () => {
    const p = project();
    const { svg } = drawLayout(page(p, { showTitle: true, title: 'Mouse_3 & <Run_2>' }), p);
    expect(svg).toContain('>Mouse_3 &amp; &lt;Run_2&gt;</text>');
  });
  it('writes a panel label as plain text', () => {
    const p = project();
    const { svg } = drawLayout(page(p), p);
    expect(svg).toMatch(/font-weight="700" fill="#000000">A<\/text>/);
  });
});

describe('the texts of a page, by font', () => {
  it('holds the title (as it is shown) and the labels in the page font, and each graph in its own font', () => {
    const p = project();
    const georgia = { ...p, charts: p.charts.map((c) => ({ ...c, fontFamily: 'Georgia, serif' })) };
    const groups = layoutTextGroups(page(georgia, { showTitle: true, title: 'x_{1} \\mu mol' }), georgia, 'Arial, sans-serif');
    expect(groups.map((g) => g.fontFamily)).toEqual(['Arial, sans-serif', 'Georgia, serif']);
    expect(groups[0].texts).toEqual(['x1 μ mol', 'A', 'B']);
    expect(groups[1].texts).toEqual(expect.arrayContaining(['Group A', 'Group D']));
  });
  it('are one group for a graph in the page font, and leave out a title that is not shown', () => {
    const p = project();
    const groups = layoutTextGroups(page(p, { showTitle: false, title: 'hidden' }), p, p.charts[0].fontFamily);
    expect(groups).toHaveLength(1);
    expect(groups[0].texts).not.toContain('hidden');
  });
  it('reach the report: each font is checked for the characters its texts hold', () => {
    const p = project();
    const georgia = { ...p, charts: p.charts.map((c) => ({ ...c, fontFamily: 'Georgia, serif' })) };
    const layout = page(georgia, { showTitle: true, title: '\\alpha' });
    const report = buildExportReport({
      name: 'Page',
      widthPx: 100,
      heightPx: 100,
      format: 'svg',
      dpi: 96,
      fontFamilies: ['Arial, sans-serif', 'Georgia, serif'],
      isFontAvailable: () => true,
      textGroups: layoutTextGroups(layout, georgia, 'Arial, sans-serif'),
      hasGlyph: (family) => family !== 'Arial', // only Arial lacks the Greek letter
      warnings: [],
      printWidthMm: null,
      printWarnings: [],
    });
    expect(report.glyphs).toBeNull();
    expect(report.glyphGroups.map((g) => [g.font, g.missing.map((m) => m.codePoint)])).toEqual([['Arial', ['U+03B1']], ['Georgia', []]]);
  });
});

describe('a master legend', () => {
  it('lists the entries of the graphs once, and the graphs lose their own legend', () => {
    const p = project();
    const { svg } = drawLayout(page(p, { legend: MASTER }, [p.charts[0].id, p.charts[0].id]), p);
    // two panels of one graph: four names, each once in the master legend; elsewhere only as the names of the columns, once for each panel
    for (const name of ['Group A', 'Group B', 'Group C', 'Group D']) {
      expect(count(masterOnly(svg), `>${name}</text>`)).toBe(1);
      expect(count(svg, `>${name}</text>`)).toBe(3);
    }
    expect(svg).toContain('id="master-legend"');
  });
  it('keeps the legends of the graphs when told to, and adds the master one', () => {
    const p = project();
    const { svg } = drawLayout(page(p, { legend: { ...MASTER, hideGraphLegends: false } }, [p.charts[0].id, null]), p);
    // the column name, the graph's own legend entry, and the master legend's
    expect(count(svg, '>Group A</text>')).toBe(3);
    expect(count(masterOnly(svg), '>Group A</text>')).toBe(1);
  });
  it('makes no entries from a graph whose legend is switched off, and says so when the page has none', () => {
    const p = project();
    const off = { ...p, charts: p.charts.map((c) => ({ ...c, legend: { ...c.legend, visible: false } })) };
    const d = drawLayout(page(off, { legend: MASTER }), off);
    expect(d.svg).not.toContain('master-legend');
    expect(d.arranged.frame.legend).toBeNull();
    expect(d.notices.join(' ')).toMatch(/master legend is empty/);
  });
  it('takes its room from the panels: the bottom band holds it, and the graph is placed above the band', () => {
    const p = project();
    const l = page(p, { legend: MASTER }, [p.charts[0].id, null]);
    const withLegend = drawLayout(l, p);
    const without = drawLayout({ ...l, legend: undefined }, p);
    const band = withLegend.arranged.frame.legend!;
    expect(band).not.toBeNull();
    expect(withLegend.arranged.placements[0].rect.h).toBeLessThan(without.arranged.placements[0].rect.h);
    expect(withLegend.arranged.placements[0].rect.y + withLegend.arranged.placements[0].rect.h).toBeLessThanOrEqual(band.y);
    // The entries of one row: one centre line, half a row (1.55 x 10 pt) below the top of the band, in order from the left, inside the band.
    const places = placesOf(withLegend.svg);
    expect(places).toHaveLength(4);
    expect(new Set(places.map((q) => q.y)).size).toBe(1);
    expect(places[0].y).toBeCloseTo(band.y + 0.5 * 15.5, 1);
    expect(places.map((q) => q.x)).toEqual([...places.map((q) => q.x)].sort((a, b) => a - b));
    expect(places[0].x).toBeGreaterThan(band.x); // the block is centred, so it does not start at the edge
    expect(places[3].x).toBeLessThan(band.x + band.w);
  });
  it('stands the entries one under the other on the right, a row of 1.55 times the text size apart, in a band at the right margin', () => {
    const p = project();
    const l = page(p, { legend: { ...MASTER, position: 'right', fontSizePt: 12 } }, [p.charts[0].id, null]);
    const d = drawLayout(l, p);
    const band = d.arranged.frame.legend!;
    const places = placesOf(d.svg);
    expect(places).toHaveLength(4);
    expect(places[1].y - places[0].y).toBeCloseTo(12 * 1.55, 1);
    expect(places[3].y - places[0].y).toBeCloseTo(3 * 12 * 1.55, 1);
    // vertically centred in the band: the block is 4 rows high
    expect(places[0].y).toBeCloseTo(band.y + (band.h - 4 * 12 * 1.55) / 2 + 0.5 * 12 * 1.55, 1);
    expect(band.x + band.w).toBeCloseTo(d.widthPt - (l.marginMm * 72) / 25.4, 6);
  });
  it('scales an entry by the page text size over the one of the graph', () => {
    const p = project();
    const size = p.charts[0].legend.fontSizePt;
    const d = drawLayout(page(p, { legend: { ...MASTER, fontSizePt: size * 2 } }, [p.charts[0].id, null]), p);
    expect(d.svg).toMatch(/<g transform="translate\([-\d.]+ [-\d.]+\) scale\(2\) translate\(/);
  });
  it('wraps a long legend into rows, and the band is as high as the rows', () => {
    const p = project();
    const rowed = drawLayout(page(p, { legend: { ...MASTER, fontSizePt: 24 } }, [p.charts[0].id, null]), p);
    const rows = new Set(placesOf(rowed.svg).map((q) => q.y)).size;
    const band = rowed.arranged.frame.legend!;
    expect(band.h).toBeCloseTo(rows * 24 * 1.55, 6);
  });
});
