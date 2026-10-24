import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createChart, createXyTable } from '../model/defaults';
import { NO_FIT_SETTINGS } from '../model/fitOptions';
import { layersOf } from '../model/layers';
import type { Chart, FitSettings } from '../model/types';
import { calcStats } from '../stats/calcCache';
import { buildAnyModel, ChartCanvas } from './anyModel';
import { chartToSvgString } from './export';
import { BAND_OPACITY } from './survivalModel';

const table = createXyTable('XY', true);
const base = createChart(table.id, undefined, 'xyLine');
const fit: FitSettings = { ...NO_FIT_SETTINGS, model: 'linear', band: 'confidence', level: 0.95 };
const withFit = (c: Chart, extra: Partial<Chart> = {}): Chart => ({ ...c, ...extra, fit: { ...c.fit, analysisId: 'a1', band: 'confidence' } });
const style = (c: Chart, patch: Record<string, unknown>): Chart => ({ ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, ...patch } } : l)) });

const bands = (svg: string) => (svg.match(new RegExp(`fill-opacity="${BAND_OPACITY}" stroke="none"`, 'g')) ?? []).length;
const render = (chart: Chart, f: FitSettings = fit, layered = true): string => {
  const any = buildAnyModel(chart, table, f);
  const model = any.family === 'xy' && !layered ? { ...any.model, layers: undefined } : any.model;
  return renderToStaticMarkup(createElement(ChartCanvas, { chart, any: { ...any, model } as typeof any, cssWidth: '600px', cssHeight: '400px' }));
};

describe('an XY chart drawn from its layers', () => {
  const configs: Array<[string, Chart, FitSettings]> = [
    ['plain', base, NO_FIT_SETTINGS],
    ['with a fit and band', withFit(base), fit],
    ['lines on top', withFit(base, { lineOrder: 'onTop' }), fit],
    ['no symbols', style(withFit(base), { showSymbols: false }), fit],
    ['no lines', style(withFit(base), { showLines: false }), fit],
    ['scatter', createChart(table.id, undefined, 'xyScatter'), NO_FIT_SETTINGS],
  ];
  it.each(configs)('is the same drawing as before, byte for byte: %s', (_, chart, f) => {
    expect(render(chart, f, true)).toBe(render(chart, f, false));
  });

  it('hides the band and keeps the fit curve, the points and every calculation', () => {
    const chart = withFit(base);
    const band = layersOf(chart, table).filter((l) => l.kind === 'fitBand');
    expect(band.length).toBeGreaterThan(0);
    const full = render(chart);
    expect(bands(full)).toBeGreaterThan(0);

    const computedBefore = calcStats.computed;
    const hidden = { ...chart, hiddenLayerIds: band.map((l) => l.id) };
    const without = render(hidden);
    expect(bands(without)).toBe(0);
    // Nothing else changed in the drawing: the band was the only thing taken out.
    expect(without.length).toBeLessThan(full.length);
    const strip = (svg: string) => svg.replace(new RegExp(`<path[^>]*fill-opacity="${BAND_OPACITY}" stroke="none"></path>`, 'g'), '');
    expect(strip(full)).toBe(without);
    // Hiding is not disabling: the model, its fit and its axes are those of the chart with the band shown.
    expect(calcStats.computed).toBe(computedBefore);
    const a = buildAnyModel(chart, table, fit).model;
    const b = buildAnyModel(hidden, table, fit).model;
    expect(JSON.stringify(b)).toBe(JSON.stringify({ ...a, layers: (a as { layers: Array<{ id: string; visible: boolean }> }).layers.map((l) => (band.some((x) => x.id === l.id) ? { ...l, visible: false } : l)) }));
  });

  it('hides each part on its own', () => {
    const chart = withFit(base);
    const full = render(chart);
    for (const kind of ['points', 'line', 'fitCurve', 'errorBars'] as const) {
      const ids = layersOf(chart, table).filter((l) => l.kind === kind && l.visible).map((l) => l.id);
      if (ids.length === 0) continue;
      const out = render({ ...chart, hiddenLayerIds: ids });
      expect(out, kind).not.toBe(full);
      expect(bands(out), `${kind} keeps the band`).toBe(bands(full));
    }
  });

  it('exports with the band hidden', () => {
    const chart = { ...withFit(base), hiddenLayerIds: layersOf(withFit(base), table).filter((l) => l.kind === 'fitBand').map((l) => l.id) };
    expect(bands(chartToSvgString(chart, table, fit))).toBe(0);
  });
});
