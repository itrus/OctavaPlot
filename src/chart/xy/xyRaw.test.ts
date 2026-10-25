import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { Chart, Project } from '../../model/types';
import { addChart, addDataTable, patchSummary } from '../../state/commands';
import { calcStats } from '../../stats/calcCache';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { buildXyModel } from './xyModel';
import { RAW_POINT_SCALE } from './xyScene';

const project = (kind: 'replicates' | 'single', patch: (c: Chart) => Chart = (c) => c): Project => {
  const layout = kind === 'replicates' ? ({ kind: 'replicates', n: 3 } as const) : undefined;
  const p = addChart('c', 't', undefined, 'xyScatter')(addDataTable('t', 'xy', { sample: true, ...(layout ? { layout } : {}) })(createExampleProject()));
  return { ...p, charts: p.charts.map((c) => (c.id === 'c' ? patch(c) : c)) };
};
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const rawOn = (c: Chart): Chart => ({ ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, showRawPoints: true } } : l)) });
const render = (p: Project, layered = true): string => {
  const any = buildAnyModel(chartOf(p), tableOf(p));
  const model = any.family === 'xy' && !layered ? { ...any.model, layers: undefined } : any.model;
  return renderToStaticMarkup(createElement(ChartCanvas, { chart: chartOf(p), any: { ...any, model } as typeof any, cssWidth: '600px', cssHeight: '400px' }));
};
const paths = (svg: string) => (svg.match(/<path/g) ?? []).length;

describe('the mean layer and the individual values of an XY chart', () => {
  it('a table of single values has no individual-values layer, and its points are not bound to a summary', () => {
    const p = project('single');
    const ls = layersOf(chartOf(p), tableOf(p));
    expect(ls.some((l) => l.kind === 'rawPoints')).toBe(false);
    expect(ls.filter((l) => l.kind === 'points').every((l) => l.calc === null)).toBe(true);
    expect(layerRows(chartOf(p), tableOf(p)).some((r) => r.label.startsWith('Points: '))).toBe(true);
  });

  it('a table of replicates has them, off until asked for, under the points, and its points are the mean', () => {
    const p = project('replicates');
    const ls = layersOf(chartOf(p), tableOf(p));
    const raw = ls.filter((l) => l.kind === 'rawPoints');
    const pts = ls.filter((l) => l.kind === 'points');
    expect(raw.length).toBe(pts.length);
    expect(raw.every((l) => !l.visible && !l.rangeContribution)).toBe(true);
    expect(pts.every((l) => l.calc?.kind === 'summary')).toBe(true);
    const on = layersOf(rawOn(chartOf(p)), tableOf(p)).filter((l) => l.kind === 'rawPoints');
    expect(on.every((l) => l.visible && l.rangeContribution)).toBe(true);
    expect(Math.max(...on.map((l) => l.z))).toBeLessThan(Math.min(...pts.map((l) => l.z)));
    const top = layersOf({ ...rawOn(chartOf(p)), lineOrder: 'onTop' }, tableOf(p));
    const z = (k: string) => top.find((l) => l.kind === k)!.z;
    expect(z('rawPoints')).toBeLessThan(z('points'));
    expect(z('points')).toBeLessThan(z('line'));
  });

  it('names the points layer for the centre it shows', () => {
    const p = project('replicates');
    const label = (q: Project) => layerRows(chartOf(q), tableOf(q)).find((r) => r.layer.kind === 'points')!.label;
    expect(label(p).startsWith('Mean: ')).toBe(true);
    const median = patchSummary('c', 'all', { centre: 'median', spread: 'none' })(p);
    expect(label(median).startsWith('Median: ')).toBe(true);
  });

  it('draws every replicate when asked for, at the symbol size scaled, and nothing otherwise', () => {
    const p = project('replicates');
    expect(buildXyModel(chartOf(p), tableOf(p)).series.every((s) => s.rawPoints === undefined)).toBe(true);
    const on = project('replicates', rawOn);
    const m = buildXyModel(chartOf(on), tableOf(on));
    const replicates = tableOf(on).groups.slice(1).flatMap((g) => g.observations).filter((o) => o.value !== null).length;
    expect(m.series.reduce((n, s) => n + (s.rawPoints?.length ?? 0), 0)).toBe(replicates);
    expect(RAW_POINT_SCALE).toBeLessThan(1);
    // Each lies where its value is on the axis.
    for (const s of m.series) for (const q of s.rawPoints ?? []) expect(q.py).toBeCloseTo(m.yScale(q.y), 6);
  });

  it('keeps the axis fitted to what is shown: a replicate beyond the error bars widens it only while shown', () => {
    // No error bars, so that only the mean and, while shown, the individual values hold the axis open.
    const noBars = (q: Project) => patchSummary('c', 'all', { spread: 'none' })(q);
    const p = noBars(project('replicates'));
    const t = tableOf(p);
    const outlier = { ...t, groups: t.groups.map((g, i) => (i === 1 ? { ...g, observations: g.observations.map((o, r) => (r === 0 ? { ...o, value: 1e3 } : o)) } : g)) };
    const withOutlier = (q: Project): Project => ({ ...q, dataTables: q.dataTables.map((x) => (x.id === 't' ? outlier : x)) });
    const hi = (q: Project) => buildXyModel(chartOf(q), tableOf(q)).y.domain[1];
    expect(hi(withOutlier(noBars(project('replicates', rawOn))))).toBeGreaterThanOrEqual(1e3);
    expect(hi(withOutlier(p))).toBeLessThan(1e3);
  });

  it('draws as before while off, byte for byte, and hides on its own by id without any recalculation', () => {
    const p = project('replicates');
    expect(render(p, true)).toBe(render(p, false));
    const on = project('replicates', rawOn);
    const full = render(on);
    expect(paths(full)).toBeGreaterThan(paths(render(p)));
    const ids = layersOf(chartOf(on), tableOf(on)).filter((l) => l.kind === 'rawPoints').map((l) => l.id);
    const before = calcStats.computed;
    const hidden = { ...on, charts: on.charts.map((c) => (c.id === 'c' ? { ...c, hiddenLayerIds: ids } : c)) };
    expect(render(hidden)).not.toBe(full);
    expect(paths(render(hidden))).toBe(paths(render(p)));
    expect(calcStats.computed).toBe(before);
  });
});
