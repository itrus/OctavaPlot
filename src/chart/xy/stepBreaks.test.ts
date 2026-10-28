import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import type { ChartType, Project, TableKind } from '../../model/types';
import { addChart, addDataTable, patchAxis, replaceTableData } from '../../state/commands';
import { buildAnyModel } from '../anyModel';
import { chartToSvgString } from '../export/export';
import type { XyModel } from './xyModel';

/** The subpaths of a path of M, L, H and V commands, each as its list of [x, y] vertices (H and V keep the other coordinate). */
const runsOf = (d: string): number[][][] =>
  d.split(/(?=M)/).filter(Boolean).map((run) => {
    const out: number[][] = [];
    for (const m of run.matchAll(/([MLHV])(-?[\d.]+)(?:,(-?[\d.]+))?/g)) {
      const prev = out[out.length - 1] ?? [0, 0];
      const v = Number(m[2]);
      out.push(m[1] === 'H' ? [v, prev[1]] : m[1] === 'V' ? [prev[0], v] : [v, Number(m[3])]);
    }
    return out;
  });

const make = (kind: TableKind, type: ChartType, names: string[], values: number[][]): Project => {
  const p = replaceTableData('t', { names, titles: null, values })(addDataTable('t', kind, { sample: true })(createExampleProject()));
  return addChart('c', 't', undefined, type)(p);
};
const withBreak = (p: Project, on = true) => patchAxis('c', 'xAxis', { min: 0, max: 100, breaks: on ? [{ from: 30, to: 70 }] : [] })(p);
const model = (p: Project): XyModel => buildAnyModel(p.charts.find((c) => c.id === 'c')!, p.dataTables.find((t) => t.id === 't')!).model as XyModel;

describe('a step whose time lies in an omitted range of the axis is not drawn at the edge of the gap', () => {
  // Events at 10, 50 and 90 and a censoring at 95: the estimate is 0.75, 0.5, 0.25 after the three events.
  const survival = () => make('survival', 'survival', ['Time', 'A'], [[10, 1], [50, 1], [90, 1], [95, 0]]);

  it('survival: the line is cut at the gap; the level before ends at one edge and the new level begins at the other, with no drop between', () => {
    const m = model(withBreak(survival()));
    const runs = runsOf(m.series[0].linePath);
    expect(runs).toHaveLength(2);
    const [left, right] = runs;
    // The drop at 10 is before the gap: drawn, as a vertical step.
    expect(left.some((q, i) => i > 0 && Math.abs(q[0] - left[i - 1][0]) < 0.01 && Math.abs(q[0] - m.xScale(10)) < 0.1)).toBe(true);
    // The first piece ends on the lower edge of the gap at the level after that drop.
    const end = left[left.length - 1];
    expect(end[0]).toBeCloseTo(m.xScale(30), 1);
    expect(end[1]).toBeCloseTo(m.yScale(0.75), 1);
    // The second begins on the upper edge at the level after the drop at 50, which happened inside the gap.
    expect(right[0][0]).toBeCloseTo(m.xScale(70), 1);
    expect(right[0][1]).toBeCloseTo(m.yScale(0.5), 1);
    // No vertical stroke stands on either edge of the gap.
    for (const run of runs) for (let i = 1; i < run.length; i++) {
      const vertical = Math.abs(run[i][0] - run[i - 1][0]) < 0.01 && Math.abs(run[i][1] - run[i - 1][1]) > 0.01;
      if (vertical) for (const edge of [30, 70]) expect(Math.abs(run[i][0] - m.xScale(edge))).toBeGreaterThan(0.5);
    }
  });
  it('survival: still draws the drop after the gap, and the same plain path when no axis is broken', () => {
    const m = model(withBreak(survival()));
    const right = runsOf(m.series[0].linePath)[1];
    expect(right.some((q, i) => i > 0 && Math.abs(q[0] - right[i - 1][0]) < 0.01 && Math.abs(q[0] - m.xScale(90)) < 0.1)).toBe(true);
    const plain = model(withBreak(survival(), false)).series[0].linePath;
    expect(plain).toMatch(/^M[\d.,-]+(H[\d.-]+V[\d.-]+)+H[\d.-]+$/);
    expect(runsOf(plain)).toHaveLength(1);
  });
  it('a cumulative distribution is cut the same way', () => {
    const p = withBreak(make('column', 'ecdf', ['A'], [[10], [50], [90]]));
    const m = model(p);
    const runs = runsOf(m.series[0].linePath);
    expect(runs).toHaveLength(2);
    const [first, second, third] = m.series[0].points;
    const end = runs[0][runs[0].length - 1];
    expect(end[0]).toBeCloseTo(m.xScale(30), 1);
    expect(end[1]).toBeCloseTo(m.yScale(first.y), 1);
    expect(runs[1][0][0]).toBeCloseTo(m.xScale(70), 1);
    expect(runs[1][0][1]).toBeCloseTo(m.yScale(second.y), 1);
    expect(runs[1].some((q, i) => i > 0 && Math.abs(q[0] - runs[1][i - 1][0]) < 0.01 && Math.abs(q[0] - m.xScale(90)) < 0.1 && Math.abs(q[1] - m.yScale(third.y)) < 0.1)).toBe(true);
  });
  it('a cumulative distribution without a break keeps its plain path', () => {
    const plain = model(withBreak(make('column', 'ecdf', ['A'], [[10], [50], [90]]), false)).series[0].linePath;
    expect(plain).toMatch(/^M[\d.,-]+(H[\d.-]+V[\d.-]+)+H[\d.-]+$/);
  });
  it('draws without a number that is not a number', () => {
    for (const p of [withBreak(survival()), withBreak(make('column', 'ecdf', ['A'], [[10], [50], [90]]))]) {
      expect(chartToSvgString(p.charts.find((c) => c.id === 'c')!, p.dataTables.find((t) => t.id === 't')!)).not.toContain('NaN');
    }
  });
});
