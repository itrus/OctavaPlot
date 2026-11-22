import { describe, expect, it } from 'vitest';
import { createChart, createContingencyTable } from '../../model/defaults';
import type { DataTable, Project } from '../../model/types';
import { patchLook, setCells } from '../../state/commands';
import { chartToSvgString } from '../export/export';
import { buildPieModel, cutForArea, dotsPath } from './pieModel';

const setup = (type: 'slices' | 'dotGrid') => {
  const table: DataTable = createContingencyTable('Outcomes', true); // one column, Cases: Cured 38, Improved 21, No change 12
  const chart = createChart(table.id, undefined, type);
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const circles = (d: string) => (d.match(/M/g) ?? []).length;

describe('cutForArea', () => {
  it('finds the vertical line that leaves the given share of a circle on its left', () => {
    expect(cutForArea(0)).toBeCloseTo(-1, 6);
    expect(cutForArea(0.5)).toBeCloseTo(0, 6);
    expect(cutForArea(1)).toBeCloseTo(1, 6);
    expect(cutForArea(0.25)).toBeLessThan(0);
  });
});

describe('dotsPath', () => {
  it('is one shape for each dot reached, whole or part, and nothing for none', () => {
    expect(circles(dotsPath(50, 50, 100, 0, 7))).toBe(7);
    expect(circles(dotsPath(50, 50, 100, 0, 7.4))).toBe(8);
    expect(circles(dotsPath(50, 50, 100, 6.5, 8.25))).toBe(3);
    expect(dotsPath(50, 50, 100, 30, 30)).toBe('');
  });
});

describe('dot shape and size', () => {
  it('draws squares, cut by width at the share of a dot, and a size that scales the dots', () => {
    const sq = dotsPath(50, 50, 100, 0, 7.5, 'square');
    expect(circles(sq)).toBe(8);
    expect(sq).not.toContain('a');
    // Size 1 on a pitch of 1: a half dot ends at its middle.
    expect(dotsPath(5, 5, 10, 0, 0.5, 'square', 1)).toBe('M0,0H0.5V1H0Z');
    expect(dotsPath(50, 50, 100, 0, 1, 'square', 1)).toBe('M0,0H10V10H0Z');
    expect(dotsPath(50, 50, 100, 0, 1, 'square', 0.5)).toBe('M2.5,2.5H7.5V7.5H2.5Z');
  });

  it('keeps the options in the chart, with defaults for a file without them', () => {
    const { table, chart } = setup('dotGrid');
    expect(chart.pie).toMatchObject({ dotShape: 'circle', dotSize: 0.8 });
    const m = buildPieModel({ ...chart, pie: { ...chart.pie, dotShape: 'square', dotSize: 1 } }, table);
    expect(m.pies[0].slices[0].path).toContain('H');
  });
});

describe('slices (one bar of parts: the rows of the column)', () => {
  it('makes one bar with a segment as wide as each share, side by side', () => {
    const { table, chart } = setup('slices');
    const m = buildPieModel(chart, table);
    expect(m.pies.map((p) => p.title)).toEqual(['Cases']);
    const w = m.pies[0].slices.map((s) => ({ x0: Number(/M([\d.-]+),/.exec(s.path)![1]), x1: Number(/H([\d.-]+)V/.exec(s.path)![1]) }));
    expect(w[1].x0).toBeCloseTo(w[0].x1, 1);
    expect(w[2].x0).toBeCloseTo(w[1].x1, 1);
    expect((w[0].x1 - w[0].x0) / (w[1].x1 - w[1].x0)).toBeCloseTo(38 / 21, 2);
  });

  it('writes the shares under the segments, and leaves out a text wider than its segment', () => {
    const { table, chart } = setup('slices');
    const withText = buildPieModel({ ...chart, pie: { ...chart.pie, labels: 'percent' } }, table);
    expect(withText.pies[0].slices.map((s) => s.text?.content)).toEqual(['53.5%', '29.6%', '16.9%']);
    expect(withText.pies[0].slices[0].text!.y).toBeGreaterThan(withText.pies[0].cy);
    const squeezed = setCells(table.id, [{ row: 2, col: 0, value: 1 }])(setup('slices').p);
    const t2 = squeezed.dataTables[0];
    const m = buildPieModel({ ...chart, pie: { ...chart.pie, labels: 'name-percent' } }, t2);
    expect(m.pies[0].slices[2].text).toBeNull();
  });

  it('draws and exports, with the colours of the parts', () => {
    const { p, table, chart } = setup('slices');
    const svg = chartToSvgString(chart, table);
    expect(svg).toMatch(/^<\?xml/);
    expect(svg).toContain('<path');
    expect(p.charts[0].type).toBe('slices');
  });
});

describe('10 × 10 dot plot', () => {
  it('has 100 dots, shared by the parts as their shares are', () => {
    const { p, table, chart } = setup('dotGrid');
    const t = setCells(table.id, [{ row: 0, col: 0, value: 76 }, { row: 1, col: 0, value: 24 }, { row: 2, col: 0, value: 0 }])(p).dataTables[0];
    const m = buildPieModel(chart, t);
    expect(m.pies).toHaveLength(1);
    expect(m.pies[0].slices.map((s) => circles(s.path))).toEqual([76, 24, 0]);
    expect(m.pies[0].slices.reduce((n, s) => n + circles(s.path), 0)).toBe(100);
    expect(m.pies[0].slices.every((s) => s.text === null)).toBe(true);
    void table;
  });

  it('splits a dot that two parts share, so that a share that is not a whole number of dots is kept', () => {
    const { p, table, chart } = setup('dotGrid');
    const t = setCells(table.id, [{ row: 0, col: 0, value: 1 }, { row: 1, col: 0, value: 2 }, { row: 2, col: 0, value: 0 }])(p).dataTables[0];
    const m = buildPieModel(chart, t);
    // 33.33 and 66.67 dots: dot 33 is shared.
    expect(m.pies[0].slices.map((s) => circles(s.path))).toEqual([34, 67, 0]);
  });

  it('keeps the exact share on the part', () => {
    const { table, chart } = setup('dotGrid');
    const m = buildPieModel(chart, table);
    expect(m.pies[0].slices[0].fraction).toBe(38 / 71);
  });

  it('survives labels and totals being asked for, draws and exports', () => {
    const { p, table } = setup('dotGrid');
    const q = patchLook(p.charts[0].id, { pie: { ...p.charts[0].pie, labels: 'percent', showTotal: true } })(p);
    const svg = chartToSvgString(q.charts[0], table);
    const total = buildPieModel(q.charts[0], table).pies[0].totalText;
    expect(total).not.toBeNull();
    expect(svg).toContain(total!);
    expect(svg).toMatch(/^<\?xml/);
  });
});
