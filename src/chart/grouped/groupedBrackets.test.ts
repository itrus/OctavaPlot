import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { applyVariant } from '../../model/graph/chartVariant';
import { layerRows } from '../../model/graph/layers';
import { xySeries } from '../../model/table/tableLayout';
import type { ChartType, Project } from '../../model/types';
import { addBracket, addChart, addDataTable, addGroup, patchChart, patchLegend, patchStyle, setCells, setFactor, setLayerHidden, setLayerRange } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildGroupedModel } from './groupedModel';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const model = (p: Project) => buildGroupedModel(chartOf(p), tableOf(p));
const svg = (p: Project) => chartToSvgString(chartOf(p), tableOf(p));
const sid = (p: Project) => xySeries(tableOf(p)).map((s) => s.id);
const bracket = (id: string, from: string, to: string, extra: { row?: number; toRow?: number; label?: string } = {}) => ({
  id,
  from,
  to,
  label: extra.label ?? 'p = 0.003',
  color: '#000000',
  widthPt: 2,
  fontSizePt: 24,
  ...(extra.row !== undefined ? { row: extra.row } : {}),
  ...(extra.toRow !== undefined ? { toRow: extra.toRow } : {}),
});

/** Grouped bars of replicates with four series (and the categories of the sample), the first two of the factor Wild type and the others Knock-out when `factors`. */
const setup = (type: ChartType = 'groupedBar', factors = false): Project => {
  let p = addDataTable('t', 'grouped', { layout: { kind: 'replicates', n: 2 }, sample: true })(createExampleProject());
  while (xySeries(tableOf(p)).length < 4) p = addGroup('t')(p);
  const filled = xySeries(tableOf(p)).slice(2).flatMap((sr) => sr.columns.flatMap((c, k) => [0, 1, 2].map((row) => ({ col: tableOf(p).groups.findIndex((g) => g.id === c.id), row, value: 5 + row + k + sr.index }))));
  p = setCells('t', filled)(p);
  p = addChart('c', 't', undefined, type)(p);
  if (factors) {
    const series = xySeries(tableOf(p));
    p = setFactor('t', series.slice(0, 2).map((s) => s.id), 'Wild type')(p);
    p = setFactor('t', series.slice(2).map((s) => s.id), 'Knock-out')(p);
  }
  return p;
};
const withBrackets = (p: Project, ...list: ReturnType<typeof bracket>[]) => list.reduce((q, b) => addBracket('c', b)(q), p);
/** The names of the series, set on the first column of each. */
const named = (p: Project, names: string[]): Project => ({
  ...p,
  dataTables: p.dataTables.map((t) => {
    const first = xySeries(t).map((s) => s.columns[0].id);
    return { ...t, groups: t.groups.map((g) => (first.includes(g.id) ? { ...g, title: names[first.indexOf(g.id)] } : g)) };
  }),
});
/** The page Y of the top of the highest bar of category `ci`. */
const barTop = (p: Project, ci: number) => Math.min(...model(p).series.flatMap((s) => s.bars.filter((b) => b.categoryIndex === ci).map((b) => b.y)));

describe('comparison brackets on grouped bars', () => {
  it('joins two series inside one category: its ends are the middles of their bars, above the highest bar', () => {
    const p0 = setup();
    const [a, , c] = sid(p0);
    const p = withBrackets(p0, bracket('b1', a, c, { row: 1 }));
    const m = model(p);
    expect(m.brackets).toHaveLength(1);
    const bar = (s: number) => m.series[s].bars.find((b) => b.categoryIndex === 1)!;
    expect(m.brackets[0].x1).toBeCloseTo(bar(0).x + bar(0).width / 2, 6);
    expect(m.brackets[0].x2).toBeCloseTo(bar(2).x + bar(2).width / 2, 6);
    expect(m.brackets[0].y).toBeLessThan(barTop(p, 1));
    expect(svg(p)).toContain('>p = 0.003<');
  });
  it('joins the same series in two categories, above everything between its ends', () => {
    const p0 = setup();
    // The third series has a value in all three categories (the first has none in the third).
    const a = sid(p0)[2];
    const p = withBrackets(p0, bracket('b1', a, a, { row: 0, toRow: 2 }));
    const m = model(p);
    expect(m.brackets).toHaveLength(1);
    expect(m.brackets[0].x1).toBeLessThan(m.brackets[0].x2);
    expect(m.brackets[0].y).toBeLessThan(Math.min(barTop(p, 0), barTop(p, 1), barTop(p, 2)));
  });
  it('extends the axis, and a hidden bracket takes its room so that hiding moves nothing (rule 5)', () => {
    const p0 = setup();
    const [a, b] = sid(p0);
    const p = withBrackets(p0, bracket('b1', a, b, { row: 0 }));
    expect(model(p).y.domain[1]).toBeGreaterThanOrEqual(model(p0).y.domain[1]);
    const hidden = setLayerHidden('c', 'b1:bracket', true)(p);
    expect(svg(hidden)).not.toContain('>p = 0.003<');
    expect(model(hidden).y.domain).toEqual(model(p).y.domain);
    expect(model(hidden).brackets[0].y).toBe(model(p).brackets[0].y);
  });
  it('stacks brackets that overlap in one category, the longer above the shorter', () => {
    const p0 = setup();
    const [a, b, c] = sid(p0);
    const m = model(withBrackets(p0, bracket('long', a, c, { row: 0 }), bracket('short', a, b, { row: 0 })));
    const y = (id: string) => m.brackets.find((x) => x.id === id)!.y;
    expect(y('long')).toBeLessThan(y('short'));
  });
  it('can be kept out of the axis range, and the layer says so', () => {
    const p0 = setup();
    const [a, b] = sid(p0);
    const p = withBrackets(p0, bracket('b1', a, b, { row: 0 }));
    const q = setLayerRange('c', 'b1:bracket', false)(p);
    expect(model(q).y.domain).toEqual(model(p0).y.domain);
    expect(layerRows(chartOf(p), tableOf(p)).find((r) => r.layer.kind === 'bracket')?.inRange).toBe(true);
    expect(layerRows(chartOf(q), tableOf(q)).find((r) => r.layer.kind === 'bracket')?.inRange).toBe(false);
  });
  it('follows the clusters of a factor: the places are in the order they stand across the page', () => {
    const p0 = setup('groupedBar', true);
    const [a, , c] = sid(p0);
    const p = withBrackets(p0, bracket('b1', a, c, { row: 0 }));
    const m = model(p);
    expect(m.brackets[0].x1).toBeLessThan(m.brackets[0].x2);
    // The bar of the third series is in the second cluster, to the right of the bar of the first.
    const bar = (s: number) => m.series[s].bars.find((b) => b.categoryIndex === 0)!;
    expect(m.brackets[0].x2).toBeCloseTo(bar(2).x + bar(2).width / 2, 6);
    expect(svg(p)).not.toContain('NaN');
  });
  it('is drawn on grouped box plots and on a horizontal chart', () => {
    const box = setup('groupedBox');
    const [a, b] = sid(box);
    expect(model(withBrackets(box, bracket('b1', a, b, { row: 0 }))).brackets).toHaveLength(1);
    const plain = setup();
    const h = patchChart('c', { orientation: 'horizontal' })(withBrackets(plain, bracket('b1', sid(plain)[0], sid(plain)[1], { row: 0 })));
    expect(svg(h)).toContain('>p = 0.003<');
    expect(svg(h)).not.toContain('NaN');
  });
  it('is not drawn, and says why, when an end is not on the graph, or it joins a place to itself', () => {
    const p0 = setup();
    const [a, b] = sid(p0);
    const gone = model(withBrackets(p0, bracket('b1', a, 'no-such-series', { row: 0, label: 'x' })));
    expect(gone.brackets).toEqual([]);
    expect(gone.warnings.join(' ')).toMatch(/Bracket "x" is not drawn: a data set it joins is not on the graph/);
    expect(model(withBrackets(p0, bracket('b2', a, b, { row: 99, label: 'y' }))).brackets).toEqual([]);
    // A series with no value in a category is no place to join.
    const hole = model(withBrackets(p0, bracket('b4', a, a, { row: 0, toRow: 2, label: 'h' })));
    expect(hole.warnings.join(' ')).toMatch(/Bracket "h" is not drawn: a value it joins is missing/);
    expect(model(withBrackets(p0, bracket('b3', a, a, { row: 0, label: 'z' }))).warnings.join(' ')).toMatch(/Bracket "z" is not drawn: it joins a data set to itself/);
  });
  it('is not offered where the series share one place (stacked bars, lines), and draws nothing there', () => {
    const [a, b] = sid(setup());
    for (const type of ['groupedStacked', 'groupedLine'] as const) {
      const p = withBrackets(setup(type), bracket('b1', a, b, { row: 0 }));
      expect(model(p).brackets).toEqual([]);
      expect(svg(p)).not.toContain('>p = 0.003<');
    }
  });
  it('is kept in the file with its categories, and a bad row is dropped', () => {
    const p0 = setup();
    const [a, b] = sid(p0);
    const p = withBrackets(p0, bracket('b1', a, b, { row: 1, toRow: 2 }));
    expect(chartOf(parseProject(stringifyProject(p))).brackets).toEqual([bracket('b1', a, b, { row: 1, toRow: 2 })]);
    const bad = JSON.parse(stringifyProject(p));
    (bad.project ?? bad).charts.find((x: { id: string }) => x.id === 'c').brackets[0].row = -1;
    expect(chartOf(parseProject(JSON.stringify(bad))).brackets[0].row).toBeUndefined();
  });
});

describe('the legend of grouped charts', () => {
  const labels = (p: Project) => model(p).legendSeries.map((i) => model(p).series[i].label);
  it('lists a series once when two factor clusters hold a series of the same name in the same place', () => {
    expect(labels(named(setup('groupedBar', true), ['Control', 'Drug', 'Control', 'Drug']))).toEqual(['Control', 'Drug']);
  });
  it('keeps series that share a place but not a name, and every series when no factor is named', () => {
    expect(labels(named(setup('groupedBar', true), ['A', 'B', 'C', 'D']))).toEqual(['A', 'B', 'C', 'D']);
    expect(labels(named(setup('groupedBar', false), ['Same', 'Same', 'Same', 'Same']))).toHaveLength(4);
  });
  it('still follows the legend that the user hid', () => {
    const p = named(setup('groupedBar', true), ['Control', 'Drug', 'Control', 'Drug']);
    // Hiding one of two series that stand for the same thing leaves the other; hiding both leaves neither.
    expect(labels(patchLegend('c', { hiddenGroupIds: [sid(p)[1]] })(p))).toEqual(['Control', 'Drug']);
    expect(labels(patchLegend('c', { hiddenGroupIds: [sid(p)[1], sid(p)[3]] })(p))).toEqual(['Control']);
  });
  /** The drawing of the legend: from its group to the end of the first key. */
  const legendOf = (p: Project): string => {
    const out = svg(p);
    const from = out.indexOf('id="legend"');
    return out.slice(from, out.indexOf('<text', from));
  };
  it('has a dot for a key on a chart of dots only, and a bar for a chart of bars', () => {
    const base = setup();
    const item = galleryItems('grouped').find((i) => i.id === 'grp.scatterI')!;
    const dotsOnly: Project = { ...base, charts: base.charts.map((c) => (c.id === 'c' ? applyVariant(c, item.variant) : c)) };
    expect(legendOf(dotsOnly)).not.toMatch(/<rect/);
    expect(legendOf(dotsOnly)).toMatch(/<path/);
    expect(legendOf(base)).toMatch(/<rect/);
  });
  it('keeps a dot key within the height of a row, however large the dots are', () => {
    const item = galleryItems('grouped').find((i) => i.id === 'grp.scatterI')!;
    const base = patchStyle('c', 'all', { symbolSizePt: 70, symbolShape: 'circle' })(setup());
    const big: Project = { ...base, charts: base.charts.map((c) => (c.id === 'c' ? applyVariant(c, item.variant) : c)) };
    expect(2 * Number(/a([0-9.]+),/.exec(legendOf(big))![1])).toBeLessThanOrEqual(20);
  });
});
