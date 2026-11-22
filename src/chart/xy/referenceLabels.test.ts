import { describe, expect, it } from 'vitest';
import { createChart, createExampleProject, createXyTable } from '../../model/defaults';
import type { Chart, ReferenceLine } from '../../model/types';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildAnyModel } from '../anyModel';
import { referenceLinesOf } from '../shared/scene/referenceLines';

const line = (patch: Partial<ReferenceLine>): ReferenceLine => ({ id: 'r1', axis: 'y', value: 5, color: '#cc0000', widthPt: 2, style: 'dashed', opacity: 1, label: 'Cut-off', showLabel: true, ...patch });
const table = createXyTable('XY', true);
const xy = (lines: ReferenceLine[]): Chart => ({ ...createChart(table.id, undefined, 'xyScatter'), referenceLines: lines });
const placedOf = (chart: Chart, t = table) => referenceLinesOf(chart, buildAnyModel(chart, t)).placed;
const planOf = (chart: Chart, t = table) => (buildAnyModel(chart, t).model as { layout: { plot: { x: number; y: number; width: number; height: number } } }).layout.plot;

describe('the label of a reference line', () => {
  it('stands outside the plotting box: right of a horizontal line, above a vertical one', () => {
    const chart = xy([line({ id: 'h' }), line({ id: 'v', axis: 'x', value: 2, label: 'Dose' })]);
    const plot = planOf(chart);
    const [h, v] = placedOf(chart);
    expect(h.labelX).toBeGreaterThan(plot.x + plot.width);
    expect(h.anchor).toBe('start');
    expect(v.labelY).toBeLessThan(plot.y);
    expect(v.anchor).toBe('middle');
  });

  it('can stand at the beginning instead: left of a horizontal line, below a vertical one, with room kept for it', () => {
    const chart = xy([line({ id: 'h', labelAt: 'start' }), line({ id: 'v', axis: 'x', value: 2, label: 'Dose', labelAt: 'start' })]);
    const plot = planOf(chart);
    const [h, v] = placedOf(chart);
    expect(h.labelX).toBeLessThan(plot.x);
    expect(h.anchor).toBe('end');
    expect(v.labelY).toBeGreaterThan(plot.y + plot.height);
    const bare = planOf(xy([]));
    expect(plot.x).toBeGreaterThan(bare.x);
    expect(plot.height).toBeLessThan(bare.height);
  });

  it('takes room only when it is shown', () => {
    const plain = planOf(xy([]));
    expect(planOf(xy([line({ showLabel: false })]))).toEqual(plain);
    expect(planOf(xy([line({})])).width).toBeLessThan(plain.width);
  });
});

describe('a reference line in front of the data', () => {
  const svgIndex = (svg: string, needle: string) => svg.indexOf(needle);
  it('is drawn after the data, and a line without the setting before them', () => {
    const chart = xy([line({ id: 'back' }), line({ id: 'front', onTop: true })]);
    const svg = chartToSvgString(chart, table);
    const lastPoint = svg.lastIndexOf('-points-');
    const back = svgIndex(svg, 'reference-line-back');
    const front = svgIndex(svg, 'reference-line-front');
    expect(back).toBeGreaterThan(-1);
    expect(back).toBeLessThan(svg.indexOf('-points-'));
    expect(front).toBeGreaterThan(lastPoint);
  });

  it('is kept by a saved file, with the place of its label', () => {
    const p = createExampleProject();
    p.charts[0] = { ...p.charts[0], referenceLines: [line({ onTop: true, labelAt: 'start' }), line({ id: 'r2' })] };
    const back = parseProject(stringifyProject(p)).charts[0].referenceLines;
    expect(back[0]).toMatchObject({ onTop: true, labelAt: 'start' });
    expect('onTop' in back[1]).toBe(false);
    expect('labelAt' in back[1]).toBe(false);
  });
});

describe('clicking a reference line', () => {
  it('has a target in the editor only, and goes to the Axes page', async () => {
    const { renderToStaticMarkup } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { ChartCanvas } = await import('../anyModel');
    const { inspectorTargetFor } = await import('../../ui/inspector/common/nav');
    const chart = xy([line({ id: 'h' })]);
    const html = (editor: boolean) => renderToStaticMarkup(createElement(ChartCanvas, { chart, any: buildAnyModel(chart, table), cssWidth: '600px', cssHeight: '400px', ...(editor ? { editor: { selection: { kind: 'chart' as const } } } : {}) }));
    expect(html(true)).toContain('data-hit="referenceLine" data-object-id="h"');
    expect(html(false)).not.toContain('data-hit');
    expect(inspectorTargetFor({ kind: 'referenceLine', objectId: 'h' })).toEqual({ page: 'axes' });
  });
});
