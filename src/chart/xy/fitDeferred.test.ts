import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createChart, createXyTable } from '../../model/defaults';
import { NO_FIT_SETTINGS } from '../../model/options/fitOptions';
import { fitStats } from '../../model/project/curveFit';
import type { Chart, DataTable, FitSettings } from '../../model/types';
import { clearCalcCache } from '../../stats/calcCache';
import { WorkerFitEngine } from '../../stats/fitEngine';
import { fitJobStats, pendingFitCount, resetFitService, setFitEngine } from '../../stats/fitService';
import { InProcessWorker, ManualEngine } from '../../testing/fitEngines';
import { buildAnyModel, buildAnyModelCached, fitsPendingOf } from '../anyModel';
import { chartToSvgString } from '../export/export';
import { buildXyModel } from './xyModel';

/** A table whose two series follow a sum of two exponentials, and one row count small enough for a quick test. */
const decayTable = (rows = 24): DataTable => {
  const t = createXyTable('XY', true);
  const value = (g: number, r: number): number | null => {
    if (r >= rows) return null;
    const x = r * 0.5;
    return g === 0 ? x : 2 + g + (4 + g) * Math.exp(-0.7 * x) + 1.2 * Math.exp(-0.05 * x) + ((r * 7) % 5) * 0.03;
  };
  return { ...t, groups: t.groups.map((g, gi) => ({ ...g, observations: g.observations.map((o, r) => ({ ...o, value: value(gi, r) })) })) };
};
const twoPhase = (extra: Partial<FitSettings> = {}): FitSettings => ({ ...NO_FIT_SETTINGS, model: 'exp_two_phase', band: 'confidence', ...extra });
/** A graph that draws a curve fit (the fit layers exist when the graph is tied to an analysis). */
const chartOf = (t: DataTable): Chart => {
  const c = createChart(t.id, undefined, 'xyScatter');
  return { ...c, fit: { ...c.fit, analysisId: 'analysis', band: 'confidence' } };
};
const settled = () => vi.waitFor(() => expect(pendingFitCount()).toBe(0), { timeout: 20000 });

beforeEach(() => {
  clearCalcCache();
  resetFitService();
  setFitEngine(new WorkerFitEngine(() => new InProcessWorker()));
  fitStats.calculated = 0;
});
afterEach(() => resetFitService());

describe('a graph with a fit that is made in the worker', () => {
  it('is drawn at first without the curve, band, numbers or reason, and says that the fit is pending', () => {
    const t = decayTable();
    const m = buildXyModel(chartOf(t), t, twoPhase(), { deferFits: true });
    expect(m.fitsPending).toBe(2);
    for (const s of m.series) {
      expect(s.fit).toEqual({ path: '', bandPath: '', summary: null, failure: null, pending: true });
      expect(s.points.length).toBeGreaterThan(0);
    }
    // No curve, no band and no invented explanation: nothing in the warnings or the scene stands for the fit yet.
    expect(m.warnings.join(' ')).not.toMatch(/fit|curve/i);
    // A layer with nothing to draw is not in the scene: no curve and no band are drawn, and none is invented.
    expect(m.scene!.layers.filter((l) => l.kind === 'fitCurve' || l.kind === 'fitBand')).toEqual([]);
  });

  it('is drawn with the curve and band when the fit is done, the same as when the fit is made on the spot', async () => {
    const t = decayTable();
    const chart = chartOf(t);
    const reference = buildXyModel(chart, t, twoPhase());
    expect(reference.series[0].fit?.path.startsWith('M')).toBe(true);
    clearCalcCache();
    resetFitService();
    setFitEngine(new WorkerFitEngine(() => new InProcessWorker()));
    expect(buildXyModel(chart, t, twoPhase(), { deferFits: true }).fitsPending).toBe(2);
    await settled();
    const m = buildXyModel(chart, t, twoPhase(), { deferFits: true });
    expect(m.fitsPending).toBe(0);
    m.series.forEach((s, i) => {
      expect(s.fit?.pending).toBeUndefined();
      expect(s.fit?.path).toBe(reference.series[i].fit?.path);
      expect(s.fit?.bandPath).toBe(reference.series[i].fit?.bandPath);
      expect(s.fit?.summary).toEqual(reference.series[i].fit?.summary);
    });
    // The axes hold the curve once it is known, exactly as with the synchronous fit.
    expect(m.y.domain).toEqual(reference.y.domain);
  });

  it('is not calculated again by a style or axis edit: the fit is found by its inputs', async () => {
    const t = decayTable();
    const chart = chartOf(t);
    buildAnyModelCached(chart, t, twoPhase(), { deferFits: true });
    await settled();
    const started = fitJobStats.started;
    expect(started).toBe(2);
    const edited: Chart[] = [
      { ...chart, title: 'A new title' },
      { ...chart, yAxis: { ...chart.yAxis, min: 0, max: 20 } },
      { ...chart, xAxis: { ...chart.xAxis, scale: 'linear', min: 0, max: 30 } },
    ];
    for (const c of edited) {
      const any = buildAnyModel(c, t, twoPhase(), { deferFits: true });
      expect(fitsPendingOf(any)).toBe(0);
      if (any.family === 'xy') expect(any.model.series[0].fit?.path.startsWith('M')).toBe(true);
    }
    expect(fitJobStats.started).toBe(started);
    expect(fitStats.calculated).toBe(0);
  });

  it('does not keep a model that waits for a fit: the next ask builds it again and finds the fit', async () => {
    const t = decayTable();
    const chart = chartOf(t);
    const first = buildAnyModelCached(chart, t, twoPhase(), { deferFits: true });
    expect(fitsPendingOf(first)).toBe(2);
    expect(buildAnyModelCached(chart, t, twoPhase(), { deferFits: true })).not.toBe(first);
    await settled();
    const done = buildAnyModelCached(chart, t, twoPhase(), { deferFits: true });
    expect(fitsPendingOf(done)).toBe(0);
    expect(buildAnyModelCached(chart, t, twoPhase(), { deferFits: true })).toBe(done);
  });

  it('drops the fit of the old inputs when the inputs change during the fit, and shows only the fit of the new ones', async () => {
    const engine = new ManualEngine();
    setFitEngine(engine);
    const t = decayTable();
    const chart = chartOf(t);
    buildXyModel(chart, t, twoPhase({ level: 0.95 }), { deferFits: true });
    expect(engine.requests).toHaveLength(2);
    // The level is changed while both series are still being fitted.
    const m = buildXyModel(chart, t, twoPhase({ level: 0.9 }), { deferFits: true });
    expect(m.fitsPending).toBe(2);
    expect(engine.requests.slice(0, 2).every((r) => r.aborted)).toBe(true);
    expect(engine.requests).toHaveLength(4);
    expect(fitJobStats.cancelled).toBe(2);
  });

  it('never shows uncertainty for a fit that failed, and says why', async () => {
    const t = decayTable(3);
    const chart = chartOf(t);
    const first = buildXyModel(chart, t, twoPhase(), { deferFits: true });
    expect(first.fitsPending).toBe(2);
    await settled();
    const m = buildXyModel(chart, t, twoPhase(), { deferFits: true });
    for (const s of m.series) {
      expect(s.fit).toMatchObject({ path: '', bandPath: '', summary: null });
      expect(s.fit?.failure).toMatch(/needs at least/);
      expect(s.fit?.pending).toBeUndefined();
    }
    expect(m.warnings.join(' ')).toMatch(/no curve was fitted/);
  });

  it('is exported with the final fit even while the screen still waits: export computes it itself', () => {
    const engine = new ManualEngine();
    setFitEngine(engine);
    const t = decayTable();
    const chart = chartOf(t);
    const preview = buildXyModel(chart, t, twoPhase(), { deferFits: true });
    expect(preview.fitsPending).toBe(2);
    expect(preview.series[0].fit?.path).toBe('');
    // Export asks for no deferral: the file has the curve and the band.
    const file = chartToSvgString(chart, t, twoPhase());
    const reference = buildXyModel(chart, t, twoPhase());
    expect(reference.series[0].fit?.path.startsWith('M')).toBe(true);
    expect(file).toContain(reference.series[0].fit!.path);
    expect(file).toContain(reference.series[0].fit!.bandPath);
  });

  it('exports the same file whether or not the screen made the fit first', async () => {
    const t = decayTable();
    const chart = chartOf(t);
    const alone = chartToSvgString(chart, t, twoPhase());
    expect(alone).toContain('M');
    clearCalcCache();
    fitStats.calculated = 0;
    resetFitService();
    setFitEngine(new WorkerFitEngine(() => new InProcessWorker()));
    buildXyModel(chart, t, twoPhase(), { deferFits: true });
    await settled();
    const afterWorker = chartToSvgString(chart, t, twoPhase());
    expect(afterWorker).toBe(alone);
    // and the worker's fit was found, not calculated again
    expect(fitStats.calculated).toBe(0);
  });

  it('draws the preview and the export from one scene: the only difference is the pending fit', async () => {
    const t = decayTable();
    const chart = chartOf(t);
    const pending = buildXyModel(chart, t, twoPhase(), { deferFits: true });
    const ids = (m: ReturnType<typeof buildXyModel>) => m.scene!.layers.flatMap((l) => [...l.paths.map((q) => q.id), ...(l.elements ?? []).map((q) => q.id)]);
    const withoutFit = ids(pending);
    await settled();
    const done = buildXyModel(chart, t, twoPhase(), { deferFits: true });
    const withFit = ids(done);
    const extra = withFit.filter((id) => !withoutFit.includes(id));
    expect(extra.length).toBeGreaterThan(0);
    expect(extra.every((id) => /fit/i.test(id ?? ""))).toBe(true);
    // Everything that was there stays there (hit-testing of the points is the same while the fit is pending).
    expect(withoutFit.every((id) => withFit.includes(id))).toBe(true);
  });
});
