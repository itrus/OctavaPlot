import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createExampleProject, createXyTable } from '../../model/defaults';
import type { Chart } from '../../model/types';
import { patchAxis } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildAnyModel } from '../anyModel';

const column = createColumnTable('Data', true, 3);
const xyTable = createXyTable('XY', true);
const withAngle = (chart: Chart, which: 'xAxis' | 'yAxis', tickAngle: number | undefined): Chart => ({ ...chart, [which]: { ...chart[which], tickAngle } });
const plotOf = (chart: Chart, t = column) => (buildAnyModel(chart, t).model as { layout: { plot: { x: number; y: number; width: number; height: number } } }).layout.plot;

describe('labels turned by hand', () => {
  it('turn the names of a category axis by the angle, and keep room for them', () => {
    const base = createChart(column.id, undefined, 'bar');
    const plain = chartToSvgString(base, column);
    const turned = withAngle(base, 'xAxis', -60);
    const svg = chartToSvgString(turned, column);
    expect(svg).toContain('rotate(-60 ');
    expect(plain).not.toContain('rotate(-60 ');
    expect(plotOf(turned).height).toBeLessThan(plotOf(withAngle(base, 'xAxis', 0)).height);
    // Down to the right starts at the tick; horizontal by hand is not turned at all.
    expect(chartToSvgString(withAngle(base, 'xAxis', 45), column)).toMatch(/text-anchor="start"[^>]*transform="rotate\(45 /);
    expect(chartToSvgString(withAngle(base, 'xAxis', 0), column)).not.toMatch(/rotate\(-?(30|45|60) /);
  });

  it('turn the numbers of the Y axis, and give them the width of the turned text', () => {
    const base = createChart(column.id, undefined, 'bar');
    const turned = withAngle(base, 'yAxis', -90);
    expect(chartToSvgString(turned, column)).toContain('rotate(-90 ');
    // Upright text is narrower than the horizontal numbers, so the plot gets wider.
    expect(plotOf(turned).width).toBeGreaterThan(plotOf(base).width);
  });

  it('turn the numbers of a numeric X axis', () => {
    const base = createChart(xyTable.id, undefined, 'xyScatter');
    expect(chartToSvgString(withAngle(base, 'xAxis', 45), xyTable)).toContain('rotate(45 ');
    // The room under the axis follows the width of the turned numbers.
    expect(plotOf(withAngle(base, 'xAxis', 90), xyTable).height).not.toBe(plotOf(base, xyTable).height);
  });

  it('are set by a command, cleared by Automatic, and kept by a saved file; a bad value is dropped', () => {
    let p = createExampleProject();
    const id = p.charts[0].id;
    p = patchAxis(id, 'xAxis', { tickAngle: 30 })(p);
    expect(p.charts[0].xAxis.tickAngle).toBe(30);
    expect(parseProject(stringifyProject(p)).charts[0].xAxis.tickAngle).toBe(30);
    expect(patchAxis(id, 'xAxis', { tickAngle: 500 })(p).charts[0].xAxis.tickAngle).toBe(90);
    p = patchAxis(id, 'xAxis', { tickAngle: undefined })(p);
    expect('tickAngle' in p.charts[0].xAxis).toBe(false);
    const text = JSON.parse(stringifyProject(patchAxis(id, 'yAxis', { tickAngle: 20 })(p)));
    text.project.charts[0].yAxis.tickAngle = 'sideways';
    expect('tickAngle' in parseProject(JSON.stringify(text)).charts[0].yAxis).toBe(false);
  });
});
