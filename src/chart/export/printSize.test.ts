import { describe, expect, it } from 'vitest';
import { createChart } from '../../model/defaults';
import type { Chart } from '../../model/types';
import { printScale, printSizeWarnings } from './printSize';

/** A chart 960 px wide (254 mm): printed at 127 mm it is scaled by exactly 0.5. All its text is large and all its lines thick. */
const roomy = (patch: Partial<Chart> = {}): Chart => {
  const c = createChart('t', { widthPx: 960, heightPx: 720 }, 'bar');
  const axis = { ...c.xAxis, lineWidthPt: 10, tickFontSizePt: 40, titleFontSizePt: 40 };
  return {
    ...c,
    titleFontSizePt: 40,
    xAxis: axis,
    yAxis: { ...axis },
    y2Axis: { ...axis },
    legend: { ...c.legend, fontSizePt: 40 },
    barLabels: { ...c.barLabels, sizePt: 40 },
    grid: { ...c.grid, widthPt: 10, minorWidthPt: 10 },
    defaults: { ...c.defaults, errorLineWidthPt: 10, lineWidthPt: 10, symbolBorderWidthPt: 10, barBorderWidthPt: 10, pointLabelFontSizePt: 40 },
    layers: c.layers.map((l) => ({ ...l, style: {} })),
    annotations: [],
    referenceLines: [],
    printWidthMm: 127,
    ...patch,
  };
};

describe('printScale', () => {
  it('is the print width over the width of the chart in mm', () => {
    const c = createChart('t', { widthPx: 640, heightPx: 480 });
    expect(printScale(c, 90)).toBeCloseTo(0.5315, 4);
    expect(printScale(roomy(), 127)).toBe(0.5);
  });
});

describe('printSizeWarnings', () => {
  it('says nothing when no print width is set', () => {
    const c = createChart('t', { widthPx: 640, heightPx: 480 });
    expect(c.printWidthMm).toBeUndefined();
    expect(printSizeWarnings(c)).toEqual([]);
    expect(printSizeWarnings({ ...c, printWidthMm: undefined })).toEqual([]);
  });
  it('says nothing for a roomy chart', () => {
    expect(printSizeWarnings(roomy())).toEqual([]);
  });
  it('names the item, its size and the width, as in the example of the roadmap', () => {
    const c = createChart('t', { widthPx: 640, heightPx: 480 }, 'bar');
    const w = printSizeWarnings({ ...roomy(), widthPx: 640, heightPx: 480, printWidthMm: 90, xAxis: { ...c.xAxis, tickFontSizePt: 10, lineWidthPt: 10, titleFontSizePt: 40 } });
    expect(w).toEqual(['Tick labels would print at 5.3 pt at 90 mm wide (smaller than 6 pt)']);
  });
  it('warns for text below 6 pt and not at 6 pt', () => {
    const at = (pt: number) => printSizeWarnings(roomy({ xAxis: { ...roomy().xAxis, tickFontSizePt: pt } }));
    expect(at(12)).toEqual([]);
    // 5.95 pt must not be shown as "6.0 pt (smaller than 6 pt)".
    expect(at(11.9)).toEqual(['Tick labels would print at 5.95 pt at 127 mm wide (smaller than 6 pt)']);
  });
  it('warns for lines below 0.25 pt and not at 0.25 pt', () => {
    const at = (pt: number) => printSizeWarnings(roomy({ yAxis: { ...roomy().yAxis, lineWidthPt: pt } }));
    expect(at(0.5)).toEqual([]);
    expect(at(0.4)).toEqual(['Axis lines would print at 0.20 pt at 127 mm wide (thinner than 0.25 pt)']);
    expect(at(0.499)).toHaveLength(1);
  });
  it('takes the smallest of several sources of one item', () => {
    const r = roomy();
    const w = printSizeWarnings({ ...r, xAxis: { ...r.xAxis, tickFontSizePt: 8 }, yAxis: { ...r.yAxis, tickFontSizePt: 4 } });
    expect(w).toEqual(['Tick labels would print at 2.0 pt at 127 mm wide (smaller than 6 pt)']);
  });
  it('reads the text of titles, the legend, labels and annotations', () => {
    const r = roomy();
    const w = printSizeWarnings({
      ...r,
      titleFontSizePt: 2,
      legend: { ...r.legend, fontSizePt: 2 },
      barLabels: { ...r.barLabels, show: 'value', sizePt: 2 },
      annotations: [{ id: 'a', text: 'n = 5', xFrac: 0, yFrac: 0, fontSizePt: 2, color: '#000000', opacity: 1 }],
    });
    expect(w.map((s) => s.split(' would')[0])).toEqual(['Chart title', 'Legend', 'Bar labels', 'Annotations']);
  });
  it('leaves out what is not drawn', () => {
    const r = roomy();
    const w = printSizeWarnings({
      ...r,
      showTitle: false,
      titleFontSizePt: 2,
      legend: { ...r.legend, visible: false, fontSizePt: 2 },
      barLabels: { ...r.barLabels, show: 'none', sizePt: 2 },
      xAxis: { ...r.xAxis, titleVisible: false, titleFontSizePt: 2, visible: false, tickFontSizePt: 2, lineWidthPt: 0.1 },
      defaults: { ...r.defaults, showErrorBars: false, errorLineWidthPt: 0.1, showPointLabels: false, pointLabelFontSizePt: 2 },
    });
    expect(w).toEqual([]);
  });
  it('reads lines of the data sets, error bars, grid and reference lines', () => {
    const r = roomy();
    const w = printSizeWarnings({
      ...r,
      grid: { ...r.grid, widthPt: 0.2 },
      xAxis: { ...r.xAxis, showGrid: true },
      defaults: { ...r.defaults, showErrorBars: true, errorLineWidthPt: 0.2, showBars: true, barBorderWidthPt: 0.2, showSymbols: true, symbolBorderWidthPt: 0.2, showLines: true, lineWidthPt: 0.2 },
      referenceLines: [{ id: 'r', axis: 'y', value: 1, color: '#000000', widthPt: 0.2, style: 'solid', opacity: 1, label: '', showLabel: false }],
    });
    expect(w.map((s) => s.split(' would')[0])).toEqual(['Grid lines', 'Error bars', 'Lines', 'Symbol borders', 'Bar borders', 'Reference lines']);
  });
  it('treats a width of zero as no line', () => {
    const r = roomy();
    expect(printSizeWarnings({ ...r, defaults: { ...r.defaults, showBars: true, barBorderWidthPt: 0 } })).toEqual([]);
  });
});
