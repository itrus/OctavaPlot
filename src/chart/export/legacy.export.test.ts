import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import type { ChartType } from '../model/types';
import { patchStyle, setChartType } from '../state/commands';
import { chartToSvgString } from './export';

/**
 * Golden exports of the legacy renderer. Stored files are raw. Never regenerate with -u.
 *
 * The goldens predate pixel sizes (they carry width="160mm") and were drawn at half the size lengths are drawn at now
 * (every length in pt is twice as large). The fixture below is the legacy chart at twice the size, with the legacy line
 * weights doubled (160 x 120 mm = 453.54 x 340.16 pt, no chart title). The root element's CSS size attributes, the only
 * part that changed, are left out of the comparison, and the drawing is brought back to the goldens' scale before it is
 * compared; numbers are compared to 0.011, as the drawing is rounded to 0.01 at twice the scale.
 */
const withoutCssSize = (s: string): string => s.replace(/(<svg [^>]*?) width="[^"]*" height="[^"]*"/, '$1');

// The stable ids (see svgIds.ts) were added after the goldens were made. They are additions, not changes of the drawing, so
// they are left out of the comparison; every other attribute, and the clip ids the goldens have, are compared as before.
const STABLE_IDS = / id="(?:page|plot-area|(?:chart|x-axis|y-axis|y2-axis)-title|x-axis|y-axis|legend|at-risk-table|fit-parameters|annotation-[^"]*|reference-line-[^"]*)"/g;
const withoutStableIds = (s: string): string => s.replace(STABLE_IDS, '');

// The goldens are half the size of the drawing now, so the legacy 160 x 120 mm geometry needs twice its pixel size.
const LEGACY_SCALE = 2;
const legacyPx = (mm: number) => ((mm * 96) / 25.4) * LEGACY_SCALE;

const NUMBER = /-?\d+(?:\.\d+)?(?:e-?\d+)?/g;
const halve = (text: string, keep: (index: number) => boolean = () => false): string => {
  let i = -1;
  return text.replace(NUMBER, (m) => (keep(++i) ? m : String(Number(m) / LEGACY_SCALE)));
};
/** Path data with every length halved; the rotation and the two flags of an arc are not lengths. */
const halvePath = (d: string): string =>
  d.replace(/([a-zA-Z])([^a-zA-Z]*)/g, (_, cmd: string, args: string) => cmd + (cmd === 'a' || cmd === 'A' ? halve(args, (i) => i % 7 >= 2 && i % 7 <= 4) : halve(args)));
const LENGTHS = /^(x|y|x1|y1|x2|y2|cx|cy|r|rx|ry|width|height|viewBox|font-size|stroke-width|stroke-dasharray)$/;
/** The drawing brought back to the scale the goldens were made at. */
const atLegacyScale = (svg: string): string =>
  withoutStableIds(withoutCssSize(svg)).replace(/([a-zA-Z-]+)="([^"]*)"/g, (m, name: string, value: string) => {
    if (name !== 'd' && name !== 'transform' && !LENGTHS.test(name)) return m;
    if (name === 'd') return `d="${halvePath(value)}"`;
    if (name === 'transform') return `transform="${/rotate\(/.test(value) ? halve(value, (i) => i === 0) : /matrix\(/.test(value) ? halve(value, (i) => i < 4) : halve(value)}"`;
    return `${name}="${halve(value)}"`;
  });

/** Same text, and every number within 0.011 of the golden's. */
function expectSameDrawing(actual: string, golden: string): void {
  const numbersOf = (s: string) => (s.match(NUMBER) ?? []).map(Number);
  const reference = withoutCssSize(golden);
  expect(actual.replace(NUMBER, '#')).toBe(reference.replace(NUMBER, '#'));
  const [a, g] = [numbersOf(actual), numbersOf(reference)];
  const off = a.findIndex((v, i) => Math.abs(v - g[i]) > 0.011);
  expect(off === -1 ? null : { index: off, actual: a[off], golden: g[off] }).toBeNull();
}

/** Example project with stable ids, assigned by object spread only. */
function frozenExample(type: ChartType) {
  let p = createExampleProject();
  p = {
    ...p,
    dataTables: p.dataTables.map((t) => ({
      ...t,
      groups: t.groups.map((g, gi) => ({
        ...g,
        id: `grp_${gi}`,
        observations: g.observations.map((o, ri) => ({ ...o, id: `obs_${gi}_${ri}` })),
      })),
    })),
  };
  p = {
    ...p,
    charts: p.charts.map((c) => ({
      ...c,
      widthPx: legacyPx(160),
      heightPx: legacyPx(120),
      showTitle: false,
      legend: { ...c.legend, visible: false },
      paletteId: 'classic',
      xAxis: { ...c.xAxis, lineWidthPt: 2.1 * LEGACY_SCALE },
      yAxis: { ...c.yAxis, lineWidthPt: 2.1 * LEGACY_SCALE },
      y2Axis: { ...c.y2Axis, lineWidthPt: 2.1 * LEGACY_SCALE },
      // The line weights and grey palette the goldens were made with, before the weights were harmonised.
      defaults: { ...c.defaults, barBorderWidthPt: 2, barPatternWidthPt: 1, symbolBorderWidthPt: 1.5, errorLineWidthPt: 2, lineWidthPt: 3 },
    })),
  };
  p = setChartType(p.charts[0].id, type)(p);
  // The bar golden predates symbols being on by default for bar charts.
  if (type === 'bar') p = patchStyle(p.charts[0].id, 'all', { showSymbols: false })(p);
  return p;
}

const svgOf = (type: ChartType): string => {
  const p = frozenExample(type);
  return chartToSvgString(p.charts[0], p.dataTables[0]);
};

const snapshotPath = (type: ChartType): string => resolve(__dirname, '__snapshots__', `legacy-${type}.svg`);

describe('legacy export goldens', () => {
  for (const type of ['bar', 'scatter', 'mean'] as const) {
    it(`${type} matches its golden at the legacy scale`, () => {
      const actual = svgOf(type);
      const file = snapshotPath(type);
      if (!existsSync(file)) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, actual);
      }
      const stored = readFileSync(file, 'utf8');
      expect(stored.startsWith('<?xml')).toBe(true);
      expect(stored.trimEnd().endsWith('</svg>')).toBe(true);
      expectSameDrawing(atLegacyScale(actual), stored);
    });
  }

  it('is deterministic across fresh projects', () => {
    for (const type of ['bar', 'scatter', 'mean'] as const) expect(svgOf(type)).toBe(svgOf(type));
  });

  it('contains no internal ids or editor attributes', () => {
    for (const type of ['bar', 'scatter', 'mean'] as const) {
      const svg = svgOf(type);
      expect(svg).not.toMatch(/(grp|obs|table|chart|layer|project)_/);
      for (const bad of ['data-hit', 'data-editor-only', 'pointer-events', '<pattern', '<image', 'fill-marks', '<desc', '<title']) {
        expect(svg).not.toContain(bad);
      }
    }
  });

  it('has exactly one clipPath and no group opacity', () => {
    for (const type of ['bar', 'scatter', 'mean'] as const) {
      const svg = svgOf(type);
      expect((svg.match(/<clipPath/g) ?? []).length).toBe(1);
      expect(svg).not.toContain('<g opacity');
    }
  });

  it('runs without a DOM', () => {
    expect(typeof document).toBe('undefined');
  });

  it('draws the expected marks per preset', () => {
    const bar = svgOf('bar');
    for (const fill of ['#d9d9d9', '#a6a6a6', '#737373', '#f2f2f2']) expect(bar).toContain(`fill="${fill}"`);
    expect((bar.match(/<rect[^>]*fill="#(d9d9d9|a6a6a6|737373|f2f2f2)"/g) ?? []).length).toBe(4);
    expect((svgOf('scatter').match(/<path d="M[\d.]+,[\d.]+a/g) ?? []).length).toBe(20);
    expect((svgOf('mean').match(/<path d="M[\d.]+,[\d.]+a/g) ?? []).length).toBe(4);
  });

  it('three presets differ', () => {
    const [a, b, c] = (['bar', 'scatter', 'mean'] as const).map(svgOf);
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a).not.toBe(c);
  });
});
