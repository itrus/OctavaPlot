import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../defaults';
import type { DataTable, Project, ReplicateLayout } from '../types';
import { addDataTable, replaceTableData, setExcluded } from '../../state/commands';
import { autoOffsetStep, offsetStepOf, offsetTable } from './offset';
import { xySeries } from './tableLayout';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
/** An XY table of the layout with the given columns of rows [X, ...columns]. */
const table = (rows: Array<Array<number | null>>, names: string[], layout?: ReplicateLayout): DataTable =>
  tableOf(replaceTableData('t', { names, titles: null, values: rows })(addDataTable('t', 'xy', { sample: true, ...(layout ? { layout } : {}) })(createExampleProject())));
const col = (t: DataTable, i: number) => t.groups[i].observations.map((o) => o.value);

describe('offset traces: the step', () => {
  it('is a little more than the largest range of a trace, rounded up to two significant digits', () => {
    // Ranges 10 and 3: 10 + 10% = 11.
    expect(autoOffsetStep(table([[1, 0, 5], [2, 10, 8]], ['X', 'A', 'B']))).toBe(11);
    // A range of 7.3 is 8.03 with the 10%, so 8.1.
    expect(autoOffsetStep(table([[1, 0, 1], [2, 7.3, 2]], ['X', 'A', 'B']))).toBe(8.1);
    expect(autoOffsetStep(table([[1, 0, 0.001], [2, 0.0073, 0.002]], ['X', 'A', 'B']))).toBeCloseTo(0.0081, 12);
  });
  it('is 1 when there is nothing to measure, and is the chart\'s own step when it has one', () => {
    expect(autoOffsetStep(table([[1, 5, 5], [2, 5, 5]], ['X', 'A', 'B']))).toBe(1);
    const t = table([[1, 0, 5], [2, 10, 8]], ['X', 'A', 'B']);
    expect(offsetStepOf(null, t)).toBe(11);
    expect(offsetStepOf(3, t)).toBe(3);
    expect(offsetStepOf(0, t)).toBe(0);
  });
  it('leaves out excluded values', () => {
    let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
    p = replaceTableData('t', { names: ['X', 'A'], titles: null, values: [[1, 0], [2, 4], [3, 1000]] })(p);
    p = setExcluded('t', [{ col: 1, row: 2 }], true)(p);
    expect(autoOffsetStep(tableOf(p))).toBe(4.4);
  });
});

describe('offset traces: the shifted table', () => {
  it('lifts trace i by i steps, keeps the first where it is and missing values missing, and never changes the table it is given', () => {
    const t = table([[1, 1, 2, 3], [2, null, 5, 6], [3, 3, 4, 5]], ['X', 'A', 'B', 'C']);
    const before = JSON.stringify(t);
    const s = offsetTable(t, 10);
    expect(col(s, 1)).toEqual([1, null, 3]);
    expect(col(s, 2)).toEqual([12, 15, 14]);
    expect(col(s, 3)).toEqual([23, 26, 25]);
    expect(col(s, 0)).toEqual(col(t, 0));
    expect(s.groups[1]).toBe(t.groups[1]);
    expect(JSON.stringify(t)).toBe(before);
  });
  it('is the same table for a step of 0', () => {
    const t = table([[1, 1, 2]], ['X', 'A', 'B']);
    expect(offsetTable(t, 0)).toBe(t);
  });
  it('moves every replicate of a trace, so the mean moves and the spread does not', () => {
    const t = table([[1, 1, 2, 3, 4, 5, 6]], ['X', 'A1', 'A2', 'A3', 'B1', 'B2', 'B3'], { kind: 'replicates', n: 3 });
    const s = offsetTable(t, 100);
    expect(xySeries(s)).toHaveLength(2);
    expect(xySeries(s)[1].columns.map((c) => c.observations[0].value)).toEqual([104, 105, 106]);
    expect(xySeries(s)[0].columns.map((c) => c.observations[0].value)).toEqual([1, 2, 3]);
  });
  it('moves the centre of an entered summary and not its SD, and all three of a mean with limits', () => {
    const sd = table([[1, 10, 1, 20, 2]], ['X', 'Mean', 'SD', 'Mean', 'SD'], { kind: 'summary', format: 'mean-sd' });
    const a = offsetTable(sd, 5);
    expect([2, 3, 4].map((i) => col(a, i)[0])).toEqual([1, 25, 2]);
    const lim = table([[1, 10, 12, 8, 20, 23, 18]], ['X', 'Mean', 'Upper', 'Lower', 'Mean', 'Upper', 'Lower'], { kind: 'summary', format: 'mean-limits' });
    const b = offsetTable(lim, 5);
    expect([4, 5, 6].map((i) => col(b, i)[0])).toEqual([25, 28, 23]);
    expect([1, 2, 3].map((i) => col(b, i)[0])).toEqual([10, 12, 8]);
  });
  it('keeps what is excluded excluded', () => {
    let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
    p = replaceTableData('t', { names: ['X', 'A', 'B'], titles: null, values: [[1, 1, 2], [2, 3, 4]] })(p);
    p = setExcluded('t', [{ col: 2, row: 0 }], true)(p);
    expect(tableOf(p).groups[2].observations[0].excluded).toBe(true);
    expect(offsetTable(tableOf(p), 10).groups[2].observations[0].excluded).toBe(true);
  });
});
