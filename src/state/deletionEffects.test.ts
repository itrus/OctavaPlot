import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import type { Project } from '../model/types';
import { addAnalysis, addChart, addDataTable, addLayout, removeChart, removeItems, removeTable } from './commands';
import { deletionEffects, noEffects } from './deletionEffects';

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
