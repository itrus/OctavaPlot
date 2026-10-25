import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import type { ChartType, Project, TableKind } from '../model/types';
import { addChart, addDataTable, patchLook, patchSurvival } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { chartToSvgString } from './export';
import { buildGroupedModel } from './groupedModel';
import { buildSurvivalModel } from './survivalModel';

function projectWith(kind: TableKind, type: ChartType, options?: Parameters<typeof addDataTable>[2]): Project {
  const p = addDataTable('t', kind, { sample: true, ...options })(createExampleProject());
  return addChart('c', 't', undefined, type)(p);
}
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const horizontal = (p: Project) => patchLook('c', { orientation: 'horizontal' })(p);

describe('horizontal grouped and contingency bars', () => {
  for (const [kind, type] of [['grouped', 'groupedBar'], ['grouped', 'groupedStacked'], ['contingency', 'contingencyBars'], ['contingency', 'contingencyStacked'], ['contingency', 'contingencyPercent']] as const) {
    it(`${type}: the value axis runs along the bottom and the categories down the left`, () => {
      const p = projectWith(kind, type);
      const v = buildGroupedModel(chartOf(p), tableOf(p));
      const h = buildGroupedModel(chartOf(horizontal(p)), tableOf(p));
      expect(v.orient.horizontal).toBe(false);
      expect(h.orient.horizontal).toBe(true);
      expect(h.orient.virtual.width).toBeCloseTo(h.orient.real.height, 6);
      // The same bars, made in the turned region: as many, with the same values.
      expect(h.series.map((s) => s.bars.map((b) => b.value))).toEqual(v.series.map((s) => s.bars.map((b) => b.value)));
      // Low end of the value axis at the left edge, high end at the right edge.
      expect(h.orient.toScreen(0, h.yScale(h.y.domain[0])).x).toBeCloseTo(h.orient.real.x, 6);
      expect(h.orient.toScreen(0, h.yScale(h.y.domain[1])).x).toBeCloseTo(h.orient.real.x + h.orient.real.width, 6);
      const svg = chartToSvgString(chartOf(horizontal(p)), tableOf(p));
      expect(svg).toContain('matrix(0 1 -1 0');
      expect(svg).not.toContain('NaN');
    });
  }
  it('lines over categories stay vertical, and the setting is saved', () => {
    const p = horizontal(projectWith('grouped', 'groupedLine'));
    expect(buildGroupedModel(chartOf(p), tableOf(p)).orient.horizontal).toBe(false);
    const q = horizontal(projectWith('grouped', 'groupedBar'));
    expect(parseProject(stringifyProject(q)).charts.find((c) => c.id === 'c')!.orientation).toBe('horizontal');
  });
  it('a gallery entry makes the horizontal chart', () => {
    const p = addChart('h', 't', undefined, 'contingencyStacked', { orientation: 'horizontal' })(addDataTable('t', 'contingency', { sample: true })(createExampleProject()));
    expect(p.charts.find((c) => c.id === 'h')!.orientation).toBe('horizontal');
  });
});

describe('floating bars of a grouped table', () => {
  const withReplicates = () => projectWith('grouped', 'groupedFloating', { layout: { kind: 'replicates', n: 3 } });
  it('run from the smallest to the largest replicate, with a line at the mean', () => {
    const p = withReplicates();
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    const bars = m.series.flatMap((s) => s.bars);
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) {
      expect(b.range![0]).toBeLessThanOrEqual(b.range![1]);
      // The centre line lies inside its bar, between its top and its bottom edge.
      expect(b.centerLine!.y).toBeGreaterThanOrEqual(b.y - 1e-9);
      expect(b.centerLine!.y).toBeLessThanOrEqual(b.y + b.height + 1e-9);
      expect(b.centerLine!.x2 - b.centerLine!.x1).toBeCloseTo(b.width, 9);
    }
    expect(m.series.every((s) => s.errorPath === '')).toBe(true);
    expect(chartToSvgString(chartOf(p), tableOf(p))).not.toContain('NaN');
  });
  it('need replicates or limits: a single value has no range, and says so', () => {
    const p = projectWith('grouped', 'groupedFloating');
    const m = buildGroupedModel(chartOf(p), tableOf(p));
    expect(m.series.every((s) => s.bars.length === 0)).toBe(true);
    expect(m.warnings.join(' ')).toMatch(/no range to draw a floating bar/);
  });
  it('can run horizontally', () => {
    const p = horizontal(withReplicates());
    expect(buildGroupedModel(chartOf(p), tableOf(p)).orient.horizontal).toBe(true);
  });
});

describe('survival symbols and error bars', () => {
  it('put a symbol at every event as well as at the censored subjects', () => {
    const p = projectWith('survival', 'survival');
    const plain = buildSurvivalModel(chartOf(p), tableOf(p));
    const withEvents = buildSurvivalModel(chartOf(patchSurvival('c', { eventSymbols: true })(p)), tableOf(p));
    expect(withEvents.series.some((s, i) => s.points.length > plain.series[i].points.length)).toBe(true);
    // Each symbol has its own identity.
    for (const s of withEvents.series) expect(new Set(s.points.map((x) => x.id)).size).toBe(s.points.length);
  });
  it('draw one standard error either side of the estimate at each event time, within 0 to 1', () => {
    const p = patchSurvival('c', { errorBars: true })(projectWith('survival', 'survival'));
    const m = buildSurvivalModel(chartOf(p), tableOf(p));
    expect(m.series.some((s) => s.errorPath.startsWith('M'))).toBe(true);
    expect(m.series.find((s) => s.errorPath !== '')!.errorMeaning).toBe('SE (Greenwood)');
    const top = m.yScale(1);
    const bottom = m.yScale(0);
    // The stem of every bar is "M x,top V bottom": both ends stay on the 0 to 1 axis.
    for (const s of m.series) {
      for (const q of s.errorPath.matchAll(/M([-\d.]+),([-\d.]+)V([-\d.]+)/g)) {
        for (const y of [Number(q[2]), Number(q[3])]) {
          expect(y).toBeGreaterThanOrEqual(top - 1e-6);
          expect(y).toBeLessThanOrEqual(bottom + 1e-6);
        }
      }
    }
  });
  it('are options of the chart that are saved, and a cumulative curve takes them too', () => {
    const p = patchSurvival('c', { errorBars: true, eventSymbols: true })(projectWith('survival', 'cumulativeEvent'));
    expect(parseProject(stringifyProject(p)).charts.find((c) => c.id === 'c')!.survival).toMatchObject({ errorBars: true, eventSymbols: true });
    expect(buildSurvivalModel(chartOf(p), tableOf(p)).series.some((s) => s.errorPath !== '')).toBe(true);
  });
  it('are made by the gallery entries', () => {
    const base = addDataTable('t', 'survival', { sample: true })(createExampleProject());
    const q = addChart('s', 't', undefined, 'survival', { survival: { eventSymbols: true } })(base);
    expect(q.charts.find((c) => c.id === 's')!.survival.eventSymbols).toBe(true);
    const r = addChart('k', 't', undefined, 'cumulativeEvent', { survival: { errorBars: true } })(base);
    expect(r.charts.find((c) => c.id === 'k')!.survival.errorBars).toBe(true);
  });
});
