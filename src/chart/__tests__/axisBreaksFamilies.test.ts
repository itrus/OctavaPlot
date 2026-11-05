import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import type { ChartType, Project, TableKind } from '../../model/types';
import { addChart, addDataTable, patchAxis } from '../../state/commands';
import { buildAnyModel } from '../anyModel';
import { chartToSvgString } from '../export/export';

const project = (kind: TableKind, type: ChartType): Project => addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true })(createExampleProject()));
const svg = (p: Project) => chartToSvgString(p.charts.find((c) => c.id === 'c')!, p.dataTables.find((t) => t.id === 't')!).replace(/ id="[^"]*"/g, '');
const withBreak = (p: Project, axis: 'xAxis' | 'yAxis') => patchAxis('c', axis, { min: 0, max: 100, breaks: [{ from: 20, to: 80 }] })(p);
const without = (p: Project, axis: 'xAxis' | 'yAxis') => patchAxis('c', axis, { min: 0, max: 100, breaks: [] })(p);

describe('which charts have a broken axis', () => {
  it.each([
    ['histogram', 'column', 'histogram'],
    ['cumulative distribution', 'column', 'ecdf'],
    ['survival', 'survival', 'survival'],
  ] as const)('a %s chart is drawn on the XY model, so its axes can be broken, without a number that is not a number', (_name, kind, type) => {
    for (const axis of ['xAxis', 'yAxis'] as const) {
      const p = project(kind, type);
      expect(svg(withBreak(p, axis))).not.toBe(svg(without(p, axis)));
      expect(svg(withBreak(p, axis))).not.toContain('NaN');
    }
  });

  it.each([
    ['pie', 'contingency', 'pie'],
    ['heat map', 'grouped', 'heatmap'],
  ] as const)('a %s has no axis to break: a break in the file changes nothing', (_name, kind, type) => {
    for (const axis of ['xAxis', 'yAxis'] as const) {
      const p = project(kind, type);
      expect(svg(withBreak(p, axis))).toBe(svg(without(p, axis)));
      const chart = withBreak(p, axis).charts.find((c) => c.id === 'c')!;
      const table = p.dataTables.find((t) => t.id === 't')!;
      expect(buildAnyModel(chart, table).model.warnings.join(' ')).not.toMatch(/omitted range/);
    }
  });

  it.each([
    ['bars', 'column', 'bar'],
    ['grouped bars', 'grouped', 'groupedBar'],
  ] as const)('%s break their value axis only: a break on the category axis changes nothing', (_name, kind, type) => {
    const p = project(kind, type);
    expect(svg(withBreak(p, 'xAxis'))).toBe(svg(without(p, 'xAxis')));
    expect(svg(withBreak(p, 'yAxis'))).not.toBe(svg(without(p, 'yAxis')));
  });
});
