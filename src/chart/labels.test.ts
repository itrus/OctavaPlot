import { describe, expect, it } from 'vitest';
import { createExampleProject, DEFAULT_STYLE } from '../model/defaults';
import { LABEL_STYLE_KEYS, patchAllGroups, resolveStyle } from '../model/style';
import type { ChartStyle } from '../model/types';
import { parseProject, stringifyProject } from '../state/serialize';
import {
  anyLabelsRequested,
  BoxGrid,
  buildPointLabels,
  emptyPointLabelModel,
  boxesOverlap,
  effectiveLabelSource,
  fitLabelText,
  formatLabelValue,
  insetBox,
  labelAvailability,
  labelWarnings,
  layoutLabels,
  MAX_LABELS,
  overlapFlags,
  placeBox,
  rectToBox,
  sanitizeLabelStyle,
  type Box,
  type LabelAnchor,
  type LabelLayoutOptions,
  type PointLabelReport,
} from './labels';
import { measureText } from './text';

const style = (patch: Partial<ChartStyle> = {}): ChartStyle => ({ ...DEFAULT_STYLE, ...patch });

describe('label defaults', () => {
  it('equal spec 7.1', () => {
    expect(DEFAULT_STYLE.showPointLabels).toBe(false);
    expect(DEFAULT_STYLE.pointLabelSource).toBe('rowTitle');
    expect(DEFAULT_STYLE.pointLabelPlacement).toBe('above-right');
    expect(DEFAULT_STYLE.pointLabelOffsetXPt).toBe(6);
    expect(DEFAULT_STYLE.pointLabelOffsetYPt).toBe(6);
    expect(DEFAULT_STYLE.pointLabelCollision).toBe('keep');
    expect(DEFAULT_STYLE.pointLabelLeader).toBe(false);
    expect(DEFAULT_STYLE.pointLabelFontSizePt).toBe(22.4);
    expect(DEFAULT_STYLE.pointLabelBold).toBe(false);
    expect(DEFAULT_STYLE.pointLabelItalic).toBe(false);
    expect(DEFAULT_STYLE.pointLabelColor).toBeNull();
    expect(DEFAULT_STYLE.pointLabelDecimals).toBeNull();
  });
  it('LABEL_STYLE_KEYS is complete and contiguous at the end of the style', () => {
    expect(LABEL_STYLE_KEYS).toHaveLength(12);
    const keys = Object.keys(DEFAULT_STYLE);
    expect(keys.slice(-12)).toEqual([...LABEL_STYLE_KEYS]);
    expect(keys.filter((k) => k.startsWith('pointLabel') || k === 'showPointLabels')).toHaveLength(12);
  });
});

describe('hierarchy', () => {
  it('carries label keys through every level', () => {
    const p = createExampleProject();
    const chart = p.charts[0];
    const layer = chart.layers[0];
    const g = p.dataTables[0].groups[0];
    layer.style = { pointLabelBold: true };
    layer.groupOverrides[g.id] = { pointLabelItalic: true };
    layer.objectOverrides[g.observations[0].id] = { pointLabelColor: '#ff0000' };
    const s = resolveStyle(chart, layer, g, g.observations[0].id);
    expect(s.pointLabelBold).toBe(true);
    expect(s.pointLabelItalic).toBe(true);
    expect(s.pointLabelColor).toBe('#ff0000');
    expect(resolveStyle(chart, layer, g).pointLabelColor).toBeNull();
  });
  it('Global patch strips only the patched keys', () => {
    const p = createExampleProject();
    const layer = p.charts[0].layers[0];
    const g = p.dataTables[0].groups[0];
    layer.groupOverrides[g.id] = { pointLabelBold: true, pointLabelItalic: true };
    const out = patchAllGroups(layer, { pointLabelBold: false });
    expect(out.style.pointLabelBold).toBe(false);
    expect(out.groupOverrides[g.id]).toEqual({ pointLabelItalic: true });
  });
});

describe('measureText', () => {
  it('italic is backward compatible in the fallback', () => {
    expect(measureText('abc', 10)).toBe(measureText('abc', 10, false, true));
    expect(measureText('abc', 10, true)).toBe(measureText('abc', 10, true, true));
    expect(measureText('abc', 10)).toBeCloseTo(3 * 10 * 0.54, 12);
    expect(measureText('abc', 10, true)).toBeCloseTo(3 * 10 * 0.58, 12);
  });
});

describe('effectiveLabelSource', () => {
  it('forces value for mean charts', () => {
    expect(effectiveLabelSource('mean', 'rowTitle')).toBe('value');
    expect(effectiveLabelSource('scatter', 'rowTitle')).toBe('rowTitle');
    expect(effectiveLabelSource('bar', 'value')).toBe('value');
  });
});

describe('formatLabelValue', () => {
  it.each([
    [1.23456789, null, '1.23457'],
    [1.2, null, '1.2'],
    [100, null, '100'],
    [0, null, '0'],
    [2.5, 0, '3'],
    [-0.0004, 2, '0.00'],
    [-0, 1, '0.0'],
    [-1.25, 1, '-1.3'],
    [Number.NaN, null, ''],
    [Infinity, 2, ''],
  ])('%s with %s -> %s', (v, d, out) => {
    expect(formatLabelValue(v, d)).toBe(out);
  });
});

describe('labelAvailability', () => {
  it('needs symbols', () => {
    const a = labelAvailability('scatter', style({ showSymbols: false }));
    expect(a.available).toBe(false);
    expect(a.reason).toMatch(/Symbols/);
    expect(a.sources.every((s) => !s.enabled)).toBe(true);
  });
  it('rowTitle is disabled for mean charts, with a reason', () => {
    const a = labelAvailability('mean', style({ showSymbols: true }));
    const row = a.sources.find((s) => s.value === 'rowTitle');
    expect(row?.enabled).toBe(false);
    expect(row?.reason).toBeTruthy();
    expect(a.sources.find((s) => s.value === 'value')?.enabled).toBe(true);
  });
  it('offers both sources for scatter', () => {
    const a = labelAvailability('scatter', style({ showSymbols: true }));
    expect(a.available).toBe(true);
    expect(a.sources.map((s) => s.enabled)).toEqual([true, true]);
  });
});

describe('sanitizeLabelStyle', () => {
  it('is the identity when valid', () => {
    const s = style();
    expect(sanitizeLabelStyle(s)).toBe(s);
    const t = style({ pointLabelColor: '#a1B2c3', pointLabelDecimals: 3, pointLabelOffsetXPt: -5 });
    expect(sanitizeLabelStyle(t)).toBe(t);
  });
  it('fixes invalid values', () => {
    const s = sanitizeLabelStyle(
      style({
        pointLabelFontSizePt: 1000,
        pointLabelOffsetXPt: Number.NaN,
        pointLabelOffsetYPt: -9999,
        pointLabelColor: 'red',
        pointLabelDecimals: 2.6,
      }),
    );
    expect(s.pointLabelFontSizePt).toBe(144);
    expect(s.pointLabelOffsetXPt).toBe(0);
    expect(s.pointLabelOffsetYPt).toBe(-400);
    expect(s.pointLabelColor).toBeNull();
    expect(s.pointLabelDecimals).toBe(3);
    expect(sanitizeLabelStyle(style({ pointLabelDecimals: 99 })).pointLabelDecimals).toBe(10);
    expect(sanitizeLabelStyle(style({ pointLabelFontSizePt: 0 })).pointLabelFontSizePt).toBe(8);
    expect(sanitizeLabelStyle(style({ pointLabelFontSizePt: Number.NaN })).pointLabelFontSizePt).toBe(22.4);
  });
});

describe('persistence', () => {
  it('old files get label defaults', () => {
    const p = createExampleProject();
    const raw = JSON.parse(stringifyProject(p));
    for (const k of LABEL_STYLE_KEYS) delete raw.project.charts[0].defaults[k];
    const loaded = parseProject(JSON.stringify(raw));
    expect(loaded.charts[0].defaults.pointLabelPlacement).toBe('above-right');
    expect(loaded.charts[0].defaults.showPointLabels).toBe(false);
  });
  it('round trip keeps nulls and set values', () => {
    const p = createExampleProject();
    p.charts[0].defaults = { ...p.charts[0].defaults, showPointLabels: true, pointLabelDecimals: 2, pointLabelColor: null };
    const loaded = parseProject(stringifyProject(p));
    expect(loaded.charts[0].defaults.showPointLabels).toBe(true);
    expect(loaded.charts[0].defaults.pointLabelDecimals).toBe(2);
    expect(loaded.charts[0].defaults.pointLabelColor).toBeNull();
  });
});

// ---- S13: label layout engine ----

const BIG: Box = { x0: 0, y0: 0, x1: 200, y1: 200 };
const opts = (patch: Partial<LabelLayoutOptions> = {}): LabelLayoutOptions => ({
  plot: BIG,
  bounds: BIG,
  customBounds: BIG,
  measure: (t, a) => Array.from(t).length * a.fontSizePt * 0.5,
  ...patch,
});
const anchor = (id: string, x: number, y: number, patch: Partial<LabelAnchor> = {}): LabelAnchor => ({
  id,
  text: 'ab',
  x,
  y,
  radius: 3,
  fontSizePt: 10,
  placement: 'above-right',
  offsetX: 3,
  offsetY: 3,
  collision: 'keep',
  leader: false,
  ...patch,
});
const naiveFlags = (boxes: Box[]) => boxes.map((b, i) => boxes.some((o, j) => i !== j && boxesOverlap(b, o)));
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}
const box = (x0: number, y0: number, x1: number, y1: number): Box => ({ x0, y0, x1, y1 });

describe('box helpers', () => {
  it('rectToBox and insetBox', () => {
    expect(rectToBox({ x: 1, y: 2, width: 3, height: 4 })).toEqual(box(1, 2, 4, 6));
    expect(insetBox(box(0, 0, 10, 10), 2)).toEqual(box(2, 2, 8, 8));
    expect(insetBox(box(0, 0, 3, 10), 2)).toEqual(box(1.5, 2, 1.5, 8));
  });
  it('boxesOverlap: touching is not overlap, tolerance 1e-6', () => {
    expect(boxesOverlap(box(0, 0, 10, 10), box(10, 0, 20, 10))).toBe(false);
    expect(boxesOverlap(box(0, 0, 10, 10), box(0, 10, 10, 20))).toBe(false);
    expect(boxesOverlap(box(0, 0, 10, 10), box(10 - 5e-7, 0, 20, 10))).toBe(false);
    expect(boxesOverlap(box(0, 0, 10, 10), box(9.99, 0, 20, 10))).toBe(true);
    expect(boxesOverlap(box(0, 0, 10, 10), box(2, 2, 3, 3))).toBe(true);
  });
});

describe('placeBox', () => {
  const a = { x: 50, y: 50, radius: 3 };
  const size = { width: 10, height: 12 };
  it('named placements start at the symbol edge plus offset', () => {
    expect(placeBox('above-right', a, size, 3, 3)).toEqual(box(56, 32, 66, 44));
    expect(placeBox('above', a, size, 3, 3)).toEqual(box(45, 32, 55, 44));
    expect(placeBox('below', a, size, 3, 3)).toEqual(box(45, 56, 55, 68));
    expect(placeBox('left', a, size, 3, 3)).toEqual(box(34, 44, 44, 56));
    expect(placeBox('right', a, size, 3, 3)).toEqual(box(56, 44, 66, 56));
    expect(placeBox('centre', a, size, 3, 3)).toEqual(box(45, 44, 55, 56));
  });
  it('negative gaps clamp to the symbol edge; custom is signed', () => {
    expect(placeBox('above-right', a, size, -9, -9)).toEqual(box(53, 35, 63, 47));
    expect(placeBox('custom', a, size, -20, -30)).toEqual(box(30, 20, 40, 32));
    expect(placeBox('custom', a, size, 5, 7)).toEqual(box(55, 57, 65, 69));
  });
});

describe('fitLabelText', () => {
  const m = (t: string) => Array.from(t).length * 5;
  it('keeps text that fits', () => {
    expect(fitLabelText('abcd', 20, m)).toBe('abcd');
    expect(fitLabelText('', 0, m)).toBe('');
  });
  it('shortens by code points with an ellipsis', () => {
    expect(fitLabelText('abcdefgh', 20, m)).toBe('abc…');
    expect(fitLabelText('a\u{1F600}b\u{1F600}cdef', 20, m)).toBe('a\u{1F600}b…');
    expect(fitLabelText('abcdefgh', 5, m)).toBe('…');
  });
  it('returns null when even the ellipsis does not fit', () => {
    expect(fitLabelText('abcdefgh', 4, m)).toBeNull();
  });
});

describe('overlapFlags and BoxGrid', () => {
  const randomBoxes = (seed: number, n: number) => {
    const r = rng(seed);
    return Array.from({ length: n }, () => {
      const x = r() * 300;
      const y = r() * 300;
      return box(x, y, x + 5 + r() * 40, y + 5 + r() * 20);
    });
  };
  it('sweep equals naive for seeded sets', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const boxes = randomBoxes(seed, 60);
      expect(overlapFlags(boxes)).toEqual(naiveFlags(boxes));
    }
    expect(overlapFlags([])).toEqual([]);
    expect(overlapFlags([box(0, 0, 10, 10), box(10, 0, 20, 10)])).toEqual([false, false]);
  });
  it('grid equals naive', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const placed = randomBoxes(seed, 40);
      const grid = new BoxGrid(24);
      placed.forEach((b, i) => grid.add(b, `t${i % 3}`));
      for (const q of randomBoxes(seed + 100, 40)) {
        expect(grid.hits(q)).toBe(placed.some((b) => boxesOverlap(b, q)));
        expect(grid.hits(q, 't1')).toBe(placed.some((b, i) => i % 3 !== 1 && boxesOverlap(b, q)));
      }
    }
  });
});

describe('layoutLabels basics', () => {
  it('empty input', () => {
    const m = layoutLabels([], opts());
    expect(m.items).toEqual([]);
    expect(m.suppressed).toEqual([]);
    expect(m.report.eligible).toBe(0);
    expect(labelWarnings(m.report)).toEqual([]);
  });
  it('places above-right with the baseline from the box top', () => {
    const [it] = layoutLabels([anchor('a', 50, 50)], opts()).items;
    expect(it.box).toEqual(box(56, 32, 66, 44));
    expect(it.x).toBe(56);
    expect(it.y).toBeCloseTo(32 + 10 * 0.9, 12);
    expect(it.code).toBe('placed');
    expect(it.leader).toBeNull();
  });
  it('flips before clamping', () => {
    // right edge: above-right does not fit, the horizontal mirror does
    const o = opts({ bounds: box(0, 0, 60, 200) });
    const [h] = layoutLabels([anchor('a', 50, 50)], o).items;
    expect(h.code).toBe('flipped-h');
    expect(h.box).toEqual(box(34, 32, 44, 44));
    // top edge: vertical mirror
    const [v] = layoutLabels([anchor('a', 50, 40)], opts({ bounds: box(0, 30, 200, 200) })).items;
    expect(v.code).toBe('flipped-v');
    expect(v.box.y0).toBe(46);
    // corner: both
    const [hv] = layoutLabels([anchor('a', 50, 40)], opts({ bounds: box(0, 30, 60, 200) })).items;
    expect(hv.code).toBe('flipped-hv');
  });
  it('clamps when no flip fits and keeps the box inside', () => {
    const o = opts({ bounds: box(40, 40, 70, 60) });
    const [it] = layoutLabels([anchor('a', 50, 50)], o).items;
    expect(it.code).toBe('clamped');
    expect(it.box.x0).toBeGreaterThanOrEqual(40);
    expect(it.box.x1).toBeLessThanOrEqual(70);
    expect(it.box.y0).toBeGreaterThanOrEqual(40);
    expect(it.box.y1).toBeLessThanOrEqual(60);
  });
  it('shortens long text and suppresses labels that cannot fit', () => {
    const o = opts({ bounds: box(0, 0, 30, 200) });
    const m = layoutLabels([anchor('a', 10, 100, { text: 'abcdefghij' }), anchor('b', 10, 120, { fontSizePt: 300 })], o);
    expect(m.items).toHaveLength(1);
    expect(m.items[0].shown).toBe('abcde…');
    expect(m.items[0].text).toBe('abcdefghij');
    expect(m.suppressed).toEqual([{ id: 'b', text: 'ab', reason: 'tooLarge' }]);
    expect(m.report.shortened).toBe(1);
    expect(m.report.tooLarge).toBe(1);
    const tiny = layoutLabels([anchor('c', 1, 1, { text: 'abc' })], opts({ bounds: box(0, 0, 2, 200) }));
    expect(tiny.suppressed[0].reason).toBe('tooLarge');
  });
});

describe('collision handling', () => {
  it('keep reports overlaps and draws every label', () => {
    const m = layoutLabels([anchor('a', 50, 50), anchor('b', 50, 50)], opts());
    expect(m.items).toHaveLength(2);
    expect(m.items.every((i) => i.overlap)).toBe(true);
    expect(m.report.overlapping).toBe(2);
  });
  it('hide suppresses the later label and lists it', () => {
    const m = layoutLabels([anchor('a', 50, 50, { collision: 'hide' }), anchor('b', 50, 50, { collision: 'hide' })], opts());
    expect(m.items.map((i) => i.id)).toEqual(['a']);
    expect(m.suppressed).toEqual([{ id: 'b', text: 'ab', reason: 'overlap' }]);
    expect(m.report.hidden).toBe(1);
  });
  it('fixed labels are placed before movable ones, items keep input order', () => {
    const m = layoutLabels(
      [anchor('m', 50, 50, { collision: 'hide' }), anchor('k', 50, 50, { collision: 'keep' })],
      opts(),
    );
    expect(m.items.map((i) => i.id)).toEqual(['k']);
    expect(m.suppressed.map((s) => s.id)).toEqual(['m']);
    const m2 = layoutLabels(
      [anchor('m', 50, 50, { collision: 'hide' }), anchor('k', 150, 150, { collision: 'keep' })],
      opts(),
    );
    expect(m2.items.map((i) => i.id)).toEqual(['m', 'k']);
  });
  it('repel: three coincident labels', () => {
    const list = ['a', 'b', 'c'].map((id) => anchor(id, 50, 50, { collision: 'repel' }));
    const m = layoutLabels(list, opts());
    expect(m.items.map((i) => i.box)).toEqual([box(56, 32, 66, 44), box(56, 20, 66, 32), box(70, 32, 80, 44)]);
    expect(m.report.overlapping).toBe(0);
    expect(m.report.moved).toBe(2);
  });
  it('repel: ninth coincident label sits at ring 1 with a leader', () => {
    const list = Array.from({ length: 9 }, (_, i) => anchor(`p${i}`, 50, 50, { collision: 'repel', leader: true }));
    const m = layoutLabels(list, opts());
    const ninth = m.items[8];
    expect(ninth.box).toEqual(box(70, 20, 80, 32));
    expect(ninth.code).toBe('moved');
    expect(ninth.leader?.x1).toBeCloseTo(52.2299, 3);
    expect(ninth.leader?.y1).toBeCloseTo(47.9931, 3);
    expect(ninth.leader?.x2).toBeCloseTo(70, 10);
    expect(ninth.leader?.y2).toBeCloseTo(32, 10);
    expect(m.items[0].leader).toBeNull();
    expect(m.report.overlapping).toBe(0);
  });
  it('repel avoids other symbols but not its own', () => {
    const list = [anchor('a', 50, 50, { collision: 'repel' }), anchor('b', 50, 50, { collision: 'repel' })];
    // the north slot of b is covered by another point's symbol
    const other = { id: 'z', box: box(56, 20, 66, 32) };
    const own = { id: 'b', box: box(56, 20, 66, 32) };
    expect(layoutLabels(list, opts({ symbols: [other] })).items[1].box).toEqual(box(70, 32, 80, 44));
    expect(layoutLabels(list, opts({ symbols: [own] })).items[1].box).toEqual(box(56, 20, 66, 32));
  });
  it('repel falls back to labels-only avoidance, then keeps the position', () => {
    const wall = { id: 'z', box: box(0, 0, 200, 200) };
    const list = [anchor('a', 50, 50, { collision: 'repel' }), anchor('b', 50, 50, { collision: 'repel' })];
    expect(layoutLabels(list, opts({ symbols: [wall] })).items[1].box).toEqual(box(56, 20, 66, 32));
    const tight = opts({ bounds: box(50, 30, 70, 50) });
    const m = layoutLabels(list, tight);
    expect(m.items).toHaveLength(2);
    expect(m.items[1].code).toBe('placed');
    expect(m.report.overlapping).toBe(2);
  });
  it('custom placement uses signed offsets, custom bounds and draws a leader when displaced', () => {
    const a = anchor('a', 50, 50, { placement: 'custom', offsetX: 30, offsetY: -40, leader: true });
    const [it] = layoutLabels([a], opts()).items;
    expect(it.box).toEqual(box(80, 10, 90, 22));
    expect(it.displaced).toBe(true);
    expect(it.leader).not.toBeNull();
    const near = anchor('n', 50, 50, { placement: 'custom', offsetX: 3, offsetY: -12, leader: true });
    expect(layoutLabels([near], opts()).items[0].leader).toBeNull();
    const out = anchor('o', 50, 50, { placement: 'custom', offsetX: 500, offsetY: 0 });
    const c = layoutLabels([out], opts({ customBounds: box(0, 0, 100, 100) })).items[0];
    expect(c.code).toBe('clamped');
    expect(c.box.x1).toBe(100);
  });
});

describe('accounting', () => {
  it('classifies unlabelled and off-plot points; plot edges are closed', () => {
    const plot = box(10, 10, 100, 100);
    const m = layoutLabels(
      [
        anchor('e', 20, 20, { text: '' }),
        anchor('l', 5, 50),
        anchor('r', 100, 50),
        anchor('t', 50, 10),
        anchor('o', 100.5, 50),
        anchor('n', Number.NaN, 50),
      ],
      opts({ plot, bounds: insetBox(plot, 2) }),
    );
    expect(m.report).toMatchObject({ eligible: 6, unlabelled: 1, offPlot: 3, tooMany: 0, drawn: 2 });
    expect(m.items.map((i) => i.id)).toEqual(['r', 't']);
  });
  it('MAX_LABELS cap', () => {
    expect(MAX_LABELS).toBe(5000);
    const list = Array.from({ length: 5005 }, (_, i) => anchor(`p${i}`, (i % 100) * 2, Math.floor(i / 100) * 3));
    const m = layoutLabels(list, opts());
    expect(m.report.tooMany).toBe(5);
    expect(m.report.drawn).toBe(5000);
    expect(m.items[4999].id).toBe('p4999');
  });
  it('seeded invariants, determinism and no input mutation', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const r = rng(seed);
      const modes = ['keep', 'hide', 'repel'] as const;
      const places = ['above-right', 'above', 'below', 'left', 'right', 'centre', 'custom'] as const;
      const list = Array.from({ length: 60 }, (_, i) =>
        anchor(`p${i}`, r() * 240 - 20, r() * 240 - 20, {
          text: r() < 0.1 ? '' : 'x'.repeat(1 + Math.floor(r() * 12)),
          collision: modes[Math.floor(r() * 3)],
          placement: places[Math.floor(r() * 7)],
          offsetX: r() * 20 - 5,
          offsetY: r() * 20 - 5,
          leader: r() < 0.5,
          fontSizePt: 6 + Math.floor(r() * 10),
        }),
      );
      const snapshot = JSON.stringify(list);
      const o = opts({ bounds: insetBox(BIG, 2), customBounds: insetBox(BIG, 2) });
      const m = layoutLabels(list, o);
      expect(JSON.stringify(list)).toBe(snapshot);
      expect(JSON.stringify(layoutLabels(list, o))).toBe(JSON.stringify(m));
      const rep = m.report;
      expect(m.items.length + m.suppressed.length).toBe(rep.eligible - rep.unlabelled - rep.offPlot - rep.tooMany);
      expect(rep.drawn).toBe(m.items.length);
      const idx = m.items.map((i) => Number(i.id.slice(1)));
      expect(idx).toEqual([...idx].sort((a, b) => a - b));
      for (const it of m.items) {
        expect(it.box.x0).toBeGreaterThanOrEqual(2 - 1e-6);
        expect(it.box.x1).toBeLessThanOrEqual(198 + 1e-6);
        expect(it.box.y0).toBeGreaterThanOrEqual(2 - 1e-6);
        expect(it.box.y1).toBeLessThanOrEqual(198 + 1e-6);
      }
      expect(overlapFlags(m.items.map((i) => i.box))).toEqual(m.items.map((i) => i.overlap));
    }
  });
});

describe('labelWarnings', () => {
  const zero: PointLabelReport = {
    eligible: 0,
    unlabelled: 0,
    offPlot: 0,
    tooMany: 0,
    drawn: 0,
    hidden: 0,
    tooLarge: 0,
    shortened: 0,
    flipped: 0,
    clamped: 0,
    moved: 0,
    overlapping: 0,
  };
  it('is silent for a clean report', () => {
    expect(labelWarnings(zero)).toEqual([]);
  });
  it('exact texts in fixed order', () => {
    const all = {
      ...zero,
      unlabelled: 1,
      offPlot: 2,
      tooMany: 3,
      tooLarge: 1,
      hidden: 2,
      shortened: 1,
      flipped: 2,
      clamped: 1,
      moved: 3,
      overlapping: 1,
    };
    expect(labelWarnings(all)).toEqual([
      '1 point has no label text and was not labelled.',
      '2 point labels were not drawn because the point is outside the plot area.',
      '3 point labels were not drawn: at most 5000 labels are drawn.',
      '1 point label is too large for the plot area and was hidden.',
      '2 point labels were hidden because they overlap another label.',
      '1 point label was shortened to fit the plot area.',
      '2 point labels were flipped to the other side of the point to stay inside the plot area.',
      '1 point label was shifted to stay inside the plot area.',
      '3 point labels were moved away from the point to avoid overlaps.',
      '1 point label overlaps another label.',
    ]);
    expect(labelWarnings({ ...zero, unlabelled: 4, hidden: 1, overlapping: 2 })).toEqual([
      '4 points have no label text and were not labelled.',
      '1 point label was hidden because it overlaps another label.',
      '2 point labels overlap another label.',
    ]);
  });
});

describe('buildPointLabels', () => {
  const plot = { x: 50, y: 20, width: 300, height: 200 };
  const chart = { width: 400, height: 300 };
  const pt = (id: string, cx: number, cy: number, over: Partial<ChartStyle> = {}, rowTitle = 'T', value = 1.23456789) => ({
    id,
    cx,
    cy,
    size: 6,
    value,
    rowTitle,
    style: style({ showSymbols: true, showPointLabels: true, ...over }),
  });
  const build = (points: ReturnType<typeof pt>[], type: 'bar' | 'scatter' | 'mean' = 'scatter') =>
    buildPointLabels({ type, groups: [{ groupId: 'g', points }], plot, chart });

  it('anyLabelsRequested sees every level and exits without labels', () => {
    const p = createExampleProject();
    const c = p.charts[0];
    expect(anyLabelsRequested(c)).toBe(false);
    const g = p.dataTables[0].groups[0];
    expect(anyLabelsRequested({ ...c, defaults: { ...c.defaults, showPointLabels: true } })).toBe(true);
    const withLayer = (patch: Partial<typeof c.layers[0]>) => ({ ...c, layers: [{ ...c.layers[0], ...patch }] });
    expect(anyLabelsRequested(withLayer({ style: { showPointLabels: true } }))).toBe(true);
    expect(anyLabelsRequested(withLayer({ groupOverrides: { [g.id]: { showPointLabels: true } } }))).toBe(true);
    expect(anyLabelsRequested(withLayer({ objectOverrides: { [g.observations[0].id]: { showPointLabels: true } } }))).toBe(true);
  });
  it('emptyPointLabelModel is all zeros and fresh each call', () => {
    const e = emptyPointLabelModel();
    expect(e.items).toEqual([]);
    expect(e.suppressed).toEqual([]);
    expect(Object.values(e.report).every((v) => v === 0)).toBe(true);
    expect(emptyPointLabelModel()).not.toBe(e);
  });
  it('above-right anchor uses the symbol extent', () => {
    const m = build([pt('a', 200, 100)]);
    const b = m.items[0].box;
    expect(b.x0).toBeCloseTo(200 + 3 + 6, 9);
    expect(b.y1).toBeCloseTo(100 - 3 - 6, 9);
  });
  it('custom offset is taken from the point centre', () => {
    const m = build([pt('a', 200, 100, { pointLabelPlacement: 'custom', pointLabelOffsetXPt: 10, pointLabelOffsetYPt: -20 })]);
    expect(m.items[0].box.x0).toBeCloseTo(210, 9);
    expect(m.items[0].box.y0).toBeCloseTo(80, 9);
  });
  it('flips before it clamps', () => {
    const m = build([pt('a', 345, 100)]);
    expect(m.items[0].code).toBe('flipped-h');
    expect(m.report.flipped).toBe(1);
    expect(m.report.clamped).toBe(0);
  });
  it('an empty row title is unlabelled', () => {
    const m = build([pt('a', 100, 100, {}, ''), pt('b', 150, 100, {}, 'x')]);
    expect(m.items.map((i) => i.id)).toEqual(['b']);
    expect(m.report.unlabelled).toBe(1);
  });
  it('value source honours decimals', () => {
    expect(build([pt('a', 100, 100, { pointLabelSource: 'value' })]).items[0].text).toBe('1.23457');
    expect(build([pt('a', 100, 100, { pointLabelSource: 'value', pointLabelDecimals: 2 })]).items[0].text).toBe('1.23');
  });
  it('mean markers are labelled with their value, even for the row title source', () => {
    const m = build([pt('g:mean', 100, 100, {}, '', 4.5)], 'mean');
    expect(m.items[0].text).toBe('4.5');
  });
  it('per-point style decides eligibility', () => {
    const m = build([pt('a', 100, 100), pt('b', 200, 100, { showPointLabels: false }), pt('c', 250, 100, { showSymbols: false })]);
    expect(m.items.map((i) => i.id)).toEqual(['a']);
    expect(m.report.eligible).toBe(1);
  });
  it('hide drops an overlapping label, keep draws it', () => {
    const pts = (collision: 'keep' | 'hide') => [pt('a', 100, 100, { pointLabelCollision: collision }), pt('b', 101, 100, { pointLabelCollision: collision })];
    const hide = build(pts('hide'));
    expect(hide.items).toHaveLength(1);
    expect(hide.suppressed.map((s) => s.reason)).toEqual(['overlap']);
    const keep = build(pts('keep'));
    expect(keep.items).toHaveLength(2);
    expect(keep.report.overlapping).toBe(2);
  });
  it('the plot edge is closed; outside is off-plot', () => {
    const m = build([pt('a', 50, 100), pt('b', 49.9, 100), pt('c', 350, 220), pt('d', 200, 220.1)]);
    expect(m.items.map((i) => i.id)).toEqual(['a', 'c']);
    expect(m.report.offPlot).toBe(2);
  });
  it('drawn + suppressed adds up and nothing is mutated', () => {
    const pts = [pt('a', 100, 100, { pointLabelCollision: 'hide' }), pt('b', 101, 100, { pointLabelCollision: 'hide' }), pt('c', 10, 10), pt('d', 120, 120, {}, '')];
    const before = JSON.stringify(pts);
    const m = build(pts);
    const r = m.report;
    expect(m.items.length + m.suppressed.length).toBe(r.eligible - r.unlabelled - r.offPlot - r.tooMany);
    expect(JSON.stringify(pts)).toBe(before);
    expect(build(pts)).toEqual(m);
  });
  it('warning texts come from labelWarnings', () => {
    const m = build([pt('a', 100, 100, {}, '')]);
    expect(labelWarnings(m.report)).toEqual(['1 point has no label text and was not labelled.']);
  });
});
