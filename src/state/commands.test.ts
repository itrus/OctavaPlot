import { describe, expect, it } from 'vitest';
import { createExampleProject, INITIAL_ROWS } from '../model/defaults';
import { MAX_ROW_TITLE_CHARS } from '../model/rows';
import { assertTableInvariants, permuteRows } from '../testing/tableChecks';
import { groupObjectIds, resetGroupStyle } from '../model/style';
import type { Project } from '../model/types';
import {
  addDataTable,
  addGroup,
  addRows,
  composeCommands,
  patchStyle,
  pasteMatrix,
  removeGroup,
  setCells,
  setRowTitles,
} from './commands';
import { historyReducer, initialHistory, type HistoryState } from './history';

const setup = () => {
  const p = createExampleProject();
  return { p, t: p.dataTables[0], chartId: p.charts[0].id };
};
const table = (p: Project) => p.dataTables[0];

describe('setRowTitles', () => {
  it('sanitises titles', () => {
    const { p, t } = setup();
    const q = setRowTitles(t.id, [{ row: 1, title: ' a\r\n  b ' }])(p);
    expect(table(q).rows[1].title).toBe('a b');
    expect(table(q).rows[1].id).toBe(t.rows[1].id);
    expect(table(q).rows[0]).toBe(t.rows[0]);
    const long = setRowTitles(t.id, [{ row: 0, title: 'x'.repeat(500) }])(p);
    expect(table(long).rows[0].title).toHaveLength(MAX_ROW_TITLE_CHARS);
  });
  it('returns the same project for no-ops and bad rows', () => {
    const { p, t } = setup();
    expect(setRowTitles(t.id, [{ row: 0, title: '' }])(p)).toBe(p);
    expect(setRowTitles(t.id, [{ row: -1, title: 'a' }, { row: 999, title: 'a' }, { row: 0.5, title: 'a' }])(p)).toBe(p);
    expect(setRowTitles('missing', [{ row: 0, title: 'a' }])(p)).toBe(p);
    expect(setRowTitles(t.id, [])(p)).toBe(p);
  });
});

describe('no-op identity', () => {
  it('setCells with unchanged values returns the same project', () => {
    const { p, t } = setup();
    expect(setCells(t.id, [{ row: 0, col: 0, value: t.groups[0].observations[0].value }])(p)).toBe(p);
    expect(setCells(t.id, [{ row: 99, col: 0, value: 1 }])(p)).toBe(p);
    expect(setCells(t.id, [{ row: 0, col: 0, value: 42 }])(p)).not.toBe(p);
  });
  it('addRows(0) returns the same project', () => {
    const { p, t } = setup();
    expect(addRows(t.id, 0)(p)).toBe(p);
  });
});

describe('lockstep growth', () => {
  it('addRows adds rows and observations together', () => {
    const { p, t } = setup();
    const q = addRows(t.id, 3)(p);
    expect(table(q).rowCount).toBe(INITIAL_ROWS + 3);
    expect(() => assertTableInvariants(table(q))).not.toThrow();
    expect(table(q).rows.slice(0, INITIAL_ROWS)).toEqual(t.rows);
  });
  it('pasteMatrix grows rows, adds groups and sets titles', () => {
    const { p, t } = setup();
    const q = pasteMatrix(t.id, INITIAL_ROWS - 1, 3, [[1, 2], [3, 4]], ['a', 'b'])(p);
    expect(table(q).rowCount).toBe(INITIAL_ROWS + 1);
    expect(table(q).groups).toHaveLength(5);
    expect(table(q).rows[INITIAL_ROWS - 1].title).toBe('a');
    expect(table(q).rows[INITIAL_ROWS].title).toBe('b');
    expect(() => assertTableInvariants(table(q))).not.toThrow();
  });
  it('a titles-only paste adds no group and may grow rows', () => {
    const { p, t } = setup();
    const q = pasteMatrix(t.id, 2, 10, [], ['x', 'y'])(p);
    expect(table(q).groups).toHaveLength(t.groups.length);
    expect(table(q).rows[2].title).toBe('x');
    const r = pasteMatrix(t.id, INITIAL_ROWS, 0, [], ['z'])(p);
    expect(table(r).rowCount).toBe(INITIAL_ROWS + 1);
    expect(table(r).rows[INITIAL_ROWS].title).toBe('z');
    expect(() => assertTableInvariants(table(r))).not.toThrow();
  });
  it('addDataTable creates aligned rows', () => {
    const { p } = setup();
    const q = addDataTable('table_new')(p);
    expect(() => assertTableInvariants(q.dataTables[1])).not.toThrow();
    expect(q.dataTables[1].rows).toHaveLength(INITIAL_ROWS);
  });
});

describe('composeCommands', () => {
  it('forms one undo step', () => {
    const { p, t } = setup();
    const cmd = composeCommands(setRowTitles(t.id, [{ row: 0, title: 'a' }]), setCells(t.id, [{ row: 0, col: 0, value: 9 }]));
    const h = historyReducer(initialHistory(p), { type: 'commit', label: 'both', command: cmd, now: 0 });
    expect(h.past).toHaveLength(1);
    expect(table(h.present).rows[0].title).toBe('a');
    expect(table(historyReducer(h, { type: 'undo' }).present)).toBe(table(p));
  });
  it('returns the same project when every command is a no-op', () => {
    const { p, t } = setup();
    expect(composeCommands(setRowTitles(t.id, []), addRows(t.id, 0))(p)).toBe(p);
  });
});

describe('removeGroup', () => {
  it('prunes the object overrides of the group and undo restores them', () => {
    const { p, t } = setup();
    const g = t.groups[0];
    const layer = p.charts[0].layers[0];
    const withObjects: Project = {
      ...p,
      charts: [
        {
          ...p.charts[0],
          layers: [
            {
              ...layer,
              objectOverrides: {
                [`${g.id}:bar`]: { barOpacity: 0.5 },
                [g.observations[0].id]: { symbolSizePt: 9 },
                [t.groups[1].observations[0].id]: { symbolSizePt: 8 },
              },
            },
          ],
        },
      ],
    };
    const h1 = historyReducer(initialHistory(withObjects), { type: 'commit', label: 'remove', command: removeGroup(t.id, g.id), now: 0 });
    expect(Object.keys(h1.present.charts[0].layers[0].objectOverrides)).toEqual([t.groups[1].observations[0].id]);
    expect(historyReducer(h1, { type: 'undo' }).present).toBe(withObjects);
  });
});

describe('groupObjectIds and resetStyle', () => {
  it('lists the bar and every observation', () => {
    const { t } = setup();
    const g = t.groups[0];
    expect(groupObjectIds(g)).toEqual([`${g.id}:bar`, ...g.observations.map((o) => o.id)]);
  });
  it('resetGroupStyle deletes all of them', () => {
    const { p, t } = setup();
    const g = t.groups[0];
    const layer = {
      ...p.charts[0].layers[0],
      groupOverrides: { [g.id]: { barOpacity: 0.5 } },
      objectOverrides: Object.fromEntries(groupObjectIds(g).map((id) => [id, { barOpacity: 0.4 }])),
    };
    const r = resetGroupStyle(layer, g);
    expect(r.groupOverrides).toEqual({});
    expect(r.objectOverrides).toEqual({});
  });
});

describe('history', () => {
  const commit = (h: HistoryState, command: (p: Project) => Project, now: number, key?: string) =>
    historyReducer(h, { type: 'commit', label: 'x', command, now, coalesceKey: key });
  it('a no-op adds no step', () => {
    const { p, t } = setup();
    const h = commit(initialHistory(p), setRowTitles(t.id, [{ row: 0, title: '' }]), 0);
    expect(h.past).toHaveLength(0);
  });
  it('coalesces within a sliding 800 ms window', () => {
    const { p, t } = setup();
    let h = commit(initialHistory(p), setRowTitles(t.id, [{ row: 0, title: 'a' }]), 0, 'k');
    h = commit(h, setRowTitles(t.id, [{ row: 0, title: 'ab' }]), 700, 'k');
    h = commit(h, setRowTitles(t.id, [{ row: 0, title: 'abc' }]), 1400, 'k');
    expect(h.past).toHaveLength(1);
    h = commit(h, setRowTitles(t.id, [{ row: 0, title: 'abcd' }]), 2300, 'k');
    expect(h.past).toHaveLength(2);
  });
  it('undo of a style edit keeps the title edit', () => {
    const { p, t, chartId } = setup();
    let h = commit(initialHistory(p), setRowTitles(t.id, [{ row: 0, title: 'kept' }]), 0);
    h = commit(h, patchStyle(chartId, 'all', { barOpacity: 0.5 }), 5000);
    h = historyReducer(h, { type: 'undo' });
    expect(table(h.present).rows[0].title).toBe('kept');
    expect(h.present.charts[0].layers[0].style.barOpacity).toBeUndefined();
  });
});

describe('invariants after a sequence', () => {
  it('reversed rows give rows[0]=q rows[1]=p', () => {
    const { p, t } = setup();
    let q = setRowTitles(t.id, [{ row: 0, title: 'p' }, { row: 1, title: 'q' }])(p);
    q = addRows(t.id, 2)(q);
    q = addGroup(t.id)(q);
    q = pasteMatrix(t.id, 0, 0, [[1], [2]])(q);
    expect(() => assertTableInvariants(table(q))).not.toThrow();
    const n = table(q).rowCount;
    const order = [1, 0, ...Array.from({ length: n - 2 }, (_, i) => i + 2)];
    const rev = permuteRows(table(q), order);
    expect(() => assertTableInvariants(rev)).not.toThrow();
    expect([rev.rows[0].title, rev.rows[1].title]).toEqual(['q', 'p']);
  });
});

describe('renaming from the navigator', () => {
  it('renames a table and a graph, trims the name, and ignores a blank one', async () => {
    const { renameItem } = await import('./commands');
    const p = createExampleProject();
    expect(renameItem('table', p.dataTables[0].id, '  Dose response ')(p).dataTables[0].name).toBe('Dose response');
    expect(renameItem('chart', p.charts[0].id, 'Figure 1')(p).charts[0].name).toBe('Figure 1');
    expect(renameItem('table', p.dataTables[0].id, '   ')(p)).toBe(p);
  });
});
