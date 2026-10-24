import { describe, expect, it } from 'vitest';
import { createChart } from '../model/defaults';
import type { AxisConfig } from '../model/types';
import { TICK_LENGTH_PT as TICK_LENGTH } from '../model/defaults';
import { AXIS_TITLE_GAP, Y_TICK_LABEL_GAP, computeLayout, type LayoutInput } from './layout';

// Without a canvas measureText is len * fontSize * 0.58 (bold), so widths are exact.
const chart = createChart('t');
const axis = (patch: Partial<AxisConfig> = {}): AxisConfig => ({ ...chart.y2Axis, ...patch });

function input(patch: Partial<LayoutInput> = {}): LayoutInput {
  return {
    widthPt: 800,
    heightPt: 600,
    title: null,
    xAxis: chart.xAxis,
    yAxis: chart.yAxis,
    legend: { visible: false, keyShape: 'rectangle', position: 'right', fontSizePt: 22.4, hiddenGroupIds: [] },
    legendLabels: [],
    categoryLabels: [],
    yTickLabels: ['0'],
    ...patch,
  };
}

describe('computeLayout right axis', () => {
  it('baseline plot is unchanged and y2Title is null', () => {
    const l = computeLayout(input());
    expect(l.plot.x).toBeCloseTo(97.028, 3);
    expect(l.plot.width).toBeCloseTo(688.972, 3);
    expect(l.y2Title).toBeNull();
  });

  it('an absent or hidden right axis reserves nothing', () => {
    const base = computeLayout(input());
    const hidden = computeLayout(input({ y2Axis: axis({ visible: false, title: 'Right' }), y2TickLabels: ['100'] }));
    expect(hidden).toEqual(base);
    expect(computeLayout(input({ y2TickLabels: ['100'] }))).toEqual(base);
  });

  it('reserves ticks and the widest bold label', () => {
    const l = computeLayout(input({ y2Axis: axis(), y2TickLabels: ['1', '100'] }));
    expect(l.plot.width).toBeCloseTo(625.488, 3);
    expect(l.y2Title).toBeNull();
  });

  it('a blank title reserves no title space', () => {
    const l = computeLayout(input({ y2Axis: axis({ title: '   ' }), y2TickLabels: ['100'] }));
    expect(l.plot.width).toBeCloseTo(625.488, 3);
    expect(l.y2Title).toBeNull();
  });

  it('missing tick labels reserve the tick and gap only', () => {
    const l = computeLayout(input({ y2Axis: axis() }));
    expect(l.plot.width).toBeCloseTo(688.972 - (TICK_LENGTH + Y_TICK_LABEL_GAP), 3);
    expect(l.plot.width).toBeCloseTo(671.772, 3);
  });

  it('a titled right axis adds the title block and places y2Title', () => {
    const l = computeLayout(input({ y2Axis: axis({ title: 'Right' }), y2TickLabels: ['100'] }));
    expect(l.plot.width).toBeCloseTo(575.088, 3);
    expect(l.y2Title!.x).toBeCloseTo(777.6, 3);
    expect(l.y2Title!.y).toBeCloseTo(l.plot.y + l.plot.height / 2, 6);
  });

  it('uses its own font sizes', () => {
    const l = computeLayout(input({ y2Axis: axis({ title: 'R', tickFontSizePt: 20, titleFontSizePt: 40 }), y2TickLabels: ['100'] }));
    const block = TICK_LENGTH + Y_TICK_LABEL_GAP + 3 * 20 * 0.58 + AXIS_TITLE_GAP + 48;
    expect(688.972 - l.plot.width).toBeCloseTo(block, 3);
    expect(l.y2Title!.x).toBeCloseTo(l.plot.x + l.plot.width + block - 12, 3);
  });

  it('tick font size widens the block', () => {
    const a = computeLayout(input({ y2Axis: axis(), y2TickLabels: ['100'] }));
    const b = computeLayout(input({ y2Axis: axis({ tickFontSizePt: 40 }), y2TickLabels: ['100'] }));
    expect(a.plot.width - b.plot.width).toBeCloseTo(23.316, 3);
  });

  it('sits 20 pt inside a right legend', () => {
    const legend = { visible: true, keyShape: 'rectangle' as const, position: 'right' as const, fontSizePt: 22.4, hiddenGroupIds: [] };
    const l = computeLayout(input({ legend, legendLabels: ['A'], y2Axis: axis(), y2TickLabels: ['100'] }));
    expect(l.legend!.rect.x).toBeCloseTo(l.plot.x + l.plot.width + (TICK_LENGTH + Y_TICK_LABEL_GAP + 46.284) + 20, 3);
  });

  it('a top legend adds no right-axis space', () => {
    const legend = { visible: true, keyShape: 'rectangle' as const, position: 'top' as const, fontSizePt: 22.4, hiddenGroupIds: [] };
    const without = computeLayout(input({ legend, legendLabels: ['A'] }));
    const withAxis = computeLayout(input({ legend, legendLabels: ['A'], y2Axis: axis(), y2TickLabels: ['100'] }));
    expect(without.plot.width - withAxis.plot.width).toBeCloseTo(63.484, 3);
    expect(withAxis.plot.y).toBe(without.plot.y);
  });

  it('X label rotation reflects the narrowed plot', () => {
    const labels = ['Group 1', 'Group 2', 'Group 3'];
    const a = computeLayout(input({ categoryLabels: labels, widthPt: 520 }));
    const b = computeLayout(input({ categoryLabels: labels, widthPt: 520, y2Axis: axis(), y2TickLabels: ['1000000'] }));
    expect(a.xTickRotated).toBe(false);
    expect(b.xTickRotated).toBe(true);
  });

  it('warns when the chart is too small', () => {
    const l = computeLayout(input({ widthPt: 180, y2Axis: axis({ title: 'Right' }), y2TickLabels: ['100'] }));
    expect(l.warnings.length).toBe(1);
    expect(l.plot.width).toBe(48);
  });

  it('works with the left axis hidden', () => {
    const l = computeLayout(input({ yAxis: { ...chart.yAxis, visible: false }, y2Axis: axis(), y2TickLabels: ['100'] }));
    expect(l.plot.x).toBe(14);
    expect(l.plot.width).toBeCloseTo(800 - 14 - 14 - 63.484, 3);
    expect(l.yTitle).toBeNull();
  });
});
