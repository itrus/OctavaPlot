import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createGroupedTable, DEFAULT_BAR_LABELS } from '../model/defaults';
import type { BarLabels, Project } from '../model/types';
import { patchBarLabels } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { barLabelText, placeBarLabel } from './barLabels';
import { chartToSvgString } from './export';
import { buildAnyModel } from './anyModel';
import { buildChartModel } from './model';

const cfg = (patch: Partial<BarLabels> = {}): BarLabels => ({ ...DEFAULT_BAR_LABELS, show: 'value', ...patch });

describe('the text of a bar label', () => {
  it('writes the value, the sample size, or nothing', () => {
    expect(barLabelText(cfg(), 1.23456789, 5)).toBe('1.23457');
    expect(barLabelText(cfg({ decimals: 1 }), 1.26, 5)).toBe('1.3');
    expect(barLabelText(cfg({ show: 'n' }), 1.26, 5)).toBe('5');
    expect(barLabelText(cfg({ show: 'none' }), 1.26, 5)).toBeNull();
    expect(barLabelText(cfg(), null, 5)).toBeNull();
    expect(barLabelText(cfg({ show: 'n' }), 2, null)).toBeNull();
  });
  it('groups thousands and adds a prefix and a suffix', () => {
    expect(barLabelText(cfg({ decimals: 2, thousands: true }), 1234567.891, 3)).toBe('1,234,567.89');
    expect(barLabelText(cfg({ decimals: 0, thousands: true, prefix: '$', suffix: ' mg' }), -45678, 3)).toBe('$-45,678 mg');
    expect(barLabelText(cfg({ show: 'n', prefix: 'n=' }), 0, 12)).toBe('n=12');
  });
});

describe('where a bar label goes', () => {
  it('sits above a bar that points up and below one that points down', () => {
    const c = cfg();
    expect(placeBarLabel(c, 50, 100, 90, 200).y).toBeLessThan(90);
    expect(placeBarLabel(c, 50, 300, 310, 200).y).toBeGreaterThan(310);
  });
});

describe('labels on charts', () => {
  const column = () => {
    const table = createColumnTable('Data', true);
    const chart = createChart(table.id, undefined, 'bar');
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    return { p, table };
  };
  it('are drawn only when asked for, above the error bars', () => {
    const { p, table } = column();
    const id = p.charts[0].id;
    expect(buildChartModel(p.charts[0], table).groups.every((g) => g.barLabel === null)).toBe(true);
    expect(chartToSvgString(p.charts[0], table)).not.toContain('text-anchor="middle" font-size="11.2"');
    const on = patchBarLabels(id, { show: 'n' })(p).charts[0];
    const m = buildChartModel(on, table);
    expect(m.groups.map((g) => g.barLabel!.text)).toEqual(['5', '5', '5', '5']);
    for (const g of m.groups) expect(g.barLabel!.y).toBeLessThan(g.bar!.y);
    const values = patchBarLabels(id, { show: 'value', decimals: 2, prefix: '~' })(p).charts[0];
    expect(buildChartModel(values, table).groups[0].barLabel!.text).toBe('~1.24');
    expect(chartToSvgString(values, table)).toContain('>~1.24</text>');
  });
  it('sit beyond the end of a bar that grows down, also when the axis is reversed', () => {
    const { p, table } = column();
    const id = p.charts[0].id;
    const flipped = { ...patchBarLabels(id, { show: 'value' })(p).charts[0] };
    flipped.yAxis = { ...flipped.yAxis, reverse: true };
    const m = buildChartModel(flipped, table);
    for (const g of m.groups) expect(g.barLabel!.y).toBeGreaterThan(g.bar!.y + g.bar!.height);
  });
  it('are drawn on grouped bars, one per bar', () => {
    const table = createGroupedTable('Grouped', true);
    const chart = createChart(table.id, undefined, 'groupedBar');
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    const on = patchBarLabels(chart.id, { show: 'value', decimals: 1 })(p).charts[0];
    const any = buildAnyModel(on, table);
    expect(any.family).toBe('grouped');
    const bars = any.family === 'grouped' ? any.model.series.flatMap((s) => s.bars) : [];
    expect(bars.length).toBeGreaterThan(0);
    expect(bars.every((b) => b.label && b.label.text !== '')).toBe(true);
    expect(chartToSvgString(on, table)).toContain(`>${bars[0].label!.text}</text>`);
  });
  it('are kept in a saved file, and a bad stored value falls back', () => {
    const { p } = column();
    const next = patchBarLabels(p.charts[0].id, { show: 'value', thousands: true, color: '#aa0000', sizePt: 99 })(p);
    expect(next.charts[0].barLabels.sizePt).toBe(48);
    const back = parseProject(stringifyProject(next));
    expect(back.charts[0].barLabels).toMatchObject({ show: 'value', thousands: true, color: '#aa0000' });
    const text = JSON.parse(stringifyProject(next));
    text.project.charts[0].barLabels = { show: 'everything', decimals: 'x', color: 'red' };
    expect(parseProject(JSON.stringify(text)).charts[0].barLabels).toMatchObject({ show: 'none', decimals: null, color: null });
    delete text.project.charts[0].barLabels;
    expect(parseProject(JSON.stringify(text)).charts[0].barLabels.show).toBe('none');
  });
});
