import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { addChart, addDataTable } from '../../state/commands';
import type { SceneElement } from '../shared/scene/sceneElement';
import { buildHeatModel } from './heatmapModel';
import { heatAxisLabelElements } from './heatMarks';
import { buildPieModel } from '../pie/pieModel';
import { pieLegendElements } from '../pie/pieMarks';

const setup = (type: 'heatmap' | 'pie', kind: 'grouped' | 'contingency') => {
  const p = addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true })(createExampleProject()));
  return { chart: p.charts.find((c) => c.id === 'c')!, table: p.dataTables.find((t) => t.id === 't')! };
};
const attr = (n: SceneElement, name: string) => n.attrs?.find(([k]) => k === name)?.[1];
const all = (nodes: ReadonlyArray<SceneElement>): SceneElement[] => nodes.flatMap((n) => [n, ...all(n.children ?? [])]);

describe('the row and column labels of a heat map as scene elements', () => {
  const { chart, table } = setup('heatmap', 'grouped');
  const model = buildHeatModel(chart, table);

  it('are one text for each row and column, with the axis as their hit target and unique ids', () => {
    const nodes = heatAxisLabelElements(chart, model);
    expect(nodes.map((n) => n.text)).toEqual([...model.rows, ...model.cols]);
    expect(nodes.filter((n) => n.hit?.objectId === 'y')).toHaveLength(model.rows.length);
    expect(nodes.filter((n) => n.hit?.objectId === 'x')).toHaveLength(model.cols.length);
    expect(new Set(nodes.map((n) => n.id)).size).toBe(nodes.length);
  });

  it('turn the column labels by 45 degrees round their own end when the layout says so', () => {
    const turned = heatAxisLabelElements(chart, { ...model, layout: { ...model.layout, xTickRotated: true } }).slice(model.rows.length);
    expect(turned.every((n) => attr(n, 'text-anchor') === 'end' && String(attr(n, 'transform')).startsWith('rotate(-45 '))).toBe(true);
    expect(heatAxisLabelElements(chart, { ...model, layout: { ...model.layout, xTickRotated: false } }).slice(model.rows.length).every((n) => attr(n, 'text-anchor') === 'middle' && attr(n, 'transform') === undefined)).toBe(true);
  });

  it('leave out an axis that is not visible', () => {
    const none = heatAxisLabelElements({ ...chart, xAxis: { ...chart.xAxis, visible: false }, yAxis: { ...chart.yAxis, visible: false } }, model);
    expect(none).toEqual([]);
  });
});

describe('the legend of a pie chart as scene elements', () => {
  it('has a key and a name for each part, and selects the part on a click', () => {
    const { chart, table } = setup('pie', 'contingency');
    const model = buildPieModel(chart, table);
    const nodes = all(pieLegendElements(chart, model));
    const entries = nodes.filter((n) => n.hit?.kind === 'legend');
    expect(entries.map((n) => n.hit!.groupId)).toEqual(model.legendParts.map((i) => model.parts[i].groupId));
    expect(nodes.filter((n) => n.tag === 'text').map((n) => n.text)).toEqual(model.layout.legend?.items.map((i) => i.label));
    expect(nodes[0].id).toBe('legend');
  });
});
