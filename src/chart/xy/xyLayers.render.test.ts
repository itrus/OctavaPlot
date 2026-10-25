import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { describe, expect, it } from 'vitest';
import { createChart, createXyTable } from '../../model/defaults';
import { NO_FIT_SETTINGS } from '../../model/options/fitOptions';
import { layersOf } from '../../model/graph/layers';
import type { Chart, FitSettings } from '../../model/types';
import { calcStats } from '../../stats/calcCache';
import { buildAnyModel, ChartCanvas } from '../anyModel';
import { chartToSvgString } from '../export/export';
import { BAND_OPACITY } from '../survival/survivalModel';

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
    const strip = (svg: string) => svg.replace(new RegExp(`<path[^>]*fill-opacity="${BAND_OPACITY}" stroke="none" id="[^"]*"></path>`, 'g'), '');
    expect(strip(full)).toBe(without);
    // Hiding is not disabling: the model, its fit and its axes are those of the chart with the band shown.
    expect(calcStats.computed).toBe(computedBefore);
    const a = buildAnyModel(chart, table, fit).model;
    const b = buildAnyModel(hidden, table, fit).model;
    // The scene is the drawing: it differs by the band that is no longer in it, and by nothing else.
    const { scene: sceneA, ...restA } = a as unknown as { scene: { layers: Array<{ id: string }> } } & Record<string, unknown>;
    const { scene: sceneB, ...restB } = b as unknown as { scene: { layers: Array<{ id: string }> } } & Record<string, unknown>;
    expect(sceneA.layers.map((l) => l.id).filter((id) => !band.some((x) => x.id === id))).toEqual(sceneB.layers.map((l) => l.id));
    expect(JSON.stringify(restB)).toBe(JSON.stringify({ ...restA, layers: (restA as { layers: Array<{ id: string; visible: boolean }> }).layers.map((l) => (band.some((x) => x.id === l.id) ? { ...l, visible: false } : l)) }));
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

  it('hides a reference line or an annotation on its own, and nothing else', () => {
    const decorated: Chart = {
      ...base,
      referenceLines: [{ id: 'r1', axis: 'y', value: 5, color: '#cc0000', widthPt: 2, style: 'dashed', label: 'Limit', showLabel: true, opacity: 1 }],
      annotations: [{ id: 'n1', text: 'Note here', xFrac: 0.1, yFrac: 0.1, fontSizePt: 20, color: '#123456', opacity: 1 }],
    };
    const full = render(decorated, NO_FIT_SETTINGS);
    expect(full).toContain('data-reference-lines');
    expect(full).toContain('Note here');
    const noLine = render({ ...decorated, hiddenLayerIds: ['r1:referenceLine'] }, NO_FIT_SETTINGS);
    expect(noLine).not.toContain('data-reference-lines');
    expect(noLine).toContain('Note here');
    const noNote = render({ ...decorated, hiddenLayerIds: ['n1:annotation'] }, NO_FIT_SETTINGS);
    expect(noNote).not.toContain('Note here');
    expect(noNote).toContain('data-reference-lines');
    // The data are the same in all three.
    const dataOf = (svg: string) => svg.match(/<g clip-path="url\(#plot-clip\)">[\s\S]*<\/g><g stroke/)?.[0];
    expect(dataOf(full)).toContain('<path');
    expect(dataOf(noLine)).toBe(dataOf(full));
  });

  it('draws the fit curve and the band in a look of their own, and the line and the points as they were', () => {
    const chart = withFit(base);
    const ls = layersOf(chart, table);
    const curve = ls.find((l) => l.kind === 'fitCurve')!.id;
    const band = ls.find((l) => l.kind === 'fitBand')!.id;
    const full = render(chart);
    const styled = render({ ...chart, layerStyles: { [curve]: { color: '#abcdef', widthPt: 7, lineStyle: 'dotted' }, [band]: { color: '#fedcba', opacity: 0.6 } } });
    expect(styled).toContain('stroke="#abcdef"');
    expect(styled).toContain('stroke-width="7"');
    expect(styled).toContain('fill="#fedcba" fill-opacity="0.6"');
    // The other series' curve, and every series' line, keep the series look.
    expect(styled.match(/fill-opacity="0.2" stroke="none"/g)?.length).toBe((full.match(/fill-opacity="0.2" stroke="none"/g)?.length ?? 0) - 1);
    // Nothing is calculated again for a look.
    const before = calcStats.computed;
    render({ ...chart, layerStyles: { [curve]: { color: '#000001' } } });
    expect(calcStats.computed).toBe(before);
  });

  it('exports with the band hidden', () => {
    const chart = { ...withFit(base), hiddenLayerIds: layersOf(withFit(base), table).filter((l) => l.kind === 'fitBand').map((l) => l.id) };
    expect(bands(chartToSvgString(chart, table, fit))).toBe(0);
  });
});
