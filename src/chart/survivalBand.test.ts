import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { xySeries } from '../model/tableLayout';
import type { ChartType, Project, TableKind } from '../model/types';
import { addChart, addDataTable, patchStyle, patchSurvival, setCells } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { normalQuantile } from '../stats/special';
import { chartToSvgString } from './export';
import { buildGroupedModel } from './groupedModel';
import { buildSurvivalModel, kaplanMeier, numberAtRisk, survivalInterval } from './survivalModel';

function projectWith(kind: TableKind, type: ChartType, options?: Parameters<typeof addDataTable>[2]): Project {
  const p = addDataTable('t', kind, { sample: true, ...options })(createExampleProject());
  return addChart('c', 't', undefined, type)(p);
}
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const subj = (rows: Array<[number, boolean]>) => rows.map(([time, event], row) => ({ time, event, row }));

describe('survival confidence band and at-risk table', () => {
  it('normalQuantile gives the usual critical values', () => {
    expect(normalQuantile(0.975)).toBeCloseTo(1.959964, 5);
    expect(normalQuantile(0.995)).toBeCloseTo(2.575829, 5);
    expect(normalQuantile(0.5)).toBeCloseTo(0, 12);
    expect(normalQuantile(0.025)).toBeCloseTo(-normalQuantile(0.975), 10);
    expect(normalQuantile(0.001)).toBeCloseTo(-3.090232, 5);
  });

  it('accumulates the Greenwood sum over the event times', () => {
    const km = kaplanMeier(subj([[1, true], [2, true], [3, true], [4, true], [5, true]]));
    expect(km.steps[0].greenwood).toBeCloseTo(0.05, 12);
    expect(km.steps[1].greenwood).toBeCloseTo(0.05 + 1 / (4 * 3), 12);
    // The last subject's event makes the variance infinite (the estimate is 0).
    expect(km.steps[4].greenwood).toBe(Infinity);
  });

  it('plain and log-log intervals follow their formulas and stay inside 0 to 1', () => {
    const step = { survival: 0.8, greenwood: 0.05 };
    const [pl, ph] = survivalInterval(step, 0.95, 'plain')!;
    const se = 0.8 * Math.sqrt(0.05);
    expect(pl).toBeCloseTo(0.8 - 1.959964 * se, 5);
    expect(ph).toBe(1);
    const [ll, lh] = survivalInterval(step, 0.95, 'loglog')!;
    const sell = Math.sqrt(0.05) / Math.abs(Math.log(0.8));
    expect(ll).toBeCloseTo(0.8 ** Math.exp(1.959964 * sell), 5);
    expect(lh).toBeCloseTo(0.8 ** Math.exp(-1.959964 * sell), 5);
    expect(ll).toBeGreaterThan(0);
    expect(lh).toBeLessThan(1);
    const [l99, h99] = survivalInterval(step, 0.99, 'loglog')!;
    expect(h99 - l99).toBeGreaterThan(lh - ll);
  });

  it('has no interval where a limit is undefined (spec 15.2): at S = 0, an infinite variance, or log-log at S = 1', () => {
    expect(survivalInterval({ survival: 0, greenwood: Infinity }, 0.95, 'loglog')).toBeNull();
    expect(survivalInterval({ survival: 0, greenwood: Infinity }, 0.95, 'plain')).toBeNull();
    expect(survivalInterval({ survival: 1, greenwood: 0 }, 0.95, 'loglog')).toBeNull();
    expect(survivalInterval({ survival: 1, greenwood: 0 }, 0.95, 'plain')).toEqual([1, 1]);
  });

  it('counts the subjects at risk at a time', () => {
    const km = kaplanMeier(subj([[2, true], [3, false], [5, true], [5, false]]));
    expect([0, 2, 3, 4, 5, 6].map((t) => numberAtRisk(km, t))).toEqual([4, 4, 3, 2, 2, 0]);
  });

  it('draws the band and the table only when asked, with the table making room below the plot', () => {
    const p = projectWith('survival', 'survival');
    const base = buildSurvivalModel(chartOf(p), tableOf(p));
    expect(base.series.every((s) => !s.bandPath)).toBe(true);
    expect(base.atRisk).toBeNull();

    const on = patchSurvival('c', { band: true, atRisk: true })(p);
    const m = buildSurvivalModel(chartOf(on), tableOf(on));
    expect(m.series[0].bandPath).toMatch(/^M[\d.,]+L.*Z$/);
    expect(m.atRisk!.rows).toHaveLength(2);
    expect(m.atRisk!.rows[0].counts[0]).toBe(10);
    expect(m.atRisk!.rows[0].counts.at(-1)!).toBeLessThanOrEqual(m.atRisk!.rows[0].counts[0]);
    expect(m.layout.plot.height).toBeLessThan(base.layout.plot.height);
    expect(m.layout.extraBottom!.y).toBeGreaterThan(m.layout.plot.y + m.layout.plot.height);
  });

  it('the band of the cumulative curve is drawn too', () => {
    const p = patchSurvival('c', { band: true })(projectWith('survival', 'cumulativeEvent'));
    expect(buildSurvivalModel(chartOf(p), tableOf(p)).series[0].bandPath).not.toBe('');
  });

  it('exports the band and the table as vectors', () => {
    const p = patchSurvival('c', { band: true, atRisk: true })(projectWith('survival', 'survival'));
    const svg = chartToSvgString(chartOf(p), tableOf(p));
    expect(svg).toContain('Number at risk');
    expect(svg).toContain('fill-opacity="0.2"');
    expect(svg).not.toContain('data-');
  });

  it('saves and loads the options, and falls back for bad stored values', () => {
    const p = patchSurvival('c', { band: true, level: 0.9, method: 'plain', atRisk: true })(projectWith('survival', 'survival'));
    expect(parseProject(stringifyProject(p)).charts.find((c) => c.id === 'c')!.survival).toEqual({ band: true, level: 0.9, method: 'plain', atRisk: true, eventSymbols: false, errorBars: false });
    const file = JSON.parse(stringifyProject(p));
    file.project.charts.find((c: { id: string }) => c.id === 'c').survival = { band: 'yes', level: 7, method: 'x' };
    expect(parseProject(JSON.stringify(file)).charts.find((c) => c.id === 'c')!.survival).toEqual({ band: false, level: 0.95, method: 'loglog', atRisk: false, eventSymbols: false, errorBars: false });
  });
});

describe('individual replicate values over grouped bars', () => {
  const withDots = () => patchStyle('c', 'all', { showSymbols: true })(projectWith('grouped', 'groupedBar', { layout: { kind: 'replicates', n: 3 } }));

  it('are drawn for every replicate, inside the bar, when symbols are on', () => {
    const p = withDots();
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(m.series[0].dots).toHaveLength(3 * 2);
    const bar = m.series[0].bars[0];
    for (const d of m.series[0].dots.filter((x) => x.row === bar.row)) {
      expect(d.px).toBeGreaterThanOrEqual(bar.x);
      expect(d.px).toBeLessThanOrEqual(bar.x + bar.width);
      expect(m.yScale(d.value)).toBeCloseTo(d.py, 6);
    }
    expect(buildGroupedModel(chartOf(p), tableOf(p)).series[0].dots.map((d) => d.px)).toEqual(m.series[0].dots.map((d) => d.px));
  });

  it('are off by default, and not drawn for a single value, entered values or contingency counts', () => {
    const p = projectWith('grouped', 'groupedBar', { layout: { kind: 'replicates', n: 3 } });
    expect(buildGroupedModel(chartOf(p), tableOf(p)).series[0].dots).toEqual([]);
    const cases: Array<[TableKind, ChartType, Parameters<typeof addDataTable>[2] | undefined]> = [
      ['grouped', 'groupedBar', undefined],
      ['grouped', 'groupedBar', { layout: { kind: 'summary', format: 'mean-sd' } }],
      ['contingency', 'contingencyBars', undefined],
    ];
    for (const [kind, type, options] of cases) {
      const q = patchStyle('c', 'all', { showSymbols: true })(projectWith(kind, type, options));
      expect(buildGroupedModel(chartOf(q), tableOf(q)).series[0].dots).toEqual([]);
    }
  });

  it('widen the axis range to include a high replicate and show in the export', () => {
    const p = withDots();
    const t = tableOf(p);
    const col = xySeries(t)[0].columns[1];
    const edited = setCells(t.id, [{ row: 0, col: t.groups.indexOf(col), value: 40 }])(p).dataTables.find((x) => x.id === 't')!;
    expect(buildGroupedModel(chartOf(p), edited).y.domain[1]).toBeGreaterThanOrEqual(40);
    const svg = chartToSvgString(chartOf(p), t);
    expect((svg.match(/<path d="M[\d.]+,[\d.]+a/g) ?? []).length).toBeGreaterThanOrEqual(6);
    expect(svg).not.toContain('data-');
  });
});
