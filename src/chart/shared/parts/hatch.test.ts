import { describe, expect, it } from 'vitest';
import {
  MAX_PATTERN_MARKS,
  countMarks,
  marksToPathData,
  patternMarks,
  type HatchKind,
  type PatternMarks,
  type Rect,
} from './hatch';

const ALL: HatchKind[] = [
  'horizontal',
  'vertical',
  'diagonalUp',
  'diagonalDown',
  'crosshatch',
  'diagonalCrosshatch',
  'dots',
];
// Bar 40 wide, 100 tall, baseline at the bottom centre.
const bar: Rect = { x: 80, y: 100, width: 40, height: 100 };
const base = { x: 100, y: 200 };

const lines = (m: PatternMarks) => {
  if (m.kind !== 'lines') throw new Error('expected lines');
  return m.segments;
};

describe('hatch geometry', () => {
  it('H1 horizontal: 25 marks between y 102 and 198', () => {
    const segs = lines(patternMarks('horizontal', bar, base, 4));
    expect(segs).toHaveLength(25);
    const ys = segs.map((s) => s.y1).sort((a, b) => a - b);
    expect(ys[0]).toBe(102);
    expect(ys[24]).toBe(198);
    expect(segs.every((s) => s.x1 === 80 && s.x2 === 120 && s.y1 === s.y2)).toBe(true);
  });

  it('H2 vertical: 10 marks, none on the centre stem', () => {
    const segs = lines(patternMarks('vertical', bar, base, 4));
    expect(segs).toHaveLength(10);
    expect(segs.some((s) => s.x1 === 100)).toBe(false);
  });

  it('H3 combined counts are the sum of their families', () => {
    expect(countMarks('crosshatch', bar, base, 4)).toBe(35);
    expect(countMarks('horizontal', bar, base, 2)).toBe(50);
    expect(patternMarks('crosshatch', bar, base, 4).count).toBe(35);
  });

  it('H4 diagonals on a 20x20 square: 7 segments, exact coordinates, spacing 4', () => {
    const sq: Rect = { x: 0, y: 0, width: 20, height: 20 };
    const o = { x: 0, y: 0 };
    const up = lines(patternMarks('diagonalUp', sq, o, 4));
    const dn = lines(patternMarks('diagonalDown', sq, { x: 20, y: 0 }, 4));
    expect(up).toHaveLength(7);
    expect(dn).toHaveLength(7);
    // First rising line is x + y = 2 * sqrt2, clipped to the square.
    const c0 = 2 * Math.SQRT2;
    expect(up[0].x1).toBeCloseTo(0, 12);
    expect(up[0].y1).toBeCloseTo(c0, 12);
    expect(up[0].x2).toBeCloseTo(c0, 12);
    expect(up[0].y2).toBeCloseTo(0, 12);
    // Perpendicular distance between neighbours is the spacing.
    const cs = up.map((s) => s.x1 + s.y1);
    for (let i = 1; i < cs.length; i++) expect((cs[i] - cs[i - 1]) / Math.SQRT2).toBeCloseTo(4, 12);
    const ds = dn.map((s) => s.y1 - s.x1);
    for (let i = 1; i < ds.length; i++) expect((ds[i] - ds[i - 1]) / Math.SQRT2).toBeCloseTo(4, 12);
  });

  it('H5 mirror symmetry of rising and falling about the vertical axis', () => {
    const sq: Rect = { x: -10, y: 0, width: 20, height: 20 };
    const o = { x: 0, y: 0 };
    const up = lines(patternMarks('diagonalUp', sq, o, 4));
    const dn = lines(patternMarks('diagonalDown', sq, o, 4));
    const r = (v: number) => Math.round(v * 1e6) / 1e6 + 0;
    const key = (a: number, b: number, c: number, d: number) => [a, b, c, d].map(r).join(',');
    const mirrored = up.map((s) => key(-s.x2, s.y2, -s.x1, s.y1)).sort();
    expect(dn.map((s) => key(s.x1, s.y1, s.x2, s.y2)).sort()).toEqual(mirrored);
  });

  it('H6 dots: 250 on a 40 x 100 bar, row-major from the top', () => {
    const m = patternMarks('dots', bar, base, 4);
    if (m.kind !== 'dots') throw new Error('expected dots');
    expect(m.count).toBe(250);
    expect(m.points[0]).toEqual({ x: 82, y: 102 });
    expect(m.points[1]).toEqual({ x: 86, y: 102 });
    expect(m.points[10].y).toBe(106);
  });

  it('H7 value edit prefix property: a taller bar keeps every existing mark', () => {
    const taller: Rect = { x: 80, y: 60, width: 40, height: 140 };
    const ser = (m: PatternMarks) =>
      m.kind === 'lines'
        ? m.segments.map((s) => `${s.x1},${s.y1},${s.x2},${s.y2}`)
        : m.kind === 'dots'
          ? m.points.map((p) => `${p.x},${p.y}`)
          : [];
    for (const kind of ['horizontal', 'vertical', 'dots', 'crosshatch'] as HatchKind[]) {
      const before = new Set(ser(patternMarks(kind, bar, base, 4)));
      const after = patternMarks(kind, taller, base, 4);
      expect(after.count).toBeGreaterThanOrEqual(before.size);
      // Vertical marks keep their x; only their length changes, so compare by x.
      if (kind === 'horizontal' || kind === 'dots') {
        const a = new Set(ser(after));
        for (const k of before) expect(a.has(k)).toBe(true);
      }
    }
  });

  it('H8 rigid translation for all kinds', () => {
    const dx = 37;
    const dy = -12;
    for (const kind of ALL) {
      const a = patternMarks(kind, bar, base, 4);
      const b = patternMarks(kind, { ...bar, x: bar.x + dx, y: bar.y + dy }, { x: base.x + dx, y: base.y + dy }, 4);
      expect(b.count).toBe(a.count);
      const shifted = (m: PatternMarks) =>
        m.kind === 'lines'
          ? m.segments.map((s) => [s.x1, s.y1, s.x2, s.y2])
          : m.kind === 'dots'
            ? m.points.map((p) => [p.x, p.y])
            : [];
      const sa = shifted(a);
      const sb = shifted(b);
      sa.forEach((row, i) =>
        row.forEach((v, j) => expect(sb[i][j]).toBeCloseTo(v + (j % 2 === 0 ? dx : dy), 9)),
      );
    }
  });

  it('H9 guards and tooDense without hanging', () => {
    expect(patternMarks('horizontal', bar, base, 0)).toEqual({ kind: 'none', reason: 'invalid', count: 0 });
    expect(patternMarks('horizontal', bar, base, -1).kind).toBe('none');
    expect(patternMarks('horizontal', bar, base, NaN).kind).toBe('none');
    expect(patternMarks('horizontal', { ...bar, height: 0 }, base, 4).kind).toBe('none');
    expect(patternMarks('horizontal', { ...bar, width: Infinity }, base, 4).kind).toBe('none');
    expect(patternMarks('dots', bar, { x: NaN, y: 0 }, 4).kind).toBe('none');
    expect(countMarks('dots', bar, base, 0)).toBe(0);
    const huge: Rect = { x: 0, y: 0, width: 1e6, height: 1e6 };
    const o = { x: 0, y: 0 };
    expect(patternMarks('dots', huge, o, 0.001)).toEqual({ kind: 'none', reason: 'tooDense', count: 0 });
    expect(countMarks('dots', huge, o, 0.001)).toBeGreaterThan(MAX_PATTERN_MARKS);
    expect(patternMarks('diagonalCrosshatch', huge, o, 0.001).kind).toBe('none');
  });

  it('H10 negative bar (drawn above the baseline) uses the same lattice', () => {
    const neg: Rect = { x: 80, y: 200, width: 40, height: 100 };
    const segs = lines(patternMarks('horizontal', neg, base, 4));
    expect(segs).toHaveLength(25);
    const ys = segs.map((s) => s.y1).sort((a, b) => a - b);
    expect(ys[0]).toBe(202);
    expect(ys[24]).toBe(298);
  });

  it('H11 closed tie rule: a mark exactly on an edge is kept', () => {
    // Lines at y = 2, 6, 10; bounds 2..10 include both edge marks.
    const r: Rect = { x: 0, y: 2, width: 10, height: 8 };
    expect(countMarks('horizontal', r, { x: 0, y: 0 }, 4)).toBe(3);
    expect(lines(patternMarks('horizontal', r, { x: 0, y: 0 }, 4))).toHaveLength(3);
  });

  it('H12 narrow bar: no vertical line fits, still kind lines with count 0', () => {
    const m = patternMarks('vertical', { x: 100.2, y: 0, width: 1, height: 50 }, { x: 100, y: 0 }, 4);
    expect(m).toEqual({ kind: 'lines', count: 0, segments: [] });
    expect(marksToPathData(m)).toBe('');
  });

  it('H13 legend key counts', () => {
    const key: Rect = { x: 0, y: 0, width: 18, height: 10 };
    const o = { x: 9, y: 10 };
    expect(countMarks('horizontal', key, o, 4)).toBe(3);
    expect(countMarks('vertical', key, o, 4)).toBe(4);
    expect(countMarks('dots', key, o, 4)).toBe(12);
  });

  it('H14 count equals generated marks for exact kinds and bounds the diagonals', () => {
    for (const kind of ALL) {
      for (const s of [2, 3.7, 4, 9]) {
        const m = patternMarks(kind, bar, base, s);
        const c = countMarks(kind, bar, base, s);
        if (kind === 'diagonalUp' || kind === 'diagonalDown' || kind === 'diagonalCrosshatch') {
          expect(m.count).toBeLessThanOrEqual(c);
        } else {
          expect(m.count).toBe(c);
        }
      }
    }
  });

  it('H15 path data rounding', () => {
    const m = patternMarks('horizontal', { x: 0, y: 0, width: 10.004, height: 2 }, { x: 0, y: 0 }, 1.234);
    expect(marksToPathData(m)).toBe('M0,0.62L10,0.62M0,1.85L10,1.85');
    const dots = patternMarks('dots', { x: 0, y: 0, width: 5, height: 5 }, { x: 0, y: 0 }, 4);
    expect(marksToPathData(dots)).toBe('M2,2h0.01');
    expect(marksToPathData({ kind: 'none', reason: 'invalid', count: 0 })).toBe('');
  });
});
