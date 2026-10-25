import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createXyTable } from '../../model/defaults';
import { bandPadding } from '../../model/options/columnOptions';
import { sanitizeLook } from '../../model/graph/look';
import { patchAxis, patchBars, patchLegend, patchLook } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildColumnModel } from '../column/columnModel';
import { buildXyModel } from '../xy/xyModel';
import type { Project } from '../../model/types';

const setup = () => {
  const table = createXyTable('XY 1', true);
  const chart = createChart(table.id, undefined, 'xyScatter');
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};

describe('fonts, titles and distances', () => {
  it('draw the text in the chosen font and colour, and drop bold', () => {
    const { p, table } = setup();
    const id = p.charts[0].id;
    let next = patchLook(id, { fontFamily: "Georgia, 'Times New Roman', serif", textColor: '#336699', titleBold: false })(p);
    next = patchAxis(id, 'yAxis', { tickBold: false })(next);
    const svg = chartToSvgString(next.charts[0], table);
    expect(svg).toContain('font-family="Georgia');
    expect(svg).toContain('fill="#336699"');
    const base = chartToSvgString(p.charts[0], table);
    expect(svg.split('font-weight="bold"').length).toBeLessThan(base.split('font-weight="bold"').length);
  });
  it('hide an axis title without losing its text', () => {
    const { p, table } = setup();
    const id = p.charts[0].id;
    const title = p.charts[0].xAxis.title;
    const next = patchAxis(id, 'xAxis', { titleVisible: false })(p);
    expect(next.charts[0].xAxis.title).toBe(title);
    expect(chartToSvgString(next.charts[0], table)).not.toContain(`>${title}</text>`);
    expect(chartToSvgString(p.charts[0], table)).toContain(`>${title}</text>`);
  });
  it('move the plot when a distance grows, and ignore a bad one', () => {
    const { p, table } = setup();
    const id = p.charts[0].id;
    const x0 = buildXyModel(p.charts[0], table).layout.plot;
    const moved = patchAxis(id, 'yAxis', { tickLabelOffsetPt: 10, titleOffsetPt: 6 })(p);
    const x1 = buildXyModel(moved.charts[0], table).layout.plot;
    expect(x1.x - x0.x).toBeCloseTo(16);
    const lower = patchLook(id, { titleOffsetPt: 12 })(p);
    expect(buildXyModel(lower.charts[0], table).layout.plot.y - x0.y).toBeCloseTo(12);
    expect(patchAxis(id, 'yAxis', { titleOffsetPt: -5 })(p).charts[0].yAxis.titleOffsetPt).toBe(0);
    expect(patchLook(id, { fontFamily: 'Comic Sans' })(p).charts[0].fontFamily).toBe(p.charts[0].fontFamily);
  });
});

describe('colours, frame and grid style', () => {
  it('draw white backgrounds and no frame by default', () => {
    const { table, chart } = setup();
    const svg = chartToSvgString(chart, table);
    expect(svg).toContain('background:#ffffff');
    expect(svg).not.toContain('fill-opacity');
    expect(svg).not.toContain('fill="none" stroke="#000000" stroke-width="2.6"/>');
  });
  it('draw a frame, the axis colour and transparent backgrounds when asked', () => {
    const { p, table } = setup();
    const next = patchLook(p.charts[0].id, { frame: 'box', axisColor: '#ff0000', pageColor: null, plotColor: null })(p);
    const svg = chartToSvgString(next.charts[0], table);
    expect(svg).toContain('stroke="#ff0000"');
    expect(svg).toMatch(/<rect[^>]*fill="none" stroke="#ff0000"/);
    expect(svg).toContain('background:transparent');
    expect(svg).toContain('fill-opacity="0"');
  });
  it('draw minor gridlines only when minor ticks and the grid are on', () => {
    const { p, table } = setup();
    const id = p.charts[0].id;
    const withGrid = patchAxis(id, 'yAxis', { showMinorGrid: true })(p);
    expect(chartToSvgString(withGrid.charts[0], table)).not.toContain('#e6e6e6');
    const both = patchAxis(id, 'yAxis', { showMinorGrid: true, minorTicks: 1 })(p);
    expect(chartToSvgString(both.charts[0], table)).toContain('stroke="#e6e6e6"');
  });
  it('ticks pointing in, both ways or none change the marks and the margin', () => {
    const { p, table } = setup();
    const id = p.charts[0].id;
    const out = chartToSvgString(p.charts[0], table);
    const none = chartToSvgString(patchAxis(id, 'yAxis', { tickDirection: 'none' })(p).charts[0], table);
    expect(none).not.toBe(out);
    expect(out).toContain('h-11.2');
    expect(chartToSvgString(patchAxis(id, 'yAxis', { tickDirection: 'in' })(p).charts[0], table)).toContain('h11.2');
    expect(chartToSvgString(patchAxis(id, 'yAxis', { tickDirection: 'both' })(p).charts[0], table)).toContain('h-22.4');
  });
  it('are kept in a saved file, and invalid stored values fall back', () => {
    const { p } = setup();
    const id = p.charts[0].id;
    let next = patchLook(id, { frame: 'box', axisColor: '#112233', grid: { style: 'dotted' } })(p);
    next = patchAxis(id, 'yAxis', { scale: 'log10', reverse: true, prefix: '$' })(next);
    const back = parseProject(stringifyProject(next));
    expect(back.charts[0].frame).toBe('box');
    expect(back.charts[0].axisColor).toBe('#112233');
    expect(back.charts[0].grid.style).toBe('dotted');
    expect(back.charts[0].yAxis).toMatchObject({ scale: 'log10', reverse: true, prefix: '$' });
    const base = createChart('t');
    const bad = sanitizeLook({ axisColor: 'red', frame: 'circle', plotColor: 12, grid: { widthPt: 99, style: 'wavy' } }, base);
    expect(bad).toMatchObject({ axisColor: '#000000', frame: 'none' });
    expect(bad.grid.widthPt).toBe(10);
    expect(bad.grid.style).toBe('solid');
  });
  it('open from a file written before these settings existed', () => {
    const { p } = setup();
    const text = JSON.parse(stringifyProject(p));
    for (const c of text.project.charts) {
      delete c.frame;
      delete c.axisColor;
      delete c.grid;
      delete c.pageColor;
      delete c.plotColor;
      for (const k of ['xAxis', 'yAxis', 'y2Axis']) for (const f of ['scale', 'reverse', 'minorTicks', 'tickDirection', 'tickLengthPt', 'prefix', 'showMinorGrid']) delete c[k][f];
    }
    const back = parseProject(JSON.stringify(text));
    expect(back.charts[0].yAxis).toMatchObject({ scale: 'linear', reverse: false, tickDirection: 'out', tickLengthPt: 11.2, prefix: '' });
    expect(back.charts[0].frame).toBe('none');
    expect(back.charts[0].pageColor).toBe('#ffffff');
  });
});

describe('column spacing, baseline and legend key', () => {
  const column = () => {
    const table = createColumnTable('Data', true);
    const chart = createChart(table.id, undefined, 'bar');
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    return { p, table, chart };
  };
  it('keeps the old layout when everything is automatic', () => {
    expect(bandPadding(createChart('t').bars)).toEqual({ inner: 0.3, outer: 0.2, align: 0.5 });
    const { p } = column();
    const same = patchBars(p.charts[0].id, { gapPct: null, beforePct: null, afterPct: null })(p);
    expect(same.charts[0].bars).toEqual(p.charts[0].bars);
  });
  it('gives the columns the spaces asked for', () => {
    const { p, table } = column();
    const id = p.charts[0].id;
    const next = patchBars(id, { gapPct: 50, beforePct: 50, afterPct: 50 })(p);
    const m = buildColumnModel(next.charts[0], table);
    const bars = m.groups.map((g) => g.bar!).filter(Boolean);
    const w = bars[0].width;
    expect(bars[1].x - (bars[0].x + w)).toBeCloseTo(w * 0.5, 6);
    expect(bars[0].x - m.layout.plot.x).toBeCloseTo(w * 0.5, 6);
    const last = bars[bars.length - 1];
    expect(m.layout.plot.x + m.layout.plot.width - (last.x + last.width)).toBeCloseTo(w * 0.5, 6);
    const lopsided = patchBars(id, { gapPct: 0, beforePct: 100, afterPct: 0 })(p);
    const m2 = buildColumnModel(lopsided.charts[0], table);
    const b2 = m2.groups.map((g) => g.bar!);
    expect(b2[1].x).toBeCloseTo(b2[0].x + b2[0].width, 6);
    expect(b2[0].x - m2.layout.plot.x).toBeCloseTo(b2[0].width, 6);
  });
  it('starts the bars at the baseline asked for, or at the nearest edge of the axis', () => {
    const { p, table } = column();
    const id = p.charts[0].id;
    const m0 = buildColumnModel(p.charts[0], table);
    expect(m0.groups[0].bar!.y + m0.groups[0].bar!.height).toBeCloseTo(m0.yScale(0), 6);
    const next = patchBars(id, { baseline: 1 })(p);
    const m1 = buildColumnModel(next.charts[0], table);
    const bar = m1.groups[0].bar!;
    // Group A is about 1.24: its bar runs from the baseline at 1 up to the mean.
    expect(Math.max(bar.y, bar.y + bar.height)).toBeCloseTo(m1.yScale(1), 6);
    expect(bar.height).toBeCloseTo(m1.yScale(1) - m1.yScale(m1.groups[0].centreValue!), 6);
  });
  it('rejects spacing outside its limits', () => {
    const { p } = column();
    const next = patchBars(p.charts[0].id, { gapPct: -20, beforePct: 9999 })(p);
    expect(next.charts[0].bars).toMatchObject({ gapPct: 0, beforePct: 500 });
  });
  it('draws a square legend key narrower than the rectangle', () => {
    const { p, table } = column();
    const id = p.charts[0].id;
    const rect = chartToSvgString(p.charts[0], table);
    const square = chartToSvgString(patchLegend(id, { keyShape: 'square' })(p).charts[0], table);
    expect(rect).toContain('width="36"');
    expect(square).not.toContain('width="36"');
    expect(square).toContain('width="20"');
  });
});
