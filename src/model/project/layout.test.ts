import { describe, expect, it } from 'vitest';
import { drawLayout } from '../chart/layoutExport';
import { addChart, addDataTable, addFreePanel, addLayout, duplicateLayout, freeLayout, patchLayout, removeChart, removeFreePanel, removeLayout, removeTable, renameItem, setFrame, setLayoutPanel } from '../state/commands';
import { buildPdf, rgbaToFlateRgb } from '../chart/pdf';
import { parseProject, stringifyProject } from '../state/serialize';
import { createExampleProject } from './defaults';
import { arrangeLayout, defaultLayout, mmToPt, pageFrame, panelLabel, sanitizeLayout, slotCount, slotRects, standardArrangements, turnFrames } from './layout';
import type { FrameMm, Layout, Project } from './types';

const twoCharts = (): Project => {
  const p = createExampleProject();
  return addChart('chart_b', p.dataTables[0].id, { widthPx: 600, heightPx: 300 })(p);
};
const withLayout = (p: Project, over: Parameters<typeof defaultLayout>[2] = {}, fillFrom?: string): { p: Project; l: Layout } => {
  const q = addLayout('layout_1', over, fillFrom ?? p.charts[0].id)(p);
  return { p: q, l: q.layouts![0] };
};

describe('page and panels', () => {
  it('is A4 in both orientations', () => {
    expect(pageFrame({ orientation: 'portrait', marginMm: 0, showTitle: false }).widthPt).toBeCloseTo(mmToPt(210));
    expect(pageFrame({ orientation: 'landscape', marginMm: 0, showTitle: false }).widthPt).toBeCloseTo(mmToPt(297));
    expect(pageFrame({ orientation: 'landscape', marginMm: 0, showTitle: false }).heightPt).toBeCloseTo(mmToPt(210));
  });
  it('numbers the panels in the four styles', () => {
    expect([0, 1, 2].map((i) => panelLabel('A', i))).toEqual(['A', 'B', 'C']);
    expect([0, 1, 2].map((i) => panelLabel('a', i))).toEqual(['a', 'b', 'c']);
    expect([0, 1, 2, 3, 8].map((i) => panelLabel('I', i))).toEqual(['I', 'II', 'III', 'IV', 'IX']);
    expect([0, 1, 2].map((i) => panelLabel('1', i))).toEqual(['1', '2', '3']);
    expect(panelLabel('none', 0)).toBe('');
    expect(panelLabel('A', 26)).toBe('AA');
  });
  it('divides the page into equal cells inside the margins, and puts the inset in the top right corner', () => {
    const l = defaultLayout('x', 'x', { arrangement: { kind: 'grid', cols: 3, rows: 2 } });
    const rects = slotRects(l);
    expect(rects).toHaveLength(6);
    expect(new Set(rects.map((r) => r.w.toFixed(3))).size).toBe(1);
    const frame = pageFrame(l);
    expect(rects[0].x).toBeCloseTo(frame.content.x);
    expect(rects[2].x + rects[2].w).toBeCloseTo(frame.content.x + frame.content.w);
    const inset = slotRects({ ...l, arrangement: { kind: 'inset' } });
    expect(inset[1].x + inset[1].w).toBeCloseTo(frame.content.x + frame.content.w);
    expect(inset[1].y).toBeCloseTo(frame.content.y);
  });
  it('reserves room for the title', () => {
    const a = pageFrame({ orientation: 'portrait', marginMm: 10, showTitle: false });
    const b = pageFrame({ orientation: 'portrait', marginMm: 10, showTitle: true });
    expect(b.content.h).toBeLessThan(a.content.h);
    expect(b.title).not.toBeNull();
  });
});

describe('harmonised sizes', () => {
  const sizes = [{ widthPt: 400, heightPt: 300 }, { widthPt: 200, heightPt: 600 }];
  const l = defaultLayout('x', 'x', { arrangement: { kind: 'grid', cols: 2, rows: 1 } });
  it('uses one factor for every graph in smallest mode: the smallest that fits', () => {
    const a = arrangeLayout(l, sizes);
    const [f0, f1] = a.placements.map((p) => p.factor);
    expect(f0).toBe(f1);
    expect(a.commonFactor).toBe(f0);
    for (const p of a.placements) {
      expect(p.graph!.w).toBeLessThanOrEqual(p.rect.w + 1e-6);
      expect(p.graph!.h).toBeLessThanOrEqual(p.rect.h + 1e-6);
    }
    // At least one graph fills its panel in one direction: the factor is not smaller than it needs to be.
    expect(a.placements.some((p) => Math.abs(p.graph!.w - p.rect.w) < 1e-6 || Math.abs(p.graph!.h - p.rect.h) < 1e-6)).toBe(true);
  });
  it('lets each graph fill its panel in fit mode, and takes a percentage as chosen', () => {
    const fit = arrangeLayout({ ...l, scaling: { mode: 'fit' } }, sizes);
    expect(fit.commonFactor).toBeNull();
    expect(fit.placements[0].factor).not.toBe(fit.placements[1].factor);
    const pct = arrangeLayout({ ...l, scaling: { mode: 'percent', percent: 50 } }, sizes);
    expect(pct.placements.map((p) => p.factor)).toEqual([0.5, 0.5]);
    expect(pct.placements[0].graph!.w).toBeCloseTo(200);
  });
  it('takes the largest factor in largest mode, so the graphs that need more room overflow their panels', () => {
    const a = arrangeLayout({ ...l, scaling: { mode: 'largest' } }, sizes);
    const fits = arrangeLayout({ ...l, scaling: { mode: 'fit' } }, sizes).placements.map((p) => p.factor);
    expect(a.commonFactor).toBe(Math.max(...fits));
    expect(a.placements[0].factor).toBe(a.placements[1].factor);
    const over = a.placements.filter((p) => p.graph!.w > p.rect.w + 1e-6 || p.graph!.h > p.rect.h + 1e-6);
    expect(over).toHaveLength(1);
  });
  it('leaves an empty slot as a placeholder and does not let it set the factor', () => {
    const a = arrangeLayout(l, [sizes[0], null]);
    expect(a.placements[1].graph).toBeNull();
    expect(a.placements[0].factor).toBeCloseTo(arrangeLayout({ ...l, arrangement: { kind: 'grid', cols: 2, rows: 1 } }, [sizes[0], null]).placements[0].factor);
  });
});

describe('sanitizing', () => {
  const base = defaultLayout('x', 'Base');
  it('clamps numbers and ignores wrong values', () => {
    const s = sanitizeLayout({ marginMm: 999, gapMm: -5, labelSizePt: 'big', scaling: { mode: 'percent', percent: 5000 }, orientation: 'sideways', background: 'red', arrangement: { kind: 'grid', cols: 99, rows: 0 } }, base);
    expect(s.marginMm).toBe(50);
    expect(s.gapMm).toBe(0);
    expect(s.labelSizePt).toBe(base.labelSizePt);
    expect(s.scaling).toEqual({ mode: 'percent', percent: 400 });
    expect(s.orientation).toBe('landscape');
    expect(s.background).toBe('#ffffff');
    expect(s.arrangement).toEqual({ kind: 'grid', cols: 6, rows: 1 });
    expect(s.panels).toHaveLength(6);
  });
  it('accepts a null background', () => expect(sanitizeLayout({ background: null }, base).background).toBeNull());
});

describe('layout commands', () => {
  it('fills the panels with the graphs of the project in order', () => {
    const { p, l } = withLayout(twoCharts());
    expect(l.panels).toEqual([p.charts[0].id, 'chart_b']);
  });
  it('keeps the graphs of the slots that remain when the arrangement changes', () => {
    let { p, l } = withLayout(twoCharts());
    p = patchLayout(l.id, { arrangement: { kind: 'grid', cols: 3, rows: 1 } })(p);
    expect(p.layouts![0].panels).toEqual([l.panels[0], 'chart_b', null]);
    p = patchLayout(l.id, { arrangement: { kind: 'grid', cols: 1, rows: 1 } })(p);
    expect(p.layouts![0].panels).toEqual([l.panels[0]]);
  });
  it('swaps two panels when a graph is chosen that is already on the page', () => {
    let { p, l } = withLayout(twoCharts());
    p = setLayoutPanel(l.id, 0, 'chart_b')(p);
    expect(p.layouts![0].panels).toEqual(['chart_b', l.panels[0]]);
    p = setLayoutPanel(l.id, 1, null)(p);
    expect(p.layouts![0].panels).toEqual(['chart_b', null]);
  });
  it('empties the panel of a deleted graph, also when its table is deleted', () => {
    let { p, l } = withLayout(twoCharts());
    p = removeChart('chart_b')(p);
    expect(p.layouts![0].panels).toEqual([l.panels[0], null]);
    // A second table with a graph on the page: deleting the table empties that panel.
    const q = addChart('chart_c', p.dataTables[0].id)(p);
    const withTable = addDataTable('table_2', 'column', {})(q);
    const onTable2 = addChart('chart_t2', 'table_2')(withTable);
    const placed = setLayoutPanel(l.id, 1, 'chart_t2')(onTable2);
    expect(placed.layouts![0].panels[1]).toBe('chart_t2');
    expect(removeTable('table_2')(placed).layouts![0].panels).toEqual([l.panels[0], null]);
  });
  it('renames, duplicates and removes', () => {
    let { p, l } = withLayout(twoCharts());
    p = renameItem('layout', l.id, 'Figure 1')(p);
    p = duplicateLayout(l.id, 'layout_2')(p);
    expect(p.layouts!.map((x) => x.name)).toEqual(['Figure 1', 'Figure 1 (copy)']);
    p = removeLayout('layout_1')(removeLayout('layout_2')(p));
    expect(p.layouts).toBeUndefined();
  });
  it('slot counts follow the arrangement', () => {
    expect(slotCount({ kind: 'inset' })).toBe(2);
    expect(slotCount({ kind: 'grid', cols: 4, rows: 2 })).toBe(8);
  });
});

describe('project file', () => {
  it('keeps layouts through save and load, and empties panels whose graph is missing', () => {
    let { p, l } = withLayout(twoCharts(), { orientation: 'portrait', arrangement: { kind: 'grid', cols: 2, rows: 2 } });
    p = patchLayout(l.id, { labelStyle: 'a', scaling: { mode: 'percent', percent: 80 }, title: 'Fig', showTitle: true })(p);
    const back = parseProject(stringifyProject(p));
    expect(back.layouts).toEqual(p.layouts);
    const env = JSON.parse(stringifyProject(p));
    env.project.charts = env.project.charts.filter((c: { id: string }) => c.id !== 'chart_b');
    const loaded = parseProject(JSON.stringify(env));
    expect(loaded.layouts![0].panels[1]).toBeNull();
  });
  it('has no layouts key when there are none', () => {
    expect(JSON.parse(stringifyProject(createExampleProject())).project.layouts).toBeUndefined();
  });
});

describe('page drawing', () => {
  it('is one SVG of A4 size with each graph nested, its label, and no id used twice', () => {
    const { p, l } = withLayout(twoCharts(), { orientation: 'portrait', arrangement: { kind: 'grid', cols: 1, rows: 2 } });
    const d = drawLayout(l, p, { metadata: true });
    expect(d.svg).toMatch(/^<svg [^>]*width="210mm" height="297mm"/);
    expect((d.svg.match(/<svg /g) ?? []).length).toBe(3);
    expect(d.svg).toContain('>A</text>');
    expect(d.svg).toContain('>B</text>');
    const ids = [...d.svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(ids).size).toBe(ids.length);
    expect(d.svg).not.toContain('data-hit');
  });
  it('draws a placeholder slot as an empty panel, and a transparent page without a background', () => {
    const { p, l } = withLayout(twoCharts(), { background: null, arrangement: { kind: 'grid', cols: 3, rows: 1 } });
    const d = drawLayout(l, p);
    expect((d.svg.match(/<svg /g) ?? []).length).toBe(3); // the page and two graphs; the third panel is empty
    expect(d.svg).not.toContain(`<rect x="0" y="0" width="${Math.round(d.widthPt * 100) / 100}"`);
    expect(drawLayout({ ...l, background: '#ffeedd' }, p).svg).toContain(`<rect x="0" y="0" width="${Math.round(d.widthPt * 100) / 100}" height="${Math.round(d.heightPt * 100) / 100}" fill="#ffeedd"/>`);
  });
  it('warns when a chosen percentage makes a graph larger than its panel', () => {
    const { p, l } = withLayout(twoCharts());
    const d = drawLayout({ ...l, scaling: { mode: 'percent', percent: 400 } }, p);
    expect(d.notices.length).toBeGreaterThan(0);
  });
});

describe('free placement', () => {
  const free = (): { p: Project; l: Layout } => {
    const { p, l } = withLayout(twoCharts(), { arrangement: { kind: 'grid', cols: 2, rows: 1 } });
    const q = freeLayout(l.id)(p);
    return { p: q, l: q.layouts![0] };
  };
  it('starts from the boxes of the grid, in mm on the page', () => {
    const { l } = free();
    expect(l.arrangement.kind).toBe('free');
    const frames = l.arrangement.kind === 'free' ? l.arrangement.frames : [];
    expect(frames).toHaveLength(2);
    expect(frames[0].x).toBeCloseTo(12, 0);
    expect(frames[1].x + frames[1].w).toBeCloseTo(297 - 12, 0);
    expect(l.panels).toHaveLength(2);
  });
  it('keeps a moved or resized box on the page and above the smallest size', () => {
    let { p, l } = free();
    p = setFrame(l.id, 0, { x: -50, y: 500, w: 5, h: 1000 })(p);
    const f = (p.layouts![0].arrangement as { frames: FrameMm[] }).frames[0];
    expect(f.x).toBe(0);
    expect(f.w).toBe(15);
    expect(f.h).toBe(210);
    expect(f.y).toBe(0);
  });
  it('draws a graph in its box, with its proportions kept and the same factor for all', () => {
    let { p, l } = free();
    p = setFrame(l.id, 0, { x: 10, y: 10, w: 100, h: 100 })(p);
    p = setFrame(l.id, 1, { x: 150, y: 20, w: 120, h: 60 })(p);
    const d = drawLayout(p.layouts![0], p);
    const [a, b] = d.arranged.placements;
    expect(a.rect.w).toBeCloseTo(mmToPt(100));
    expect(a.factor).toBe(b.factor);
    expect(d.arranged.commonFactor).toBe(a.factor);
  });
  it('adds and removes panels, with their graphs, and refuses the last removal', () => {
    let { p, l } = free();
    p = addFreePanel(l.id)(p);
    expect(p.layouts![0].panels).toEqual([l.panels[0], 'chart_b', null]);
    p = removeFreePanel(l.id, 0)(p);
    expect(p.layouts![0].panels).toEqual(['chart_b', null]);
    p = removeFreePanel(l.id, 1)(p);
    expect(p.layouts![0].panels).toEqual(['chart_b']);
    // The last panel stays.
    const same = removeFreePanel(l.id, 0)(p);
    expect(same.layouts![0].panels).toEqual(['chart_b']);
    expect((same.layouts![0].arrangement as { frames: FrameMm[] }).frames).toHaveLength(1);
  });
  it('carries the boxes to the other orientation in proportion to the page', () => {
    let { p, l } = free();
    const before = (l.arrangement as { frames: FrameMm[] }).frames[1];
    p = patchLayout(l.id, { orientation: 'portrait' })(p);
    const after = (p.layouts![0].arrangement as { frames: FrameMm[] }).frames[1];
    expect(after.x + after.w).toBeLessThanOrEqual(210 + 1e-6);
    expect(after.x / 210).toBeCloseTo(before.x / 297, 1);
    expect(turnFrames([before], 'landscape', 'landscape')).toEqual([before]);
  });
  it('is kept in the file, with a damaged box repaired', () => {
    const { p } = free();
    expect(parseProject(stringifyProject(p)).layouts).toEqual(p.layouts);
    const env = JSON.parse(stringifyProject(p));
    env.project.layouts[0].arrangement.frames[0] = { x: 'left', w: 99999 };
    const loaded = parseProject(JSON.stringify(env)).layouts![0];
    const f = (loaded.arrangement as { frames: FrameMm[] }).frames[0];
    expect(f.x).toBe(0);
    expect(f.w).toBeLessThanOrEqual(297);
  });
  it('reads the earlier name of the smallest-size mode', () => {
    expect(sanitizeLayout({ scaling: { mode: 'equal' } }, defaultLayout('x', 'x')).scaling).toEqual({ mode: 'smallest' });
  });
});

describe('PDF', () => {
  it('is a one-page PDF of the page size with a correct cross-reference table', () => {
    const flateRgb = new Uint8Array([120, 156, 3, 0, 0, 0, 0, 1]);
    const bytes = buildPdf({ widthPt: 841.89, heightPt: 595.28, pxWidth: 10, pxHeight: 7, flateRgb, title: 'Figure (1)' });
    const text = new TextDecoder('latin1').decode(bytes);
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text).toContain('/MediaBox[0 0 841.89 595.28]');
    expect(text).toContain('/Width 10/Height 7');
    expect(text).toContain(String.raw`/Title(Figure \(1\))`);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    // Every entry of the xref table points at the start of its object.
    const start = Number(/startxref\n(\d+)/.exec(text)![1]);
    expect(text.slice(start, start + 4)).toBe('xref');
    const entries = [...text.slice(start).matchAll(/(\d{10}) 00000 n /g)].map((m) => Number(m[1]));
    expect(entries).toHaveLength(6);
    entries.forEach((o, i) => expect(text.slice(o, o + `${i + 1} 0 obj`.length)).toBe(`${i + 1} 0 obj`));
    // The stream length is that of the image data.
    expect(text).toContain(`/Length ${flateRgb.length}`);
  });
  it('compresses RGB so that it can be read back, with transparency as white', async () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]);
    const flate = await rgbaToFlateRgb(rgba);
    const back = new Uint8Array(await new Response(new Blob([flate as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
    expect([...back]).toEqual([255, 0, 0, 255, 255, 255]);
  });
});

describe('panel label defaults', () => {
  it('start at 16 pt', () => expect(defaultLayout('x', 'x').labelSizePt).toBe(16));
});

describe('standard arrangements', () => {
  it('are five, and two and three graphs go side by side on landscape and one above the other on portrait', () => {
    const land = standardArrangements('landscape');
    const port = standardArrangements('portrait');
    expect(land).toHaveLength(5);
    expect(land.map((s) => s.id)).toEqual(port.map((s) => s.id));
    expect(land.find((s) => s.id === 'two')!.arrangement).toEqual({ kind: 'grid', cols: 2, rows: 1 });
    expect(land.find((s) => s.id === 'three')!.arrangement).toEqual({ kind: 'grid', cols: 3, rows: 1 });
    expect(port.find((s) => s.id === 'two')!.arrangement).toEqual({ kind: 'grid', cols: 1, rows: 2 });
    expect(port.find((s) => s.id === 'three')!.arrangement).toEqual({ kind: 'grid', cols: 1, rows: 3 });
    expect(port.find((s) => s.id === 'four')!.arrangement).toEqual({ kind: 'grid', cols: 2, rows: 2 });
  });
});
