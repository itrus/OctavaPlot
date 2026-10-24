import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createXyTable } from '../model/defaults';
import { resolveStyle } from '../model/style';
import type { SymbolShape } from '../model/types';
import { patchStyle } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { chartToSvgString } from './export';
import { SYMBOL_SHAPE_OPTIONS, symbolPath } from './symbols';

describe('symbols', () => {
  it('every offered shape has a path, centred where it is put, with no NaN', () => {
    for (const o of SYMBOL_SHAPE_OPTIONS) {
      const d = symbolPath(o.value as SymbolShape, 100, 50, 10);
      expect(d.length, o.value).toBeGreaterThan(5);
      expect(d, o.value).not.toContain('NaN');
      const nums = [...d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));
      expect(nums.every(Number.isFinite)).toBe(true);
    }
    expect(SYMBOL_SHAPE_OPTIONS.map((o) => o.value)).toEqual(expect.arrayContaining(['triangleDown', 'hexagon', 'star', 'target', 'asterisk']));
  });
  it('the polygons stay within the size asked for', () => {
    for (const shape of ['triangleDown', 'hexagon', 'star'] as const) {
      const pts = [...symbolPath(shape, 0, 0, 10).matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeLessThanOrEqual(5 * Math.SQRT2 + 1e-6);
      expect(pts.length).toBeGreaterThanOrEqual(3);
    }
    // The down triangle points down: the single lowest corner is the last one.
    const t = symbolPath('triangleDown', 0, 0, 10);
    expect(t).toBe('M-5,-5L5,-5L0,5Z');
  });
});

describe('symbol fill opacity', () => {
  const xy = () => {
    const table = createXyTable('XY', true);
    const chart = createChart(table.id, undefined, 'xyScatter');
    return { table, chart, project: { id: 'p', name: 'p', dataTables: [table], charts: [chart] } };
  };
  it('is solid by default and drawn into the picture when changed, in XY and column charts', () => {
    const { table, chart, project } = xy();
    expect(resolveStyle(chart, chart.layers[0], { id: 'g', paletteIndex: 0 }).symbolFillOpacity).toBe(1);
    expect(chartToSvgString(chart, table)).not.toContain('fill-opacity');
    const hollow = patchStyle(chart.id, 'all', { symbolFillOpacity: 0 })(project);
    expect(chartToSvgString(hollow.charts[0], table)).toContain('fill-opacity="0"');
    const col = createColumnTable('C', true);
    const c = createChart(col.id, undefined, 'scatter');
    const p = patchStyle(c.id, 'all', { symbolFillOpacity: 0.3 })({ id: 'p', name: 'p', dataTables: [col], charts: [c] });
    expect(chartToSvgString(p.charts[0], col)).toContain('fill-opacity="0.3"');
  });
  it('is saved, and a file without it gets a solid fill', () => {
    const { chart, project } = xy();
    const p = patchStyle(chart.id, 'all', { symbolFillOpacity: 0.4, symbolShape: 'star' })(project);
    const back = parseProject(stringifyProject(p)).charts[0];
    expect(resolveStyle(back, back.layers[0], { id: 'g', paletteIndex: 0 })).toMatchObject({ symbolFillOpacity: 0.4, symbolShape: 'star' });
    const old = parseProject(stringifyProject(project)).charts[0];
    expect(resolveStyle(old, old.layers[0], { id: 'g', paletteIndex: 0 }).symbolFillOpacity).toBe(1);
  });
});

describe('line patterns', () => {
  it('every pattern has dashes in units of the line width, and solid has none', async () => {
    const { dashOf, LINE_STYLES, linePattern } = await import('../model/look');
    expect(LINE_STYLES.map((l) => l.value)).toEqual(['solid', 'longDash', 'dashed', 'dotted', 'dashDot', 'dashDotDot']);
    expect(dashOf('solid', 5.2)).toBeUndefined();
    // Gridlines (thin) keep the patterns they always had.
    expect(dashOf('dashed')).toBe('8 6');
    expect(dashOf('dotted', 1)).toBe('2 4');
    // A thicker line has longer dashes, so the pattern keeps its look.
    expect(dashOf('dashDot', 4)).toBe('24 12 4 12');
    expect(dashOf('dashDotDot', 2)).toBe('12 6 2 6 2 6');
    expect(linePattern({ lineStyle: 'solid', lineWidthPt: 2 }).strokeLinecap).toBe('round');
    expect(linePattern({ lineStyle: 'dotted', lineWidthPt: 2 }).strokeLinecap).toBe('butt');
  });
  it('are drawn on series lines and in the legend, saved, and a solid line writes no dash array', () => {
    const table = createXyTable('XY', true);
    const chart = createChart(table.id, undefined, 'xyLine');
    const project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    expect(chartToSvgString(chart, table)).not.toContain('stroke-dasharray');
    const dotted = patchStyle(chart.id, 'all', { lineStyle: 'dashDot' })(project);
    const svg = chartToSvgString(dotted.charts[0], table);
    expect(svg).toContain('stroke-dasharray="31.2 15.6 5.2 15.6"');
    // The plot lines and the two legend keys.
    expect((svg.match(/stroke-dasharray="31.2 15.6 5.2 15.6"/g) ?? []).length).toBe(4);
    const back = parseProject(stringifyProject(dotted)).charts[0];
    expect(resolveStyle(back, back.layers[0], { id: 'g', paletteIndex: 0 }).lineStyle).toBe('dashDot');
  });
});
