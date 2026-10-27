import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import type { DataTable } from '../../model/types';
import { setCells, setRowTitles } from '../../state/commands';
import { planFill } from './fill';

/** A table whose cell (row, col) holds 10 * row + col, and whose row titles are "R<row>". */
const tableOf = (): DataTable => {
  const p0 = createExampleProject();
  const t0 = p0.dataTables[0];
  const rows = 4;
  const cols = 3;
  const edits = Array.from({ length: rows * cols }, (_, i) => ({ row: Math.floor(i / cols), col: i % cols, value: 10 * Math.floor(i / cols) + (i % cols) }));
  const p1 = setCells(t0.id, edits)(p0);
  const p2 = setRowTitles(t0.id, Array.from({ length: rows }, (_, row) => ({ row, title: `R${row}` })))(p1);
  return p2.dataTables.find((t) => t.id === t0.id)!;
};

describe('planFill', () => {
  const t = tableOf();
  it('down: copies the first row of the selection into the rows below it, in every selected column', () => {
    const r = planFill(t, { r0: 0, r1: 2, c0: 1, c1: 2 }, 'down');
    expect(r.ok && r.edits).toEqual([
      { row: 1, col: 1, value: 1 }, { row: 1, col: 2, value: 2 },
      { row: 2, col: 1, value: 1 }, { row: 2, col: 2, value: 2 },
    ]);
    expect(r.ok && r.titles).toEqual([]);
    expect(r.ok && r.message).toBe('Filled down: 4 cells.');
  });
  it('down, one row selected: copies the row above, titles too when the Row title column is selected', () => {
    const r = planFill(t, { r0: 2, r1: 2, c0: -1, c1: 0 }, 'down');
    expect(r.ok && r.edits).toEqual([{ row: 2, col: 0, value: 10 }]);
    expect(r.ok && r.titles).toEqual([{ row: 2, title: 'R1' }]);
  });
  it('down, first row alone: nothing above to fill from', () => {
    expect(planFill(t, { r0: 0, r1: 0, c0: 0, c1: 0 }, 'down')).toEqual({ ok: false, message: 'There is no row above to fill from.' });
  });
  it('right: copies the first column of the selection into the columns to its right, in every selected row', () => {
    const r = planFill(t, { r0: 1, r1: 2, c0: 0, c1: 2 }, 'right');
    expect(r.ok && r.edits).toEqual([
      { row: 1, col: 1, value: 10 }, { row: 2, col: 1, value: 20 },
      { row: 1, col: 2, value: 10 }, { row: 2, col: 2, value: 20 },
    ]);
  });
  it('right, one column selected: copies the column to the left', () => {
    const r = planFill(t, { r0: 0, r1: 1, c0: 2, c1: 2 }, 'right');
    expect(r.ok && r.edits).toEqual([{ row: 0, col: 2, value: 1 }, { row: 1, col: 2, value: 11 }]);
  });
  it('right: never fills from or into the Row title column', () => {
    expect(planFill(t, { r0: 0, r1: 0, c0: -1, c1: 0 }, 'right')).toEqual({ ok: false, message: 'There is no value column to the left to fill from.' });
    const r = planFill(t, { r0: 0, r1: 0, c0: -1, c1: 1 }, 'right');
    expect(r.ok && r.edits).toEqual([{ row: 0, col: 1, value: 0 }]);
    expect(r.ok && r.titles).toEqual([]);
  });
  it('stays inside the table and copies an empty cell as empty', () => {
    const r = planFill(t, { r0: 2, r1: t.rowCount + 50, c0: 0, c1: 99 }, 'down');
    expect(r.ok && r.edits.every((e) => e.row < t.rowCount && e.col < t.groups.length)).toBe(true);
    expect(r.ok && Math.max(...r.edits.map((e) => e.row))).toBe(t.rowCount - 1);
    const blank = { ...t, groups: t.groups.map((g, i) => (i === 0 ? { ...g, observations: g.observations.map((o, row) => (row === 0 ? { ...o, value: null } : o)) } : g)) };
    const f = planFill(blank, { r0: 0, r1: 1, c0: 0, c1: 0 }, 'down');
    expect(f.ok && f.edits).toEqual([{ row: 1, col: 0, value: null }]);
  });
  it('says what to do when there is nothing to fill', () => {
    expect(planFill(t, { r0: 0, r1: 0, c0: 2, c1: 2 }, 'right').ok).toBe(true);
    expect(planFill(t, { r0: 0, r1: 3, c0: 2, c1: 2 }, 'right').ok).toBe(true);
    expect(planFill(t, { r0: t.rowCount + 3, r1: t.rowCount + 3, c0: 0, c1: 0 }, 'down')).toMatchObject({ ok: false, message: expect.stringMatching(/Select the cells/) });
  });
});

import { planSeries, suggestSeries } from './fill';
import { gridJump } from './gridKeys';

describe('planSeries', () => {
  const t = tableOf();
  it('down: start, start + step ... in each selected column, from the first selected row', () => {
    const r = planSeries(t, { r0: 1, r1: 3, c0: 0, c1: 1 }, 5, 0.5, 'down');
    expect(r.ok && r.edits).toEqual([
      { row: 1, col: 0, value: 5 }, { row: 2, col: 0, value: 5.5 }, { row: 3, col: 0, value: 6 },
      { row: 1, col: 1, value: 5 }, { row: 2, col: 1, value: 5.5 }, { row: 3, col: 1, value: 6 },
    ]);
  });
  it('across: the series runs along the columns of each selected row', () => {
    const r = planSeries(t, { r0: 0, r1: 1, c0: 0, c1: 2 }, 1, 2, 'across');
    expect(r.ok && r.edits.filter((e) => e.row === 0).map((e) => e.value)).toEqual([1, 3, 5]);
    expect(r.ok && r.edits).toHaveLength(6);
  });
  it('takes the rounding noise off, leaves the Row title column alone and stays inside the table', () => {
    const r = planSeries(t, { r0: 0, r1: 3, c0: -1, c1: 0 }, 0, 0.1, 'down');
    expect(r.ok && r.edits.map((e) => e.value)).toEqual([0, 0.1, 0.2, 0.3]);
    expect(r.ok && r.edits.every((e) => e.col === 0)).toBe(true);
    const wide = planSeries(t, { r0: 0, r1: t.rowCount + 20, c0: 0, c1: 99 }, 1, 1, 'down');
    expect(wide.ok && wide.edits.every((e) => e.row < t.rowCount && e.col < t.groups.length)).toBe(true);
  });
  it('refuses a start or step that is not a number, and an empty selection', () => {
    expect(planSeries(t, { r0: 0, r1: 1, c0: 0, c1: 0 }, NaN, 1, 'down')).toEqual({ ok: false, message: 'The start and the step must be numbers.' });
    expect(planSeries(t, { r0: t.rowCount + 2, r1: t.rowCount + 3, c0: 0, c1: 0 }, 1, 1, 'down').ok).toBe(false);
  });
  it('suggests the first value and its distance to the next, or 1 and 1', () => {
    expect(suggestSeries(t, { r0: 0, r1: 3, c0: 0, c1: 0 }, 'down')).toEqual({ start: 0, step: 10 });
    expect(suggestSeries(t, { r0: 0, r1: 0, c0: 0, c1: 2 }, 'across')).toEqual({ start: 0, step: 1 });
    expect(suggestSeries(t, { r0: t.rowCount + 5, r1: t.rowCount + 5, c0: 0, c1: 0 }, 'down')).toEqual({ start: 1, step: 1 });
  });
});

describe('gridJump', () => {
  it('Home goes to the Row title column of the row, Ctrl+Home to the first cell', () => {
    expect(gridJump('Home', false, { r: 7, c: 2 }, 50, 4)).toEqual({ r: 7, c: -1 });
    expect(gridJump('Home', true, { r: 7, c: 2 }, 50, 4)).toEqual({ r: 0, c: -1 });
  });
  it('End goes to the last column of the row, Ctrl+End to the last cell', () => {
    expect(gridJump('End', false, { r: 7, c: 0 }, 50, 4)).toEqual({ r: 7, c: 3 });
    expect(gridJump('End', true, { r: 7, c: 0 }, 50, 4)).toEqual({ r: 49, c: 3 });
    expect(gridJump('End', true, { r: 0, c: 0 }, 0, 0)).toEqual({ r: 0, c: -1 });
  });
  it('ignores other keys', () => {
    expect(gridJump('ArrowDown', false, { r: 0, c: 0 }, 5, 5)).toBeNull();
  });
});
