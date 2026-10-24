import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createXyTable } from '../model/defaults';
import type { Project, ReferenceLine } from '../model/types';
import { addReferenceLine } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { buildAnyModel } from './anyModel';
import { chartToSvgString } from './export';
import { referenceLineNotices, referenceLinesOf } from './referenceLines';

const line = (patch: Partial<ReferenceLine> = {}): ReferenceLine => ({ id: 'r1', axis: 'y', value: 50, color: '#cc0000', widthPt: 1, style: 'dashed', label: 'Target', showLabel: true, ...patch });

describe('reference lines', () => {
  const xyTable = createXyTable('XY', true);
  const xyChart = (lines: ReferenceLine[]) => ({ ...createChart(xyTable.id, undefined, 'xyScatter'), referenceLines: lines });

  it('run across the plotting region at the value of the axis', () => {
    const chart = xyChart([line({ value: 4 }), line({ id: 'r2', axis: 'x', value: 2, label: '' })]);
    const any = buildAnyModel(chart, xyTable);
    if (any.family !== 'xy') throw new Error('expected an XY model');
    const { placed } = referenceLinesOf(chart, any);
    expect(placed).toHaveLength(2);
    const { plot } = any.model.layout;
    const y = any.model.yScale(4);
    expect(placed[0].d).toBe(`M${Math.round(plot.x * 100) / 100},${Math.round(y * 100) / 100}H${Math.round((plot.x + plot.width) * 100) / 100}`);
    expect(placed[0].label).toBe('Target');
    expect(placed[1].d.startsWith(`M${Math.round(any.model.xScale(2) * 100) / 100},`)).toBe(true);
    expect(placed[1].d).toContain('V');
  });

  it('are left out, and reported, when outside the axis range, never moved to the edge', () => {
    const chart = xyChart([line({ value: 1e9 }), line({ id: 'r2', value: -1e9 })]);
    const any = buildAnyModel(chart, xyTable);
    const r = referenceLinesOf(chart, any);
    expect(r.placed).toHaveLength(0);
    expect(r.skipped).toHaveLength(2);
    expect(any.model.warnings.some((w) => /2 reference lines are outside the axis range/.test(w))).toBe(true);
  });

  it('skip a value inside the gap of a broken axis', () => {
    const base = createChart(xyTable.id, undefined, 'xyScatter');
    let p: Project = { id: 'p', name: 'p', dataTables: [xyTable], charts: [{ ...base, yAxis: { ...base.yAxis, min: 0, max: 100, breaks: [{ from: 20, to: 80 }] } }] };
    p = addReferenceLine(base.id, line({ value: 50 }))(p);
    p = addReferenceLine(base.id, line({ id: 'r2', value: 10 }))(p);
    const any = buildAnyModel(p.charts[0], xyTable);
    const r = referenceLinesOf(p.charts[0], any);
    expect(r.placed.map((l) => l.id)).toEqual(['r2']);
    expect(r.skipped.map((l) => l.id)).toEqual(['r1']);
  });

  it('on a column chart: Y lines are drawn, X lines are reported as unsupported', () => {
    const table = createColumnTable('Column', true, 4);
    const chart = { ...createChart(table.id), referenceLines: [line({ value: 3 }), line({ id: 'r2', axis: 'x', value: 1 })] };
    const any = buildAnyModel(chart, table);
    const r = referenceLinesOf(chart, any);
    expect(r.placed.map((l) => l.id)).toEqual(['r1']);
    expect(r.unsupported.map((l) => l.id)).toEqual(['r2']);
    expect(referenceLineNotices(r).join(' ')).toMatch(/axis this chart does not have/);
  });

  it('appear in the exported drawing in their colour, pattern and label, and are saved and restored', () => {
    const table = xyTable;
    const base = createChart(table.id, undefined, 'xyScatter');
    const chart = { ...base, referenceLines: [line({ value: 4, style: 'dotted', color: '#123456' })] };
    const svg = chartToSvgString(chart, table);
    expect(svg).toContain('stroke="#123456"');
    expect(svg).toContain('data-reference-lines');
    expect(svg).toContain('>Target</text>');
    const p = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    expect(parseProject(stringifyProject(p)).charts[0].referenceLines).toEqual(chart.referenceLines);
  });

  it('are cleaned on load: unreadable entries are dropped, odd values get defaults', () => {
    const base = createChart(xyTable.id, undefined, 'xyScatter');
    const p = { id: 'p', name: 'p', dataTables: [xyTable], charts: [base] };
    const env = JSON.parse(stringifyProject(p));
    env.project.charts[0].referenceLines = [null, { id: 'a', axis: 'z', value: 1 }, { id: 'b', axis: 'y', value: 'x' }, { id: 'c', axis: 'y', value: 5, color: 'red', widthPt: -3, style: 'wavy', label: 7, showLabel: 'yes' }];
    const parsed = parseProject(JSON.stringify(env));
    expect(parsed.charts[0].referenceLines).toEqual([{ id: 'c', axis: 'y', value: 5, color: '#000000', widthPt: 2, style: 'dashed', label: '', showLabel: false }]);
  });
});
