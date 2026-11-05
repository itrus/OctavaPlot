import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createXyTable } from '../../model/defaults';
import type { Chart, ExtraTick, Project } from '../../model/types';
import { parseProject, stringifyProject } from '../../state/serialize';
import { patchAxis } from '../../state/commands';
import { chartToSvgString } from '../export/export';
import { buildColumnModel } from '../column/columnModel';
import { buildXyModel } from '../xy/xyModel';

const projectOf = (kind: 'column' | 'xy', type: Chart['type']): Project => {
  const table = kind === 'column' ? createColumnTable('C', true, 3) : createXyTable('X', true);
  const chart = { ...createChart(table.id, undefined, type), id: 'c' };
  return { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
};
const withTicks = (p: Project, which: 'xAxis' | 'yAxis', extraTicks: ExtraTick[]): Project => patchAxis('c', which, { extraTicks })(p);
const svg = (p: Project) => chartToSvgString(p.charts[0], p.dataTables[0]);

describe('the settings of an added tick', () => {
  it('are saved and read back; what is not valid is dropped, and no setting means the defaults', () => {
    const all: ExtraTick = { value: 1.5, label: 'cut', showText: false, textAngle: 45, textOffsetPt: 6, showTick: false, tickSize: 'minor', tickDirection: 'both', tickWidthPt: 2, showGrid: true, gridWidthPt: 1.5, gridStyle: 'dashed', gridColor: '#ff0000', gridOver: true };
    const p = withTicks(projectOf('column', 'bar'), 'yAxis', [all, { value: 2, label: '', textAngle: 500, tickDirection: 'sideways' as never, gridColor: 'red', showText: 'no' as never }]);
    const back = parseProject(stringifyProject(p)).charts[0].yAxis.extraTicks!;
    expect(back[0]).toEqual(all);
    expect(back[1]).toEqual({ value: 2, label: '', textAngle: 90 });
  });

  it('turn the text of a tick off, away from the axis and round', () => {
    const base = projectOf('column', 'bar');
    const plain = svg(withTicks(base, 'yAxis', [{ value: 1.55, label: 'MARK' }]));
    expect(plain).toContain('>MARK<');
    expect(svg(withTicks(base, 'yAxis', [{ value: 1.55, label: 'MARK', showText: false }]))).not.toContain('>MARK<');
    const turned = svg(withTicks(base, 'yAxis', [{ value: 1.55, label: 'MARK', textAngle: 30, textOffsetPt: 10 }]));
    expect(turned).toMatch(/rotate\(30 [\d.-]+ [\d.-]+\)[^>]*>MARK</);
  });

  it('give a tick no mark, or a mark of its own thickness', () => {
    const base = projectOf('xy', 'xyScatter');
    const marks = (p: Project) => (svg(p).match(/stroke-width="7"/g) ?? []).length;
    const none = withTicks(base, 'xAxis', [{ value: 4.5, label: '' }]);
    const thick = withTicks(base, 'xAxis', [{ value: 4.5, label: '', tickWidthPt: 7 }]);
    expect(marks(none)).toBe(0);
    expect(marks(thick)).toBe(1);
    const hidden = buildXyModel(withTicks(base, 'xAxis', [{ value: 4.5, label: '', showTick: false }]).charts[0], base.dataTables[0]);
    expect(hidden.x.extraTicks?.get(4.5)?.showTick).toBe(false);
  });

  it('draw a gridline of their own, behind the data or in front of it, even with the axis gridlines off', () => {
    const base = projectOf('column', 'bar');
    const line = (over: boolean) => withTicks(base, 'yAxis', [{ value: 1.55, label: '', showGrid: true, gridColor: '#12ab34', gridWidthPt: 3, gridOver: over }]);
    const behind = svg(line(false));
    const front = svg(line(true));
    expect(behind).toContain('stroke="#12ab34"');
    expect(front).toContain('stroke="#12ab34"');
    // In front, the line comes after the bars; behind, before them.
    const bar = (s: string) => s.indexOf('<rect', s.indexOf('plot-area') + 20);
    expect(behind.indexOf('#12ab34')).toBeLessThan(bar(behind) < 0 ? Infinity : bar(behind));
    expect(front.indexOf('#12ab34')).toBeGreaterThan(behind.indexOf('#12ab34'));
    // No gridline at all when it is switched off for the tick.
    expect(svg(withTicks(base, 'yAxis', [{ value: 1.55, label: '', showGrid: false, gridColor: '#12ab34' }]))).not.toContain('#12ab34');
  });
});

describe('added ticks on every chart with a numeric axis', () => {
  it('are on the value axis of a bar chart, and a notice says when one is not drawn', () => {
    const base = projectOf('column', 'bar');
    const p = withTicks(base, 'yAxis', [{ value: 1.55, label: 'LOW' }, { value: 999, label: 'FAR' }]);
    const m = buildColumnModel(p.charts[0], p.dataTables[0]);
    expect(m.y.ticks).toContain(1.55);
    expect(m.y.tickLabel(1.55)).toBe('LOW');
    expect(m.warnings.join(' ')).toMatch(/1 extra tick is on the Y axis/);
  });
});
