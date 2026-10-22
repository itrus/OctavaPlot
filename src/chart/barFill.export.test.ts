import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import type { Project } from '../model/types';
import { patchAxis, patchStyle, setCells } from '../state/commands';
import { ChartSvg } from './ChartSvg';
import { chartToSvgString } from './export';
import { fillClipId } from './FillMarks';
import { buildChartModel } from './model';

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
    createElement(ChartSvg, {
      chart: p.charts[0],
      model: buildChartModel(p.charts[0], p.dataTables[0]),
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
      const m = buildChartModel(p.charts[0], p.dataTables[0]);
      const bar = m.groups[0].bar!;
      expect(bar.height).toBe(0);
      const s = svgOf(p);
      expect(s).toMatch(/<path d="M[-\d.]+,[-\d.]+h[\d.]+" fill="none" stroke="#[0-9a-f]{6}"/);
      expect(count(s, /<rect[^>]*height="0"/g)).toBe(0);
    }
  });

  it('Z2 the editor adds a transparent hit rect padded by 4 pt', () => {
    const html = editorHtml(zero());
    const hits = html.match(/<rect[^>]*data-hit="bar"[^>]*>/g) ?? [];
    expect(hits).toHaveLength(4);
    expect(hits.filter((h) => h.includes('fill="transparent"') && h.includes('height="8"'))).toHaveLength(1);
    expect(svgOf(zero())).not.toContain('transparent');
  });

  it('Z3 a zero bar in pattern mode draws no marks or clip of its own', () => {
    const s = svgOf(pattern(zero()));
    expect(count(s, /class="fill-marks"/g)).toBe(3);
    expect(count(s, /<clipPath/g)).toBe(4);
  });

  it('Z4 the threshold is the rounded height: below 0.005 pt is a baseline, above is a rect', () => {
    const p = patchAxis(chartId, 'yAxis', { min: 0, max: 1e6 })(base);
    const plotH = buildChartModel(p.charts[0], p.dataTables[0]).layout.plot.height;
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
