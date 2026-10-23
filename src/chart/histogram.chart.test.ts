import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../model/defaults';
import { defaultYTitle } from '../model/histogramOptions';
import type { DataTable, Project } from '../model/types';
import { patchAxis, patchLook, setChartType } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { buildAnyModel } from './anyModel';
import { chartToSvgString } from './export';
import { buildHistModel } from './histModel';
import { histTooltipLines } from './tooltip';

const data = [1, 1, 2, 3, 3, 3, 4, 5, 8, 9];
const setup = (type: 'histogram' | 'ecdf' = 'histogram', columns: number[][] = [data]) => {
  const table: DataTable = createColumnTable('Data', false);
  table.groups.forEach((g, i) => g.observations.forEach((o, r) => (o.value = columns[i]?.[r] ?? null)));
  const chart = createChart(table.id, undefined, type);
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const opt = (p: Project, patch: Partial<Project['charts'][0]['histogram']>) => patchLook(p.charts[0].id, { histogram: { ...p.charts[0].histogram, ...patch } })(p).charts[0];

describe('histogram chart', () => {
  it('has one bar for each bin, as high as the count, standing on zero', () => {
    const { table, chart } = setup('histogram');
    const m = buildHistModel(chart, table);
    const bars = m.series[0].bars!;
    expect(bars.reduce((n, b) => n + b.count, 0)).toBe(10);
    for (const b of bars) {
      expect(b.y + b.height).toBeCloseTo(m.yScale(0), 6);
      expect(b.y).toBeCloseTo(m.yScale(b.count), 6);
    }
    // Neighbouring bins touch (no gap by default) and the bars run across the value axis in order.
    for (let i = 1; i < bars.length; i++) expect(bars[i].x).toBeCloseTo(bars[i - 1].x + bars[i - 1].width, 6);
    expect(m.series[0].points).toHaveLength(0);
    // The value axis runs over the bins, no further.
    expect(m.x.domain[0]).toBe(bars[0].bin[0]);
    expect(m.x.domain[1]).toBe(bars.at(-1)!.bin[1]);
  });
  it('uses a bin width set by hand, and an edge the bins line up with', () => {
    const { p, table } = setup('histogram');
    const w = buildHistModel(opt(p, { binning: 'width', binWidth: 2 }), table).series[0].bars!;
    expect(w.map((b) => b.bin[1] - b.bin[0])).toEqual(w.map(() => 2));
    expect(w[0].bin[0] % 2).toBe(0);
    const anchored = buildHistModel(opt(p, { binning: 'width', binWidth: 2, firstEdge: 1 }), table).series[0].bars!;
    expect(anchored[0].bin[0]).toBe(1);
  });
  it('shows fractions, percents and densities of all the values', () => {
    const { p, table } = setup('histogram');
    const heights = (frequency: 'count' | 'fraction' | 'percent' | 'density') => buildHistModel(opt(p, { frequency, binning: 'width', binWidth: 2 }), table).series[0].bars!.map((b) => b.value);
    const count = heights('count');
    expect(heights('fraction')).toEqual(count.map((c) => c / 10));
    expect(heights('percent')).toEqual(count.map((c) => c * 10));
    expect(heights('density').reduce((a, v) => a + v * 2, 0)).toBeCloseTo(1, 12);
  });
  it('adds up for a cumulative histogram, and its axis shows the total', () => {
    const { p, table } = setup('histogram');
    const m = buildHistModel(opt(p, { cumulative: 'ascending' }), table);
    const values = m.series[0].bars!.map((b) => b.value);
    expect(values[values.length - 1]).toBe(10);
    expect([...values].sort((a, b) => a - b)).toEqual(values);
    expect(m.y.domain[1]).toBeGreaterThanOrEqual(10);
  });
  it('uses the same bins for every data set, and can put the bars side by side', () => {
    const { p, table } = setup('histogram', [data, [2, 2, 4, 6, 6, 7]]);
    const over = buildHistModel(p.charts[0], table);
    expect(over.series[1].bars!.map((b) => b.bin)).toEqual(over.series[0].bars!.map((b) => b.bin));
    const side = buildHistModel(opt(p, { arrangement: 'side' }), table);
    const [a, b] = [side.series[0].bars![0], side.series[1].bars![0]];
    expect(b.x).toBeCloseTo(a.x + a.width, 6);
    expect(a.width).toBeCloseTo(over.series[0].bars![0].width / 2, 6);
  });
  it('leaves a space between bars as a share of the bin', () => {
    const { p, table } = setup('histogram');
    const tight = buildHistModel(p.charts[0], table).series[0].bars![0];
    const gapped = buildHistModel(opt(p, { gapPct: 20 }), table).series[0].bars![0];
    expect(gapped.width).toBeCloseTo(tight.width * 0.8, 6);
  });
  it('draws bars and a legend key in the SVG, with no NaN, and a tooltip for a bar', () => {
    const { table, chart } = setup('histogram');
    const svg = chartToSvgString(chart, table);
    expect(svg).toContain('<rect');
    expect(svg).not.toContain('NaN');
    const m = buildHistModel(chart, table);
    const bar = m.series[0].bars![1];
    expect(histTooltipLines(m, { kind: 'bar', groupId: m.series[0].groupId, objectId: bar.id })).toEqual([m.series[0].label, `Bin: ${bar.bin[0]} to ${bar.bin[1]}`, `Count: ${bar.count}`, `Plotted: ${bar.value}`]);
  });
  it('writes nothing for no values, and says so', () => {
    const { chart } = setup('histogram', [[]]);
    const table = createColumnTable('Empty', false);
    const m = buildHistModel({ ...chart, dataTableId: table.id }, table);
    expect(m.warnings.join(' ')).toMatch(/Enter numbers/);
    expect(chartToSvgString({ ...chart, dataTableId: table.id }, table)).not.toContain('NaN');
  });
});

describe('cumulative distribution chart', () => {
  it('has a step at each different value, and the ties make one jump', () => {
    const { table, chart } = setup('ecdf');
    const s = buildHistModel(chart, table).series[0];
    expect(s.points.map((q) => q.x)).toEqual([1, 2, 3, 4, 5, 8, 9]);
    expect(s.points.map((q) => q.y)).toEqual([0.2, 0.3, 0.6, 0.7, 0.8, 0.9, 1]);
    expect(s.bars).toBeUndefined();
  });
  it('rises to the whole sample, as a count or as percent', () => {
    const { p, table } = setup('ecdf');
    expect(buildHistModel(opt(p, { ecdfUnits: 'count' }), table).series[0].points.at(-1)!.y).toBe(10);
    expect(buildHistModel(opt(p, { ecdfUnits: 'percent' }), table).series[0].points.at(-1)!.y).toBe(100);
  });
  it('can count the values above each value instead', () => {
    const { p, table } = setup('ecdf');
    const s = buildHistModel(opt(p, { ecdfDirection: 'above' }), table).series[0];
    expect(s.points.at(-1)!.y).toBe(0);
    expect(s.points[0].y).toBeCloseTo(0.8, 12);
    // It starts at the top, before the first value.
    expect(s.linePath.startsWith(`M`)).toBe(true);
  });
  it('goes level to the ends of the axis, or only between its first and last value', () => {
    const { p, table } = setup('ecdf');
    const ends = buildHistModel(p.charts[0], table);
    const first = ends.series[0].points[0];
    const startsAt = Number(/^M([-\d.]+),/.exec(ends.series[0].linePath)![1]);
    expect(startsAt).toBeLessThan(first.px);
    const only = buildHistModel(opt(p, { ecdfExtend: false }), table);
    expect(Number(/^M([-\d.]+),/.exec(only.series[0].linePath)![1])).toBeCloseTo(only.series[0].points[0].px, 1);
  });
  it('is drawn as a line in the series colour, with symbols when asked', () => {
    const { p, table } = setup('ecdf', [data, [2, 4, 6]]);
    const m = buildHistModel(p.charts[0], table);
    expect(m.series[0].style.showLines).toBe(true);
    expect(m.series[0].style.lineColor).not.toBe(m.series[1].style.lineColor);
    const svg = chartToSvgString(opt(p, { ecdfSymbols: true }), table);
    expect(svg).not.toContain('NaN');
  });
});

describe('histogram settings', () => {
  it('route a column table to its own family, and a switch from bars keeps the data', () => {
    const { p, table } = setup('histogram');
    expect(buildAnyModel(p.charts[0], table).family).toBe('hist');
    const next = setChartType(p.charts[0].id, 'ecdf')(p);
    expect(buildAnyModel(next.charts[0], table).family).toBe('hist');
    const bar = setChartType(p.charts[0].id, 'bar')(p);
    expect(buildAnyModel(bar.charts[0], table).family).toBe('category');
  });
  it('name the Y axis by what the heights are', () => {
    const o = createChart('t', undefined, 'histogram').histogram;
    expect(defaultYTitle('histogram', o)).toBe('Count');
    expect(defaultYTitle('histogram', { ...o, frequency: 'percent' })).toBe('Percent');
    expect(defaultYTitle('histogram', { ...o, frequency: 'density' })).toBe('Probability density');
    expect(defaultYTitle('histogram', { ...o, cumulative: 'ascending' })).toBe('Cumulative count');
    expect(defaultYTitle('histogram', { ...o, frequency: 'density', cumulative: 'ascending' })).toBe('Cumulative fraction');
    expect(defaultYTitle('ecdf', o)).toBe('Cumulative fraction');
    expect(defaultYTitle('ecdf', { ...o, ecdfUnits: 'percent', ecdfDirection: 'above' })).toBe('Percent above');
    expect(createChart('t', undefined, 'histogram').yAxis.title).toBe('Count');
    expect(createChart('t', undefined, 'ecdf').yAxis.title).toBe(defaultYTitle('ecdf', o));
  });
  it('are kept in a file; bad values fall back, and old files get the defaults', () => {
    const { p } = setup('histogram');
    const next = patchLook(p.charts[0].id, { histogram: { ...p.charts[0].histogram, binning: 'width', binWidth: 2.5, frequency: 'percent', gapPct: 500 } })(p);
    expect(next.charts[0].histogram.gapPct).toBe(90);
    const back = parseProject(stringifyProject(next));
    expect(back.charts[0].histogram).toMatchObject({ binning: 'width', binWidth: 2.5, frequency: 'percent' });
    const text = JSON.parse(stringifyProject(next));
    text.project.charts[0].histogram = { binning: 'weird', binWidth: -4, frequency: 'x', cumulative: 5 };
    expect(parseProject(JSON.stringify(text)).charts[0].histogram).toMatchObject({ binning: 'auto', binWidth: null, frequency: 'count', cumulative: 'off' });
    delete text.project.charts[0].histogram;
    expect(parseProject(JSON.stringify(text)).charts[0].histogram.frequency).toBe('count');
  });
  it('keep the value axis linear, whatever the file says', () => {
    const { p, table } = setup('histogram');
    const logged = patchAxis(p.charts[0].id, 'xAxis', { scale: 'log10' })(p).charts[0];
    expect(buildHistModel(logged, table).x.log ?? null).toBeNull();
  });
});
