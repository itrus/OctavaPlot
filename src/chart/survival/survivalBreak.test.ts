import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import type { Project } from '../../model/types';
import { addChart, addDataTable, patchAxis } from '../../state/commands';
import { axisMapper, dataGaps } from '../shared/axes/axisScale';
import { buildSurvivalModel } from './survivalModel';

const project = (): Project => addChart('c', 't', undefined, 'survival')(addDataTable('t', 'survival', { sample: true })(createExampleProject()));
const build = (p: Project) => buildSurvivalModel(p.charts.find((c) => c.id === 'c')!, p.dataTables.find((t) => t.id === 't')!);
const brokenX = (p: Project, from: number, to: number) => patchAxis('c', 'xAxis', { min: 0, max: 100, breaks: [{ from, to }] })(p);
const brokenY = (p: Project, from: number, to: number) => patchAxis('c', 'yAxis', { min: 0, max: 1, breaks: [{ from, to }] })(p);

describe('a broken axis on a survival chart places the data on the broken axis', () => {
  it('maps time through the pieces of the X axis, as the axis is drawn', () => {
    const m = build(brokenX(project(), 20, 80));
    expect(dataGaps(m.x)).toEqual([[20, 80]]);
    const { plot } = m.layout;
    const draw = axisMapper(m.x, plot.x, plot.width);
    for (const t of [0, 10, 20, 80, 90, 100]) expect(m.xScale(t)).toBeCloseTo(draw(t), 6);
    // 60 units are left out, so 0 to 100 is not spread over the width as if nothing were omitted.
    expect(m.xScale(90) - m.xScale(10)).toBeLessThan((80 / 100) * plot.width);
  });
  it('maps the fraction through the pieces of the Y axis', () => {
    const m = build(brokenY(project(), 0.2, 0.8));
    expect(dataGaps(m.y)).toEqual([[0.2, 0.8]]);
    const { plot } = m.layout;
    const draw = axisMapper(m.y, plot.y + plot.height, -plot.height);
    for (const v of [0, 0.1, 0.2, 0.8, 0.9, 1]) expect(m.yScale(v)).toBeCloseTo(draw(v), 6);
  });
  it('does not draw a mark whose time is inside the gap, and says so', () => {
    const plain = build(patchAxis('c', 'xAxis', { min: 0, max: 100, breaks: [] })(project()));
    const marks = plain.series.reduce((n, s) => n + s.points.length, 0);
    expect(marks).toBeGreaterThan(0);
    // A gap over the whole range of the data leaves nothing to put a mark on.
    const m = build(brokenX(project(), 0.0001, 99.9999));
    expect(m.series.reduce((n, s) => n + s.points.length, 0)).toBeLessThan(marks);
    expect(m.warnings.join(' ')).toMatch(/inside an omitted range of the axis and (is|are) not drawn/);
  });
});
