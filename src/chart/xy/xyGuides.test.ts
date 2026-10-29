import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createExampleProject } from '../../model/defaults';
import { seriesWidth, subLabels, xySeries } from '../../model/table/tableLayout';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { AxisConfig, Project, ReferenceLine, ShadedRegion } from '../../model/types';
import { addChart, addDataTable, addReferenceLine, addRegion, patchAxis, patchChart, patchLayerStyle, patchStyle, removeRegion, replaceTableData, setLayerHidden, setLayerRange } from '../../state/commands';
import { parseProject, parseProjectWithNotes, stringifyProject } from '../../state/serialize';
import { buildAnyModel } from '../anyModel';
import { chartToSvgString } from '../export/export';
import { obliqueRuns, referenceLinesOf, regionNotices, regionsOf, regionSpans } from '../shared/scene/referenceLines';
import { withExtraTicks } from '../shared/axes/extraTicks';
import { resolveAxis } from '../shared/axes/axisScale';
import { buildXyModel } from './xyModel';

const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const model = (p: Project) => buildXyModel(chartOf(p), tableOf(p));
const seriesId = (p: Project) => xySeries(tableOf(p))[0].id;
const nums = (d: string) => (d.match(/-?\d+(?:\.\d+)?(?:e-?\d+)?/g) ?? []).map(Number);

/** An XY chart of a table of the layout "Y, Y +/- error, X +/- error": `rows` are [X, Y, error of Y, error of X]. */
const setupX = (rows: Array<Array<number | null>>): Project => {
  let p = addDataTable('t', 'xy', { sample: true, layout: { kind: 'xerror' } })(createExampleProject());
  p = replaceTableData('t', { names: ['X', 'Y', 'Y err', 'X err'], titles: null, values: rows })(p);
  return patchStyle('c', 'all', { showErrorBars: true, errorCap: 'bar', errorCapWidthPt: 10, errorDirection: 'both' })(addChart('c', 't', undefined, 'xyScatter')(p));
};
/** A plain XY chart of single Y values: `rows` are [X, Y]. */
const setupPlain = (rows: Array<Array<number | null>>): Project => {
  let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
  p = replaceTableData('t', { names: ['X', 'Y'], titles: null, values: rows })(p);
  return addChart('c', 't', undefined, 'xyScatter')(p);
};
/** The first stem of the bars along X of the first series: [x start, y, x end]. */
const firstStem = (p: Project) => {
  const d = model(p).series[0].xErrorPath ?? '';
  const m = /^M([-\d.e]+),([-\d.e]+)H([-\d.e]+)/.exec(d);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};

describe('error bars along X: the table', () => {
  it('has a Y, an error of Y and an error of X for each series', () => {
    expect(seriesWidth({ kind: 'xerror' })).toBe(3);
    expect(subLabels({ kind: 'xerror' })).toEqual(['Y', 'Y +/- error', 'X +/- error']);
    const t = tableOf(addDataTable('t', 'xy', { sample: true, layout: { kind: 'xerror' } })(createExampleProject()));
    expect(xySeries(t)[0].columns).toHaveLength(3);
    // The sample holds errors on both axes, so the sample table draws both.
    expect(xySeries(t)[0].columns[1].observations.some((o) => o.value !== null && o.value > 0)).toBe(true);
    expect(xySeries(t)[0].columns[2].observations.some((o) => o.value !== null && o.value > 0)).toBe(true);
  });
  it('survives save and reopen, and a table of another layout is as before', () => {
    expect(tableOf(parseProject(stringifyProject(setupX([[1, 2, 0.1, 0.2]])))).layout).toEqual({ kind: 'xerror' });
    expect(tableOf(parseProject(stringifyProject(setupPlain([[1, 2]])))).layout).toBeUndefined();
  });
});

describe('error bars along X: the drawing', () => {
  it('runs from X minus the error to X plus the error at the height of the point, each end mapped on its own', () => {
    const p = setupX([[2, 5, 1, 0.5], [4, 6, 1, 1], [6, 7, 1, 0.25]]);
    const m = model(p);
    const [start, y, end] = firstStem(p)!;
    expect(start).toBeCloseTo(m.xScale(1.5), 6);
    expect(end).toBeCloseTo(m.xScale(2.5), 6);
    expect(y).toBeCloseTo(m.series[0].points[0].py, 6);
    // Caps of the width asked for (10 pt), across the stem at both ends.
    const d = m.series[0].xErrorPath!;
    expect(d).toContain(`M${end},${y - 5}V${y + 5}`);
    expect(d).toContain(`M${start},${y - 5}V${y + 5}`);
    // Three points, three stems.
    expect(d.match(/H/g)).toHaveLength(3);
  });
  it('is independent of the bars along Y: each has its own error, and a row with only one of them draws only that one', () => {
    const p = setupX([[2, 5, 1, null], [4, 6, null, 1], [6, 7, 2, 2]]);
    const s = model(p).series[0];
    expect(s.xErrorPath!.match(/H/g)).toHaveLength(2);
    // The bars along Y: rows 1 and 3, each a stem along Y (V).
    expect(s.errorPath.match(/V/g)?.length).toBeGreaterThanOrEqual(2);
    expect(model(p).warnings.join(' ')).not.toMatch(/no usable error/);
  });
  it('draws one side only when the direction says so', () => {
    const p = patchStyle('c', 'all', { errorDirection: 'positive' })(setupX([[2, 5, 1, 0.5]]));
    const m = model(p);
    const [start, , end] = firstStem(p)!;
    expect(start).toBeCloseTo(m.xScale(2), 6);
    expect(end).toBeCloseTo(m.xScale(2.5), 6);
    const negative = patchStyle('c', 'all', { errorDirection: 'negative' })(setupX([[2, 5, 1, 0.5]]));
    const [lower, , stop] = firstStem(negative)!;
    expect(lower).toBeCloseTo(model(negative).xScale(1.5), 6);
    expect(stop).toBeCloseTo(model(negative).xScale(2), 6);
  });
  it('is not drawn for an error that is negative, and says how many; an empty error is no bar and no complaint', () => {
    const p = setupX([[2, 5, 1, -0.5], [4, 6, 1, null], [6, 7, 1, 1], [8, 9, 1, 0]]);
    const m = model(p);
    expect(m.series[0].xErrorPath!.match(/H/g)).toHaveLength(1);
    expect(m.warnings.join(' ')).toMatch(/Series A: 1 row has an error of X that is negative or not a number/);
    // The point itself is drawn, and so are the bars along Y.
    expect(m.series[0].points).toHaveLength(4);
    expect(m.series[0].errorPath).not.toBe('');
  });
  it('refuses a negative error of Y as any supplied error, and still draws the bar along X of the row', () => {
    const m = model(setupX([[2, 5, -1, 0.5]]));
    expect(m.warnings.join(' ')).toMatch(/1 row has a mean but no usable error/);
    expect(m.series[0].errorPath).toBe('');
    expect(m.series[0].xErrorPath).not.toBe('');
  });
  it('holds the ends in the X range while the layer counts, and leaves them out when it is kept out of the range or the bars are off', () => {
    const p = setupX([[1, 5, 1, 1], [2, 6, 1, 1]]);
    const counted = model(p).x.domain;
    // Ends at 0, 1, 2 and 3.
    expect(counted[0]).toBeLessThanOrEqual(0);
    expect(counted[1]).toBeGreaterThanOrEqual(3);
    const id = `${seriesId(p)}:xErrorBars`;
    const apart = model(setLayerRange('c', id, false)(p));
    expect(apart.x.domain[1]).toBeLessThan(3);
    // Kept out of the range, the bars are still drawn (clipped by the plot where they leave it).
    expect(apart.series[0].xErrorPath).not.toBe('');
    const off = model(patchStyle('c', 'all', { showErrorBars: false })(p));
    expect(off.x.domain).toEqual(apart.x.domain);
    expect(off.series[0].xErrorPath).toBe('');
  });
  it('on a log axis: an end at or below 0 is drawn at the low end and counted as clipped, and is not part of the range', () => {
    const p = patchAxis('c', 'xAxis', { scale: 'log10' })(setupX([[2, 5, 1, 5], [20, 6, 1, 5]]));
    const m = model(p);
    expect(m.x.domain).toEqual([1, 100]);
    const [start, , end] = firstStem(p)!;
    expect(start).toBeCloseTo(m.layout.plot.x, 6);
    expect(end).toBeCloseTo(m.xScale(7), 6);
    expect(m.warnings).toContain('1 error bar end lies outside the axis range and is clipped.');
  });
  it('on a broken axis: a bar with an end in the omitted range is not drawn and is counted; the others are', () => {
    const p = patchAxis('c', 'xAxis', { breaks: [{ from: 3, to: 8 }] })(setupX([[2, 5, 1, 2], [10, 6, 1, 1]]));
    const m = model(p);
    expect(m.series[0].xErrorPath!.match(/H/g)).toHaveLength(1);
    expect(firstStem(p)![2]).toBeCloseTo(m.xScale(11), 6);
    expect(m.warnings.join(' ')).toMatch(/1 error bar has an end inside an omitted range of the X axis and is not drawn/);
  });
  it('is a layer of its own, with its own look and its own place in the range switch, bound to its series', () => {
    const p = setupX([[2, 5, 1, 0.5]]);
    const id = `${seriesId(p)}:xErrorBars`;
    const rows = layerRows(chartOf(p), tableOf(p));
    const row = rows.find((r) => r.layer.id === id)!;
    expect(row.label).toBe('X error bars: Series A');
    expect(row.takes).toEqual(['color', 'widthPt', 'opacity']);
    expect(row.inRange).toBe(true);
    expect(row.canMoveUp || row.canMoveDown).toBe(true);
    expect(row.layer.binding?.seriesId).toBe(seriesId(p));
    // A table with no error of X has no such layer.
    expect(layersOf(chartOf(setupPlain([[1, 2]])), tableOf(setupPlain([[1, 2]]))).some((l) => l.kind === 'xErrorBars')).toBe(false);
    // The look of the layer goes to its bars and not to the bars along Y.
    const styled = patchLayerStyle('c', id, { color: '#00aa00', widthPt: 3 })(p);
    const scene = model(styled).scene!;
    const own = scene.layers.find((l) => l.kind === 'xErrorBars')!.paths[0];
    expect([own.stroke, own.strokeWidth]).toEqual(['#00aa00', 3]);
    expect(scene.layers.find((l) => l.kind === 'errorBars')!.paths[0].stroke).not.toBe('#00aa00');
    // Hidden, it leaves the drawing and nothing else.
    const hidden = model(setLayerHidden('c', id, true)(p));
    expect(hidden.scene!.layers.some((l) => l.kind === 'xErrorBars')).toBe(false);
    expect(hidden.x.domain).toEqual(model(p).x.domain);
  });
  it('is in the exported drawing without a number that is not a number', () => {
    const p = setupX([[2, 5, 1, 0.5], [4, 6, 1, 1]]);
    const svg = chartToSvgString(chartOf(p), tableOf(p));
    expect(svg).not.toContain('NaN');
    expect(svg).toContain(`id="${seriesId(p)}-xErrorBars"`);
  });
});

describe('oblique reference lines: the line inside the plot', () => {
  const axis = (lo: number, hi: number, extra: Partial<{ log: number | null; segments: Array<{ lo: number; hi: number }> }> = {}) => ({ domain: [lo, hi] as [number, number], log: null, reverse: false, ...extra });

  it('keeps the stretch where Y is in its range: y = 2x on 0..10 by 0..10 ends at the top at x = 5', () => {
    expect(obliqueRuns(0, 2, axis(0, 10), axis(0, 10))).toEqual([[{ x: 0, y: 0 }, { x: 5, y: 10 }]]);
  });
  it('the identity line runs corner to corner of a square plot and stops at the shorter axis of a wide one', () => {
    expect(obliqueRuns(0, 1, axis(0, 10), axis(0, 10))).toEqual([[{ x: 0, y: 0 }, { x: 10, y: 10 }]]);
    expect(obliqueRuns(0, 1, axis(0, 10), axis(0, 5))).toEqual([[{ x: 0, y: 0 }, { x: 5, y: 5 }]]);
  });
  it('a falling line: y = 12 - x enters at the top at x = 2', () => {
    expect(obliqueRuns(12, -1, axis(0, 10), axis(0, 10))).toEqual([[{ x: 2, y: 10 }, { x: 10, y: 2 }]]);
  });
  it('a line with no slope is horizontal across the plot, and a line that misses the plot has no run', () => {
    expect(obliqueRuns(5, 0, axis(0, 10), axis(0, 10))).toEqual([[{ x: 0, y: 5 }, { x: 10, y: 5 }]]);
    expect(obliqueRuns(50, 0, axis(0, 10), axis(0, 10))).toEqual([]);
    expect(obliqueRuns(100, 1, axis(0, 10), axis(0, 10))).toEqual([]);
  });
  it('on log axes the identity line and y = 2x stay on the line: every point satisfies the equation and the ends are the edges of the plot', () => {
    const identity = obliqueRuns(0, 1, axis(1, 1000, { log: 10 }), axis(1, 100, { log: 10 }));
    expect(identity).toHaveLength(1);
    expect(identity[0][0]).toEqual({ x: 1, y: 1 });
    expect(identity[0][identity[0].length - 1].x).toBeCloseTo(100, 9);
    for (const q of identity[0]) expect(q.y).toBeCloseTo(q.x, 9);
    const double = obliqueRuns(0, 2, axis(1, 1000, { log: 10 }), axis(1, 100, { log: 10 }));
    expect(double[0][0].x).toBeCloseTo(1, 9);
    expect(double[0][double[0].length - 1]).toEqual({ x: 50, y: 100 });
    for (const q of double[0]) expect(q.y).toBeCloseTo(2 * q.x, 9);
  });
  it('is cut where it crosses the omitted range of a broken axis, in data units', () => {
    const broken = axis(0, 10, { segments: [{ lo: 0, hi: 3 }, { lo: 8, hi: 10 }] });
    expect(obliqueRuns(0, 1, axis(0, 10), broken)).toEqual([[{ x: 0, y: 0 }, { x: 3, y: 3 }], [{ x: 8, y: 8 }, { x: 10, y: 10 }]]);
  });
});

describe('oblique reference lines: the chart', () => {
  const identity = (patch: Partial<ReferenceLine> = {}): ReferenceLine => ({ id: 'r1', axis: 'y', value: 0, slope: 1, intercept: 0, color: '#cc0000', widthPt: 1, style: 'dashed', opacity: 1, label: 'y = x', showLabel: true, ...patch });
  const pathOf = (svg: string) => /<path[^>]*id="reference-line-r1"[^>]*>/.exec(svg)![0].match(/ d="([^"]+)"/)![1];

  it('is drawn from the point where it enters the plot to the point where it leaves, at the positions of the axes', () => {
    const p = addReferenceLine('c', identity())(setupPlain([[0, 0], [10, 8]]));
    const m = model(p);
    const [lo, hi] = [Math.max(m.x.domain[0], m.y.domain[0]), Math.min(m.x.domain[1], m.y.domain[1])];
    const [a, b, c, d] = nums(pathOf(chartToSvgString(chartOf(p), tableOf(p))));
    expect([a, b, c, d]).toEqual([lo, lo, hi, hi].map((v, i) => Math.round((i % 2 === 0 ? m.xScale(v) : m.yScale(v)) * 100) / 100));
  });
  it('with equal units the identity line runs at 45 degrees: the same length across and up', () => {
    const p = addReferenceLine('c', identity())(patchChart('c', { equalUnits: true })(setupPlain([[0, 0], [10, 90]])));
    const [x0, y0, x1, y1] = nums(pathOf(chartToSvgString(chartOf(p), tableOf(p))));
    expect(Math.abs(x1 - x0)).toBeCloseTo(Math.abs(y1 - y0), 1);
    // Without it the same data give a line that is not at 45 degrees.
    const free = addReferenceLine('c', identity())(setupPlain([[0, 0], [10, 90]]));
    const [a, b, c, d] = nums(pathOf(chartToSvgString(chartOf(free), tableOf(free))));
    expect(Math.abs(c - a)).not.toBeCloseTo(Math.abs(d - b), 0);
  });
  it('is named in the layers, drawn in its colour, and left out with a notice when it misses the plot', () => {
    const p = addReferenceLine('c', identity({ id: 'r2', slope: 0.5, intercept: 3 }))(addReferenceLine('c', identity())(setupPlain([[0, 0], [10, 8]])));
    const labels = layerRows(chartOf(p), tableOf(p)).map((r) => r.label);
    expect(labels).toContain('Reference line: identity (Y = X)');
    expect(labels).toContain('Reference line: Y = 3 + 0.5 X');
    const far = addReferenceLine('c', identity({ id: 'r3', intercept: 1e6 }))(setupPlain([[0, 0], [10, 8]]));
    expect(buildAnyModel(chartOf(far), tableOf(far)).model.warnings.join(' ')).toMatch(/1 reference line is outside the axis range/);
  });
  it('is saved and restored, and a slope without an intercept is read as a line at its value, with a note', () => {
    const p = addReferenceLine('c', identity({ slope: -2, intercept: 3.5 }))(setupPlain([[0, 0]]));
    expect(chartOf(parseProject(stringifyProject(p))).referenceLines[0]).toMatchObject({ slope: -2, intercept: 3.5 });
    const broken = JSON.parse(stringifyProject(p));
    delete broken.project.charts.find((c: { id: string }) => c.id === 'c').referenceLines[0].intercept;
    const { project, notes } = parseProjectWithNotes(JSON.stringify(broken));
    expect(chartOf(project).referenceLines[0].slope).toBeUndefined();
    expect(notes.join(' ')).toMatch(/slope or an intercept that could not be read/);
  });
  it('is not drawn on a chart over categories, which has no X axis of numbers: it is reported as unsupported', () => {
    const table = createColumnTable('Column', true, 4);
    const chart = { ...createChart(table.id), referenceLines: [identity()] };
    expect(referenceLinesOf(chart, buildAnyModel(chart, table)).unsupported.map((l) => l.id)).toEqual(['r1']);
  });
});

describe('shaded regions', () => {
  const dom = (lo: number, hi: number, extra: Partial<{ log: number | null; segments: Array<{ lo: number; hi: number }> }> = {}) => ({ domain: [lo, hi] as [number, number], log: null, reverse: false, ...extra });
  const region = (patch: Partial<ShadedRegion> = {}): ShadedRegion => ({ id: 'g1', axis: 'x', from: 2, to: 4, color: '#4f81bd', opacity: 0.25, label: 'Window', showLabel: true, ...patch });

  it('is the part of the band that is on the axis, whichever order the limits were typed in', () => {
    expect(regionSpans(2, 4, dom(0, 10))).toEqual([[2, 4]]);
    expect(regionSpans(4, 2, dom(0, 10))).toEqual([[2, 4]]);
    expect(regionSpans(-5, 4, dom(0, 10))).toEqual([[0, 4]]);
    expect(regionSpans(8, 40, dom(0, 10))).toEqual([[8, 10]]);
  });
  it('has nothing left outside the range, between a value and itself, and inside the omitted range of a broken axis', () => {
    expect(regionSpans(20, 30, dom(0, 10))).toEqual([]);
    expect(regionSpans(3, 3, dom(0, 10))).toEqual([]);
    const broken = dom(0, 10, { segments: [{ lo: 0, hi: 3 }, { lo: 8, hi: 10 }] });
    expect(regionSpans(4, 7, broken)).toEqual([]);
    expect(regionSpans(2, 9, broken)).toEqual([[2, 3], [8, 9]]);
  });
  it('on a log axis reaches to the edge from a limit at or below 0, where the band covers everything on that side', () => {
    expect(regionSpans(-1, 50, dom(1, 100, { log: 10 }))).toEqual([[1, 50]]);
  });

  it('is a rectangle across the plot between the positions of its two values, drawn behind the reference lines and the data', () => {
    let p = addRegion('c', region())(setupPlain([[0, 0], [10, 8]]));
    p = addReferenceLine('c', { id: 'r1', axis: 'y', value: 3, color: '#cc0000', widthPt: 1, style: 'solid', opacity: 1, label: '', showLabel: false })(p);
    const any = buildAnyModel(chartOf(p), tableOf(p));
    if (any.family !== 'xy') throw new Error('expected an XY model');
    const { placed } = regionsOf(chartOf(p), any);
    const { plot } = any.model.layout;
    expect(placed).toHaveLength(1);
    expect(placed[0].rects).toHaveLength(1);
    expect(placed[0].rects[0].x).toBeCloseTo(any.model.xScale(2), 6);
    expect(placed[0].rects[0].width).toBeCloseTo(any.model.xScale(4) - any.model.xScale(2), 6);
    expect([placed[0].rects[0].y, placed[0].rects[0].height]).toEqual([plot.y, plot.height]);
    const svg = chartToSvgString(chartOf(p), tableOf(p));
    expect(svg).toContain('>Window</text>');
    expect(svg.indexOf('data-regions')).toBeGreaterThan(-1);
    expect(svg.indexOf('data-regions')).toBeLessThan(svg.indexOf('data-reference-lines'));
    expect(svg.indexOf('data-reference-lines')).toBeLessThan(svg.indexOf(`id="${xySeries(tableOf(p))[0].id}-points`));
  });
  it('of Y stands across the plot at the height between its values', () => {
    const p = addRegion('c', region({ axis: 'y', from: 5, to: 2 }))(setupPlain([[0, 0], [10, 8]]));
    const any = buildAnyModel(chartOf(p), tableOf(p));
    if (any.family !== 'xy') throw new Error('expected an XY model');
    const r = regionsOf(chartOf(p), any).placed[0].rects[0];
    expect(r.y).toBeCloseTo(any.model.yScale(5), 6);
    expect(r.height).toBeCloseTo(any.model.yScale(2) - any.model.yScale(5), 6);
    expect([r.x, r.width]).toEqual([any.model.layout.plot.x, any.model.layout.plot.width]);
  });
  it('is left out, and reported, when nothing of it is on the axis; hiding it is the same as not drawing it and moves nothing', () => {
    const p = addRegion('c', region({ from: 500, to: 600 }))(setupPlain([[0, 0], [10, 8]]));
    expect(regionsOf(chartOf(p), buildAnyModel(chartOf(p), tableOf(p))).skipped).toHaveLength(1);
    expect(buildAnyModel(chartOf(p), tableOf(p)).model.warnings.join(' ')).toMatch(/1 shaded region is empty, outside the axis range or in a gap of a broken axis and is not drawn/);
    expect(regionNotices([region(), region()])[0]).toMatch(/2 shaded regions are empty/);
    const drawn = addRegion('c', region())(setupPlain([[0, 0], [10, 8]]));
    const hidden = setLayerHidden('c', 'g1:region', true)(drawn);
    expect(chartToSvgString(chartOf(hidden), tableOf(hidden))).not.toContain('data-regions');
    expect(model(hidden).x.domain).toEqual(model(drawn).x.domain);
  });
  it('is a layer below the reference lines, named by its limits, and does not take part in the range', () => {
    const p = addReferenceLine('c', { id: 'r1', axis: 'y', value: 3, color: '#cc0000', widthPt: 1, style: 'solid', opacity: 1, label: '', showLabel: false })(addRegion('c', region({ from: 4, to: 2 }))(setupPlain([[0, 0], [10, 8]])));
    const ls = layersOf(chartOf(p), tableOf(p));
    const [g, r] = [ls.find((l) => l.id === 'g1:region')!, ls.find((l) => l.id === 'r1:referenceLine')!];
    expect(g.z).toBeLessThan(r.z);
    expect(g.rangeContribution).toBe(false);
    expect(layerRows(chartOf(p), tableOf(p)).find((x) => x.layer.id === 'g1:region')).toMatchObject({ label: 'Shaded region: X from 2 to 4', inRange: null, takes: null });
    // A region far outside the data does not stretch the axis.
    const far = addRegion('c', region({ from: 500, to: 600 }))(setupPlain([[0, 0], [10, 8]]));
    expect(model(far).x.domain).toEqual(model(setupPlain([[0, 0], [10, 8]])).x.domain);
    // Removing a region takes its hidden mark with it.
    expect(chartOf(removeRegion('c', 'g1')(setLayerHidden('c', 'g1:region', true)(addRegion('c', region())(setupPlain([[0, 0]]))))).hiddenLayerIds).toEqual([]);
  });
  it('is saved and restored; one that cannot be read is dropped with a note', () => {
    const p = addRegion('c', region({ axis: 'y', from: 1.5, to: 2.5, showLabel: false }))(setupPlain([[0, 0]]));
    expect(chartOf(parseProject(stringifyProject(p))).regions).toEqual(chartOf(p).regions);
    const broken = JSON.parse(stringifyProject(p));
    broken.project.charts.find((c: { id: string }) => c.id === 'c').regions.push({ id: 'bad', axis: 'z', from: 1, to: 2 });
    const { project, notes } = parseProjectWithNotes(JSON.stringify(broken));
    expect(chartOf(project).regions).toHaveLength(1);
    expect(notes.join(' ')).toMatch(/regions\[1\] could not be read and was dropped/);
  });
  it('is not part of a chart type without an X axis of numbers: only XY charts have the layer', () => {
    let p = addRegion('c', region())(setupPlain([[0, 0]]));
    expect(layersOf(chartOf(p), tableOf(p)).some((l) => l.kind === 'region')).toBe(true);
    p = { ...p, charts: p.charts.map((c) => ({ ...c, type: 'survival' as const })) };
    expect(layersOf(chartOf(p), tableOf(p)).some((l) => l.kind === 'region')).toBe(false);
  });
});

describe('extra ticks', () => {
  const base = () => resolveAxis({ values: [0, 10], includeZero: false, min: 0, max: 10, majorInterval: 2, tickCountHint: 5 }, { scale: 'linear', reverse: false, breaks: [], minorTicks: 0, numberFormat: 'auto', decimals: null, thousands: false, prefix: '', suffix: '', tickFontSizePt: 12 } as unknown as AxisConfig);

  it('stand among the automatic ticks in order, and a typed label is written instead of the number', () => {
    const { axis, skipped } = withExtraTicks(base(), [{ value: 7.5, label: 'cut-off' }, { value: 1, label: '' }]);
    expect(skipped).toBe(0);
    expect(axis.ticks).toEqual([0, 1, 2, 4, 6, 7.5, 8, 10]);
    expect(axis.tickLabel(7.5)).toBe('cut-off');
    expect(axis.tickLabel(1)).toBe('1');
    expect(axis.tickLabel(4)).toBe('4');
  });
  it('keep an automatic tick that is at the same value, and give it the label', () => {
    const { axis } = withExtraTicks(base(), [{ value: 6, label: 'six' }]);
    expect(axis.ticks).toEqual([0, 2, 4, 6, 8, 10]);
    expect(axis.tickLabel(6)).toBe('six');
  });
  it('are left out and counted when outside the range, or in the omitted range of a broken axis, or at or below 0 on a log axis', () => {
    expect(withExtraTicks(base(), [{ value: 11, label: '' }, { value: -1, label: '' }, { value: 5, label: '' }]).skipped).toBe(2);
    const broken = { ...base(), segments: [{ lo: 0, hi: 3 }, { lo: 8, hi: 10 }] };
    expect(withExtraTicks(broken, [{ value: 5, label: '' }, { value: 9, label: '' }])).toMatchObject({ skipped: 1 });
    const log = resolveAxis({ values: [1, 100], includeZero: false, min: null, max: null, majorInterval: null, tickCountHint: 5 }, { scale: 'log10', reverse: false, breaks: [], minorTicks: 0, numberFormat: 'auto', decimals: null, thousands: false, prefix: '', suffix: '', tickFontSizePt: 12 } as unknown as AxisConfig);
    expect(withExtraTicks(log, [{ value: 0, label: '' }, { value: -3, label: '' }, { value: 30, label: '30' }]).skipped).toBe(2);
    expect(withExtraTicks(log, [{ value: 30, label: '' }]).axis.ticks).toEqual([1, 10, 30, 100]);
  });
  it('take the place of a minor tick they land on', () => {
    const minor = { ...base(), minorTicks: [1, 3, 5] };
    expect(withExtraTicks(minor, [{ value: 3, label: '' }]).axis.minorTicks).toEqual([1, 5]);
  });
  it('are on the axes of the chart and in the drawing, and a value with no place is told', () => {
    const p = patchAxis('c', 'xAxis', { extraTicks: [{ value: 2.5, label: 'cut-off' }, { value: 99, label: '' }] })(setupPlain([[0, 0], [10, 8]]));
    const m = model(p);
    expect(m.x.ticks).toContain(2.5);
    expect(m.x.tickLabel(2.5)).toBe('cut-off');
    expect(m.warnings.join(' ')).toMatch(/1 extra tick is on the X axis at a value outside its range/);
    expect(chartToSvgString(chartOf(p), tableOf(p))).toContain('>cut-off</text>');
    expect(model(setupPlain([[0, 0], [10, 8]])).x.ticks).not.toContain(2.5);
  });
  it('are saved and restored; unusable ones are dropped, and no extra ticks is no setting', () => {
    const p = patchAxis('c', 'yAxis', { extraTicks: [{ value: 1.5, label: 'a' }] })(setupPlain([[0, 0]]));
    expect(chartOf(parseProject(stringifyProject(p))).yAxis.extraTicks).toEqual([{ value: 1.5, label: 'a' }]);
    const junk = patchAxis('c', 'yAxis', { extraTicks: [{ value: Number.NaN, label: 'x' }, { value: 2, label: 'ok' }, { value: 2, label: 'twice' }] })(setupPlain([[0, 0]]));
    expect(chartOf(junk).yAxis.extraTicks).toEqual([{ value: 2, label: 'ok' }]);
    expect('extraTicks' in chartOf(patchAxis('c', 'yAxis', { extraTicks: [] })(p)).yAxis).toBe(false);
    expect('extraTicks' in chartOf(parseProject(stringifyProject(setupPlain([[0, 0]])))).yAxis).toBe(false);
  });
});

describe('equal units', () => {
  const ratio = (p: Project) => {
    const m = model(p);
    return [m.layout.plot.width / Math.abs(m.x.domain[1] - m.x.domain[0]), m.layout.plot.height / Math.abs(m.y.domain[1] - m.y.domain[0])];
  };

  it('gives one unit the same length on both axes, widening the axis that had more room, and keeps all the data in', () => {
    const data = [[0, 0], [10, 90]];
    const free = setupPlain(data);
    const [kx0, ky0] = ratio(free);
    expect(kx0).toBeGreaterThan(ky0 * 2);
    const p = patchChart('c', { equalUnits: true })(free);
    const [kx, ky] = ratio(p);
    expect(kx).toBeCloseTo(ky, 6);
    const m = model(p);
    // The Y axis is as it was; the X axis grew around its middle and still holds 0 to 10.
    expect(m.y.domain).toEqual(model(free).y.domain);
    expect(m.x.domain[0]).toBeLessThanOrEqual(0);
    expect(m.x.domain[1]).toBeGreaterThanOrEqual(10);
    expect((m.x.domain[0] + m.x.domain[1]) / 2).toBeCloseTo((model(free).x.domain[0] + model(free).x.domain[1]) / 2, 6);
  });
  it('widens Y instead when Y has the more room, even when its numbers change the width of the plot', () => {
    const p = patchChart('c', { equalUnits: true })(setupPlain([[0, 0], [1000, 3]]));
    const [kx, ky] = ratio(p);
    expect(kx).toBeCloseTo(ky, 6);
    expect(model(p).y.domain[1]).toBeGreaterThan(3);
  });
  it('keeps a limit that was set by hand and widens the other side, and says so when both limits of the axis to widen are set', () => {
    const base = setupPlain([[0, 0], [10, 90]]);
    const lowFixed = patchChart('c', { equalUnits: true })(patchAxis('c', 'xAxis', { min: 0 })(base));
    expect(model(lowFixed).x.domain[0]).toBe(0);
    expect(ratio(lowFixed)[0]).toBeCloseTo(ratio(lowFixed)[1], 6);
    const bothFixed = patchChart('c', { equalUnits: true })(patchAxis('c', 'xAxis', { min: 0, max: 10 })(base));
    expect(model(bothFixed).x.domain).toEqual([0, 10]);
    expect(model(bothFixed).warnings.join(' ')).toMatch(/Equal units are not applied: both limits of the axis that has to be widened are fixed/);
  });
  it('is not applied on a log or a broken axis, and says so', () => {
    const log = patchChart('c', { equalUnits: true })(patchAxis('c', 'xAxis', { scale: 'log10' })(setupPlain([[1, 1], [100, 90]])));
    expect(model(log).warnings.join(' ')).toMatch(/Equal units are not applied: they need linear axes with no omitted range/);
    const broken = patchChart('c', { equalUnits: true })(patchAxis('c', 'yAxis', { breaks: [{ from: 20, to: 70 }] })(setupPlain([[0, 0], [10, 90]])));
    expect(model(broken).warnings.join(' ')).toMatch(/Equal units are not applied/);
  });
  it('changes nothing when it is off, and is saved and restored', () => {
    const base = setupPlain([[0, 0], [10, 90]]);
    expect(model(patchChart('c', { equalUnits: false })(base)).x.domain).toEqual(model(base).x.domain);
    const on = patchChart('c', { equalUnits: true })(base);
    expect(chartOf(parseProject(stringifyProject(on))).equalUnits).toBe(true);
    expect(JSON.stringify(parseProject(stringifyProject(base)).charts[0])).not.toContain('equalUnits');
  });
});
