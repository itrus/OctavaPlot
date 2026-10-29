import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { layerRows } from '../../model/graph/layers';
import { capabilitiesOf } from '../../model/graph/capabilities';
import type { Project } from '../../model/types';
import { addBracket, addChart, addDataTable, patchAxis, patchChart, patchLook, patchBracket, removeBracket, setLayerHidden, setLayerRange } from '../../state/commands';
import { parseProject, parseProjectWithNotes, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildColumnModel } from './columnModel';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const model = (p: Project) => buildColumnModel(chartOf(p), tableOf(p));
const svg = (p: Project) => chartToSvgString(chartOf(p), tableOf(p));
const ids = (p: Project) => tableOf(p).groups.map((g) => g.id);

/** A bar chart of the four sample groups A to D (their values rise from A to D). */
const base = (): Project => addChart('c', 't', undefined, 'bar')(addDataTable('t', 'column', { sample: true })(createExampleProject()));
const bracket = (id: string, from: string, to: string, label = 'p = 0.003') => ({ id, from, to, label, color: '#000000', widthPt: 2, fontSizePt: 24 });
const withBrackets = (p: Project, ...list: ReturnType<typeof bracket>[]) => list.reduce((q, b) => addBracket('c', b)(q), p);

describe('comparison brackets on a chart over columns', () => {
  it('joins the places of two data sets, above everything either draws, with its label', () => {
    const p0 = base();
    const [a, , , d] = ids(p0);
    const p = withBrackets(p0, bracket('b1', a, d));
    const m = model(p);
    expect(m.brackets).toHaveLength(1);
    const [b] = m.brackets;
    expect(b.x1).toBeCloseTo(m.groups[0].centerX, 6);
    expect(b.x2).toBeCloseTo(m.groups[3].centerX, 6);
    // Above (a smaller page y than) the top of the highest error bar of all the data sets.
    const tallest = Math.min(...m.groups.map((g) => (g.errorBar ? g.errorBar.top : m.yScale(g.centreValue ?? 0))));
    expect(b.y).toBeLessThan(tallest);
    expect(svg(p)).toContain('>p = 0.003<');
  });
  it('extends the axis to show the bracket and its label, inside the plot', () => {
    const p0 = base();
    const [a, , , d] = ids(p0);
    const plain = model(p0);
    const m = model(withBrackets(p0, bracket('b1', a, d)));
    expect(m.y.domain[1]).toBeGreaterThan(plain.y.domain[1] - 1e-9);
    const [b] = m.brackets;
    expect(b.y - 4).toBeGreaterThanOrEqual(m.layout.plot.y - 1e-6);
    expect(b.y + b.tick).toBeLessThanOrEqual(m.layout.plot.y + m.layout.plot.height);
  });
  it('stacks brackets that overlap, so the longer one stands above the shorter', () => {
    const p0 = base();
    const [a, b, c] = ids(p0);
    const m = model(withBrackets(p0, bracket('long', a, c), bracket('short', a, b)));
    const y = (id: string) => m.brackets.find((x) => x.id === id)!.y;
    expect(y('long')).toBeLessThan(y('short'));
  });
  it('is a layer that can be hidden: nothing is drawn, and the axes and the other brackets do not move (rule 5)', () => {
    const p0 = base();
    const [a, b, c] = ids(p0);
    const p = withBrackets(p0, bracket('long', a, c), bracket('short', a, b, 'ns'));
    const hidden = setLayerHidden('c', 'short:bracket', true)(p);
    expect(svg(hidden)).not.toContain('>ns<');
    expect(svg(hidden)).toContain('>p = 0.003<');
    expect(model(hidden).y.domain).toEqual(model(p).y.domain);
    expect(model(hidden).brackets.find((x) => x.id === 'long')!.y).toBe(model(p).brackets.find((x) => x.id === 'long')!.y);
  });
  it('is listed among the layers of the graph with its label', () => {
    const p0 = base();
    const [a, b] = ids(p0);
    const p = withBrackets(p0, bracket('b1', a, b, 'p < 0.05'));
    const row = layerRows(chartOf(p), tableOf(p)).find((r) => r.layer.kind === 'bracket');
    expect(row?.label).toBe('Comparison bracket: p < 0.05');
    expect(row?.layer.id).toBe('b1:bracket');
  });
  it('is not drawn, and says why, when a data set it joins is not on the graph', () => {
    const p = withBrackets(base(), bracket('b1', ids(base())[0], 'no-such-data-set', 'x'));
    const m = model(p);
    expect(m.brackets).toEqual([]);
    expect(m.warnings.join(' ')).toMatch(/Bracket "x" is not drawn: a data set it joins is not on the graph/);
  });
  it('stands above the data on a log axis, and never draws a number that is not a number', () => {
    const p0 = base();
    const [a, , , d] = ids(p0);
    const p = patchAxis('c', 'yAxis', { scale: 'log10' })(withBrackets(p0, bracket('b1', a, d)));
    const m = model(p);
    expect(m.brackets).toHaveLength(1);
    expect(m.brackets[0].y).toBeLessThan(Math.min(...m.groups.map((g) => g.errorBar?.top ?? m.yScale(g.centreValue ?? 1))));
    expect(svg(p)).not.toContain('NaN');
  });
  it('is drawn on a horizontal chart, with its label upright beside the bar', () => {
    const p0 = base();
    const [a, , , d] = ids(p0);
    const p = patchChart('c', { orientation: 'horizontal' })(withBrackets(p0, bracket('b1', a, d)));
    const out = svg(p);
    expect(out).toContain('>p = 0.003<');
    expect(out).not.toContain('NaN');
    expect(out).toContain('transform="matrix');
  });
  it('is offered for charts over columns, side by side grouped bars and XY charts, not for the others', () => {
    for (const type of ['bar', 'scatter', 'mean', 'box', 'violin', 'floating', 'paired', 'groupedBar', 'groupedFloating', 'groupedBox', 'groupedViolin', 'xyScatter', 'xyLineSymbols', 'xyBubble'] as const) expect(capabilitiesOf(type).brackets).toBe(true);
    // Stacked bars and lines have one place for all their series; a survival chart is bounded at 100%; a histogram has one data set to a bin.
    for (const type of ['histogram', 'ecdf', 'groupedStacked', 'groupedLine', 'contingencyBars', 'pie', 'survival', 'cumulativeEvent', 'heatmap'] as const) expect(capabilitiesOf(type).brackets).toBe(false);
  });
  it('can be kept out of the axis range: the axis does not grow, the bracket is still placed and drawn, clipped by the plot', () => {
    const p0 = base();
    const [a, , , d] = ids(p0);
    const plain = model(p0);
    const p = withBrackets(p0, bracket('b1', a, d));
    const kept = model(setLayerRange('c', 'b1:bracket', false)(p));
    expect(kept.y.domain).toEqual(plain.y.domain);
    expect(model(p).y.domain[1]).toBeGreaterThan(plain.y.domain[1]);
    // Still above the highest thing drawn (a smaller page y); the plot clips what lies beyond its edge.
    expect(kept.brackets).toHaveLength(1);
    expect(kept.brackets[0].y).toBeLessThan(Math.min(...kept.groups.map((g) => (g.errorBar ? g.errorBar.top : kept.yScale(g.centreValue ?? 0)))));
    expect(layerRows(chartOf(p), tableOf(p)).find((r) => r.layer.kind === 'bracket')?.inRange).toBe(true);
    const q = setLayerRange('c', 'b1:bracket', false)(p);
    expect(layerRows(chartOf(q), tableOf(q)).find((r) => r.layer.kind === 'bracket')?.inRange).toBe(false);
  });
});

describe('comparison brackets: the commands and the file', () => {
  it('are added, changed and removed one at a time', () => {
    const p0 = base();
    const [a, b, c] = ids(p0);
    let p = withBrackets(p0, bracket('b1', a, b));
    p = patchBracket('c', 'b1', { label: '***', to: c })(p);
    expect(chartOf(p).brackets).toEqual([{ ...bracket('b1', a, c), label: '***' }]);
    expect(chartOf(removeBracket('c', 'b1')(p)).brackets).toEqual([]);
  });
  it('is kept in the file, and a graph without brackets has none', () => {
    const p0 = base();
    const [a, b] = ids(p0);
    const p = withBrackets(p0, bracket('b1', a, b, 'p = 0.01'));
    expect(chartOf(parseProject(stringifyProject(p))).brackets).toEqual([bracket('b1', a, b, 'p = 0.01')]);
    expect(chartOf(parseProject(stringifyProject(p0))).brackets).toEqual([]);
  });
  it('drops an entry that cannot be read, with a note, and repairs a value of the wrong type', () => {
    const p0 = base();
    const [a, b] = ids(p0);
    const p = withBrackets(p0, bracket('b1', a, b), bracket('b2', a, b));
    const bad = JSON.parse(stringifyProject(p));
    const c = (bad.project ?? bad).charts.find((x: { id: string }) => x.id === 'c');
    c.brackets[0].widthPt = 'thick';
    c.brackets[0].color = 'red';
    c.brackets[1].from = 5;
    const { project, notes } = parseProjectWithNotes(JSON.stringify(bad));
    const got = project.charts.find((x) => x.id === 'c')!.brackets;
    expect(got).toHaveLength(1);
    expect([got[0].widthPt, got[0].color]).toEqual([2, '#000000']);
    expect(notes.join(' ')).toMatch(/brackets\[1\] could not be read and was dropped/);
  });
  it('survive a look edit', () => {
    const p0 = base();
    const [a, b] = ids(p0);
    const p = patchLook('c', { lineOrder: 'onTop' })(withBrackets(p0, bracket('b1', a, b)));
    expect(chartOf(p).brackets).toHaveLength(1);
  });
});
