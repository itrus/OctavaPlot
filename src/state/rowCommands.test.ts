import { describe, expect, it } from 'vitest';
import { createContingencyTable, createExampleProject, createGroupedTable, createSurvivalTable, createXyTable, INITIAL_ROWS } from '../model/defaults';
import { assertTableInvariants } from '../testing/tableChecks';
import type { DataTable, Project } from '../model/types';
import { addRows, appendRows, deleteRows, duplicateRows, insertRows, MAX_TABLE_ROWS, rowRoom, setCells, setExcluded, setRowTitles, composeCommands, type Command } from './commands';
import { historyReducer, initialHistory } from './history';

/** An example project whose table has titled rows 0..3 with values, row 1 excluded in column 0 (with a reason). */
const setup = () => {
  let p: Project = createExampleProject();
  const id = p.dataTables[0].id;
  p = composeCommands(
    setRowTitles(id, [0, 1, 2, 3].map((row) => ({ row, title: `r${row}` }))),
    setCells(id, [0, 1, 2, 3].map((row) => ({ row, col: 0, value: 10 + row }))),
    setExcluded(id, [{ row: 1, col: 0 }], true, 'outlier'),
  )(p);
  return { p, id, t: p.dataTables[0] };
};
const tableOf = (p: Project, id: string) => p.dataTables.find((t) => t.id === id) as DataTable;
const titles = (t: DataTable, n = 6) => t.rows.slice(0, n).map((r) => r.title);
const col0 = (t: DataTable, n = 6) => t.groups[0].observations.slice(0, n).map((o) => o.value);

/** One commit, then undo and redo: the table must come back identical each way. */
function oneUndoStep(p: Project, id: string, command: Command) {
  const h = historyReducer(initialHistory(p), { type: 'commit', label: 'rows', command, now: 0 });
  expect(h.past).toHaveLength(1);
  expect(tableOf(h.present, id)).not.toBe(tableOf(p, id));
  const undone = historyReducer(h, { type: 'undo' });
  expect(tableOf(undone.present, id)).toBe(tableOf(p, id));
  const redone = historyReducer(undone, { type: 'redo' });
  expect(tableOf(redone.present, id)).toBe(tableOf(h.present, id));
  return tableOf(h.present, id);
}

describe('insertRows', () => {
  it('inserts blank rows with fresh ids and keeps every other row, id, observation id and exclusion', () => {
    const { p, id, t } = setup();
    const q = tableOf(insertRows(id, 1, 2)(p), id);
    expect(q.rowCount).toBe(INITIAL_ROWS + 2);
    expect(() => assertTableInvariants(q)).not.toThrow();
    expect(titles(q)).toEqual(['r0', '', '', 'r1', 'r2', 'r3']);
    expect(col0(q)).toEqual([10, null, null, 11, 12, 13]);
    // The rows that stay are the very same objects: ids, titles and exclusions travel with them.
    expect(q.rows[0]).toBe(t.rows[0]);
    expect(q.rows[3]).toBe(t.rows[1]);
    expect(q.groups[0].observations[3]).toBe(t.groups[0].observations[1]);
    expect(q.groups[0].observations[3]).toMatchObject({ excluded: true, excludedReason: 'outlier' });
    expect(q.groups[0].observations[1].excluded).toBeUndefined();
    const ids = new Set([...q.rows.map((r) => r.id), ...q.groups.flatMap((g) => g.observations.map((o) => o.id))]);
    expect(ids.size).toBe(q.rows.length + q.groups.length * q.rowCount);
  });
  it('inserts at the end and the start, clamps the position, and ignores a bad count', () => {
    const { p, id, t } = setup();
    expect(tableOf(insertRows(id, 0)(p), id).rows[1]).toBe(t.rows[0]);
    expect(tableOf(insertRows(id, 999999)(p), id).rows[INITIAL_ROWS]).toMatchObject({ title: '' });
    expect(tableOf(insertRows(id, -5)(p), id).rows[1]).toBe(t.rows[0]);
    expect(insertRows(id, 0, 0)(p)).toBe(p);
    expect(insertRows(id, 0, 1.5)(p)).toBe(p);
    expect(insertRows('missing', 0)(p)).toBe(p);
  });
  it('is refused when the table would pass the limit', () => {
    const { p, id } = setup();
    const full = addRows(id, MAX_TABLE_ROWS - INITIAL_ROWS)(p);
    expect(rowRoom(tableOf(full, id))).toBe(0);
    expect(insertRows(id, 0)(full)).toBe(full);
    expect(duplicateRows(id, [0])(full)).toBe(full);
    expect(appendRows(id, 5)(full)).toBe(full);
  });
  it('is one undo step', () => {
    const { p, id } = setup();
    oneUndoStep(p, id, insertRows(id, 2));
  });
});

describe('deleteRows', () => {
  it('removes the rows with their titles, values and exclusions; the rest keep their ids', () => {
    const { p, id, t } = setup();
    const q = tableOf(deleteRows(id, [1, 2])(p), id);
    expect(q.rowCount).toBe(INITIAL_ROWS - 2);
    expect(() => assertTableInvariants(q)).not.toThrow();
    expect(titles(q, 3)).toEqual(['r0', 'r3', t.rows[4].title]);
    expect(col0(q, 3)).toEqual([10, 13, t.groups[0].observations[4].value]);
    expect(q.rows[1]).toBe(t.rows[3]);
    expect(q.groups[0].observations[1]).toBe(t.groups[0].observations[3]);
    expect(q.groups.every((g) => g.observations.every((o) => o.excluded !== true))).toBe(true);
  });
  it('ignores bad and repeated rows, and is a no-op when nothing valid is left', () => {
    const { p, id } = setup();
    expect(tableOf(deleteRows(id, [2, 2, -1, 1e9, 0.5])(p), id).rowCount).toBe(INITIAL_ROWS - 1);
    expect(deleteRows(id, [-1, 1e9])(p)).toBe(p);
    expect(deleteRows(id, [])(p)).toBe(p);
  });
  it('refuses to remove every row', () => {
    const { p, id } = setup();
    expect(deleteRows(id, Array.from({ length: INITIAL_ROWS }, (_, i) => i))(p)).toBe(p);
    const one = tableOf(deleteRows(id, Array.from({ length: INITIAL_ROWS - 1 }, (_, i) => i + 1))(p), id);
    expect(one.rowCount).toBe(1);
    expect(titles(one, 1)).toEqual(['r0']);
  });
  it('is one undo step, and the charts of the table keep working', () => {
    const { p, id } = setup();
    const q = oneUndoStep(p, id, deleteRows(id, [0, 1]));
    expect(q.rowCount).toBe(INITIAL_ROWS - 2);
  });
});

describe('duplicateRows', () => {
  it('copies the rows (title, value, exclusion) as a block after the last selected row, with new ids', () => {
    const { p, id, t } = setup();
    const q = tableOf(duplicateRows(id, [1, 2])(p), id);
    expect(q.rowCount).toBe(INITIAL_ROWS + 2);
    expect(() => assertTableInvariants(q)).not.toThrow();
    expect(titles(q)).toEqual(['r0', 'r1', 'r2', 'r1', 'r2', 'r3']);
    expect(col0(q)).toEqual([10, 11, 12, 11, 12, 13]);
    expect(q.rows[1]).toBe(t.rows[1]);
    expect(q.rows[2]).toBe(t.rows[2]);
    expect(q.rows[5]).toBe(t.rows[3]);
    expect(q.rows[3].id).not.toBe(t.rows[1].id);
    expect(q.groups[0].observations[3].id).not.toBe(t.groups[0].observations[1].id);
    expect(q.groups[0].observations[3]).toMatchObject({ value: 11, excluded: true, excludedReason: 'outlier' });
    expect(q.groups[0].observations[1]).toBe(t.groups[0].observations[1]);
  });
  it('copies a separated selection in table order and is one undo step', () => {
    const { p, id } = setup();
    const q = oneUndoStep(p, id, duplicateRows(id, [3, 0]));
    expect(titles(q, 7)).toEqual(['r0', 'r1', 'r2', 'r3', 'r0', 'r3', '']);
  });
  it('ignores bad rows', () => {
    const { p, id } = setup();
    expect(duplicateRows(id, [-1, INITIAL_ROWS])(p)).toBe(p);
    expect(duplicateRows(id, [])(p)).toBe(p);
  });
});

describe('appendRows', () => {
  it('adds blank rows at the end and keeps the rest', () => {
    const { p, id, t } = setup();
    const q = tableOf(appendRows(id, 7)(p), id);
    expect(q.rowCount).toBe(INITIAL_ROWS + 7);
    expect(q.rows.slice(0, INITIAL_ROWS)).toEqual(t.rows);
    expect(() => assertTableInvariants(q)).not.toThrow();
  });
  it('is bounded: it adds only what fits, and nothing for a bad count', () => {
    const { p, id } = setup();
    expect(tableOf(appendRows(id, 10 * MAX_TABLE_ROWS)(p), id).rowCount).toBe(MAX_TABLE_ROWS);
    expect(appendRows(id, 0)(p)).toBe(p);
    expect(appendRows(id, -3)(p)).toBe(p);
    expect(appendRows(id, 2.5)(p)).toBe(p);
  });
  it('is one undo step', () => {
    const { p, id } = setup();
    oneUndoStep(p, id, appendRows(id, 10));
  });
});

describe('every kind of table holds rows the same way', () => {
  const tables: Array<[string, DataTable]> = [
    ['xy replicates', createXyTable('xy', true, { kind: 'replicates', n: 3 })],
    ['grouped replicates', createGroupedTable('g', true, { kind: 'replicates', n: 2 })],
    ['xy summary', createXyTable('s', true, { kind: 'summary', format: 'mean-sd-n' })],
    ['contingency', createContingencyTable('c', true)],
    ['survival', createSurvivalTable('v', true)],
  ];
  it.each(tables)('%s: insert, duplicate and delete keep every column aligned', (_, table) => {
    const p: Project = { ...createExampleProject(), dataTables: [table] };
    const id = table.id;
    const withTitle = setRowTitles(id, [{ row: 0, title: 'first' }])(p);
    for (const cmd of [insertRows(id, 0, 3), duplicateRows(id, [0]), deleteRows(id, [0]), appendRows(id, 4)]) {
      const q = tableOf(cmd(withTitle), id);
      expect(() => assertTableInvariants(q)).not.toThrow();
      expect(q.groups).toHaveLength(table.groups.length);
    }
    const dup = tableOf(duplicateRows(id, [0])(withTitle), id);
    expect(dup.rows[1].title).toBe('first');
    expect(dup.groups.map((g) => g.observations[1].value)).toEqual(table.groups.map((g) => g.observations[0].value));
  });
});

describe('ragged tables', () => {
  /** A table whose rows list is short and one column is short: what an older or damaged file may hold. */
  const ragged = (): { p: Project; id: string } => {
    const { p, id } = setup();
    const t = tableOf(p, id);
    const short: DataTable = {
      ...t,
      rowCount: 6,
      rows: t.rows.slice(0, 4),
      groups: t.groups.map((g, i) => ({ ...g, observations: g.observations.slice(0, i === 0 ? 6 : 3) })),
    };
    return { p: { ...p, dataTables: [short] }, id };
  };
  it('every operation yields an aligned table with unique ids', () => {
    const { p, id } = ragged();
    for (const cmd of [insertRows(id, 2), duplicateRows(id, [4, 5]), deleteRows(id, [0, 5]), appendRows(id, 2)]) {
      const q = tableOf(cmd(p), id);
      expect(() => assertTableInvariants(q)).not.toThrow();
    }
    const q = tableOf(duplicateRows(id, [5])(p), id);
    expect(q.rowCount).toBe(7);
    expect(q.rows[6].title).toBe('');
    expect(q.groups[1].observations[6].value).toBeNull();
    expect(q.groups[0].observations[1]).toMatchObject({ excluded: true });
  });
});
