import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { historyReducer, initialHistory, scopeCoalesceKey } from './history';
import { patchChart } from './commands';

describe('undo transactions', () => {
  it('does not merge title edits on different charts made within the coalescing window', () => {
    const p = createExampleProject();
    const [a, b] = [p.charts[0], { ...p.charts[0], id: 'chart-b' }];
    const withTwo = { ...p, charts: [a, b] };
    const key = (id: string) => scopeCoalesceKey({ view: { kind: 'chart', id }, selection: { kind: 'chart' } }, 'chart:title');
    let h = initialHistory(withTwo);
    h = historyReducer(h, { type: 'commit', label: 'Title A', command: patchChart(a.id, { title: 'A' }), coalesceKey: key(a.id), now: 0 });
    h = historyReducer(h, { type: 'commit', label: 'Title B', command: patchChart(b.id, { title: 'B' }), coalesceKey: key(b.id), now: 100 });
    expect(h.past).toHaveLength(2);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.charts[0].title).toBe('A');
    expect(h.present.charts[1].title).toBe(a.title);
  });
  it('still merges consecutive edits of the same object', () => {
    const p = createExampleProject();
    const key = scopeCoalesceKey({ view: { kind: 'chart', id: p.charts[0].id }, selection: { kind: 'chart' } }, 'chart:title');
    let h = initialHistory(p);
    h = historyReducer(h, { type: 'commit', label: 'T', command: patchChart(p.charts[0].id, { title: 'A' }), coalesceKey: key, now: 0 });
    h = historyReducer(h, { type: 'commit', label: 'T', command: patchChart(p.charts[0].id, { title: 'AB' }), coalesceKey: key, now: 100 });
    expect(h.past).toHaveLength(1);
  });
});

import type { Project } from '../model/types';
import { addDataTable, patchStyle, removeTable, setCells } from './commands';

const commit = (h: ReturnType<typeof initialHistory>, label: string, command: (p: Project) => Project, now = 0, coalesceKey?: string) => historyReducer(h, { type: 'commit', label, command, now, coalesceKey });
const title = (p: Project, text: string) => patchChart(p.charts[0].id, { title: text });

describe('redo', () => {
  it('is cleared by a new edit, and a command that changes nothing leaves it alone', () => {
    const p = createExampleProject();
    let h = commit(initialHistory(p), 'A', title(p, 'A'));
    h = historyReducer(h, { type: 'undo' });
    expect(h.future).toHaveLength(1);
    h = commit(h, 'nothing', (x) => x);
    expect(h.future).toHaveLength(1);
    h = commit(h, 'B', title(p, 'B'));
    expect(h.future).toHaveLength(0);
    expect(historyReducer(h, { type: 'redo' })).toBe(h);
    expect(h.present.charts[0].title).toBe('B');
  });
  it('puts back what undo took, step by step, with the label of each step in the status line', () => {
    const p = createExampleProject();
    let h = commit(initialHistory(p), 'First', title(p, '1'));
    h = commit(h, 'Second', title(p, '2'));
    h = historyReducer(historyReducer(h, { type: 'undo' }), { type: 'undo' });
    expect(h.present).toBe(p);
    expect(h.lastAction).toBe('Undid: First');
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.charts[0].title).toBe('1');
    expect(h.lastAction).toBe('Redid: First');
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.charts[0].title).toBe('2');
    expect(historyReducer(h, { type: 'redo' })).toBe(h);
  });
});

describe('undo', () => {
  it('goes back to the very project it started from, so that nothing counts as unsaved', () => {
    const p = createExampleProject();
    const h = historyReducer(commit(initialHistory(p), 'A', title(p, 'A')), { type: 'undo' });
    expect(h.present).toBe(p);
    expect(historyReducer(initialHistory(p), { type: 'undo' }).present).toBe(p);
  });
  it('keeps the last 200 steps and forgets the oldest', () => {
    const p = createExampleProject();
    let h = initialHistory(p);
    for (let i = 1; i <= 205; i++) h = commit(h, `Step ${i}`, title(p, String(i)));
    expect(h.past).toHaveLength(200);
    for (let i = 0; i < 300; i++) h = historyReducer(h, { type: 'undo' });
    // The first five steps are no longer undoable: the oldest state reachable is the one after step 5.
    expect(h.present.charts[0].title).toBe('5');
    expect(h.future).toHaveLength(200);
  });
  it('undoes a style edit before the data edit made earlier, and redo brings both back in order', () => {
    const p = createExampleProject();
    const table = p.dataTables[0];
    const cellValue = (x: Project) => x.dataTables[0].groups[0].observations[0].value;
    let h = commit(initialHistory(p), 'Data', setCells(table.id, [{ row: 0, col: 0, value: 42 }]));
    h = commit(h, 'Style', patchStyle(p.charts[0].id, 'all', { barOpacity: 0.5 }));
    const opacity = (x: Project) => x.charts[0].layers[0].style.barOpacity;
    h = historyReducer(h, { type: 'undo' });
    expect(cellValue(h.present)).toBe(42);
    expect(opacity(h.present)).not.toBe(0.5);
    h = historyReducer(h, { type: 'undo' });
    expect(cellValue(h.present)).not.toBe(42);
    h = historyReducer(historyReducer(h, { type: 'redo' }), { type: 'redo' });
    expect(cellValue(h.present)).toBe(42);
    expect(opacity(h.present)).toBe(0.5);
  });
  it('takes back a table that was added and puts back a table that was removed, with its graphs', () => {
    const p = createExampleProject();
    let h = commit(initialHistory(p), 'Add table', addDataTable('extra', 'column'));
    expect(h.present.dataTables).toHaveLength(p.dataTables.length + 1);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.dataTables).toHaveLength(p.dataTables.length);

    // The last table cannot be removed, so there are two.
    const two = addDataTable('extra', 'column')(p);
    const table = two.dataTables[0];
    const graphs = two.charts.filter((c) => c.dataTableId === table.id).length;
    expect(graphs).toBeGreaterThan(0);
    let r = commit(initialHistory(two), 'Delete table', removeTable(table.id));
    expect(r.present.dataTables.find((t) => t.id === table.id)).toBeUndefined();
    expect(r.present.charts.filter((c) => c.dataTableId === table.id)).toHaveLength(0);
    r = historyReducer(r, { type: 'undo' });
    expect(r.present).toBe(two);
    expect(r.present.charts.filter((c) => c.dataTableId === table.id)).toHaveLength(graphs);
    // And the last table is not removed at all.
    expect(removeTable(p.dataTables[0].id)(p)).toBe(p);
  });
});

describe('opening another project', () => {
  it('starts a new history: nothing of the old one can be undone into the new project', () => {
    const p = createExampleProject();
    let h = commit(initialHistory(p), 'A', title(p, 'A'));
    const other = createExampleProject();
    h = historyReducer(h, { type: 'replace', project: other });
    expect(h.present).toBe(other);
    expect(h.past).toHaveLength(0);
    expect(h.future).toHaveLength(0);
    expect(historyReducer(h, { type: 'undo' })).toBe(h);
  });
});
