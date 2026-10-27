import { describe, expect, it } from 'vitest';
import { createChart, createExampleProject, createGroup } from '../defaults';
import { newId } from '../ids';
import { createRows, groupRowTitle } from './rows';
import { buildColumnModel } from '../../chart/column/columnModel';
import { effectiveTable, graphSources } from './chartTable';
import { setGroupOnGraph } from '../../state/commands';
import type { Project } from '../types';

function twoTables(): Project {
  const p = createExampleProject();
  const other = {
    id: newId('table'),
    name: 'Data 2',
    kind: 'column' as const,
    rowCount: 3,
    rows: createRows(3),
    groups: [createGroup('X', 0, 3, [5, 6, 7]), createGroup('Y', 1, 3, [8, 9, 10])],
  };
  return { ...p, dataTables: [...p.dataTables, other] };
}

describe('data sets on a graph', () => {
  it('uses the chart table itself while nothing is hidden or added', () => {
    const p = twoTables();
    expect(effectiveTable(p, p.charts[0])).toBe(p.dataTables[0]);
  });

  it('switches a data set of its own table off and on', () => {
    let p = twoTables();
    const chartId = p.charts[0].id;
    const g = p.dataTables[0].groups[1];
    p = setGroupOnGraph(chartId, p.dataTables[0].id, g.id, false)(p);
    expect(effectiveTable(p, p.charts[0])!.groups.map((x) => x.name)).toEqual(['Group A', 'Group C', 'Group D']);
    expect(buildColumnModel(p.charts[0], effectiveTable(p, p.charts[0])!).groups).toHaveLength(3);
    p = setGroupOnGraph(chartId, p.dataTables[0].id, g.id, true)(p);
    expect(effectiveTable(p, p.charts[0])).toBe(p.dataTables[0]);
  });

  it('adds a data set from another table and pads the shorter ones', () => {
    let p = twoTables();
    const chartId = p.charts[0].id;
    const x = p.dataTables[1].groups[0];
    p = setGroupOnGraph(chartId, p.dataTables[1].id, x.id, true)(p);
    const t = effectiveTable(p, p.charts[0])!;
    expect(t.groups.map((g) => g.name)).toEqual(['Group A', 'Group B', 'Group C', 'Group D', 'Data 2: X']);
    expect(t.rowCount).toBe(p.dataTables[0].rowCount);
    expect(t.groups[4].observations).toHaveLength(t.rowCount);
    expect(t.groups[4].observations.slice(0, 3).map((o) => o.value)).toEqual([5, 6, 7]);
    expect(t.groups[4].observations[3].value).toBeNull();
    expect(buildColumnModel(p.charts[0], t).groups).toHaveLength(5);
    expect(graphSources(p, p.charts[0]).filter((s) => !s.own).map((s) => [s.group.name, s.onGraph])).toEqual([['X', true], ['Y', false]]);
    p = setGroupOnGraph(chartId, p.dataTables[1].id, x.id, false)(p);
    expect(p.charts[0].extraGroups).toEqual([]);
  });

  it('ignores an added data set whose table or group has gone', () => {
    const p = twoTables();
    const c = { ...p.charts[0], extraGroups: [{ tableId: 'gone', groupId: 'gone' }] };
    expect(effectiveTable({ ...p, charts: [c] }, c)!.groups).toHaveLength(4);
  });
});

describe('chart defaults', () => {
  it('start with nothing hidden or added', () => {
    const c = createChart('t');
    expect(c.hiddenGroupIds).toEqual([]);
    expect(c.extraGroups).toEqual([]);
  });
});

describe('colours of data sets', () => {
  it('stay with their data set when another is hidden', () => {
    let p = twoTables();
    const own = p.dataTables[0];
    const before = effectiveTable(p, p.charts[0])!.groups.map((g) => g.paletteIndex);
    p = setGroupOnGraph(p.charts[0].id, own.id, own.groups[0].id, false)(p);
    const after = effectiveTable(p, p.charts[0])!.groups;
    expect(after.map((g) => g.name)).toEqual(['Group B', 'Group C', 'Group D']);
    expect(after.map((g) => g.paletteIndex)).toEqual(before.slice(1));
  });

  describe('of data sets added from another table', () => {
    const third = (p: Project): Project => ({
      ...p,
      dataTables: [...p.dataTables, { ...p.dataTables[1], id: newId('table'), name: 'Data 3', groups: [createGroup('Z', 2, 3, [1, 2, 3])] }],
    });
    const addAll = (p: Project): Project => {
      const [a, b] = [p.dataTables[1].groups[0], p.dataTables[1].groups[1]];
      const c = p.dataTables[2].groups[0];
      p = setGroupOnGraph(p.charts[0].id, p.dataTables[1].id, a.id, true)(p);
      p = setGroupOnGraph(p.charts[0].id, p.dataTables[1].id, b.id, true)(p);
      return setGroupOnGraph(p.charts[0].id, p.dataTables[2].id, c.id, true)(p);
    };
    const colours = (p: Project) => Object.fromEntries(effectiveTable(p, p.charts[0])!.groups.map((g) => [g.name, g.paletteIndex]));

    it('stay when an earlier added data set is removed', () => {
      let p = addAll(third(twoTables()));
      const before = colours(p);
      p = setGroupOnGraph(p.charts[0].id, p.dataTables[1].id, p.dataTables[1].groups[0].id, false)(p);
      const after = colours(p);
      expect(after['Data 2: Y']).toBe(before['Data 2: Y']);
      expect(after['Data 3: Z']).toBe(before['Data 3: Z']);
      expect(after['Group A']).toBe(before['Group A']);
    });

    it('stay when the data sets are reordered, and stay distinct', () => {
      const p = addAll(third(twoTables()));
      const before = colours(p);
      const ids = effectiveTable(p, p.charts[0])!.groups.map((g) => g.id).reverse();
      const c = { ...p.charts[0], groupOrder: ids };
      expect(colours({ ...p, charts: [c] })).toEqual(before);
      expect(new Set(Object.values(before)).size).toBe(Object.values(before).length);
    });

    it('fall back to their position when a saved file has no colour slot', () => {
      const p = addAll(third(twoTables()));
      const c = { ...p.charts[0], extraGroups: p.charts[0].extraGroups.map(({ tableId, groupId }) => ({ tableId, groupId })) };
      expect(colours({ ...p, charts: [c] })).toEqual(colours(p));
    });
  });
});

describe('row titles of data sets added from another table', () => {
  it("are the titles of the table they came from, not those of the graph's own table", () => {
    const p0 = twoTables();
    const [own, second] = p0.dataTables;
    const p = {
      ...p0,
      dataTables: [{ ...own, rows: own.rows.map((r, i) => ({ ...r, title: `own ${i}` })) }, { ...second, rows: second.rows.map((r, i) => ({ ...r, title: `other ${i}` })) }],
    };
    const q = setGroupOnGraph(p.charts[0].id, second.id, second.groups[0].id, true)(p);
    const t = effectiveTable(q, q.charts[0])!;
    const added = t.groups[t.groups.length - 1];
    expect(added.sourceRowTitles).toEqual(['other 0', 'other 1', 'other 2']);
    expect(groupRowTitle(t, added, 1)).toBe('other 1');
    expect(groupRowTitle(t, t.groups[0], 1)).toBe('own 1');
    expect(groupRowTitle(t, added, 7)).toBe('');
    expect(t.groups[0].sourceRowTitles).toBeUndefined();
  });
});
