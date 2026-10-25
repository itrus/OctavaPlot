import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createXyTable } from '../../../model/defaults';
import type { DataTable, Project } from '../../../model/types';
import { patchAxis, patchLook } from '../../../state/commands';
import { parseProject, stringifyProject } from '../../../state/serialize';
import { crossingPosition } from './axisTicks';
import { chartToSvgString } from '../../export/export';
import { buildColumnModel } from '../../column/columnModel';
import { buildXyModel } from '../../xy/xyModel';

const r2 = (v: number) => String(Math.round(v * 100) / 100);

describe('where an axis line crosses', () => {
  const scale = { domain: [-10, 20] as [number, number] };
  const map = (v: number) => 100 - v * 2;
  it('is the low edge unless there is a value inside the axis', () => {
    expect(crossingPosition(null, scale, map, 7)).toBe(7);
    expect(crossingPosition(0, scale, map, 7)).toBe(100);
    expect(crossingPosition(-10, scale, map, 7)).toBe(120);
    expect(crossingPosition(25, scale, map, 7)).toBe(7);
    expect(crossingPosition(-11, scale, map, 7)).toBe(7);
    expect(crossingPosition(NaN, scale, map, 7)).toBe(7);
  });
  it('keeps the edge for a value with no position on a log axis', () => {
    expect(crossingPosition(0, { domain: [1, 100], log: 10 }, map, 7)).toBe(7);
    expect(crossingPosition(10, { domain: [1, 100], log: 10 }, map, 7)).toBe(80);
  });
});

describe('origin of an XY chart', () => {
  const setup = () => {
    const table: DataTable = createXyTable('XY 1', true);
    table.groups[0].observations.slice(0, 4).forEach((o, i) => (o.value = [-4, -1, 2, 6][i]));
    table.groups[1].observations.slice(0, 4).forEach((o, i) => (o.value = [-3, 0, 5, 9][i]));
    const chart = createChart(table.id, undefined, 'xyScatter');
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    return { p, table };
  };
  it('moves the axis lines to the values asked for, and the ticks with them', () => {
    const { p, table } = setup();
    const base = buildXyModel(p.charts[0], table);
    expect(base.x.domain[0]).toBeLessThan(0);
    const c = patchLook(p.charts[0].id, { origin: { x: 0, y: 0 } })(p).charts[0];
    const m = buildXyModel(c, table);
    const svg = chartToSvgString(c, table);
    expect(svg).toContain(`M${r2(m.xScale(0))},${r2(m.layout.plot.y)}V`);
    expect(svg).toContain(`M${r2(m.layout.plot.x)},${r2(m.yScale(0))}H`);
    // The X axis line is no longer on the bottom edge, and its ticks start on the new line.
    expect(svg).toContain(`M${r2(m.xScale(0))},${r2(m.yScale(0))}v11.2`);
    expect(chartToSvgString(p.charts[0], table)).not.toContain(`M${r2(m.layout.plot.x)},${r2(m.yScale(0))}H`);
  });
  it('keeps the numbers where they are', () => {
    const { p, table } = setup();
    const c = patchLook(p.charts[0].id, { origin: { x: 0, y: 0 } })(p).charts[0];
    const m = buildXyModel(c, table);
    const label = `x="${r2(m.layout.plot.x - 11.2 - 6)}"`;
    expect(chartToSvgString(c, table)).toContain(label);
  });
  it('stays at the edge for a value outside the axis', () => {
    const { p, table } = setup();
    const c = patchLook(p.charts[0].id, { origin: { x: 1000, y: -1000 } })(p).charts[0];
    expect(chartToSvgString(c, table)).toBe(chartToSvgString(p.charts[0], table));
  });
  it('is kept in a file, and a bad value is dropped', () => {
    const { p } = setup();
    const next = patchLook(p.charts[0].id, { origin: { x: 2.5, y: 0 } })(p);
    expect(parseProject(stringifyProject(next)).charts[0].origin).toEqual({ x: 2.5, y: 0 });
    const text = JSON.parse(stringifyProject(next));
    text.project.charts[0].origin = { x: 'left', y: null };
    expect(parseProject(JSON.stringify(text)).charts[0].origin).toEqual({ x: null, y: null });
    delete text.project.charts[0].origin;
    expect(parseProject(JSON.stringify(text)).charts[0].origin).toEqual({ x: null, y: null });
  });
});

describe('origin of a column chart', () => {
  const setup = () => {
    const table: DataTable = createColumnTable('Data', false);
    table.groups[0].observations.slice(0, 3).forEach((o, i) => (o.value = [-3, -2, -4][i]));
    table.groups[1].observations.slice(0, 3).forEach((o, i) => (o.value = [3, 5, 4][i]));
    const chart = createChart(table.id, undefined, 'bar');
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    return { p, table };
  };
  it('puts the category axis through zero, where bars with negative values hang from it', () => {
    const { p, table } = setup();
    const c = patchLook(p.charts[0].id, { origin: { x: null, y: 0 } })(p).charts[0];
    const m = buildColumnModel(c, table);
    const svg = chartToSvgString(c, table);
    expect(svg).toContain(`M${r2(m.layout.plot.x)},${r2(m.yScale(0))}H`);
    // The category names stay under the plot, not on the line.
    expect(svg).toMatch(/text-anchor="middle"[^>]*>Group A</);
    const label = svg.match(/y="([\d.]+)"[^>]*text-anchor="middle"[^>]*>Group A</) ?? svg.match(/text-anchor="middle"[^>]*y="([\d.]+)"/);
    expect(Number(label![1])).toBeGreaterThan(m.layout.plot.y + m.layout.plot.height);
  });
  it('puts the category axis of a horizontal chart through zero too, as a vertical line', () => {
    const { p, table } = setup();
    const flipped = patchLook(p.charts[0].id, { orientation: 'horizontal', origin: { x: null, y: 0 } })(p).charts[0];
    const m = buildColumnModel(flipped, table);
    const zeroX = m.orient.toScreen(0, m.yScale(0)).x;
    expect(chartToSvgString(flipped, table)).toContain(`M${r2(zeroX)},${r2(m.layout.plot.y)}V`);
  });
});

describe('scale bar', () => {
  const setup = () => {
    const table: DataTable = createXyTable('XY 1', true);
    const chart = createChart(table.id, undefined, 'xyScatter');
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    return { p, table };
  };
  it('stands in for a hidden axis: a bar of one major interval with that interval written beside it', () => {
    const { p, table } = setup();
    const hidden = patchAxis(p.charts[0].id, 'xAxis', { visible: false, scaleBar: true })(p);
    const m = buildXyModel(hidden.charts[0], table);
    const step = m.x.ticks[1] - m.x.ticks[0];
    const length = Math.abs(m.xScale(m.x.domain[0] + step) - m.xScale(m.x.domain[0]));
    const svg = chartToSvgString(hidden.charts[0], table);
    expect(svg).toContain(`H${r2(m.layout.plot.x + 20 + length)}`);
    expect(svg).toContain(`>${m.x.tickLabel(step)}</text>`);
    expect(svg).not.toContain('NaN');
  });
  it('is drawn only while the axis is hidden and a bar was asked for', () => {
    const { p, table } = setup();
    const id = p.charts[0].id;
    const plain = chartToSvgString(p.charts[0], table);
    expect(chartToSvgString(patchAxis(id, 'xAxis', { scaleBar: true })(p).charts[0], table)).toBe(plain);
    const hiddenOnly = chartToSvgString(patchAxis(id, 'yAxis', { visible: false })(p).charts[0], table);
    const withBar = chartToSvgString(patchAxis(id, 'yAxis', { visible: false, scaleBar: true })(p).charts[0], table);
    expect(withBar).not.toBe(hiddenOnly);
  });
  it('is not drawn on a log axis, where a fixed length means nothing', () => {
    const { p, table } = setup();
    const id = p.charts[0].id;
    const hidden = patchAxis(id, 'yAxis', { visible: false, scale: 'log10' })(p);
    const bar = patchAxis(id, 'yAxis', { scaleBar: true })(hidden);
    expect(chartToSvgString(bar.charts[0], table)).toBe(chartToSvgString(hidden.charts[0], table));
  });
  it('belongs to a column chart value axis, also when it runs along the bottom', () => {
    const table: DataTable = createColumnTable('Data', true);
    const chart = createChart(table.id, undefined, 'bar');
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    const flipped = patchLook(chart.id, { orientation: 'horizontal' })(p);
    const bar = patchAxis(chart.id, 'yAxis', { visible: false, scaleBar: true })(flipped);
    const svg = chartToSvgString(bar.charts[0], table);
    expect(svg).not.toContain('NaN');
    expect(svg).toContain('stroke-linecap="butt"');
    expect(parseProject(stringifyProject(bar)).charts[0].yAxis.scaleBar).toBe(true);
  });
});
