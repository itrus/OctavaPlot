import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import type { ChartType } from '../model/types';
import { CHART_DRAW_SCALE } from '../model/units';
import { patchStyle, setChartType } from '../state/commands';
import { chartToSvgString } from './export';

/**
 * Golden exports of the legacy renderer. Stored files are raw; both sides are
 * compared after rounding every decimal token to 6 places, so last-digit
 * floating-point differences never fail the gate. Never regenerate with -u.
 *
 * The goldens predate pixel sizes (they carry width="160mm"). The fixture below keeps their geometry
 * (160 x 120 mm = 453.54 x 340.16 pt, no chart title); the root element's CSS size attributes, the only
 * part that changed, are left out of the comparison.
 */
const normalize = (s: string): string =>
  s
    .replace(/(<svg [^>]*?) width="[^"]*" height="[^"]*"/, '$1')
    .replace(/-?\d+\.\d+(e-?\d+)?/g, (m) => Number(m).toFixed(6));

// Charts are drawn at CHART_DRAW_SCALE x, so the legacy 160 x 120 mm geometry needs twice its pixel size.
const legacyPx = (mm: number) => ((mm * 96) / 25.4) * CHART_DRAW_SCALE;

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
      xAxis: { ...c.xAxis, lineWidthPt: 2.1 },
      yAxis: { ...c.yAxis, lineWidthPt: 2.1 },
      y2Axis: { ...c.y2Axis, lineWidthPt: 2.1 },
      // The line weights and grey palette the goldens were made with, before the weights were harmonised.
      defaults: { ...c.defaults, barBorderWidthPt: 1, barPatternWidthPt: 0.5, symbolBorderWidthPt: 0.75, errorLineWidthPt: 1, lineWidthPt: 1.5 },
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
    it(`${type} matches its golden after number normalisation`, () => {
      const actual = svgOf(type);
      const file = snapshotPath(type);
      if (!existsSync(file)) {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, actual);
      }
      const stored = readFileSync(file, 'utf8');
      expect(stored.startsWith('<?xml')).toBe(true);
      expect(stored.trimEnd().endsWith('</svg>')).toBe(true);
      expect(normalize(actual)).toBe(normalize(stored));
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
