import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../model/defaults';
import { GALLERY } from '../../model/graph/chartGallery';
import { applyVariant } from '../../model/graph/chartVariant';
import type { Project } from '../../model/types';
import { addChart, addDataTable, patchLook, patchStyle, replaceTableData } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildGroupedModel } from './groupedModel';

/**
 * A forest plot: the estimates and the limits of each study as typed in a grouped table ("Mean (or median), Upper/Lower limits"),
 * lines over categories turned on their side and without the line. Nothing is calculated or pooled.
 */

const STUDIES = ['Alpha 2019', 'Beta 2020', 'Gamma 2021', 'Pooled'];
// estimate, upper limit, lower limit (the order of the sub-columns of that format)
const VALUES = [[0.8, 1.2, 0.5], [1.5, 2.4, 0.9], [0.4, 0.9, 0.2], [0.9, 1.1, 0.7]];

function forestProject(kind: 'difference' | 'ratio'): Project {
  let p = addDataTable('t', 'grouped', { layout: { kind: 'summary', format: 'mean-limits' } })(createEmptyProject());
  p = replaceTableData('t', { names: ['Mean', 'Upper', 'Lower'], titles: STUDIES, values: VALUES })(p);
  return addChart('c', 't', undefined, 'groupedLine', { forest: kind })(p);
}
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const numbersIn = (path: string): number[] => [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

describe('forest plot', () => {
  it('is a gallery entry for differences and one for ratios, both of lines over categories', () => {
    const items = GALLERY.grouped.flatMap((t) => t.items).filter((i) => i.variant?.forest);
    expect(items.map((i) => [i.id, i.type, i.variant!.forest])).toEqual([['grp.forest', 'groupedLine', 'difference'], ['grp.forestRatio', 'groupedLine', 'ratio']]);
  });

  it('turns the chart on its side, with square markers, no joining line and a dashed line at no effect', () => {
    const d = chartOf(forestProject('difference'));
    expect(d.orientation).toBe('horizontal');
    expect(d.layers[0].style).toMatchObject({ showLines: false, symbolShape: 'square' });
    expect(d.referenceLines.map((l) => [l.axis, l.value, l.style])).toEqual([['y', 0, 'dashed']]);
    expect(d.yAxis).toMatchObject({ scale: 'linear', title: 'Effect and interval' });
    expect(d.legend.visible).toBe(false);
    const r = chartOf(forestProject('ratio'));
    expect(r.referenceLines.map((l) => l.value)).toEqual([1]);
    expect(r.yAxis).toMatchObject({ scale: 'log10', title: 'Ratio (log scale)' });
  });

  it('changes nothing in a chart of another type', () => {
    const plain = chartOf(addChart('c', 't', undefined, 'groupedBar')(addDataTable('t', 'grouped')(createEmptyProject())));
    expect(applyVariant(plain, { forest: 'ratio' })).toEqual(plain);
  });

  it('puts the studies in table order down the page and the estimates left to right by value', () => {
    const p = forestProject('difference');
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(m.orient.horizontal).toBe(true);
    const pts = m.series[0].points.map((q) => m.orient.toScreen(q.px, q.py));
    expect(pts).toHaveLength(STUDIES.length);
    // The first study is at the top, the last at the bottom.
    pts.forEach((q, i) => i > 0 && expect(q.y).toBeGreaterThan(pts[i - 1].y));
    // The farther right, the larger the estimate: the order of the x of the markers is the order of the typed estimates.
    const byX = [...pts.keys()].sort((a, b) => pts[a].x - pts[b].x);
    const byValue = [...VALUES.keys()].sort((a, b) => VALUES[a][0] - VALUES[b][0]);
    expect(byX).toEqual(byValue);
  });

  it('draws each interval from the lower to the upper limit as typed, not as a symmetric error', () => {
    const p = forestProject('difference');
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    // The bars are made in the turned region: along the value axis their ends are at the values the axis gives the limits.
    const ends = numbersIn(m.series[0].errorPath);
    for (const [, upper, lower] of VALUES) {
      expect(ends.some((v) => Math.abs(v - m.yScale(upper)) < 1e-6), `upper ${upper}`).toBe(true);
      expect(ends.some((v) => Math.abs(v - m.yScale(lower)) < 1e-6), `lower ${lower}`).toBe(true);
    }
  });

  it('is drawn on a log axis for ratios, and the line at 1 is in the drawing', () => {
    const p = forestProject('ratio');
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(m.y.log).toBeTruthy();
    const svg = chartToSvgString(chartOf(p), tableOf(p));
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
    expect(svg).toContain('stroke-dasharray');
  });

  it('is saved and read back as it was made', () => {
    const p = forestProject('ratio');
    expect(parseProject(stringifyProject(p))).toEqual(p);
  });
});

describe('summary diamond', () => {
  const rowId = (p: Project, row: number) => tableOf(p).rows[row].id;
  const withSummary = (p: Project, rows: number[]) => patchLook('c', { summaryRows: rows.map((r) => rowId(p, r)) })(p);
  /** The diamonds in a drawing: paths of four corners, closed, as lists of points. */
  const diamondsIn = (svg: string): number[][][] =>
    [...svg.matchAll(/ d="(M[-\d.,]+(?:L[-\d.,]+){3}Z)"/g)].map((m) => m[1].slice(1, -1).split('L').map((pt) => pt.split(',').map(Number)));

  it('draws the summary row from its lower to its upper limit, centred on its estimate, and no bar there', () => {
    const base = forestProject('difference');
    const p = withSummary(base, [3]);
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    const pts = m.series[0].points;
    expect(pts.map((q) => q.diamond !== undefined)).toEqual([false, false, false, true]);
    expect(pts[3].diamond).toEqual({ lowerPy: m.yScale(0.7), upperPy: m.yScale(1.1) });
    // The bar of that row is gone; the bars of the other rows are as they were.
    const ends = numbersIn(m.series[0].errorPath);
    expect(ends.some((v) => Math.abs(v - m.yScale(1.1)) < 1e-6)).toBe(false);
    expect(ends.some((v) => Math.abs(v - m.yScale(0.7)) < 1e-6)).toBe(false);
    for (const [, upper, lower] of VALUES.slice(0, 3)) {
      expect(ends.some((v) => Math.abs(v - m.yScale(upper)) < 1e-6)).toBe(true);
      expect(ends.some((v) => Math.abs(v - m.yScale(lower)) < 1e-6)).toBe(true);
    }
  });

  it('puts the corners where the axis puts the limits, across the width of a marker, on the turned chart', () => {
    const p = withSummary(forestProject('difference'), [3]);
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    const found = diamondsIn(chartToSvgString(chartOf(p), tableOf(p)));
    expect(found).toHaveLength(1);
    const xs = found[0].map((q) => q[0]);
    const ys = found[0].map((q) => q[1]);
    const at = (value: number) => m.orient.toScreen(m.series[0].points[3].px, m.yScale(value));
    // Along the value axis (to the right on a horizontal chart): from the lower to the upper limit. Across it: the size of a marker.
    expect(Math.min(...xs)).toBeCloseTo(at(0.7).x, 1);
    expect(Math.max(...xs)).toBeCloseTo(at(1.1).x, 1);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(chartOf(p).layers[0].style.symbolSizePt ?? m.series[0].style.symbolSizePt, 1);
    // The widest corners sit at the height of the estimate.
    const estimateX = at(0.9).x;
    expect(found[0].some((q) => Math.abs(q[0] - estimateX) < 0.02 && Math.abs(q[1] - Math.min(...ys)) < 0.02)).toBe(true);
  });

  it('keeps its limits in the axis range even when the error bars are off', () => {
    let p = addDataTable('t', 'grouped', { layout: { kind: 'summary', format: 'mean-limits' } })(createEmptyProject());
    p = replaceTableData('t', { names: ['Mean', 'Upper', 'Lower'], titles: ['A', 'Pooled'], values: [[1, 1.5, 0.5], [2, 9, 0.2]] })(p);
    p = addChart('c', 't', undefined, 'groupedLine', { forest: 'difference' })(p);
    p = patchStyle('c', 'all', { showErrorBars: false })(p);
    const off = buildGroupedModel(chartOf(p), tableOf(p));
    expect(off.y.domain[1]).toBeLessThan(9);
    const on = buildGroupedModel(chartOf(withSummary(p, [1])), tableOf(p));
    expect(on.y.domain[1]).toBeGreaterThanOrEqual(9);
    expect(on.y.domain[0]).toBeLessThanOrEqual(0.2);
  });

  it('draws a summary row with no interval as an ordinary marker, and says so', () => {
    let p = forestProject('difference');
    p = replaceTableData('t', { names: ['Mean', 'Upper', 'Lower'], titles: STUDIES, values: [...VALUES.slice(0, 3), [0.9, null, null]] })(p);
    const m = buildGroupedModel(chartOf(withSummary(p, [3])), tableOf(p));
    expect(m.series[0].points.map((q) => q.diamond)).toEqual([undefined, undefined, undefined, undefined]);
    expect(m.warnings.some((w) => /1 summary row has no interval/.test(w))).toBe(true);
  });

  it('is not drawn for a row that is gone, and adds no notice for it', () => {
    const p = patchLook('c', { summaryRows: ['row_that_is_gone'] })(forestProject('difference'));
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(m.series[0].points.every((q) => q.diamond === undefined)).toBe(true);
    expect(m.warnings.some((w) => /summary row/.test(w))).toBe(false);
  });

  it('is read and written as ids, once each, and none is the absence of the field', () => {
    const p = withSummary(forestProject('difference'), [3, 3, 1]);
    expect(chartOf(p).summaryRows).toEqual([rowId(p, 3), rowId(p, 1)]);
    expect(parseProject(stringifyProject(p))).toEqual(p);
    expect(chartOf(patchLook('c', { summaryRows: [] })(p)).summaryRows).toBeUndefined();
    const written = JSON.parse(stringifyProject(p));
    written.project.charts.find((c: { id: string }) => c.id === 'c').summaryRows = ['a', 'a', 3, '', null];
    expect(chartOf(parseProject(JSON.stringify(written))).summaryRows).toEqual(['a']);
    written.project.charts.find((c: { id: string }) => c.id === 'c').summaryRows = 'x';
    expect(chartOf(parseProject(JSON.stringify(written))).summaryRows).toBeUndefined();
  });
});
