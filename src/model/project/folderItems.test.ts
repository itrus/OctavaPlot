import { describe, expect, it } from 'vitest';
import { folderItems, nudge, reorder, sortedByName } from './folderItems';
import { createExampleProject } from '../defaults';

const items = (...names: string[]) => names.map((name) => ({ id: name.toLowerCase(), name }));
const ids = (list: ReadonlyArray<{ id: string }>) => list.map((x) => x.id);

describe('putting items in another order', () => {
  const list = items('A', 'B', 'C', 'D', 'E');

  it('moves one item before another, or to the end', () => {
    expect(ids(reorder(list, ['d'], 'b'))).toEqual(['a', 'd', 'b', 'c', 'e']);
    expect(ids(reorder(list, ['b'], null))).toEqual(['a', 'c', 'd', 'e', 'b']);
    expect(ids(reorder(list, ['e'], 'a'))).toEqual(['e', 'a', 'b', 'c', 'd']);
  });

  it('moves several items together, in the order they had', () => {
    expect(ids(reorder(list, ['d', 'b'], 'e'))).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(ids(reorder(list, ['e', 'a'], 'c'))).toEqual(['b', 'a', 'e', 'c', 'd']);
  });

  it('changes nothing when an item is put before itself, before an unknown item, or nothing is moved', () => {
    expect(ids(reorder(list, ['c'], 'c'))).toEqual(ids(list));
    expect(ids(reorder(list, ['c', 'd'], 'd'))).toEqual(ids(list));
    expect(ids(reorder(list, ['c'], 'zzz'))).toEqual(ids(list));
    expect(ids(reorder(list, [], 'a'))).toEqual(ids(list));
    expect(ids(reorder(list, ['nothing'], 'a'))).toEqual(ids(list));
  });

  it('does not change the list it is given', () => {
    const before = ids(list);
    reorder(list, ['d'], 'a');
    nudge(list, ['d'], -1);
    expect(ids(list)).toEqual(before);
  });

  it('moves items one place earlier or later', () => {
    expect(ids(nudge(list, ['c'], -1))).toEqual(['a', 'c', 'b', 'd', 'e']);
    expect(ids(nudge(list, ['c'], 1))).toEqual(['a', 'b', 'd', 'c', 'e']);
  });

  it('moves a block of neighbours as one and stops at the ends', () => {
    expect(ids(nudge(list, ['c', 'd'], -1))).toEqual(['a', 'c', 'd', 'b', 'e']);
    expect(ids(nudge(list, ['a', 'b'], -1))).toEqual(ids(list));
    expect(ids(nudge(list, ['d', 'e'], 1))).toEqual(ids(list));
    expect(ids(nudge(list, ['a', 'c'], -1))).toEqual(['a', 'c', 'b', 'd', 'e']);
  });
});

describe('sorting by name', () => {
  it('puts the names A to Z, whatever the case, and numbers as numbers', () => {
    expect(sortedByName(items('graph 10', 'Graph 2', 'graph 1', 'Alpha', 'beta')).map((x) => x.name)).toEqual(['Alpha', 'beta', 'graph 1', 'Graph 2', 'graph 10']);
  });
  it('keeps the order of items with the same name', () => {
    const same = [{ id: 'x1', name: 'Same' }, { id: 'x2', name: 'same' }, { id: 'x3', name: 'Same' }];
    expect(ids(sortedByName(same))).toEqual(['x1', 'x2', 'x3']);
  });
});

describe('the items of a folder', () => {
  it('are the pages of the project in the order of the navigator', () => {
    const p = createExampleProject();
    expect(folderItems(p, 'tables')).toBe(p.dataTables);
    expect(folderItems(p, 'graphs')).toBe(p.charts);
    expect(folderItems(p, 'results')).toEqual([]);
    expect(folderItems(p, 'layouts')).toEqual([]);
  });
});
