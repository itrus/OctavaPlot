import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { applyVariant } from '../../model/graph/chartVariant';
import { layerBaseStyle } from '../../model/graph/layers';
import { FACTOR_GAP, factorLayout, hasFactors, seriesPaletteIndex } from '../../model/table/factors';
import { xySeries } from '../../model/table/tableLayout';
import type { ChartType, Project } from '../../model/types';
import { addChart, addDataTable, addGroup, patchChart, setCells, setFactor } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildGroupedModel } from './groupedModel';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const model = (p: Project) => buildGroupedModel(chartOf(p), tableOf(p));
const fac = (...factors: string[]) => factors.map((factor) => ({ columns: [{ factor }] }));

/** A grouped table of replicates with four series; the first two are the factor Wild type and the other two Knock-out. */
const setup = (type: ChartType = 'groupedBar', factors = true): Project => {
  let p = addDataTable('t', 'grouped', { layout: { kind: 'replicates', n: 2 }, sample: true })(createExampleProject());
  while (xySeries(tableOf(p)).length < 4) p = addGroup('t')(p);
  // The series that were added have no values yet: give each replicate of the first rows one.
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
/** The left edge of the bar of each series in category 0, in order of series. */
const barXs = (p: Project) => model(p).series.map((s) => s.bars.find((b) => b.categoryIndex === 0)!.x);

describe('factor clusters: the layout', () => {
  it('draws the series of a factor together, with a gap between clusters, in the order of the first series of each', () => {
    const l = factorLayout(fac('WT', 'WT', 'KO', 'KO'))!;
    expect(l.slot).toEqual([0, 1, 2 + FACTOR_GAP, 3 + FACTOR_GAP]);
    expect(l.position).toEqual([0, 1, 0, 1]);
    expect(l.units).toBeCloseTo(4 + FACTOR_GAP, 9);
    expect(l.clusters.map((c) => c.factor)).toEqual(['WT', 'KO']);
  });
  it('brings the series of a factor together whatever lies between them in the table', () => {
    const l = factorLayout(fac('WT', 'KO', 'WT', 'KO'))!;
    expect(l.clusters.map((c) => c.series)).toEqual([[0, 2], [1, 3]]);
    expect(l.slot).toEqual([0, 2 + FACTOR_GAP, 1, 3 + FACTOR_GAP]);
    expect(l.position).toEqual([0, 0, 1, 1]);
  });
  it('is null when no series names a factor, and series that name none form a cluster of their own', () => {
    expect(factorLayout(fac('', '', ''))).toBeNull();
    expect(hasFactors(fac('', 'A'))).toBe(true);
    const mixed = factorLayout(fac('A', '', 'A'))!;
    expect(mixed.clusters.map((c) => c.factor)).toEqual(['A', '']);
    expect(mixed.slot).toEqual([0, 2 + FACTOR_GAP, 1]);
  });
  it('a series keeps the colour of its place in its cluster; chart types that do not cluster keep the plain colours', () => {
    const cols = fac('WT', 'WT', 'KO', 'KO').map((c) => c.columns[0]);
    expect([0, 1, 2, 3].map((i) => seriesPaletteIndex({ type: 'groupedBar', groupedBy: 'category' }, cols, i))).toEqual([0, 1, 0, 1]);
    expect([0, 1, 2, 3].map((i) => seriesPaletteIndex({ type: 'groupedStacked', groupedBy: 'category' }, cols, i))).toEqual([0, 1, 2, 3]);
    // Grouped by series every series is a group of its own and keeps its own colour.
    expect([0, 1, 2, 3].map((i) => seriesPaletteIndex({ type: 'groupedBar', groupedBy: 'series' }, cols, i))).toEqual([0, 1, 2, 3]);
  });
});

describe('factors that name one series each', () => {
  it('leave each series its own colour, since the factor already tells them apart', () => {
    const l = factorLayout(fac('WT', 'KO'))!;
    expect(l.position).toEqual([0, 1]);
    const cols = fac('WT', 'KO', 'HET').map((c) => c.columns[0]);
    expect([0, 1, 2].map((i) => seriesPaletteIndex({ type: 'groupedBar', groupedBy: 'category' }, cols, i))).toEqual([0, 1, 2]);
    // With two series in a cluster the colour is the place in the cluster again.
    expect(factorLayout(fac('WT', 'WT', 'KO'))!.position).toEqual([0, 1, 0]);
  });
});

describe('the names of the factors fit their clusters', () => {
  it('are written at the tick size when they fit, and smaller (not below 60%) when they are wider than their cluster', () => {
    const p = setup();
    const tick = chartOf(p).xAxis.tickFontSizePt;
    const wide = Math.max(...model(p).factorLabels.map((f) => f.fontPt));
    expect(wide).toBeLessThanOrEqual(tick);
    const series = xySeries(tableOf(p));
    const long = setFactor('t', series.slice(0, 2).map((s) => s.id), 'A factor with a very long name indeed')(p);
    const sizes = model(long).factorLabels.filter((f) => f.text.startsWith('A factor')).map((f) => f.fontPt);
    expect(sizes.length).toBeGreaterThan(0);
    for (const size of sizes) {
      expect(size).toBeLessThan(tick);
      expect(size).toBeGreaterThanOrEqual(tick * 0.6 - 1e-9);
    }
  });
});

describe('three-way bars: the chart', () => {
  it('puts a wider gap between the clusters than between the bars inside one', () => {
    const p = setup();
    const xs = barXs(p);
    const bw = model(p).series[0].bars[0].width;
    expect(xs[1] - xs[0]).toBeCloseTo(bw, 6);
    expect(xs[2] - xs[1]).toBeCloseTo(bw * (1 + FACTOR_GAP), 6);
    expect(xs[3] - xs[2]).toBeCloseTo(bw, 6);
  });
  it('gives the series in the same place of two clusters the same colour', () => {
    const p = setup();
    const m = model(p);
    expect(m.series[0].style.barFill).toBe(m.series[2].style.barFill);
    expect(m.series[1].style.barFill).toBe(m.series[3].style.barFill);
    expect(m.series[0].style.barFill).not.toBe(m.series[1].style.barFill);
  });
  it('writes the name of each factor under its cluster in each category, in a row the plot made room for', () => {
    const plain = model(setup('groupedBar', false));
    const m = model(setup());
    expect(plain.factorLabels).toEqual([]);
    expect(plain.layout.categoryRow).toBeNull();
    expect(m.factorLabels).toHaveLength(m.categories.length * 2);
    expect(m.layout.categoryRow).not.toBeNull();
    expect(m.layout.plot.height).toBeLessThan(plain.layout.plot.height);
    for (const f of m.factorLabels) {
      expect(f.y).toBe(m.layout.categoryRow!.y);
      expect(f.x2).toBeGreaterThan(f.x1);
    }
    const svg = chartToSvgString(chartOf(setup()), tableOf(setup()));
    expect(svg).toContain('>Wild type<');
    expect(svg).toContain('>Knock-out<');
    expect(svg).not.toContain('NaN');
  });
  it('does not change a chart whose series name no factor', () => {
    const a = setup('groupedBar', false);
    const m = model(a);
    expect(m.factorLabels).toEqual([]);
    expect(m.layout.categoryRow).toBeNull();
    expect(chartToSvgString(chartOf(a), tableOf(a))).not.toContain('Wild type');
  });
  it('clusters the other side-by-side types too (floating bars, box plots, violins) and leaves stacked bars and lines alone', () => {
    for (const type of ['groupedFloating', 'groupedBox', 'groupedViolin'] as const) expect(model(setup(type)).factorLabels.length).toBeGreaterThan(0);
    for (const type of ['groupedStacked', 'groupedLine'] as const) expect(model(setup(type)).factorLabels).toEqual([]);
  });
  it('writes no names on a horizontal chart, and says so', () => {
    const p = patchChart('c', { orientation: 'horizontal' })(setup());
    const m = model(p);
    expect(m.factorLabels).toEqual([]);
    expect(m.warnings.join(' ')).toMatch(/names of the factors are not written on a horizontal chart/);
  });
  it('keeps the look the Layers section starts from in step with the colours of the chart', () => {
    const p = setup();
    const m = model(p);
    m.series.forEach((sr) => {
      const layer = m.layers.find((l) => l.binding?.seriesId === sr.groupId)!;
      expect(layerBaseStyle(chartOf(p), tableOf(p), layer)?.barFill).toBe(sr.style.barFill);
    });
  });
});

describe('factor: the command and the file', () => {
  it('names the factor of the series of the columns it is given, and clears it with an empty text', () => {
    const p = setup('groupedBar', false);
    const first = xySeries(tableOf(p))[0].id;
    const named = setFactor('t', [first], '  Wild type ')(p);
    expect(xySeries(tableOf(named))[0].columns[0].factor).toBe('Wild type');
    expect(setFactor('t', [first], 'Wild type')(named)).toBe(named);
    const cleared = setFactor('t', [first], '')(named);
    expect('factor' in xySeries(tableOf(cleared))[0].columns[0]).toBe(false);
  });
  it('ignores a column that is not the first of its series', () => {
    const p = setup('groupedBar', false);
    const second = xySeries(tableOf(p))[0].columns[1];
    expect(setFactor('t', [second.id], 'A')(p)).toBe(p);
  });
  it('survives save and reopen, and a file without factors opens as before', () => {
    const p = setup();
    const back = parseProject(stringifyProject(p));
    expect(xySeries(back.dataTables.find((t) => t.id === 't')!)[0].columns[0].factor).toBe('Wild type');
    expect(hasFactors(xySeries(tableOf(parseProject(stringifyProject(setup('groupedBar', false))))))).toBe(false);
  });
});

describe('three-way bars and dots in the gallery', () => {
  it('are offered as grouped bars, the dots as dots only', () => {
    const items = galleryItems('grouped');
    const bars = items.find((i) => i.id === 'three.bars');
    const dots = items.find((i) => i.id === 'three.dots');
    expect(bars?.type).toBe('groupedBar');
    expect(dots?.type).toBe('groupedBar');
    const made = (v: Parameters<typeof applyVariant>[1]) => applyVariant(chartOf(setup('groupedBar', false)), v).layers[0].style.showBars;
    expect(made(bars?.variant)).toBe(true);
    expect(made(dots?.variant)).toBe(false);
  });
});
