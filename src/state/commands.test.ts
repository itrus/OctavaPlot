import { describe, expect, it } from 'vitest';
import { createExampleProject, INITIAL_ROWS } from '../model/defaults';
import { MAX_ROW_TITLE_CHARS } from '../model/table/rows';
import { assertTableInvariants, permuteRows } from '../testing/tableChecks';
import { groupObjectIds, resetGroupStyle } from '../model/graph/style';
import type { Project } from '../model/types';
import { addDataTable, addGroup, addRows, composeCommands, patchStyle, pasteMatrix, removeGroup, setCells, setRowTitles, addAnalysis, addChart, addLayout, removeChart, removeItems, removeTable, deletionEffects, noEffects } from './commands';
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
    expect(setRowTitles(t.id, [{ row: -1, title: 'a' }, { row: INITIAL_ROWS + 5, title: 'a' }, { row: 0.5, title: 'a' }])(p)).toBe(p);
    expect(setRowTitles('missing', [{ row: 0, title: 'a' }])(p)).toBe(p);
    expect(setRowTitles(t.id, [])(p)).toBe(p);
  });
});

describe('no-op identity', () => {
  it('setCells with unchanged values returns the same project', () => {
    const { p, t } = setup();
    expect(setCells(t.id, [{ row: 0, col: 0, value: t.groups[0].observations[0].value }])(p)).toBe(p);
    expect(setCells(t.id, [{ row: INITIAL_ROWS + 99, col: 0, value: 1 }])(p)).toBe(p);
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

  it('gives the graphs of a renamed table its name, unless their name or title was changed', async () => {
    const { renameItem } = await import('./commands');
    const p = createExampleProject();
    const t = p.dataTables[0];
    const c = p.charts.find((x) => x.dataTableId === t.id)!;
    const follow = { ...p, charts: p.charts.map((x) => (x === c ? { ...x, name: t.name, title: t.name } : x)) };
    const a = renameItem('table', t.id, 'Dose response')(follow).charts.find((x) => x.id === c.id)!;
    expect([a.name, a.title]).toEqual(['Dose response', 'Dose response']);
    const own = { ...p, charts: p.charts.map((x) => (x === c ? { ...x, name: 'Fig', title: 'My title' } : x)) };
    const b = renameItem('table', t.id, 'Dose response')(own).charts.find((x) => x.id === c.id)!;
    expect([b.name, b.title]).toEqual(['Fig', 'My title']);
  });
});

describe('duplicating and deleting items', () => {
  it('duplicates a table with new IDs, and deleting it takes its graphs and results with it', async () => {
    const { duplicateTable, removeTable, addAnalysis } = await import('./commands');
    const p0 = createExampleProject();
    const t = p0.dataTables[0];
    let p = duplicateTable(t.id, 'copy-1')(p0);
    expect(p.dataTables).toHaveLength(2);
    const copy = p.dataTables[1];
    expect(copy.name).toBe(`${t.name} (copy)`);
    expect(copy.groups[0].id).not.toBe(t.groups[0].id);
    expect(copy.groups[0].observations[0].id).not.toBe(t.groups[0].observations[0].id);
    expect(copy.groups[0].observations.map((o) => o.value)).toEqual(t.groups[0].observations.map((o) => o.value));
    expect(new Set(p.dataTables.flatMap((x) => x.groups.flatMap((g) => g.observations.map((o) => o.id)))).size).toBe(p.dataTables.reduce((n, x) => n + x.groups.reduce((m, g) => m + g.observations.length, 0), 0));
    p = addAnalysis('an-1', t.id, 'descriptive')(p);
    const after = removeTable(t.id)(p);
    expect(after.dataTables.map((x) => x.id)).toEqual(['copy-1']);
    expect(after.charts.every((c) => c.dataTableId === 'copy-1')).toBe(true);
    expect(after.analyses).toBeUndefined();
    // The last table is never deleted.
    expect(removeTable('copy-1')(after)).toBe(after);
    // And the deletion is one undoable step.
    const h = historyReducer(initialHistory(p), { type: 'commit', label: 'Delete table', command: removeTable(t.id), now: 0 });
    expect(historyReducer(h, { type: 'undo' }).present).toBe(p);
  });
  it('keeps hidden, ordered, range-switched and own-look layers of a duplicated graph (their ids hold the graph id)', async () => {
    const { addChart, duplicateChart } = await import('./commands');
    const { layersOf } = await import('../model/graph/layers');
    for (const [type, kind] of [['survival', 'survival'], ['paired', 'column'], ['pie', 'contingency'], ['heatmap', 'grouped']] as const) {
      let p = addChart('g', 'tb', undefined, type)(addDataTable('tb', kind, { sample: true })(createExampleProject()));
      const tb = p.dataTables.find((t) => t.id === 'tb')!;
      const own = layersOf(p.charts.find((c) => c.id === 'g')!, tb).filter((l) => l.id.startsWith('g:'));
      expect(own.length, type).toBeGreaterThan(0);
      const ids = own.map((l) => l.id);
      p = { ...p, charts: p.charts.map((c) => (c.id === 'g' ? { ...c, hiddenLayerIds: ids, rangeExcludedLayerIds: ids, layerOrder: ids, layerStyles: Object.fromEntries(ids.map((i) => [i, { opacity: 0.5 }])) } : c)) };
      p = duplicateChart('g', 'h')(p);
      const copy = p.charts.find((c) => c.id === 'h')!;
      const remap = (i: string) => `h${i.slice(1)}`;
      expect(copy.hiddenLayerIds, type).toEqual(ids.map(remap));
      expect(copy.rangeExcludedLayerIds, type).toEqual(ids.map(remap));
      expect(copy.layerOrder, type).toEqual(ids.map(remap));
      expect(Object.keys(copy.layerStyles), type).toEqual(ids.map(remap));
      const view = (c: typeof copy, back: (i: string) => string) => layersOf(c, tb).map((l) => [back(l.id), l.visible, l.rangeContribution]);
      expect(view(copy, (i) => (i.startsWith('h:') ? `g${i.slice(1)}` : i))).toEqual(view(p.charts.find((c) => c.id === 'g')!, (i) => i));
      expect(layersOf(copy, tb).filter((l) => l.id.startsWith('h:')).every((l) => !l.visible), type).toBe(true);
    }
  });
  it('duplicates and deletes graphs and analyses', async () => {
    const { duplicateChart, removeChart, addAnalysis, duplicateAnalysis, removeAnalysis } = await import('./commands');
    let p = createExampleProject();
    p = duplicateChart(p.charts[0].id, 'chart-copy')(p);
    expect(p.charts.map((c) => c.id)).toContain('chart-copy');
    expect(removeChart('chart-copy')(p).charts).toHaveLength(1);
    p = addAnalysis('a1', p.dataTables[0].id, 'descriptive')(p);
    p = duplicateAnalysis('a1', 'a2')(p);
    expect(p.analyses!.map((a) => a.id)).toEqual(['a1', 'a2']);
    expect(removeAnalysis('a1')(p).analyses!.map((a) => a.id)).toEqual(['a2']);
  });
});

describe('deleting a row', () => {
  it('takes with it the style of its point, so the value later pasted at that row does not inherit it', async () => {
    const { patchPointStyle, deleteRows } = await import('./commands');
    const { effectiveTable } = await import('../model/table/chartTable');
    const { resolveStyle, dataLayer } = await import('../model/graph/style');
    let p = createExampleProject();
    const table = p.dataTables[0];
    const last = table.rowCount - 1;
    const point = table.groups[0].observations[last];
    p = patchPointStyle(p.charts[0].id, point.id, { symbolColor: '#ff0000' })(p);
    p = deleteRows(table.id, [last])(p);
    expect(Object.keys(dataLayer(p.charts[0]).objectOverrides)).not.toContain(point.id);
    p = pasteMatrix(table.id, last, 0, [[1]])(p);
    const t = effectiveTable(p, p.charts[0])!;
    const fresh = t.groups[0].observations[last];
    expect(resolveStyle(p.charts[0], dataLayer(p.charts[0]), t.groups[0], fresh.id).symbolColor).not.toBe('#ff0000');
  });
  it('is not pasted past the limit of rows a file can hold', async () => {
    const { appendRows, MAX_TABLE_ROWS } = await import('./commands');
    let p = createExampleProject();
    p = appendRows(p.dataTables[0].id, MAX_TABLE_ROWS)(p);
    const before = p;
    expect(pasteMatrix(p.dataTables[0].id, MAX_TABLE_ROWS - 1, 0, [[1], [2]])(before)).toBe(before);
  });
});

describe('choosing a palette', () => {
  it('colours every data set by its own place, also one that was hidden when the palette was chosen', async () => {
    const { applyPalette, setGroupOnGraph, patchStyle } = await import('./commands');
    const { PALETTES } = await import('../model/graph/palettes');
    const { effectiveTable } = await import('../model/table/chartTable');
    const { resolveStyle, dataLayer } = await import('../model/graph/style');
    let p = createExampleProject();
    const [a, b] = p.dataTables[0].groups;
    p = patchStyle(p.charts[0].id, a.id, { barFill: '#123456' })(p);
    p = applyPalette(p.charts[0].id, PALETTES[1])(p);
    const fills = () => {
      const t = effectiveTable(p, p.charts[0])!;
      return t.groups.map((g) => resolveStyle(p.charts[0], dataLayer(p.charts[0]), g).barFill);
    };
    const shown = fills();
    expect(shown[0]).not.toBe('#123456');
    expect(shown[0]).not.toBe(shown[1]);
    p = setGroupOnGraph(p.charts[0].id, p.dataTables[0].id, b.id, false)(p);
    p = setGroupOnGraph(p.charts[0].id, p.dataTables[0].id, b.id, true)(p);
    expect(fills()).toEqual(shown);
  });
});

describe('commands that change nothing', () => {
  // The history records no undo step for a command that returns the same project.
  it('return the same project for results and layouts', async () => {
    const { addAnalysis, addLayout, patchAnalysis, removeAnalysis, removeLayout, renameItem, setHighlight } = await import('./commands');
    let p = createExampleProject();
    p = addAnalysis('an', p.dataTables[0].id)(p);
    p = addLayout('lay')(p);
    const [layoutName, analysisName, level] = [p.layouts![0].name, p.analyses![0].name, p.analyses![0].level];
    for (const command of [renameItem('layout', 'lay', layoutName), renameItem('analysis', 'an', analysisName), setHighlight('layout', 'lay', null), setHighlight('analysis', 'an', null), patchAnalysis('an', { level }), patchAnalysis('gone', { level: 0.9 }), removeAnalysis('gone'), removeLayout('gone')]) {
      expect(command(p)).toBe(p);
    }
    expect(removeAnalysis('an')(p).analyses).toBeUndefined();
  });
});

/** Two tables, each with a graph and a result; layout L1 holds the graph of the first table only, L2 holds both graphs, L3 is empty from the start. */
const make = (): Project => {
  let p = createExampleProject();
  const first = p.dataTables[0].id;
  const chart1 = p.charts[0].id;
  p = addDataTable('t2', 'column')(p);
  p = addChart('c2', 't2')(p);
  p = addAnalysis('a1', first, 'descriptive')(p);
  p = addLayout('L1', { arrangement: { kind: 'grid', cols: 2, rows: 1 } }, chart1)(p);
  p = addLayout('L2', { arrangement: { kind: 'grid', cols: 2, rows: 1 } }, chart1)(p);
  p = { ...p, layouts: p.layouts!.map((l) => (l.id === 'L1' ? { ...l, panels: [chart1, null] } : l)) };
  p = addLayout('L3', { arrangement: { kind: 'grid', cols: 2, rows: 1 } })(p);
  return p;
};

describe('what a deletion also deletes', () => {
  it('lists the graphs and results of a table, and the layouts left with no graph', () => {
    const p = make();
    const e = deletionEffects(p, 'tables', [p.dataTables[0].id]);
    expect(e.charts.map((c) => c.id)).toEqual([p.charts[0].id]);
    expect(e.analyses.map((a) => a.id)).toEqual(['a1']);
    // L1 held only that graph; L2 also holds the second, so it stays with an empty panel; L3 was empty before and is not touched.
    expect(e.layouts.map((l) => l.id)).toEqual(['L1']);
    expect(noEffects(e)).toBe(false);
    const after = removeTable(p.dataTables[0].id)(p);
    expect(after.layouts!.map((l) => l.id)).toEqual(['L2', 'L3']);
  });

  it('says nothing for a graph no layout depends on, and names the layouts a graph leaves empty', () => {
    const p = make();
    expect(noEffects(deletionEffects(p, 'graphs', ['c2']))).toBe(true);
    const e = deletionEffects(p, 'graphs', [p.charts[0].id]);
    expect(e.layouts.map((l) => l.id)).toEqual(['L1']);
    expect(removeChart(p.charts[0].id)(p).layouts!.map((l) => l.id)).toEqual(['L2', 'L3']);
  });

  it('does not list what was asked for itself, and counts several items together', () => {
    const p = make();
    expect(deletionEffects(p, 'graphs', [p.charts[0].id, 'c2']).charts).toEqual([]);
    expect(deletionEffects(p, 'graphs', [p.charts[0].id, 'c2']).layouts.map((l) => l.id)).toEqual(['L1', 'L2']);
    expect(noEffects(deletionEffects(p, 'layouts', ['L1']))).toBe(true);
    expect(removeItems('graphs', [p.charts[0].id, 'c2'])(p).layouts!.map((l) => l.id)).toEqual(['L3']);
  });
});
