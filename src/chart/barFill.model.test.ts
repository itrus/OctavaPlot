import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import type { Project } from '../model/types';
import { patchAxis, patchStyle, setCells } from '../state/commands';
import { dualAxisFixture } from './dualAxisFixture';
import { patternMarks } from './hatch';
import { buildChartModel, intersectRects } from './model';

const base = createExampleProject();
const chartId = base.charts[0].id;
const table = base.dataTables[0];
const model = (p: Project) => buildChartModel(p.charts[0], p.dataTables[0]);
const pattern = (p: Project, extra: Record<string, unknown> = {}) =>
  patchStyle(chartId, 'all', { barFillMode: 'pattern', barPattern: 'horizontal', barPatternSpacingPt: 6, ...extra })(p);
const setCol = (p: Project, col: number, f: (v: number) => number) => {
  const t = p.dataTables[0];
  return setCells(t.id, t.groups[col].observations.map((o, row) => ({ row, col, value: f(o.value as number) })))(p);
};
const ys = (marks: unknown): number[] => {
  const m = marks as { kind: string; segments: { y1: number }[] };
  if (m.kind !== 'lines') throw new Error('expected lines');
  return m.segments.map((s) => s.y1).sort((a, b) => a - b);
};

describe('bar fill geometry', () => {
  it('M1 anchors at the bar centre and the baseline pixel, with a half-spacing lattice', () => {
    const m = model(pattern(base));
    const bar = m.groups[0].bar!;
    expect(bar.anchor.x).toBe(m.groups[0].centerX);
    expect(bar.anchor.y).toBeCloseTo(m.yScale(0), 9);
    for (const y of ys(bar.marks)) {
      const k = (bar.anchor.y - y) / 6 - 0.5;
      expect(Math.abs(k - Math.round(k))).toBeLessThan(1e-9);
    }
  });

  it('M2 a style-only edit leaves bar numbers and the anchor unchanged', () => {
    const a = model(pattern(base)).groups[0].bar!;
    const b = model(pattern(base, { barPatternColor: '#ff0000', barPatternWidthPt: 1 })).groups[0].bar!;
    expect([b.x, b.y, b.width, b.height]).toEqual([a.x, a.y, a.width, a.height]);
    expect(b.anchor).toEqual(a.anchor);
    expect(b.bounds).toEqual(a.bounds);
  });

  it('M3 spacing is physical, not data units', () => {
    for (const p of [pattern(base), patchAxis(chartId, 'yAxis', { min: 0, max: 100 })(pattern(base))]) {
      const v = ys(model(p).groups[0].bar!.marks);
      for (let i = 1; i < v.length; i++) expect(v[i] - v[i - 1]).toBeCloseTo(6, 9);
    }
  });

  it('M4 a value edit keeps the marks that stay inside both bars', () => {
    const p = pattern(base);
    const before = model(p).groups[0].bar!;
    const after = model(setCol(p, 0, (x) => x * 0.8)).groups[0].bar!;
    expect(after.height).toBeLessThan(before.height);
    const keys = new Set(ys(before.marks).map((y) => y.toFixed(6)));
    const common = ys(after.marks).filter((y) => keys.has(y.toFixed(6)));
    expect(common.length).toBeGreaterThan(0);
    expect(after.marks!.count).toBeLessThanOrEqual(before.marks!.count);
  });

  it('M5 an axis range edit changes the bounds but not the physical spacing', () => {
    const p = pattern(base);
    const a = model(p).groups[0].bar!;
    const b = model(patchAxis(chartId, 'yAxis', { min: 0, max: 20 })(p)).groups[0].bar!;
    expect(b.bounds!.height).not.toBeCloseTo(a.bounds!.height, 3);
    expect(b.fillSpec.spacingPt).toBe(a.fillSpec.spacingPt);
  });

  it('M6 a baseline shift moves the anchor, and it follows the group axis', () => {
    const m = model(patchAxis(chartId, 'yAxis', { min: 2 })(pattern(base)));
    expect(m.groups[0].bar!.anchor.y).toBeCloseTo(m.yScale(2), 9);
    const dual = model(pattern(dualAxisFixture()));
    expect(dual.groups[2].bar!.anchor.y).toBeCloseTo(dual.y2Scale!(0), 9);
    expect(dual.groups[0].bar!.anchor.y).toBeCloseTo(dual.yScale(0), 9);
  });

  it('M7 a negative bar is anchored at the baseline above it', () => {
    const bar = model(setCol(pattern(base), 0, () => -5)).groups[0].bar!;
    expect(bar.anchor.y).toBeCloseTo(bar.y, 9);
    expect(bar.marks!.kind).toBe('lines');
    expect(bar.marks!.count).toBeGreaterThan(0);
  });

  it('M8 warns about invisible patterns and patterns that do not fit', () => {
    const invisible = model(pattern(base, { barPatternColor: '#112233', barPatternBackground: '#112233' }));
    expect(invisible.warnings.some((w) => /^Pattern on .+ has the same colour as its background\.$/.test(w))).toBe(true);
    const tiny = model(pattern(patchAxis(chartId, 'yAxis', { min: 0, max: 1000000 })(base), { barPatternSpacingPt: 50 }));
    expect(tiny.groups[0].bar!.marks!.count).toBe(0);
    expect(tiny.warnings.some((w) => /^Pattern spacing on .+ is larger than the bar; no pattern marks fit\.$/.test(w))).toBe(true);
    expect(model(base).warnings.some((w) => /^Pattern /.test(w))).toBe(false);
  });

  it('M9 a too-dense fill falls back to no marks and says how many it needs', () => {
    const chart = base.charts[0];
    const big = buildChartModel(
      { ...chart, widthPx: 11340, heightPx: 11340, defaults: { ...chart.defaults, barFillMode: 'pattern', barPattern: 'dots', barPatternSpacingPt: 1 } },
      table,
    );
    expect(big.groups.some((g) => g.bar?.marks?.kind === 'none')).toBe(true);
    expect(big.warnings.some((w) => /^Pattern on .+ needs \d+ marks; increase the spacing\.$/.test(w))).toBe(true);
  });

  it('M10 solid mode keeps the legacy fields and has no marks', () => {
    const bar = model(base).groups[0].bar!;
    expect(bar.fillSpec.mode).toBe('solid');
    expect(bar.marks).toBeNull();
    expect(bar.fill).toBe(bar.fillSpec.solidColor);
    expect(bar.opacity).toBe(bar.fillSpec.opacity);
  });

  it('M11 none mode has no marks', () => {
    const bar = model(patchStyle(chartId, 'all', { barFillMode: 'none' })(base)).groups[0].bar!;
    expect(bar.fillSpec.mode).toBe('none');
    expect(bar.marks).toBeNull();
  });

  it('M12 a manual range clips the bounds to the plot', () => {
    const m = model(pattern(patchAxis(chartId, 'yAxis', { min: 0, max: 1 })(base)));
    const bar = m.groups[0].bar!;
    const plot = m.layout.plot;
    expect(bar.height).toBeGreaterThan(plot.height);
    expect(bar.bounds!.y).toBeGreaterThanOrEqual(plot.y - 1e-9);
    expect(bar.bounds!.y + bar.bounds!.height).toBeLessThanOrEqual(plot.y + plot.height + 1e-9);
  });

  it('M13 a group setting beats the layer setting', () => {
    const p0 = patchStyle(chartId, 'all', { barFillMode: 'pattern', barPatternSpacingPt: 6 })(base);
    const g = table.groups[1].id;
    const m = model(patchStyle(chartId, g, { barPatternSpacingPt: 9, barFillMode: 'solid' })(p0));
    expect(m.groups[0].bar!.fillSpec.spacingPt).toBe(6);
    expect(m.groups[1].bar!.fillSpec.spacingPt).toBe(9);
    expect(m.groups[1].bar!.fillSpec.mode).toBe('solid');
    expect(m.groups[1].bar!.marks).toBeNull();
  });

  it('M14 a zero-height bar has no bounds and no marks', () => {
    const bar = model(setCol(pattern(base), 0, () => 0)).groups[0].bar!;
    expect(bar.bounds).toBeNull();
    expect(bar.marks).toBeNull();
  });

  it('M15 intersectRects', () => {
    const a = { x: 0, y: 0, width: 10, height: 10 };
    expect(intersectRects(a, { x: 5, y: 5, width: 10, height: 10 })).toEqual({ x: 5, y: 5, width: 5, height: 5 });
    expect(intersectRects(a, { x: 10, y: 0, width: 5, height: 5 })).toBeNull();
    expect(intersectRects(a, { x: 20, y: 20, width: 1, height: 1 })).toBeNull();
    expect(intersectRects(a, { x: 2, y: 2, width: 3, height: 3 })).toEqual({ x: 2, y: 2, width: 3, height: 3 });
  });

  it('marks equal patternMarks on the bounds', () => {
    const bar = model(pattern(base)).groups[0].bar!;
    expect(bar.marks).toEqual(patternMarks('horizontal', bar.bounds!, bar.anchor, 6));
  });
});
