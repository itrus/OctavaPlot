import { describe, expect, it } from 'vitest';
import { buildXyModel } from '../chart/xyModel';
import { addChart, addDataTable, setLayerHidden } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { NO_FIT_SETTINGS } from './fitOptions';
import { createExampleProject } from './defaults';
import { layerRows, layersAvailable, layersOf } from './layers';
import type { Chart, Project } from './types';

const projectWith = (patch: (c: Chart) => Chart = (c) => c): Project => {
  const p = addChart('c', 't', undefined, 'xyLine')(addDataTable('t', 'xy', { sample: true })(createExampleProject()));
  return { ...p, charts: p.charts.map((c) => (c.id === 'c' ? patch(c) : c)) };
};
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const layers = (p: Project) => layersOf(chartOf(p), tableOf(p));
const withStyle = (patch: Record<string, unknown>) => (c: Chart): Chart => ({ ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, ...patch } } : l)) });
/** A bar chart on a column table, which is not drawn from layers. */
const barProject = (): Project => {
  const p = addDataTable('x', 'column', { sample: true })(createExampleProject());
  return addChart('b', 'x', undefined, 'bar')(p);
};

describe('layers of an XY chart', () => {
  it('are available for the XY family only', () => {
    expect(layersAvailable(chartOf(projectWith()))).toBe(true);
    expect(layersAvailable(barProject().charts.find((c) => c.id === 'b')!)).toBe(false);
  });
  it('have unique ids and a strictly increasing drawing order', () => {
    const ls = layers(projectWith());
    expect(new Set(ls.map((l) => l.id)).size).toBe(ls.length);
    expect(ls.map((l) => l.z)).toEqual(ls.map((_, i) => i));
  });
  it('give each series points and a line, bound to its table and series', () => {
    const p = projectWith();
    const ls = layers(p);
    for (const kind of ['points', 'line'] as const) {
      const of = ls.filter((l) => l.kind === kind);
      expect(of.length).toBeGreaterThan(0);
      for (const l of of) expect(l.binding?.tableId).toBe('t');
    }
  });
  it('keep their ids and order when only the style changes, and when a chart is renamed', () => {
    const p = projectWith();
    const base = layers(p);
    const edit = (patch: (c: Chart) => Chart): Project => ({ ...p, charts: p.charts.map((c) => (c.id === 'c' ? patch(c) : c)) });
    expect(layers(edit(withStyle({ symbolSizePt: 9, lineWidthPt: 3 }))).map((l) => l.id)).toEqual(base.map((l) => l.id));
    expect(layers(edit((c) => ({ ...c, name: 'other' })))).toEqual(base);
  });
  it('turn the show flags into visibility without removing the layer (hiding is not disabling)', () => {
    const ls = layers(projectWith(withStyle({ showSymbols: false, showLines: false })));
    for (const l of ls.filter((x) => x.kind === 'points' || x.kind === 'line')) {
      expect(l.visible).toBe(false);
      expect(l.enabled).toBe(true);
    }
  });
  it('agree with what the model draws', () => {
    for (const patch of [{}, { showSymbols: false }, { showLines: false }, { showErrorBars: false }]) {
      const p = projectWith(withStyle(patch));
      const m = buildXyModel(chartOf(p), tableOf(p));
      const ls = layers(p);
      for (const s of m.series) {
        const at = (kind: string) => ls.find((l) => l.id === `${s.groupId}:${kind}`);
        expect(at('points')?.visible).toBe(s.style.showSymbols);
        expect(at('line')?.visible).toBe(s.style.showLines);
        if (s.errorPath !== '') expect(at('errorBars')?.visible).toBe(true);
      }
    }
  });
  it('put the fit curve and its band in only when a fit is chosen, and keep the band out of the axis range', () => {
    expect(layers(projectWith()).some((l) => l.kind === 'fitCurve' || l.kind === 'fitBand')).toBe(false);
    const ls = layers(projectWith((c) => ({ ...c, fit: { ...c.fit, analysisId: 'a1', band: 'confidence' } })));
    const curve = ls.find((l) => l.kind === 'fitCurve')!;
    const band = ls.find((l) => l.kind === 'fitBand')!;
    expect(curve.calc).toEqual({ kind: 'curvefit', analysisId: 'a1' });
    expect(curve.rangeContribution).toBe(true);
    expect(band.rangeContribution).toBe(false);
    expect(band.z).toBeLessThan(curve.z);
    const noBand = layers(projectWith((c) => ({ ...c, fit: { ...c.fit, analysisId: 'a1', band: 'none' } })));
    expect(noBand.some((l) => l.kind === 'fitBand')).toBe(false);
    expect(noBand.some((l) => l.kind === 'fitCurve')).toBe(true);
  });
  it('draw points over the line parts, or under them when lines go on top', () => {
    const z = (ls: ReturnType<typeof layers>, kind: string) => ls.find((l) => l.kind === kind)!.z;
    const normal = layers(projectWith());
    expect(z(normal, 'points')).toBeGreaterThan(z(normal, 'line'));
    const top = layers(projectWith((c) => ({ ...c, lineOrder: 'onTop' })));
    expect(z(top, 'points')).toBeLessThan(z(top, 'line'));
  });
  it('refuses a family that is not drawn from layers', () => {
    const bar = barProject();
    expect(() => layersOf(bar.charts.find((x) => x.id === 'b')!, bar.dataTables.find((t) => t.id === 'x')!)).toThrow();
  });
});

describe('layer rows and hiding', () => {
  const withFitChart = (p: Project): Project => ({ ...p, charts: p.charts.map((c) => (c.id === 'c' ? { ...c, fit: { ...c.fit, analysisId: 'a1', band: 'confidence' as const } } : c)) });

  it('list the data layers topmost first, named by kind and series', () => {
    const p = withFitChart(projectWith());
    const rows = layerRows(chartOf(p), tableOf(p));
    expect(rows.every((r) => r.layer.kind !== 'referenceLine' && r.layer.kind !== 'annotation')).toBe(true);
    expect(rows.map((r) => r.layer.z)).toEqual([...rows.map((r) => r.layer.z)].sort((a, b) => b - a));
    expect(rows.filter((r) => r.layer.kind === 'fitBand').map((r) => r.label)).toEqual(['Fit band: Series B', 'Fit band: Series A']);
  });
  it('offer hiding only where the style has not already switched the layer off', () => {
    const p = withFitChart(projectWith(withStyle({ showLines: false })));
    const rows = layerRows(chartOf(p), tableOf(p));
    const line = rows.find((r) => r.layer.kind === 'line')!;
    expect([line.shown, line.canToggle, line.reason]).toEqual([false, false, 'Switched off in Style']);
    expect(rows.find((r) => r.layer.kind === 'fitCurve')?.canToggle).toBe(true);
  });
  it('setLayerHidden hides and shows by id, and is idempotent', () => {
    const p = withFitChart(projectWith());
    const id = layersOf(chartOf(p), tableOf(p)).find((l) => l.kind === 'fitBand')!.id;
    const hidden = setLayerHidden('c', id, true)(p);
    expect(chartOf(hidden).hiddenLayerIds).toEqual([id]);
    expect(setLayerHidden('c', id, true)(hidden)).toEqual(hidden);
    expect(layerRows(chartOf(hidden), tableOf(hidden)).find((r) => r.layer.id === id)?.shown).toBe(false);
    expect(chartOf(setLayerHidden('c', id, false)(hidden)).hiddenLayerIds).toEqual([]);
  });
  it('hiding leaves the axes of the chart as they were', () => {
    const p = withFitChart(projectWith());
    const ids = layersOf(chartOf(p), tableOf(p)).filter((l) => l.kind === 'fitCurve' || l.kind === 'fitBand').map((l) => l.id);
    const fit = { ...NO_FIT_SETTINGS, model: 'linear' as const, band: 'confidence' as const, level: 0.95 };
    const a = buildXyModel(chartOf(p), tableOf(p), fit);
    const b = buildXyModel({ ...chartOf(p), hiddenLayerIds: ids }, tableOf(p), fit);
    expect([b.y.domain, b.x.domain]).toEqual([a.y.domain, a.x.domain]);
  });
  it('are saved and read back, and anything that is not an id is dropped', () => {
    const p = withFitChart(projectWith());
    const id = layersOf(chartOf(p), tableOf(p))[0].id;
    const hidden = setLayerHidden('c', id, true)(p);
    expect(chartOf(parseProject(stringifyProject(hidden))).hiddenLayerIds).toEqual([id]);
    const raw = JSON.parse(stringifyProject(hidden));
    raw.project.charts.find((c: { id: string }) => c.id === 'c').hiddenLayerIds = [id, 3, null, { a: 1 }];
    expect(chartOf(parseProject(JSON.stringify(raw))).hiddenLayerIds).toEqual([id]);
    delete raw.project.charts.find((c: { id: string }) => c.id === 'c').hiddenLayerIds;
    expect(chartOf(parseProject(JSON.stringify(raw))).hiddenLayerIds).toEqual([]);
  });
});
