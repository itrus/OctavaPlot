import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../../model/defaults';
import { layersOf } from '../../../model/graph/layers';
import type { Chart, ChartType, DataTable, Project, TableKind } from '../../../model/types';
import { addChart, addDataTable, setLayerHidden } from '../../../state/commands';
import { parseProject, stringifyProject } from '../../../state/serialize';
import { permuteRows } from '../../../testing/tableChecks';
import { buildAnyModel, ChartCanvas } from '../../anyModel';
import { chartToSvgString } from '../../export/export';
import { svgId } from './svgIds';

/** The ids of the marks of the column, grouped, histogram, pie and heat map charts: made from the layer and the observation they draw. */
const CASES: Array<[string, ChartType, TableKind, boolean]> = [
  ['bar', 'bar', 'column', false],
  ['box', 'box', 'column', false],
  ['paired', 'paired', 'column', false],
  ['mean', 'mean', 'column', false],
  ['grouped bars', 'groupedBar', 'grouped', true],
  ['grouped line', 'groupedLine', 'grouped', true],
  ['grouped violin', 'groupedViolin', 'grouped', true],
  ['stacked contingency', 'contingencyStacked', 'contingency', false],
  ['histogram', 'histogram', 'column', false],
  ['pie', 'pie', 'contingency', false],
  ['doughnut', 'doughnut', 'contingency', false],
  ['heat map', 'heatmap', 'grouped', false],
  ['cumulative distribution', 'ecdf', 'column', false],
];

function project(type: ChartType, kind: TableKind, replicates: boolean): Project {
  const p = addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true, ...(replicates ? { layout: { kind: 'replicates' as const, n: 4 } } : {}) })(createExampleProject()));
  // Everything the type can draw is on: error bars, mean lines, symbols, lines.
  return {
    ...p,
    charts: p.charts.map((c) =>
      c.id === 'c' ? { ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, summary: { ...l.summary, spread: 'sd' as const }, style: { ...l.style, showErrorBars: true, showMeanLine: true, showSymbols: true, showLines: true, showBars: true } } : l)) } : c,
    ),
  };
}
const chartOf = (p: Project): Chart => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project): DataTable => p.dataTables.find((t) => t.id === 't')!;
const svgOf = (p: Project, editor = false): string =>
  editor
    ? renderToStaticMarkup(createElement(ChartCanvas, { chart: chartOf(p), any: buildAnyModel(chartOf(p), tableOf(p)), cssWidth: '600px', cssHeight: '400px', editor: { selection: { kind: 'chart' as const } } }))
    : chartToSvgString(chartOf(p), tableOf(p));
const idsOf = (svg: string): string[] => [...svg.matchAll(/ id="([^"]+)"/g)].map((m) => m[1]);
/** The ids that belong to a layer: they start with the layer's own id. */
const markIds = (p: Project): string[] => {
  const prefixes = layersOf(chartOf(p), tableOf(p)).map((l) => svgId(l.id));
  return idsOf(svgOf(p)).filter((id) => prefixes.some((x) => id === x || id.startsWith(`${x}-`)));
};

describe.each(CASES)('the ids of the marks of a %s chart', (_, type, kind, replicates) => {
  const p = project(type, kind, replicates);

  it('are there, unique and valid in XML, and the same in the editor as in an export', () => {
    const exported = idsOf(svgOf(p));
    expect(markIds(p).length).toBeGreaterThan(0);
    expect(new Set(exported).size).toBe(exported.length);
    for (const id of exported) expect(id).toMatch(/^[A-Za-z_][A-Za-z0-9_.-]*$/);
    expect(idsOf(svgOf(p, true))).toEqual(exported);
  });

  it('say which layer they belong to', () => {
    const layers = layersOf(chartOf(p), tableOf(p));
    const drawn = new Set(markIds(p).map((id) => layers.find((l) => id === svgId(l.id) || id.startsWith(`${svgId(l.id)}-`))?.kind));
    expect(drawn.size).toBeGreaterThan(0);
    expect(drawn.has(undefined)).toBe(false);
  });

  it('do not change when the chart is restyled, resized, renamed, saved and opened', () => {
    const base = markIds(p);
    const restyled: Project = { ...p, charts: p.charts.map((c): Chart => (c.id === 'c' ? { ...c, name: 'other', widthPx: 500, heightPx: 400, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, symbolSizePt: 20, lineWidthPt: 6, barFill: '#123456' } } : l)) } : c)) };
    expect(markIds(restyled)).toEqual(base);
    expect(markIds(parseProject(stringifyProject(p)))).toEqual(base);
  });

  it('do not change when the rows of the table are put in another order', () => {
    const t = tableOf(p);
    const reversed = permuteRows(t, Array.from({ length: t.rowCount }, (_, i) => t.rowCount - 1 - i));
    const moved: Project = { ...p, dataTables: p.dataTables.map((x) => (x.id === 't' ? reversed : x)) };
    expect([...markIds(moved)].sort()).toEqual([...markIds(p)].sort());
  });

  it('go with their layer when it is hidden, and the others stay as they were', () => {
    const base = markIds(p);
    const layer = layersOf(chartOf(p), tableOf(p)).find((l) => base.some((id) => id === svgId(l.id) || id.startsWith(`${svgId(l.id)}-`)))!;
    const gone = markIds(setLayerHidden('c', layer.id, true)(p));
    const own = (id: string) => id === svgId(layer.id) || id.startsWith(`${svgId(layer.id)}-`);
    expect(gone).toEqual(base.filter((id) => !own(id)));
    expect(base.some(own)).toBe(true);
  });
});
