import { describe, expect, it } from 'vitest';
import { drawLayout } from '../../chart/export/layoutExport';
import { addLayout, setExcluded, setGroupOnGraph } from '../../state/commands';
import { createExampleProject } from '../defaults';
import type { Project } from '../types';
import { prepareChartInput } from './preparedChart';

const base = createExampleProject();
const tableId = base.dataTables[0].id;

/** The example project with its first graph on a page of its own. */
const onPage = (p: Project) => {
  const q = addLayout('layout_1', { arrangement: { kind: 'grid', cols: 1, rows: 1 } }, p.charts[0].id)(p);
  return { p: q, layout: q.layouts![0] };
};

/** The same project with the observation really blank, which is what an exclusion means to a chart. */
const blanked = (p: Project, row: number, col: number): Project => ({
  ...p,
  dataTables: p.dataTables.map((t) => ({
    ...t,
    groups: t.groups.map((g, c) => (c === col ? { ...g, observations: g.observations.map((o, r) => (r === row ? { ...o, value: null } : o)) } : g)),
  })),
});

describe('prepareChartInput', () => {
  it('gives the table as the graph sees it, and the fit it asks for', () => {
    const excluded = setExcluded(tableId, [{ row: 0, col: 0 }], true, 'pipetting error')(base);
    const prepared = prepareChartInput(excluded, excluded.charts[0])!;
    expect(prepared.chart).toBe(excluded.charts[0]);
    expect(prepared.table.groups[0].observations[0].value).toBeNull();
    expect(excluded.dataTables[0].groups[0].observations[0].value).not.toBeNull();
    expect(prepared.fit.model).toBe('none');
  });
  it('is undefined when the table of the graph is gone', () => {
    expect(prepareChartInput({ ...base, dataTables: [] }, base.charts[0])).toBeUndefined();
  });
});

describe('a graph on a page of a layout', () => {
  it('leaves out an excluded value, exactly as the graph does', () => {
    const excluded = onPage(setExcluded(tableId, [{ row: 0, col: 0 }], true)(base));
    const plain = onPage(base);
    const gone = onPage(blanked(base, 0, 0));
    const withExclusion = drawLayout(excluded.layout, excluded.p).svg;
    expect(withExclusion).toBe(drawLayout(gone.layout, gone.p).svg);
    expect(withExclusion).not.toBe(drawLayout(plain.layout, plain.p).svg);
  });
  it('leaves out a data set that is hidden on the graph', () => {
    const name = base.dataTables[0].groups[1].name;
    expect(drawLayout(onPage(base).layout, onPage(base).p).svg).toContain(name);
    const hidden = onPage(setGroupOnGraph(base.charts[0].id, tableId, base.dataTables[0].groups[1].id, false)(base));
    expect(drawLayout(hidden.layout, hidden.p).svg).not.toContain(name);
  });
});
