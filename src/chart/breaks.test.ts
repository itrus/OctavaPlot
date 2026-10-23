import { describe, expect, it } from 'vitest';
import { sanitizeBreaks } from '../model/axis';
import { createChart, createColumnTable, createXyTable } from '../model/defaults';
import type { DataTable, Project } from '../model/types';
import { patchAxis } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { axisGaps, axisMapper, axisPieces, BREAK_GAP_PT, resolveAxis, segmentsOf } from './axisScale';
import { chartToSvgString } from './export';
import { buildChartModel } from './model';
import { buildXyModel } from './xyModel';

const input = (values: number[], patch = {}) => ({ values, includeZero: true, min: 0, max: 100, majorInterval: 10, tickCountHint: 6, ...patch });
const cfg = (breaks: Array<{ from: number; to: number }>, extra = {}) => ({ scale: 'linear' as const, reverse: false, minorTicks: 0, numberFormat: 'auto' as const, decimals: null, thousands: false, prefix: '', suffix: '', breaks, ...extra });

describe('segments of a broken axis', () => {
  it('are what is left of the domain when the breaks are taken out', () => {
    expect(segmentsOf([0, 100], [{ from: 20, to: 70 }])).toEqual([{ lo: 0, hi: 20 }, { lo: 70, hi: 100 }]);
    expect(segmentsOf([0, 100], [{ from: 10, to: 20 }, { from: 50, to: 60 }])).toEqual([{ lo: 0, hi: 10 }, { lo: 20, hi: 50 }, { lo: 60, hi: 100 }]);
  });
  it('ignore a break outside the domain, clip one that sticks out, and refuse to break everything away', () => {
    expect(segmentsOf([0, 100], [{ from: 150, to: 200 }])).toBeNull();
    expect(segmentsOf([0, 100], [{ from: -20, to: 30 }])).toBeNull();
    expect(segmentsOf([0, 100], [{ from: 60, to: 300 }])).toBeNull();
    expect(segmentsOf([0, 100], [{ from: 60, to: 120 }, { from: 10, to: 20 }])).toEqual([{ lo: 0, hi: 10 }, { lo: 20, hi: 60 }]);
    expect(segmentsOf([0, 100], [])).toBeNull();
  });
});

describe('a broken axis', () => {
  const s = resolveAxis(input([5, 95]), cfg([{ from: 20, to: 70 }]));
  it('has ticks only where there is axis, and the ends of each stretch', () => {
    expect(s.segments).toEqual([{ lo: 0, hi: 20 }, { lo: 70, hi: 100 }]);
    expect(s.ticks).toEqual([0, 10, 20, 70, 80, 90, 100]);
    expect(s.domain).toEqual([0, 100]);
  });
  it('lays the stretches along the axis in proportion to their ranges, with a gap between', () => {
    // 20 and 30 of value: lengths 40% and 60% of what is left after the gap.
    const map = axisMapper(s, 300, -200);
    const usable = 200 - BREAK_GAP_PT;
    expect(map(0)).toBe(300);
    expect(map(20)).toBeCloseTo(300 - (usable * 20) / 50, 9);
    expect(map(70)).toBeCloseTo(300 - (usable * 20) / 50 - BREAK_GAP_PT, 9);
    expect(map(100)).toBeCloseTo(100, 9);
    // The same scale in each stretch.
    expect(map(10) - map(0)).toBeCloseTo(map(80) - map(70), 9);
  });
  it('puts a value in a gap at the nearer end of it, and one outside the domain beyond the ends', () => {
    const map = axisMapper(s, 300, -200);
    expect(map(30)).toBe(map(20));
    expect(map(60)).toBe(map(70));
    expect(map(-5)).toBeGreaterThan(300);
    expect(map(105)).toBeLessThan(100);
  });
  it('says where the pieces and the gaps are on the page', () => {
    const pieces = axisPieces(s, 300, -200)!;
    const gaps = axisGaps(s, 300, -200);
    expect(pieces).toHaveLength(2);
    expect(gaps).toHaveLength(1);
    expect(gaps[0][1] - gaps[0][0]).toBeCloseTo(BREAK_GAP_PT, 9);
    // Pieces run from low to high on the page: the stretch of high values is the upper piece.
    expect(pieces[0][0]).toBeCloseTo(gaps[0][1], 9);
    expect(pieces[1][1]).toBeCloseTo(gaps[0][0], 9);
  });
  it('leaves room for the numbers either side of a gap: at least their height', () => {
    const big = resolveAxis(input([5, 95]), cfg([{ from: 20, to: 70 }], { tickFontSizePt: 20 }));
    expect(big.gapPt).toBe(26);
    const [gap] = axisGaps(big, 300, -200);
    expect(gap[1] - gap[0]).toBeCloseTo(26, 9);
    expect(s.gapPt).toBe(BREAK_GAP_PT);
  });
  it('is not broken on a log axis or a reversed one', () => {
    expect(resolveAxis(input([5, 95], { min: 1 }), cfg([{ from: 20, to: 70 }], { scale: 'log10' })).segments).toBeUndefined();
    expect(resolveAxis(input([5, 95]), cfg([{ from: 20, to: 70 }], { reverse: true })).segments).toBeUndefined();
    expect(axisPieces({}, 0, 100)).toBeNull();
  });
  it('gives a range with a gap to each stretch of a three-stretch axis', () => {
    const t = resolveAxis(input([5, 95]), cfg([{ from: 10, to: 20 }, { from: 50, to: 60 }]));
    expect(axisPieces(t, 300, -200)).toHaveLength(3);
    expect(axisGaps(t, 300, -200)).toHaveLength(2);
  });
});

describe('breaks as stored', () => {
  it('are sorted, kept apart, at most two, and each from below to', () => {
    expect(sanitizeBreaks([{ from: 50, to: 60 }, { from: 10, to: 20 }], [])).toEqual([{ from: 10, to: 20 }, { from: 50, to: 60 }]);
    expect(sanitizeBreaks([{ from: 10, to: 30 }, { from: 20, to: 40 }], [])).toEqual([{ from: 10, to: 30 }]);
    expect(sanitizeBreaks([{ from: 1, to: 2 }, { from: 3, to: 4 }, { from: 5, to: 6 }], [])).toHaveLength(2);
    expect(sanitizeBreaks([{ from: 5, to: 5 }, { from: 9, to: 2 }, { from: 'a', to: 3 }, null], [])).toEqual([]);
    expect(sanitizeBreaks('nonsense', [{ from: 1, to: 2 }])).toEqual([{ from: 1, to: 2 }]);
  });
});

describe('a column chart with a broken value axis', () => {
  const setup = () => {
    const table: DataTable = createColumnTable('Data', false);
    table.groups[0].observations.slice(0, 3).forEach((o, i) => (o.value = [5, 8, 6][i]));
    table.groups[1].observations.slice(0, 3).forEach((o, i) => (o.value = [90, 95, 92][i]));
    const chart = createChart(table.id, undefined, 'bar');
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    return { p, table };
  };
  const broken = (p: Project) => patchAxis(p.charts[0].id, 'yAxis', { breaks: [{ from: 20, to: 80 }], min: 0, max: 100 })(p).charts[0];
  it('has the tall bar cross the gap, the clip cutting the gap out, and the axis line in two pieces', () => {
    const { p, table } = setup();
    const c = broken(p);
    const m = buildChartModel(c, table);
    expect(m.y.segments).toHaveLength(2);
    const svg = chartToSvgString(c, table);
    // The clip of the data is two rectangles, one above the gap and one below.
    const clip = /<clipPath id="plot-clip">(.*?)<\/clipPath>/.exec(svg)![1];
    expect(clip.match(/<rect/g)).toHaveLength(2);
    // The axis line is in two pieces, and a mark is drawn at each end of the gap.
    const axis = svg.match(/M[\d.]+,[\d.]+V[\d.]+M[\d.]+,[\d.]+V[\d.]+/);
    expect(axis).not.toBeNull();
    expect(svg).toMatch(/L[\d.]+,[\d.]+M[\d.]+,[\d.]+L/);
    // Short bars stay below the gap; the tall one is as high as its value is.
    expect(m.groups[0].bar!.height).toBeLessThan(m.groups[1].bar!.height);
    expect(m.groups[1].bar!.y).toBeCloseTo(m.yScale(m.groups[1].centreValue!), 6);
    expect(svg).not.toContain('NaN');
  });
  it('draws like any other chart when nothing is broken', () => {
    const { p, table } = setup();
    expect(buildChartModel(p.charts[0], table).y.segments).toBeUndefined();
    const svg = chartToSvgString(p.charts[0], table);
    expect(/<clipPath id="plot-clip">(.*?)<\/clipPath>/.exec(svg)![1].match(/<rect/g)).toHaveLength(1);
  });
  it('can have its marks changed or left off', () => {
    const { p, table } = setup();
    const none = patchAxis(p.charts[0].id, 'yAxis', { breaks: [{ from: 20, to: 80 }], min: 0, max: 100, breakMark: 'none' })(p).charts[0];
    expect(chartToSvgString(none, table)).not.toMatch(/L[\d.]+,[\d.]+M[\d.]+,[\d.]+L/);
  });
  it('is kept in a file, and a bad one is dropped', () => {
    const { p } = setup();
    const c = broken(p);
    const next: Project = { ...p, charts: [c] };
    expect(parseProject(stringifyProject(next)).charts[0].yAxis.breaks).toEqual([{ from: 20, to: 80 }]);
    const text = JSON.parse(stringifyProject(next));
    text.project.charts[0].yAxis.breaks = [{ from: 90, to: 10 }, 7];
    text.project.charts[0].yAxis.breakMark = 'wave';
    const back = parseProject(JSON.stringify(text)).charts[0].yAxis;
    expect(back.breaks).toEqual([]);
    expect(back.breakMark).toBe('doubleSlash');
  });
});

describe('an XY chart with broken axes', () => {
  it('can break either axis, and the points keep to their stretches', () => {
    const table: DataTable = createXyTable('XY 1', false);
    table.groups[0].observations.slice(0, 4).forEach((o, i) => (o.value = [1, 2, 90, 95][i]));
    table.groups[1].observations.slice(0, 4).forEach((o, i) => (o.value = [3, 4, 80, 85][i]));
    const chart = createChart(table.id, undefined, 'xyScatter');
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    let c = patchAxis(chart.id, 'xAxis', { breaks: [{ from: 10, to: 80 }], min: 0, max: 100 })(p);
    c = patchAxis(chart.id, 'yAxis', { breaks: [{ from: 10, to: 70 }], min: 0, max: 100 })(c);
    const m = buildXyModel(c.charts[0], table);
    expect(m.x.segments).toHaveLength(2);
    expect(m.y.segments).toHaveLength(2);
    const pts = m.series[0].points;
    // Points 1 and 2 are in the left stretch of the X axis, 3 and 4 in the right one, past the gap.
    expect(pts[1].px).toBeLessThan(pts[2].px - 100);
    const svg = chartToSvgString(c.charts[0], table);
    expect(/<clipPath id="plot-clip">(.*?)<\/clipPath>/.exec(svg)![1].match(/<rect/g)).toHaveLength(4);
    expect(svg).not.toContain('NaN');
  });
});
