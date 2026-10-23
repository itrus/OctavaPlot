import { describe, expect, it } from 'vitest';
import { buildChartModel } from '../chart/model';
import { columnLayout } from '../chart/columns';
import { createChart, createColumnTable } from './defaults';
import { effectiveTable } from './chartTable';
import { applyOrder, moveGroup, sanitizeGaps, sanitizeOrder } from './groupOrder';
import { setGroupGap, setGroupOrder } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import type { Project } from './types';

const setup = () => {
  const table = createColumnTable('Data', true);
  const chart = createChart(table.id, undefined, 'bar');
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const ids = ['a', 'b', 'c', 'd'];

describe('moving data sets', () => {
  it('moves one place or to an end, and reverses', () => {
    expect(moveGroup(ids, 'c', 'up')).toEqual(['a', 'c', 'b', 'd']);
    expect(moveGroup(ids, 'c', 'down')).toEqual(['a', 'b', 'd', 'c']);
    expect(moveGroup(ids, 'c', 'top')).toEqual(['c', 'a', 'b', 'd']);
    expect(moveGroup(ids, 'b', 'bottom')).toEqual(['a', 'c', 'd', 'b']);
    expect(moveGroup(ids, 'a', 'up')).toEqual(ids);
    expect(moveGroup(ids, 'd', 'down')).toEqual(ids);
    expect(moveGroup(ids, 'a', 'reverse')).toEqual(['d', 'c', 'b', 'a']);
    expect(moveGroup(ids, 'zzz', 'top')).toEqual(ids);
  });
  it('puts the listed data sets first and keeps the others after them', () => {
    const items = ids.map((id) => ({ id }));
    expect(applyOrder(items, ['c', 'a']).map((i) => i.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(applyOrder(items, ['x', 'c', 'c']).map((i) => i.id)).toEqual(['c', 'a', 'b', 'd']);
    expect(applyOrder(items, []).map((i) => i.id)).toEqual(ids);
  });
  it('cleans what a file holds', () => {
    expect(sanitizeOrder(['a', 3, 'a', 'b'])).toEqual(['a', 'b']);
    expect(sanitizeOrder('a')).toEqual([]);
    expect(sanitizeGaps({ a: 50, b: 100, c: 9999, d: 'x', e: -3 })).toEqual({ a: 50, c: 500, e: 0 });
  });
});

describe('the order and the gaps on a chart', () => {
  it('draws the data sets in the new order, with the colours staying with them', () => {
    const { p, table } = setup();
    const first = effectiveTable(p, p.charts[0])!;
    const colourOf = (name: string) => first.groups.find((g) => g.name === name)!.paletteIndex;
    const reversed = setGroupOrder(p.charts[0].id, table.groups.map((g) => g.id).reverse())(p);
    const eff = effectiveTable(reversed, reversed.charts[0])!;
    expect(eff.groups.map((g) => g.name)).toEqual(table.groups.map((g) => g.name).reverse());
    expect(eff.groups.find((g) => g.name === 'Group A')!.paletteIndex).toBe(colourOf('Group A'));
    const m = buildChartModel(reversed.charts[0], eff);
    expect(m.groups.map((g) => g.name)).toEqual(['Group D', 'Group C', 'Group B', 'Group A']);
    expect(m.groups[0].centerX).toBeLessThan(m.groups[3].centerX);
  });
  it('gives a data set more room before it, and normal room by default', () => {
    const { p, table } = setup();
    const plain = columnLayout({ x: 0, width: 400 }, table.groups.map((g) => g.id), p.charts[0].bars, {});
    const idList = table.groups.map((g) => g.id);
    const gapOf = (l: typeof plain, i: number) => l.x(idList[i])! - (l.x(idList[i - 1])! + l.bw);
    expect(gapOf(plain, 1)).toBeCloseTo(gapOf(plain, 2), 6);
    const wide = columnLayout({ x: 0, width: 400 }, idList, p.charts[0].bars, { [idList[2]]: 300 });
    expect(gapOf(wide, 2)).toBeCloseTo(gapOf(wide, 1) * 3, 6);
    // Everything still fits between the edges of the plotting region.
    expect(wide.x(idList[3])! + wide.bw).toBeLessThanOrEqual(400);
    const none = setGroupGap(p.charts[0].id, idList[2], 100)(p);
    expect(none.charts[0].groupGaps).toEqual({});
  });
  it('is kept in a saved file', () => {
    const { p, table } = setup();
    const idList = table.groups.map((g) => g.id);
    let next = setGroupOrder(p.charts[0].id, [...idList].reverse())(p);
    next = setGroupGap(p.charts[0].id, idList[1], 150)(next);
    const back = parseProject(stringifyProject(next));
    expect(back.charts[0].groupOrder).toEqual([...idList].reverse());
    expect(back.charts[0].groupGaps).toEqual({ [idList[1]]: 150 });
  });
});
