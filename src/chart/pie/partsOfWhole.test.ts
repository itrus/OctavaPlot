import { describe, expect, it } from 'vitest';
import { createChart, createContingencyTable } from '../../model/defaults';
import type { DataTable, Project } from '../../model/types';
import { patchLook, setCells } from '../../state/commands';
import { chartToSvgString } from '../export/export';
import { dotAllocation, dotsPath } from './pieModel';
import { buildPieModel } from './pieModel';

const setup = (type: 'slices' | 'dotGrid') => {
  const table: DataTable = createContingencyTable('Outcomes', true); // Treated 38/12, Control 21/29
  const chart = createChart(table.id, undefined, type);
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const circles = (d: string) => (d.match(/M/g) ?? []).length;

describe('dotAllocation', () => {
  it('always uses 100 dots, by the largest remainders, the earlier part first on a tie', () => {
    expect(dotAllocation([38, 12])).toEqual([76, 24]);
    expect(dotAllocation([1, 1, 1])).toEqual([34, 33, 33]);
    expect(dotAllocation([1, 2])).toEqual([33, 67]);
    expect(dotAllocation([1, 0, 1])).toEqual([50, 0, 50]);
    for (const w of [[7, 11, 13, 2], [1, 1e6], [3, 3, 3, 3, 3, 3, 3]]) expect(dotAllocation(w).reduce((a, b) => a + b, 0)).toBe(100);
  });
  it('gives no dots to a part with no weight, and none at all when nothing has any', () => {
    expect(dotAllocation([0, 5])).toEqual([0, 100]);
    expect(dotAllocation([0, 0])).toEqual([0, 0]);
  });
  it('never makes a part with a weight smaller than its share rounded down', () => {
    const w = [1, 99.4, 0.3];
    const counts = dotAllocation(w);
    const total = w.reduce((a, b) => a + b, 0);
    counts.forEach((c, i) => expect(c).toBeGreaterThanOrEqual(Math.floor((w[i] / total) * 100)));
  });
});

describe('dotsPath', () => {
  it('is one circle for each dot, and nothing for none', () => {
    expect(circles(dotsPath(50, 50, 100, 0, 7))).toBe(7);
    expect(dotsPath(50, 50, 100, 30, 30)).toBe('');
  });
});

describe('slices (one bar of parts for each row)', () => {
  it('makes a bar for each row with a segment as wide as each share, side by side', () => {
    const { table, chart } = setup('slices');
    const m = buildPieModel(chart, table);
    expect(m.pies.map((p) => p.title)).toEqual(['Treated', 'Control']);
    const widths = (i: number) => m.pies[i].slices.map((s) => {
      const [, x0, , y0] = /M([\d.-]+),([\d.-]+)H([\d.-]+)V/.exec(s.path)!.map(Number);
      return { x0, x1: Number(/H([\d.-]+)V/.exec(s.path)![1]), y0 };
    });
    const w = widths(0);
    expect(w[1].x0).toBeCloseTo(w[0].x1, 1);
    expect((w[0].x1 - w[0].x0) / (w[1].x1 - w[0].x0)).toBeCloseTo(0.76, 2);
    // The second row is under the first, in the same columns.
    expect(m.pies[1].cy).toBeGreaterThan(m.pies[0].cy);
    expect(widths(1)[0].x0).toBeCloseTo(w[0].x0, 1);
  });

  it('writes the shares under the segments, and leaves out a text wider than its segment', () => {
    const { table, chart } = setup('slices');
    const withText = buildPieModel({ ...chart, pie: { ...chart.pie, labels: 'percent' } }, table);
    expect(withText.pies[0].slices.map((s) => s.text?.content)).toEqual(['76.0%', '24.0%']);
    expect(withText.pies[0].slices[0].text!.y).toBeGreaterThan(withText.pies[0].cy);
    const squeezed = setCells(table.id, [{ row: 0, col: 1, value: 1 }])(setup('slices').p);
    const t2 = squeezed.dataTables[0];
    const m = buildPieModel({ ...chart, pie: { ...chart.pie, labels: 'name-percent' } }, t2);
    expect(m.pies[0].slices[1].text).toBeNull();
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
  it('has 100 dots for each row, shared by the parts as their shares are', () => {
    const { table, chart } = setup('dotGrid');
    const m = buildPieModel(chart, table);
    expect(m.pies[0].slices.map((s) => circles(s.path))).toEqual([76, 24]);
    expect(m.pies[1].slices.map((s) => circles(s.path))).toEqual([42, 58]);
    expect(m.pies.every((p) => p.slices.reduce((n, s) => n + circles(s.path), 0) === 100)).toBe(true);
    expect(m.pies[0].slices.every((s) => s.text === null)).toBe(true);
  });

  it('has the same grid in every row, and the exact share stays on the part', () => {
    const { table, chart } = setup('dotGrid');
    const m = buildPieModel(chart, table);
    expect(m.pies[0].slices[0].fraction).toBe(0.76);
    expect(m.pies[0].r).toBeCloseTo(m.pies[1].r, 9);
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
