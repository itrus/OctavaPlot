import { describe, expect, it } from 'vitest';
import { folderItems } from '../model/project/folderItems';
import { createExampleProject } from '../model/defaults';
import type { FolderKey, Id, Project } from '../model/types';
import { addAnalysis, addChart, addDataTable, addLayout, duplicateItems, moveItems, nudgeItems, removeItems, sortItemsByName } from './commands';

/** The example project with more tables, graphs, results and layouts, so each folder has several pages. */
function busy(): Project {
  let p = createExampleProject();
  p = addDataTable('t2', 'xy', { sample: true })(p);
  p = addDataTable('t3', 'column', { sample: true })(p);
  p = addChart('g2', 't2')(p);
  p = addChart('g3', 't3')(p);
  p = addAnalysis('r1', 't2', 'descriptive')(p);
  p = addAnalysis('r2', 't3', 'descriptive')(p);
  p = addLayout('l1')(p);
  p = addLayout('l2')(p);
  return p;
}
const ids = (p: Project, folder: FolderKey): Id[] => folderItems(p, folder).map((x) => x.id);
const FOLDERS: FolderKey[] = ['tables', 'results', 'graphs', 'layouts'];

describe('reordering the pages of a folder', () => {
  it.each(FOLDERS)('moves pages in %s before another page', (folder) => {
    const p = busy();
    const [first, second] = ids(p, folder);
    const moved = moveItems(folder, [second], first)(p);
    expect(ids(moved, folder).slice(0, 2)).toEqual([second, first]);
    expect(ids(moved, folder).slice().sort()).toEqual(ids(p, folder).slice().sort());
  });

  it('puts several pages at the end', () => {
    const p = busy();
    const [a, b, ...rest] = ids(p, 'tables');
    expect(ids(moveItems('tables', [a, b], null)(p), 'tables')).toEqual([...rest, a, b]);
  });

  it('leaves the other folders and the content of the pages as they were', () => {
    const p = busy();
    const moved = moveItems('graphs', [ids(p, 'graphs')[2]], ids(p, 'graphs')[0])(p);
    expect(moved.dataTables).toBe(p.dataTables);
    expect(moved.analyses).toBe(p.analyses);
    expect(moved.layouts).toBe(p.layouts);
    expect(moved.charts.map((c) => c.id).sort()).toEqual(p.charts.map((c) => c.id).sort());
    expect(moved.charts.find((c) => c.id === 'g2')).toBe(p.charts.find((c) => c.id === 'g2'));
  });

  it('is the same project when the order does not change', () => {
    const p = busy();
    const [first, second] = ids(p, 'results');
    expect(moveItems('results', [first], second)(p)).toBe(p);
    expect(moveItems('results', [first], first)(p)).toBe(p);
    expect(moveItems('results', [], first)(p)).toBe(p);
    expect(nudgeItems('results', [first], -1)(p)).toBe(p);
  });

  it('moves the selected pages one place earlier or later', () => {
    const p = busy();
    const [a, b, c] = ids(p, 'tables');
    expect(ids(nudgeItems('tables', [c], -1)(p), 'tables').slice(0, 3)).toEqual([a, c, b]);
    expect(ids(nudgeItems('tables', [a], 1)(p), 'tables').slice(0, 3)).toEqual([b, a, c]);
  });

  it('sorts a folder by name, and does nothing when it is sorted', () => {
    let p = busy();
    p = { ...p, charts: p.charts.map((c, i) => ({ ...c, name: ['Zeta', 'Graph 10', 'Graph 2'][i] ?? c.name })) };
    const sorted = sortItemsByName('graphs')(p);
    expect(sorted.charts.map((c) => c.name)).toEqual(['Graph 2', 'Graph 10', 'Zeta']);
    expect(sortItemsByName('graphs')(sorted)).toBe(sorted);
  });

  it('keeps the list of results or layouts as it is when it is empty', () => {
    const p = createExampleProject();
    expect(sortItemsByName('results')(p)).toBe(p);
    expect(moveItems('layouts', ['x'], null)(p)).toBe(p);
  });
});

describe('deleting several pages at once', () => {
  it('deletes the pages in one step', () => {
    const p = busy();
    const gone = removeItems('graphs', ['g2', 'g3'])(p);
    expect(ids(gone, 'graphs')).toEqual(ids(p, 'graphs').filter((x) => x !== 'g2' && x !== 'g3'));
  });

  it('takes the graphs and results of a table with it', () => {
    const p = busy();
    const gone = removeItems('tables', ['t2', 't3'])(p);
    expect(ids(gone, 'tables')).toEqual(ids(p, 'tables').filter((x) => x !== 't2' && x !== 't3'));
    expect(gone.charts.some((c) => c.dataTableId === 't2' || c.dataTableId === 't3')).toBe(false);
    expect((gone.analyses ?? []).length).toBe(0);
  });

  it('keeps the last table', () => {
    const p = busy();
    const gone = removeItems('tables', ids(p, 'tables'))(p);
    expect(gone.dataTables).toHaveLength(1);
  });

  it('leaves no results, and no empty list of layouts, behind', () => {
    const p = busy();
    expect(removeItems('results', ids(p, 'results'))(p).analyses ?? []).toEqual([]);
    expect(removeItems('layouts', ids(p, 'layouts'))(p).layouts).toBeUndefined();
  });

  it('ignores a page that is not there', () => {
    const p = busy();
    expect(ids(removeItems('graphs', ['nothing'])(p), 'graphs')).toEqual(ids(p, 'graphs'));
  });
});

describe('copying several pages at once', () => {
  it.each(FOLDERS)('copies pages of %s, each with its own new ID and a name of its own', (folder) => {
    const p = busy();
    const [a, b] = ids(p, folder);
    const copied = duplicateItems(folder, [[a, 'copy-a'], [b, 'copy-b']])(p);
    expect(ids(copied, folder)).toEqual([...ids(p, folder), 'copy-a', 'copy-b']);
    const names = folderItems(copied, folder).map((x) => x.name);
    expect(new Set(names).size).toBe(names.length);
  });
});
