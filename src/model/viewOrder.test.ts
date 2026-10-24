import { describe, expect, it } from 'vitest';
import { addAnalysis, addChart, addLayout, addDataTable, removeChart, removeLayout, removeAnalysis, removeTable } from '../state/commands';
import { createExampleProject } from './defaults';
import { viewAfterRemoval, viewOrder } from './viewOrder';

/** Two tables, one result, two graphs and two layouts. */
function project() {
  let p = createExampleProject();
  const t1 = p.dataTables[0].id;
  p = addDataTable('t2', 'column', {})(p);
  p = addAnalysis('a1', t1, 'descriptive')(p);
  p = addChart('c2', t1)(p);
  p = addLayout('l1', {})(p);
  p = addLayout('l2', {})(p);
  return { p, t1, c1: p.charts[0].id };
}

describe('where to go when the page on screen is gone', () => {
  it('lists the pages in the order of the navigator', () => {
    const { p, t1, c1 } = project();
    expect(viewOrder(p).map((v) => `${v.kind}:${v.id}`)).toEqual([`table:${t1}`, 'table:t2', 'analysis:a1', `chart:${c1}`, 'chart:c2', 'layout:l1', 'layout:l2']);
  });
  it('goes to the page above', () => {
    const { p, c1 } = project();
    expect(viewAfterRemoval(p, removeChart('c2')(p), { kind: 'chart', id: 'c2' })).toEqual({ kind: 'chart', id: c1 });
    expect(viewAfterRemoval(p, removeLayout('l2')(p), { kind: 'layout', id: 'l2' })).toEqual({ kind: 'layout', id: 'l1' });
  });
  it('goes to the last page of the section above when the first of its own section is gone', () => {
    const { p } = project();
    expect(viewAfterRemoval(p, removeLayout('l1')(removeLayout('l2')(p)), { kind: 'layout', id: 'l1' })).toEqual({ kind: 'chart', id: 'c2' });
    expect(viewAfterRemoval(p, removeAnalysis('a1')(p), { kind: 'analysis', id: 'a1' })).toEqual({ kind: 'table', id: 't2' });
  });
  it('goes to the page below when nothing is above, and to the first table when nothing is left', () => {
    const { p, t1 } = project();
    expect(viewAfterRemoval(p, removeTable(t1)(p), { kind: 'table', id: t1 })).toEqual({ kind: 'table', id: 't2' });
    const single = createExampleProject();
    expect(viewAfterRemoval(single, removeChart(single.charts[0].id)(single), { kind: 'chart', id: single.charts[0].id })).toEqual({ kind: 'table', id: single.dataTables[0].id });
  });
});
