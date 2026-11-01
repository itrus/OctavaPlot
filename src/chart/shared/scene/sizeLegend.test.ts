import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../../model/defaults';
import { applyVariant } from '../../../model/graph/chartVariant';
import { xySeries } from '../../../model/table/tableLayout';
import type { Project } from '../../../model/types';
import { addChart, addDataTable, patchLayerStyle, patchLook, patchStyle, replaceTableData } from '../../../state/commands';
import { parseProjectWithNotes, stringifyProject } from '../../../state/serialize';
import { chartToSvgString } from '../../export/export';
import { symbolPath } from '../parts/symbols';
import { MAX_LEGEND_SIZES, niceSizes, sizeKeyOf, sizeLabel } from './sizeLegend';
import { buildXyModel } from '../../xy/xyModel';

const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const model = (p: Project) => buildXyModel(chartOf(p), tableOf(p));
const svg = (p: Project) => chartToSvgString(chartOf(p), tableOf(p));

/** A bubble chart of a table "Y and size"; the sizes of its one series are the last numbers of each row. */
const bubbles = (rows: Array<Array<number | null>>): Project => {
  let p = addDataTable('t', 'xy', { sample: true, layout: { kind: 'sized' } })(createExampleProject());
  p = replaceTableData('t', { names: ['X', 'Y', 'Count'], titles: null, values: rows })(p);
  return addChart('c', 't', undefined, 'xyBubble')(p);
};
const ROWS = [[1, 5, 10], [2, 6, 40], [3, 7, 100]];

describe('the sizes a bubble legend shows', () => {
  it('are the round values (1, 2 or 5 times a power of ten) at and below the largest size, smallest first', () => {
    expect(niceSizes(87)).toEqual([10, 20, 50]);
    expect(niceSizes(100)).toEqual([20, 50, 100]);
    expect(niceSizes(120)).toEqual([20, 50, 100]);
    expect(niceSizes(1.5)).toEqual([0.2, 0.5, 1]);
    expect(niceSizes(5)).toEqual([1, 2, 5]);
    expect(niceSizes(0.03)).toEqual([0.005, 0.01, 0.02]);
  });
  it('are none when there is no size', () => {
    expect(niceSizes(0)).toEqual([]);
    expect(niceSizes(Number.NaN)).toEqual([]);
  });
  it('are written without needless digits', () => {
    expect(sizeLabel(50)).toBe('50');
    expect(sizeLabel(0.1 + 0.2)).toBe('0.3');
    expect(sizeLabel(1234567)).toBe('1234567');
  });
});

describe('the key of a bubble chart', () => {
  it('draws a circle of a size on the scale of the bubbles: the largest size is the symbol size, the area follows the size', () => {
    const key = sizeKeyOf({ chosen: [], largest: 100, symbolSizePt: 36, title: 'Count', fontSizePt: 12 })!;
    const d = Object.fromEntries(key.items.map((i) => [i.value, i.diameterPt]));
    expect(d[100]).toBeCloseTo(36, 9);
    expect(d[50]).toBeCloseTo(36 * Math.sqrt(0.5), 9);
    expect(d[20] ** 2 / d[100] ** 2).toBeCloseTo(0.2, 9);
    expect(key.title).toBe('Count');
    expect(key.heightPt).toBeGreaterThanOrEqual(36 + 10);
  });
  it('takes the sizes the owner typed: above 0, once each, from the smallest, at most six, and may be larger than the largest', () => {
    const key = sizeKeyOf({ chosen: [30, 5, 5, -2, 0, 200, 1, 2, 3, 4, 6], largest: 100, symbolSizePt: 20, title: '', fontSizePt: 12 })!;
    expect(key.items.map((i) => i.value)).toEqual([1, 2, 3, 4, 5, 6].slice(0, MAX_LEGEND_SIZES));
    expect(key.title).toBe('Size');
    const big = sizeKeyOf({ chosen: [400], largest: 100, symbolSizePt: 20, title: 'n', fontSizePt: 12 })!;
    expect(big.items[0].diameterPt).toBeCloseTo(40, 9);
  });
  it('is nothing without a size to draw', () => {
    expect(sizeKeyOf({ chosen: [], largest: 0, symbolSizePt: 20, title: 'n', fontSizePt: 12 })).toBeNull();
    expect(sizeKeyOf({ chosen: [-1, 0], largest: 10, symbolSizePt: 20, title: 'n', fontSizePt: 12 })).toBeNull();
  });
});

describe('the size legend of a bubble chart', () => {
  it('is not there unless asked for: the drawing is what it was', () => {
    const p = bubbles(ROWS);
    expect(model(p).sizeKey).toBeUndefined();
    expect(model(p).layout.extraBottom).toBeNull();
    expect(svg(p)).not.toContain('size-legend');
  });

  it('is a row of circles and numbers under the plot, in the room the layout reserved for it', () => {
    const p = patchLook('c', { sizeLegend: { values: [] } })(bubbles(ROWS));
    const m = model(p);
    expect(m.sizeKey!.items.map((i) => i.label)).toEqual(['20', '50', '100']);
    expect(m.layout.extraBottom!.height).toBeCloseTo(m.sizeKey!.heightPt, 9);
    const s = svg(p);
    expect(s).toContain('id="size-legend"');
    const radii = [...s.matchAll(/<circle[^>]*\br="([\d.]+)"[^>]*id="size-legend-key-(\d)"/g)].map((r) => Number(r[1]));
    expect(radii).toHaveLength(3);
    const symbol = chartOf(p).defaults.symbolSizePt;
    expect(radii[2] * 2).toBeCloseTo(symbol, 1);
    // The title is the name of the size column, and it all lies inside the reserved row.
    expect(s).toContain('>Size<');
    const cy = [...s.matchAll(/<circle[^>]*\bcy="([-\d.]+)"/g)].map((r) => Number(r[1]));
    const row = m.layout.extraBottom!;
    for (const y of cy) expect(y).toBeGreaterThanOrEqual(row.y - 1e-6), expect(y).toBeLessThanOrEqual(row.y + row.height + 1e-6);
  });

  it('draws the sizes the owner chose', () => {
    const p = patchLook('c', { sizeLegend: { values: [10, 100] } })(bubbles(ROWS));
    expect(model(p).sizeKey!.items.map((i) => i.value)).toEqual([10, 100]);
    expect(svg(p)).toMatch(/id="size-legend-label-1"[^>]*>100</);
  });

  it('takes room from the plot, and is gone with the setting', () => {
    const plain = bubbles(ROWS);
    const shown = patchLook('c', { sizeLegend: { values: [] } })(plain);
    expect(model(shown).layout.plot.height).toBeLessThan(model(plain).layout.plot.height);
    const off = patchLook('c', { sizeLegend: undefined })(shown);
    expect(chartOf(off).sizeLegend).toBeUndefined();
    expect(svg(off)).toBe(svg(plain));
  });

  it('is left out of a chart that is not a bubble chart, or whose table has no sizes', () => {
    const scatter = patchLook('c', { sizeLegend: { values: [] } })(addChart('c', 't', undefined, 'xyScatter')(replaceTableData('t', { names: ['X', 'A'], titles: null, values: [[1, 2], [2, 3]] })(addDataTable('t', 'xy', { sample: true })(createExampleProject()))));
    expect(model(scatter).sizeKey).toBeUndefined();
    const plainTable = patchLook('c', { sizeLegend: { values: [] } })(addChart('c', 't', undefined, 'xyBubble')(addDataTable('t', 'xy', { sample: true })(createExampleProject())));
    expect(model(plainTable).sizeKey).toBeUndefined();
  });

  it('is on in a bubble chart made from the gallery, and kept in the file', () => {
    const made = applyVariant(chartOf(bubbles(ROWS)), { bubbles: true });
    expect(made.sizeLegend).toEqual({ values: [] });
    const p = patchLook('c', { sizeLegend: { values: [50, 10, 10, -3, 0, 7] } })(bubbles(ROWS));
    expect(chartOf(p).sizeLegend).toEqual({ values: [7, 10, 50] });
    const back = parseProjectWithNotes(stringifyProject(p));
    expect(back.notes).toEqual([]);
    expect(back.project.charts.find((c) => c.id === 'c')!.sizeLegend).toEqual({ values: [7, 10, 50] });
    const env = JSON.parse(stringifyProject(p));
    env.project.charts.find((c: { id: string }) => c.id === 'c').sizeLegend = 'yes';
    expect(parseProjectWithNotes(JSON.stringify(env)).project.charts.find((c) => c.id === 'c')!.sizeLegend).toBeUndefined();
  });
});

describe('a legend key that follows the look of its layer', () => {
  const keyPaths = (s: string) => [...(/id="legend"[\s\S]*$/.exec(s)?.[0] ?? '').matchAll(/<path d="([^"]+)"/g)].map((m) => m[1]);
  const base = (): Project => {
    let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
    p = replaceTableData('t', { names: ['X', 'A'], titles: null, values: [[1, 2], [2, 3], [3, 4]] })(p);
    return addChart('c', 't', undefined, 'xyLineSymbols')(p);
  };

  it('shows the shape the points layer was given, not the shape of the series', () => {
    const p0 = base();
    const id = xySeries(tableOf(p0))[0].id;
    const layered = patchLayerStyle('c', `${id}:points`, { shape: 'square' })(p0);
    const whole = patchStyle('c', id, { symbolShape: 'square' })(p0);
    expect(keyPaths(svg(layered))).toEqual(keyPaths(svg(whole)));
    expect(keyPaths(svg(layered))).not.toEqual(keyPaths(svg(p0)));
  });

  it('shows the colour and the width the line layer was given', () => {
    const p0 = base();
    const id = xySeries(tableOf(p0))[0].id;
    const p = patchLayerStyle('c', `${id}:line`, { color: '#12ab34', widthPt: 5 })(p0);
    const legend = /id="legend"[\s\S]*$/.exec(svg(p))![0];
    expect(legend).toMatch(/<path d="M[^"]+H[^"]+"[^>]*stroke="#12ab34"[^>]*stroke-width="5"/);
    expect(/id="legend"[\s\S]*$/.exec(svg(p0))![0]).not.toContain('#12ab34');
  });

  it('is the key it was when no layer was given a look', () => {
    const p = base();
    const [a, b] = [svg(p), svg(patchStyle('c', 'all', {})(p))];
    expect(a).toBe(b);
    expect(symbolPath('circle', 0, 0, 1)).toContain('a');
  });
});
