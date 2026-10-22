import { describe, expect, it } from 'vitest';
import { createChart, createExampleProject, createGroup } from './defaults';
import { newId } from './ids';
import { createRows } from './rows';
import { buildChartModel } from '../chart/model';
import { effectiveTable, graphSources } from './chartTable';
import { setGroupOnGraph } from '../state/commands';
import type { Project } from './types';

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
    expect(buildChartModel(p.charts[0], effectiveTable(p, p.charts[0])!).groups).toHaveLength(3);
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
    expect(buildChartModel(p.charts[0], t).groups).toHaveLength(5);
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
