import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import type { Project } from '../../model/types';
import { patchAxis, patchStyle, setCells } from '../../state/commands';
import { dualAxisFixture } from '../../testing/dualAxisFixture';
import { patternMarks } from '../shared/parts/hatch';
import { buildColumnModel, intersectRects } from './columnModel';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { FILL_PATTERNS, legendKeyFill, resolveBarFill } from '../../model/graph/fill';
import { parseProject, stringifyProject } from '../../state/serialize';
import {
  BAR_FILL_KEY_FRAMES,
  BAR_FILL_NEGATIVE_INDEX,
  BAR_FILL_PATTERN_COUNT,
  barFillFixture,
} from '../../testing/barFillFixture';
import { ChartCanvas } from '../anyModel';
import { chartToSvgString } from '../export/export';
import { fillClipId } from '../shared/parts/fillElements';

const base = createExampleProject();
const chartId = base.charts[0].id;
const table = base.dataTables[0];
const model = (p: Project) => buildColumnModel(p.charts[0], p.dataTables[0]);
const pattern = (p: Project, extra: Record<string, unknown> = {}) =>
  patchStyle(chartId, 'all', { barFillMode: 'pattern', barPattern: 'horizontal', barPatternSpacingPt: 6, ...extra })(p);
const setCol = (p: Project, col: number, f: (v: number) => number) => {
  const t = p.dataTables[0];
  return setCells(t.id, t.groups[col].observations.flatMap((o, row) => (o.value === null ? [] : [{ row, col, value: f(o.value) }])))(p);
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
    const big = buildColumnModel(
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

const svgOf = (p: Project): string => chartToSvgString(p.charts[0], p.dataTables[0]);
const modelOf = (p: Project) => buildColumnModel(p.charts[0], p.dataTables[0]);
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
const editorHtml = (p: Project): string =>
  renderToStaticMarkup(
    createElement(ChartCanvas, {
      chart: p.charts[0],
      any: { family: 'column' as const, model: modelOf(p) },
      editor: { selection: { kind: 'chart' } as never },
      cssWidth: '1px',
      cssHeight: '1px',
    }),
  );

describe('bar fill visual fixture', () => {
  const project = barFillFixture();

  it('X8a has nine data sets: seven patterns, one solid, one none, a visible legend and a manual range', () => {
    const chart = project.charts[0];
    const table = project.dataTables[0];
    expect(table.groups).toHaveLength(9);
    expect(chart.legend.visible).toBe(true);
    expect(chart.yAxis.min).toBe(-2);
    expect(chart.yAxis.max).toBe(3);
    const modes = modelOf(project).groups.map((g) => g.bar?.fillSpec.mode);
    expect(modes).toEqual([...Array(BAR_FILL_PATTERN_COUNT).fill('pattern'), 'solid', 'none']);
    expect(modelOf(project).groups.slice(0, BAR_FILL_PATTERN_COUNT).map((g) => g.bar?.fillSpec.pattern)).toEqual([...FILL_PATTERNS]);
    expect(Math.max(...table.groups[BAR_FILL_NEGATIVE_INDEX].observations.map((o) => o.value as number))).toBeLessThan(0);
  });

  it('X8b has marks for each pattern role only, and the negative bar hangs from the baseline', () => {
    const groups = modelOf(project).groups;
    groups.forEach((g, i) => {
      const bar = g.bar!;
      if (i < BAR_FILL_PATTERN_COUNT) {
        expect(bar.marks?.kind).toBe(FILL_PATTERNS[i] === 'dots' ? 'dots' : 'lines');
        expect(bar.marks?.count).toBeGreaterThan(0);
      } else {
        expect(bar.marks).toBeNull();
      }
    });
    const base = groups[0].bar!.anchor.y;
    for (const g of groups) expect(g.bar!.anchor.y).toBeCloseTo(base, 9);
    const neg = groups[BAR_FILL_NEGATIVE_INDEX].bar!;
    expect(neg.y).toBeCloseTo(neg.anchor.y, 9);
    expect(neg.height).toBeGreaterThan(0);
    const pos = groups[0].bar!;
    expect(pos.y + pos.height).toBeCloseTo(pos.anchor.y, 9);
  });

  it('X8c export has 17 frames, 15 clip paths and no editor machinery', () => {
    const s = svgOf(project);
    expect(count(s, /stroke-linejoin="miter"/g)).toBe(9 + BAR_FILL_KEY_FRAMES);
    expect(count(s, /<clipPath/g)).toBe(1 + 2 * BAR_FILL_PATTERN_COUNT);
    expect(count(s, /<clipPath id="fill-clip-[^"]*legend-/g)).toBe(BAR_FILL_PATTERN_COUNT);
    expect(count(s, /class="fill-marks"/g)).toBe(2 * BAR_FILL_PATTERN_COUNT);
    expect(count(s, /<g opacity/g)).toBe(0);
    for (const bad of ['<pattern', '<image', '<desc', 'pointer-events', 'data-hit']) expect(s).not.toContain(bad);
  });

  it('X8d legend keys cap the spacing at 8 pt and the mark at half of it', () => {
    const style = project.charts[0].defaults;
    const group = modelOf(project).groups[0].bar!.fillSpec;
    expect(group.spacingPt).toBe(12);
    const key = legendKeyFill(group);
    expect(key.spacingPt).toBe(8);
    expect(key.markWidthPt).toBe(2);
    expect(legendKeyFill(resolveBarFill({ ...style, barPatternSpacingPt: 12, barPatternWidthPt: 10 })).markWidthPt).toBe(4);
    expect(legendKeyFill({ ...group, spacingPt: 6 }).spacingPt).toBe(6);
  });

  it('X8e the opacity variant puts one group opacity on each pattern bar and key', () => {
    const p = barFillFixture({ opacity: true });
    const s = svgOf(p);
    expect(count(s, /<g opacity="0.5"/g)).toBe(2 * BAR_FILL_PATTERN_COUNT);
    expect(s).not.toContain('<g opacity="0.5" opacity');
    expect(count(s, /fill-opacity="0.5"/g)).toBeGreaterThanOrEqual(1);
    expect(p.charts[0].yAxis.showGrid).toBe(true);
    expect(count(s, /<clipPath/g)).toBe(1 + 2 * BAR_FILL_PATTERN_COUNT);
  });

  it('X8f editor markup: marks ignore the pointer, each bar frame owns the hit attributes', () => {
    const html = editorHtml(project);
    expect(count(html, /<g[^>]*pointer-events="none"/g)).toBe(2 * BAR_FILL_PATTERN_COUNT);
    const frames = html.match(/<rect[^>]*data-hit="bar"[^>]*>/g) ?? [];
    expect(frames).toHaveLength(9);
    expect(html).not.toMatch(/<path[^>]*class="fill-marks"[^>]*data-hit/);
  });

  it('X8g is deterministic and survives a save and load', () => {
    expect(svgOf(project)).toBe(svgOf(project));
    expect(editorHtml(project)).toBe(editorHtml(project));
    const loaded = parseProject(stringifyProject(project));
    expect(svgOf(loaded)).toBe(svgOf(project));
  });

  it('X8h a style-only edit changes only that data set colour', () => {
    const chart = project.charts[0];
    const id = project.dataTables[0].groups[0].id;
    const edited = patchStyle(chart.id, id, { barPatternColor: '#cc0000' })(project);
    const before = svgOf(project);
    const after = svgOf(edited);
    expect(after).not.toBe(before);
    expect(after.replaceAll('#cc0000', '#000000')).toBe(before);
    expect(count(after, /#cc0000/g)).toBe(2);
  });
});

describe('the bar fill in an exported SVG', () => {
  // These counts are of the bars alone, so the legend (on by default) is switched off.
  const example = createExampleProject();
  const base = { ...example, charts: example.charts.map((c) => ({ ...c, legend: { ...c.legend, visible: false } })) };
  const chartId = base.charts[0].id;
  const svgOf = (p: Project): string => chartToSvgString(p.charts[0], p.dataTables[0]);
  const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;
  const pattern = (p: Project, extra: Record<string, unknown> = {}) =>
    patchStyle(chartId, 'all', { barFillMode: 'pattern', barPattern: 'horizontal', barPatternSpacingPt: 6, ...extra })(p);
  const editorHtml = (p: Project): string =>
    renderToStaticMarkup(
      createElement(ChartCanvas, {
        chart: p.charts[0],
        any: { family: 'column' as const, model: buildColumnModel(p.charts[0], p.dataTables[0]) },
        editor: { selection: { kind: 'chart' } as never },
        cssWidth: '1px',
        cssHeight: '1px',
      }),
    );
  const setCol0 = (p: Project, value: number) => {
    const t = p.dataTables[0];
    return setCells(t.id, t.groups[0].observations.map((_, row) => ({ row, col: 0, value })))(p);
  };

  describe('bar fill rendering', () => {
    it('X1 solid mode draws only legacy rects, no fill machinery', () => {
      const s = svgOf(base);
      expect(count(s, /<clipPath/g)).toBe(1);
      for (const bad of ['fill-marks', '<g opacity', '<pattern', '<image', '<desc', 'pointer-events']) expect(s).not.toContain(bad);
    });

    it('X2 pattern export has one clip per bar and one marks path per bar', () => {
      const s = svgOf(pattern(base));
      expect(count(s, /<clipPath/g)).toBe(5);
      expect(count(s, /class="fill-marks"/g)).toBe(4);
      for (const bad of ['<pattern', '<image', '<desc', 'pointer-events', 'data-hit']) expect(s).not.toContain(bad);
    });

    it('X3 opacity is a group opacity only, never a fill opacity on marks', () => {
      const s = svgOf(pattern(base, { barOpacity: 0.5, barPatternBackground: '#ffee00' }));
      expect(count(s, /<g opacity="0.5"/g)).toBe(4);
      expect(s).not.toContain('fill-opacity');
      expect(svgOf(pattern(base))).not.toContain('<g opacity');
    });

    it('X4 editor: marks ignore the pointer, the frame owns the hit attributes', () => {
      const html = editorHtml(pattern(base));
      expect(count(html, /<g[^>]*pointer-events="none"/g)).toBe(4);
      const frames = html.match(/<rect[^>]*data-hit="bar"[^>]*>/g) ?? [];
      expect(frames).toHaveLength(4);
      for (const f of frames) {
        expect(f).toContain('pointer-events="all"');
        expect(f).toContain('fill="none"');
        expect(f).toContain('stroke-linejoin="miter"');
      }
      expect(html).not.toMatch(/<path[^>]*class="fill-marks"[^>]*data-hit/);
    });

    it('X5 legend keys show the pattern at key scale', () => {
      const s = svgOf(patchStyle(chartId, 'all', { barFillMode: 'pattern', barPatternSpacingPt: 12 })(base));
      expect(count(s, /<clipPath/g)).toBe(base.charts[0].legend.visible ? 9 : 5);
      expect(s).toContain('fill-clip-');
    });

    it('X6 none mode draws only the frame', () => {
      const s = svgOf(patchStyle(chartId, 'all', { barFillMode: 'none' })(base));
      expect(count(s, /<clipPath/g)).toBe(1);
      expect(s).not.toContain('fill-marks');
      expect(count(s, /fill="none"[^>]*stroke-linejoin="miter"|stroke-linejoin="miter"[^>]*fill="none"/g)).toBeGreaterThanOrEqual(4);
    });

    it('X7 is deterministic', () => {
      expect(svgOf(pattern(base))).toBe(svgOf(pattern(base)));
      expect(editorHtml(pattern(base))).toBe(editorHtml(pattern(base)));
    });
  });

  describe('zero-height bars', () => {
    const zero = (extra?: Project) => setCol0(extra ?? base, 0);
    it('Z1 a zero bar renders as an opaque baseline path, in every fill mode', () => {
      for (const p of [zero(), pattern(zero()), patchStyle(chartId, 'all', { barFillMode: 'none' })(zero())]) {
        const m = buildColumnModel(p.charts[0], p.dataTables[0]);
        const bar = m.groups[0].bar!;
        expect(bar.height).toBe(0);
        const s = svgOf(p);
        expect(s).toMatch(/<path d="M[-\d.]+,[-\d.]+h[\d.]+" fill="none" stroke="#[0-9a-f]{6}"/);
        expect(count(s, /<rect[^>]*height="0"/g)).toBe(0);
      }
    });

    it('Z2 the editor adds a transparent hit rect padded by 8 pt', () => {
      const html = editorHtml(zero());
      const hits = html.match(/<rect[^>]*data-hit="bar"[^>]*>/g) ?? [];
      expect(hits).toHaveLength(4);
      expect(hits.filter((h) => h.includes('fill="transparent"') && h.includes('height="16"'))).toHaveLength(1);
      expect(svgOf(zero())).not.toContain('transparent');
    });

    it('Z3 a zero bar in pattern mode draws no marks or clip of its own', () => {
      const s = svgOf(pattern(zero()));
      expect(count(s, /class="fill-marks"/g)).toBe(3);
      expect(count(s, /<clipPath/g)).toBe(4);
    });

    it('Z4 the threshold is the rounded height: below 0.005 pt is a baseline, above is a rect', () => {
      const p = patchAxis(chartId, 'yAxis', { min: 0, max: 1e6 })(base);
      const plotH = buildColumnModel(p.charts[0], p.dataTables[0]).layout.plot.height;
      const per = (v: number) => (v / 1e6) * plotH;
      const vTiny = Math.floor(0.004 / (plotH / 1e6));
      const vBig = Math.ceil(0.02 / (plotH / 1e6));
      expect(per(vTiny)).toBeLessThan(0.005);
      expect(per(vBig)).toBeGreaterThan(0.005);
      const tiny = svgOf(setCol0(p, vTiny));
      const big = svgOf(setCol0(p, vBig));
      expect(count(tiny, /<rect[^>]*fill="#3B4992"/gi)).toBe(0);
      expect(count(big, /<rect[^>]*fill="#3B4992"/gi)).toBe(1);
    });
  });

  describe('fillClipId', () => {
    it('K1 is deterministic, sanitised and distinct per mark', () => {
      expect(fillClipId('chart_1', 'grp_1:bar')).toBe(fillClipId('chart_1', 'grp_1:bar'));
      expect(fillClipId('chart 1', 'a:b"c')).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(fillClipId('c', 'a:b')).not.toBe(fillClipId('c', 'a:c'));
      expect(fillClipId('c', 'a:b')).not.toBe(fillClipId('d', 'a:b'));
    });
  });
});
