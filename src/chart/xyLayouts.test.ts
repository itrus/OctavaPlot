import { describe, expect, it } from 'vitest';
import { createChart, createExampleProject, createXyTable } from '../model/defaults';
import { effectiveTable, graphSources } from '../model/chartTable';
import { SUMMARY_FORMATS, seriesWidth, subLabels, xySeries } from '../model/tableLayout';
import type { ReplicateLayout, SummaryFormat } from '../model/types';
import { addDataTable, addGroup, patchSummary, removeSeries, renameSeries, setCells, setGroupOnGraph } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { chartToSvgString } from './export';
import { buildXyModel, suppliedStats } from './xyModel';

const projectOf = (layout: ReplicateLayout) => {
  const table = createXyTable('XY 1', true, layout);
  const chart = createChart(table.id, undefined, 'xyLineSymbols');
  return { p: { id: 'p', name: 'p', dataTables: [table], charts: [chart] }, table, chart };
};

describe('table layouts', () => {
  it('knows how many columns a series takes and what they are called', () => {
    expect(seriesWidth({ kind: 'single' })).toBe(1);
    expect(seriesWidth({ kind: 'replicates', n: 4 })).toBe(4);
    expect(subLabels({ kind: 'replicates', n: 3 })).toEqual(['Y1', 'Y2', 'Y3']);
    expect(subLabels({ kind: 'summary', format: 'mean-sd-n' })).toEqual(['Mean', 'SD', 'N']);
    expect(SUMMARY_FORMATS).toHaveLength(8);
  });

  it('builds blocks of columns per series, named by the first column title', () => {
    const t = createXyTable('t', true, { kind: 'replicates', n: 3 });
    expect(t.groups).toHaveLength(1 + 2 * 3);
    const s = xySeries(t);
    expect(s.map((x) => x.name)).toEqual(['Series A', 'Series B']);
    expect(s[0].columns.map((c) => c.name)).toEqual(['Y1', 'Y2', 'Y3']);
    expect(s[0].id).toBe(t.groups[1].id);
  });

  it('adds, renames and removes whole series', () => {
    let p = addDataTable('t2', 'xy', { layout: { kind: 'replicates', n: 2 }, sample: true })(createExampleProject());
    const table = () => p.dataTables.find((t) => t.id === 't2')!;
    expect(table().groups).toHaveLength(1 + 2 * 2);
    p = addGroup('t2')(p);
    expect(table().groups).toHaveLength(1 + 3 * 2);
    expect(xySeries(table()).map((s) => s.name)).toEqual(['Series A', 'Series B', 'Series C']);
    p = renameSeries('t2', xySeries(table())[1].id, 'Treated')(p);
    expect(xySeries(table())[1].name).toBe('Treated');
    p = removeSeries('t2', xySeries(table())[0].id)(p);
    expect(table().groups).toHaveLength(1 + 2 * 2);
    p = removeSeries('t2', xySeries(table())[0].id)(p);
    // the last series cannot be removed
    p = removeSeries('t2', xySeries(table())[0].id)(p);
    expect(table().groups).toHaveLength(1 + 2);
  });

  it('a new table starts empty or with sample data', () => {
    const find = (p: ReturnType<typeof createExampleProject>, id: string) => p.dataTables.find((t) => t.id === id)!;
    const empty = find(addDataTable('e', 'xy')(createExampleProject()), 'e');
    expect(empty.groups.every((g) => g.observations.every((o) => o.value === null))).toBe(true);
    expect(find(addDataTable('s', 'xy', { sample: true })(createExampleProject()), 's').groups[0].observations[0].value).toBe(1);
    expect(find(addDataTable('c', 'column', { sample: true })(createExampleProject()), 'c').groups[0].observations[0].value).toBe(1.1);
    expect(find(addDataTable('c2', 'column')(createExampleProject()), 'c2').groups[0].observations[0].value).toBeNull();
  });
});

describe('XY chart of replicate values', () => {
  it('plots the centre of the replicates with an error bar from the chosen spread', () => {
    const { p, table, chart } = projectOf({ kind: 'replicates', n: 3 });
    const m = buildXyModel(chart, table);
    const s = m.series[0];
    expect(s.points).toHaveLength(8);
    const row0 = [0, 1, 2].map((k) => xySeries(table)[0].columns[k].observations[0].value!);
    expect(s.points[0].y).toBeCloseTo(row0.reduce((a, b) => a + b, 0) / 3, 9);
    expect(s.errorPath).not.toBe('');
    expect(s.errorMeaning).toBe('SD');
    expect(s.points[0].stats!.n).toBe(3);
    const none = patchSummary(chart.id, 'all', { spread: 'none' })(p);
    expect(buildXyModel(none.charts[0], table).series[0].errorPath).toBe('');
    const med = patchSummary(chart.id, 'all', { centre: 'median' })(p);
    expect(buildXyModel(med.charts[0], table).series[0].points[0].y).toBe([...row0].sort((a, b) => a - b)[1]);
  });

  it('draws a point when only some replicates are filled, and counts a row with none as not drawn', () => {
    const { p, table, chart } = projectOf({ kind: 'replicates', n: 3 });
    const edited = setCells(table.id, [
      { row: 0, col: 2, value: null },
      { row: 0, col: 3, value: null },
      { row: 1, col: 1, value: null },
      { row: 1, col: 2, value: null },
      { row: 1, col: 3, value: null },
    ])(p).dataTables[0];
    const m = buildXyModel(chart, edited);
    expect(m.series[0].points.find((q) => q.row === 0)!.stats!.n).toBe(1);
    expect(m.series[0].points.some((q) => q.row === 1)).toBe(false);
    expect(m.series[0].skipped).toBe(1);
  });

  it('exports the error bars as vector paths without editor attributes', () => {
    const { table, chart } = projectOf({ kind: 'replicates', n: 3 });
    const svg = chartToSvgString(chart, table);
    expect(svg).not.toContain('data-');
    expect(svg).toContain('stroke-linecap="butt"');
  });
});

describe('XY chart of values already calculated', () => {
  it('builds the interval from the error entered', () => {
    expect(suppliedStats('mean-sd', [10, 2])!.stats.interval).toMatchObject({ lower: 8, upper: 12, status: 'ok' });
    expect(suppliedStats('mean-sem-n', [10, 0.5, 4])!.stats).toMatchObject({ n: 4, effectiveSpread: 'sem' });
    expect(suppliedStats('mean-cv', [20, 10])!.stats.interval).toMatchObject({ lower: 18, upper: 22 });
    expect(suppliedStats('mean-pm', [5, 1.5])!.stats.interval).toMatchObject({ lower: 3.5, upper: 6.5 });
    expect(suppliedStats('mean-limits', [5, 7, 4])!.stats.interval).toMatchObject({ lower: 4, upper: 7 });
  });

  it('draws no bar for a missing, negative or inconsistent error, but still the mean', () => {
    expect(suppliedStats('mean-sd', [10, null])!.stats.interval.status).toBe('none');
    expect(suppliedStats('mean-sd', [10, -1])!.stats.interval.status).toBe('none');
    expect(suppliedStats('mean-limits', [5, 3, 7])!.stats.interval.status).toBe('none');
    expect(suppliedStats('mean-sd', [10, 1])!.stats.centre).toBe(10);
    expect(suppliedStats('mean-sd', [null, 1])).toBeNull();
  });

  it('plots a whole table of every supplied format', () => {
    for (const f of SUMMARY_FORMATS) {
      const { table, chart } = projectOf({ kind: 'summary', format: f.id as SummaryFormat });
      const m = buildXyModel(chart, table);
      expect(m.series).toHaveLength(2);
      expect(m.series[0].points).toHaveLength(8);
      expect(m.series[0].errorPath).not.toBe('');
      expect(m.warnings.filter((w) => w.includes('no usable error'))).toEqual([]);
    }
  });

  it('the axis range includes the error bars', () => {
    const { table, chart } = projectOf({ kind: 'summary', format: 'mean-limits' });
    const m = buildXyModel(chart, table);
    const top = Math.max(...m.series.flatMap((s) => s.points.map((q) => q.stats!.interval.upper!)));
    expect(m.y.domain[1]).toBeGreaterThanOrEqual(top);
  });
});

describe('series of sub-columns on a graph', () => {
  it('hides a whole series and lists series, not columns', () => {
    const { p, chart, table } = projectOf({ kind: 'replicates', n: 3 });
    expect(graphSources(p, chart).map((s) => s.group.name)).toEqual(['Series A', 'Series B']);
    const hidden = setGroupOnGraph(chart.id, table.id, xySeries(table)[0].id, false)(p);
    const t = effectiveTable(hidden, hidden.charts[0])!;
    expect(t.groups).toHaveLength(1 + 3);
    expect(buildXyModel(hidden.charts[0], t).series.map((s) => s.label)).toEqual(['Series B']);
  });

  it('saves and loads the layout, and rejects columns that do not fit it', () => {
    const { p } = projectOf({ kind: 'replicates', n: 3 });
    expect(parseProject(stringifyProject(p)).dataTables[0].layout).toEqual({ kind: 'replicates', n: 3 });
    const file = JSON.parse(stringifyProject(p));
    file.project.dataTables[0].layout.n = 4;
    expect(() => parseProject(JSON.stringify(file))).toThrow(/blocks of 4/);
  });
});

describe('supplied summaries', () => {
  it('gives no error bar for a %CV with a mean of 0, and no made-up N', () => {
    const z = suppliedStats('mean-cv-n', [0, 50, 4])!.stats;
    expect(z.interval.status).toBe('none');
    expect(suppliedStats('mean-sd-n', [10, 2, 2.5])!.stats.n).toBe(0);
    expect(suppliedStats('mean-sd-n', [10, 2, -3])!.stats.n).toBe(0);
    expect(suppliedStats('mean-sd-n', [10, 2, 6])!.stats.n).toBe(6);
  });
});
