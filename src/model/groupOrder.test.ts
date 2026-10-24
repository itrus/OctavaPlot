import { describe, expect, it } from 'vitest';
import { buildChartModel } from '../chart/model';
import { columnLayout } from '../chart/columns';
import { createChart, createColumnTable } from './defaults';
import { effectiveTable } from './chartTable';
import { applyOrder, moveGroup, sanitizeOrder } from './groupOrder';
import { AUTO_BAR_GAP_PCT, foldGroupGaps } from './columnOptions';
import { removeGroup, setGroupOrder } from '../state/commands';
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
  it('lays the columns out evenly, with the space between columns as the only spacing', () => {
    const { p, table } = setup();
    const idList = table.groups.map((g) => g.id);
    const layout = columnLayout({ x: 0, width: 400 }, idList, p.charts[0].bars);
    const gapOf = (i: number) => layout.x(idList[i])! - (layout.x(idList[i - 1])! + layout.bw);
    expect(gapOf(1)).toBeCloseTo(gapOf(2), 6);
    expect(gapOf(2)).toBeCloseTo(gapOf(3), 6);
    const wider = columnLayout({ x: 0, width: 400 }, idList, { ...p.charts[0].bars, gapPct: 200 });
    expect(wider.x(idList[1])! - (wider.x(idList[0])! + wider.bw)).toBeCloseTo(2 * wider.bw, 6);
  });
  it('is kept in a saved file', () => {
    const { p, table } = setup();
    const idList = table.groups.map((g) => g.id);
    const next = setGroupOrder(p.charts[0].id, [...idList].reverse())(p);
    const back = parseProject(stringifyProject(next));
    expect(back.charts[0].groupOrder).toEqual([...idList].reverse());
    expect('groupGaps' in back.charts[0]).toBe(false);
  });
});

describe('spaces before single data sets in older files', () => {
  const ids3 = ['a', 'b', 'c'];
  const bars = { gapPct: null, beforePct: null, afterPct: null, baseline: null };
  it('are added to the space between columns when they are all the same', () => {
    const r = foldGroupGaps({ b: 200, c: 200 }, ids3, bars);
    expect(r.bars.gapPct).toBeCloseTo(AUTO_BAR_GAP_PCT * 2, 1);
    expect(r.note).not.toBeNull();
    expect(foldGroupGaps({ b: 50, c: 50 }, ids3, { ...bars, gapPct: 80 }).bars.gapPct).toBe(40);
  });
  it('change nothing when they are all normal, and are dropped with a note when they differ', () => {
    expect(foldGroupGaps({}, ids3, bars)).toEqual({ bars, note: null });
    expect(foldGroupGaps({ b: 100, c: 100 }, ids3, bars)).toEqual({ bars, note: null });
    const mixed = foldGroupGaps({ b: 300 }, ids3, bars);
    expect(mixed.bars).toBe(bars);
    expect(mixed.note).toMatch(/dropped/);
  });
  it('are folded when an old file is opened, and are not written again', () => {
    const { p, table } = setup();
    const env = JSON.parse(stringifyProject(p));
    env.project.charts[0].groupGaps = Object.fromEntries(table.groups.slice(1).map((g) => [g.id, 200]));
    const back = parseProject(JSON.stringify(env));
    expect(back.charts[0].bars.gapPct).toBeCloseTo(AUTO_BAR_GAP_PCT * 2, 1);
    expect('groupGaps' in back.charts[0]).toBe(false);
    expect(stringifyProject(back)).not.toContain('groupGaps');
  });
});

describe('series colours stay with their data set', () => {
  it('keeps each data set palette index when others are reordered or removed', () => {
    const { p, table, chart } = setup();
    const before = new Map(table.groups.map((g) => [g.id, g.paletteIndex]));
    const [first, second, , last] = table.groups.map((g) => g.id);
    const reordered = setGroupOrder(chart.id, [last, second, first])(p);
    const removed = removeGroup(table.id, first)(reordered);
    const groups = removed.dataTables[0].groups;
    expect(groups.some((g) => g.id === first)).toBe(false);
    expect(reordered.charts[0].groupOrder).toEqual([last, second, first]);
    for (const g of groups) expect(g.paletteIndex).toBe(before.get(g.id));
  });
});
