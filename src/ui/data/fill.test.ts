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
