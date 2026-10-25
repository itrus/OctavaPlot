import { describe, expect, it } from 'vitest';
import { effectiveTable } from '../../model/table/chartTable';
import { createChart, createColumnTable, createExampleProject } from '../../model/defaults';
import { xySeries } from '../../model/table/tableLayout';
import type { ChartType, Project, TableKind } from '../../model/types';
import { addChart, addDataTable, patchLook, setGroupOnGraph, setGroupOrder } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildGroupedModel } from '../grouped/groupedModel';
import { buildSurvivalModel } from '../survival/survivalModel';
import { buildXyModel } from '../xy/xyModel';

function projectWith(kind: TableKind, type: ChartType): Project {
  return addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true })(createExampleProject()));
}
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const eff = (p: Project) => effectiveTable(p, chartOf(p))!;

describe('the order of the series of a graph', () => {
  it('puts the series in the order asked for, keeping the X column first, and the colours with their series', () => {
    const p = projectWith('xy', 'xyLineSymbols');
    const ids = xySeries(eff(p)).map((s) => s.id);
    expect(ids.length).toBeGreaterThan(1);
    const flipped = setGroupOrder('c', [...ids].reverse())(p);
    const t = eff(flipped);
    expect(t.groups[0].id).toBe(eff(p).groups[0].id);
    expect(xySeries(t).map((s) => s.id)).toEqual([...ids].reverse());
    const before = buildXyModel(chartOf(p), eff(p));
    const after = buildXyModel(chartOf(flipped), t);
    expect(after.series.map((s) => s.label)).toEqual(before.series.map((s) => s.label).reverse());
    // Series A keeps its colour wherever it is drawn.
    for (const s of before.series) expect(after.series.find((x) => x.groupId === s.groupId)!.style.lineColor).toBe(s.style.lineColor);
  });
  it('works for grouped, contingency and survival tables too, with their colours', () => {
    for (const [kind, type] of [['grouped', 'groupedBar'], ['contingency', 'contingencyBars'], ['survival', 'survival']] as const) {
      const p = projectWith(kind, type);
      const ids = xySeries(eff(p)).map((s) => s.id);
      const flipped = setGroupOrder('c', [...ids].reverse())(p);
      expect(xySeries(eff(flipped)).map((s) => s.id), kind).toEqual([...ids].reverse());
      const colours = (q: Project) => {
        const m = kind === 'survival' ? buildSurvivalModel(chartOf(q), eff(q)) : buildGroupedModel(chartOf(q), eff(q));
        return new Map(m.series.map((s) => [s.groupId, s.style.barFill + s.style.lineColor]));
      };
      const a = colours(p);
      for (const [id, c] of colours(flipped)) expect(c, `${kind} ${id}`).toBe(a.get(id));
    }
  });
  it('keeps colours when a series is hidden, and goes back to the original order', () => {
    const p = projectWith('xy', 'xyLineSymbols');
    const [first, second] = xySeries(eff(p)).map((s) => s.id);
    const colour = (q: Project, id: string) => buildXyModel(chartOf(q), eff(q)).series.find((s) => s.groupId === id)!.style.symbolColor;
    const hidden = setGroupOnGraph('c', 't', first, false)(p);
    expect(colour(hidden, second)).toBe(colour(p, second));
    const restored = setGroupOrder('c', [])(setGroupOrder('c', [second, first])(p));
    expect(xySeries(eff(restored)).map((s) => s.id)).toEqual([first, second]);
  });
});

describe('lines and error bars over or under the symbols', () => {
  const indexOf = (svg: string, needle: RegExp) => svg.search(needle);
  it('XY: under the symbols by default and on top when asked; the setting is saved', () => {
    const p = projectWith('xy', 'xyLineSymbols');
    const table = eff(p);
    const auto = chartToSvgString(chartOf(p), table);
    const top = chartToSvgString(chartOf(patchLook('c', { lineOrder: 'onTop' })(p)), table);
    // The first line of the series (a stroked path without fill) comes before the first symbol in auto, after it on top.
    const firstLine = (svg: string) => indexOf(svg, /fill="none" stroke="#[0-9a-f]{6}" stroke-width="4"/i);
    const firstSymbol = (svg: string) => indexOf(svg, /<path d="M[\d.\-]+,[\d.\-]+a/);
    expect(firstLine(auto)).toBeGreaterThan(-1);
    expect(firstLine(auto)).toBeLessThan(firstSymbol(auto));
    expect(firstLine(top)).toBeGreaterThan(firstSymbol(top));
    expect(parseProject(stringifyProject(patchLook('c', { lineOrder: 'onTop' })(p))).charts.find((c) => c.id === 'c')!.lineOrder).toBe('onTop');
  });
  it('every chart type draws all three orders without trouble', () => {
    for (const [kind, type] of [['xy', 'xyLineSymbols'], ['grouped', 'groupedBar'], ['grouped', 'groupedLine'], ['contingency', 'contingencyStacked']] as const) {
      const p = projectWith(kind, type);
      const base = chartToSvgString(chartOf(p), eff(p));
      for (const order of ['onTop', 'underneath'] as const) {
        const svg = chartToSvgString(chartOf(patchLook('c', { lineOrder: order })(p)), eff(p));
        expect(svg, `${type} ${order}`).not.toContain('NaN');
        // The same marks, only in another order: the same amount of drawing.
        expect(svg.length, `${type} ${order}`).toBe(base.length);
      }
    }
    const col = createColumnTable('C', true);
    const chart = { ...createChart(col.id, undefined, 'bar'), lineOrder: 'underneath' as const };
    expect(chartToSvgString(chart, col)).not.toContain('NaN');
  });
  it('an old file without the setting loads as auto', () => {
    const p = projectWith('xy', 'xyLine');
    const file = JSON.parse(stringifyProject(p));
    delete file.project.charts.find((c: { id: string }) => c.id === 'c').lineOrder;
    expect(parseProject(JSON.stringify(file)).charts.find((c) => c.id === 'c')!.lineOrder).toBe('auto');
  });
});
