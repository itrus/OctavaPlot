import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { layerRows } from '../../model/graph/layers';
import { xySeries } from '../../model/table/tableLayout';
import type { Bracket, Project } from '../../model/types';
import { addBracket, addChart, addDataTable, patchChart, replaceTableData, setLayerHidden, setLayerRange } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { placeXyBrackets } from './xyBrackets';
import { buildXyModel } from './xyModel';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const model = (p: Project) => buildXyModel(chartOf(p), tableOf(p));
const svg = (p: Project) => chartToSvgString(chartOf(p), tableOf(p));
const sid = (p: Project) => xySeries(tableOf(p)).map((s) => s.id);
const bracket = (id: string, from: string, to: string, at: number | undefined, label = 'p = 0.003'): Bracket => ({ id, from, to, label, color: '#000000', widthPt: 2, fontSizePt: 24, ...(at !== undefined ? { at } : {}) });

/** Three series over X = 1 to 4; the third has no value at X = 3. */
const setup = (type: 'xyScatter' | 'xyLineSymbols' = 'xyScatter'): Project => {
  let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
  p = replaceTableData('t', { names: ['X', 'A', 'B', 'C'], titles: null, values: [[1, 2, 3, 4], [2, 3, 5, 6], [3, 4, 8, null], [4, 6, 10, 9]] })(p);
  return addChart('c', 't', undefined, type)(p);
};
const withBrackets = (p: Project, ...list: Bracket[]) => list.reduce((q, b) => addBracket('c', b)(q), p);

describe('placing the brackets of an XY chart', () => {
  const series = [
    { id: 'a', points: [{ x: 1, y: 2 }, { x: 2, y: 3 }] },
    { id: 'b', points: [{ x: 1, y: 5 }, { x: 2, y: 8 }] },
    { id: 'c', points: [{ x: 2, y: 4 }] },
  ];
  it('joins the point each series has at the X, low end and high end', () => {
    const { placed } = placeXyBrackets([bracket('k', 'b', 'a', 2)], series);
    expect(placed).toHaveLength(1);
    expect([placed[0].at, placed[0].low, placed[0].high, placed[0].lane]).toEqual([2, 3, 8, 1]);
  });
  it('puts brackets that overlap at one X in lanes, the shorter nearer the points, whichever was added first', () => {
    for (const list of [[bracket('long', 'a', 'b', 2), bracket('short', 'a', 'c', 2)], [bracket('short', 'a', 'c', 2), bracket('long', 'a', 'b', 2)]]) {
      const { placed } = placeXyBrackets(list, series);
      const lane = (id: string) => placed.find((p) => p.bracket.id === id)!.lane;
      expect([lane('short'), lane('long')]).toEqual([1, 2]);
    }
  });
  it('leaves brackets at different X, or that do not overlap, in the first lane', () => {
    const { placed } = placeXyBrackets([bracket('x1', 'a', 'b', 1), bracket('x2', 'a', 'b', 2)], series);
    expect(placed.map((p) => p.lane)).toEqual([1, 1]);
  });
  it('skips, with the reason, a series that is not there, the same series twice, no X, and a series with no point at the X', () => {
    const reasons = placeXyBrackets([bracket('1', 'a', 'zz', 1), bracket('2', 'a', 'a', 1), bracket('3', 'a', 'b', undefined), bracket('4', 'a', 'c', 1)], series).skipped.map((s) => s.reason);
    expect(reasons).toEqual(['a data set it joins is not on the graph', 'it joins a data set to itself', 'it has no X to stand at', 'a data set it joins has no point at X = 1']);
  });
});

describe('comparison brackets on an XY chart', () => {
  it('stand to the right of the two points they join, from the one to the other, with their label', () => {
    const p0 = setup();
    const [a, b] = sid(p0);
    const p = withBrackets(p0, bracket('b1', a, b, 2));
    const m = model(p);
    expect(m.brackets).toHaveLength(1);
    const point = (s: number) => m.series[s].points.find((q) => q.x === 2)!;
    const [g] = m.brackets!;
    expect(g.x).toBeGreaterThan(point(0).px);
    expect([g.y1, g.y2]).toEqual([point(0).py, point(1).py]);
    expect(svg(p)).toContain('>p = 0.003<');
    expect(svg(p)).not.toContain('NaN');
  });
  it('leaves room on the X axis for the bar and its label, so the bracket at the last X is inside the plot', () => {
    const p0 = setup();
    const [a, b] = sid(p0);
    const plain = model(p0);
    const m = model(withBrackets(p0, bracket('b1', a, b, 4)));
    expect(m.x.domain[1]).toBeGreaterThan(plain.x.domain[1] - 1e-9);
    const plot = m.layout.plot;
    expect(m.brackets![0].x).toBeLessThan(plot.x + plot.width);
  });
  it('takes its room when hidden, so that hiding it moves nothing (rule 5), and can be kept out of the range', () => {
    const p0 = setup();
    const [a, b] = sid(p0);
    const p = withBrackets(p0, bracket('b1', a, b, 4));
    const hidden = setLayerHidden('c', 'b1:bracket', true)(p);
    expect(svg(hidden)).not.toContain('>p = 0.003<');
    expect(model(hidden).x.domain).toEqual(model(p).x.domain);
    expect(model(hidden).brackets).toEqual(model(p).brackets);
    const out = setLayerRange('c', 'b1:bracket', false)(p);
    expect(model(out).x.domain).toEqual(model(p0).x.domain);
    expect(layerRows(chartOf(out), tableOf(out)).find((r) => r.layer.kind === 'bracket')?.inRange).toBe(false);
    expect(layerRows(chartOf(p), tableOf(p)).find((r) => r.layer.kind === 'bracket')?.inRange).toBe(true);
  });
  it('is not drawn, and says why, when a series has no point at its X', () => {
    const p0 = setup();
    const [a, , c] = sid(p0);
    const m = model(withBrackets(p0, bracket('b1', a, c, 3, 'x')));
    expect(m.brackets).toEqual([]);
    expect(m.warnings.join(' ')).toMatch(/Bracket "x" is not drawn: a data set it joins has no point at X = 3/);
  });
  it('works on a line chart and on a log X axis, and survives the file', () => {
    const p0 = setup('xyLineSymbols');
    const [a, b] = sid(p0);
    const p = patchChart('c', { xAxis: { ...chartOf(p0).xAxis, scale: 'log10' } })(withBrackets(p0, bracket('b1', a, b, 2)));
    expect(model(p).brackets).toHaveLength(1);
    expect(svg(p)).not.toContain('NaN');
    expect(chartOf(parseProject(stringifyProject(p))).brackets).toEqual([bracket('b1', a, b, 2)]);
  });
  it('is not offered, and draws nothing, on a survival chart', () => {
    const p = withBrackets(setup(), bracket('b1', sid(setup())[0], sid(setup())[1], 2));
    const surv = { ...p, charts: p.charts.map((c) => ({ ...c, type: 'survival' as const })) };
    expect(chartToSvgString(chartOf(surv), tableOf(surv))).not.toContain('>p = 0.003<');
  });
});
