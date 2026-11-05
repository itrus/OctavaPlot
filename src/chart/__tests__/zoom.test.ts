import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../../model/defaults';
import type { ChartType, Project, TableKind } from '../../../model/types';
import { addAnnotation, addChart, addDataTable } from '../../../state/commands';
import { buildAnyModel, ChartCanvas } from '../../anyModel';
import { chartToSvgString } from '../../export/export';

/** One chart of each family the drawing is made for, with an annotation (which every family draws the same way). */
const FAMILIES: ReadonlyArray<readonly [string, TableKind, ChartType]> = [
  ['column bars', 'column', 'bar'],
  ['column dots', 'column', 'scatter'],
  ['box', 'column', 'box'],
  ['grouped bars', 'grouped', 'groupedBar'],
  ['grouped lines', 'grouped', 'groupedLine'],
  ['pie', 'contingency', 'pie'],
  ['doughnut', 'contingency', 'doughnut'],
  ['heat map', 'grouped', 'heatmap'],
  ['xy', 'xy', 'xyLineSymbols'],
  ['histogram', 'column', 'histogram'],
  ['survival', 'survival', 'survival'],
];

const project = (kind: TableKind, type: ChartType): Project => {
  const p = addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true })(createExampleProject()));
  return addAnnotation('c', { id: 'n1', text: 'A note', xFrac: 0.1, yFrac: 0.1, fontSizePt: 14, color: '#000000', opacity: 1 })(p);
};
const svgOf = (p: Project, css: string, editor = false): string => {
  const chart = p.charts.find((c) => c.id === 'c')!;
  const table = p.dataTables.find((t) => t.id === 't')!;
  return renderToStaticMarkup(createElement(ChartCanvas, { chart, any: buildAnyModel(chart, table), cssWidth: css, cssHeight: css, ...(editor ? { editor: { selection: { kind: 'chart' as const } } } : {}) }));
};
/** Zoom is only the size of the element: leave it out and everything else is the page in pt. */
const plain = (svg: string) => svg.replace(/(<svg [^>]*?) width="[^"]*" height="[^"]*"/, '$1');
/** The marks that have an id (paths, rects, circles), without the attributes only the editor adds: what is drawn, not how it is clicked. */
const marks = (svg: string) =>
  [...svg.matchAll(/<(?:path|rect|circle|g)(?: [^>]*?)? id="[^"]+"[^>]*>/g)].map((m) => m[0].replace(/ data-[a-z-]+="[^"]*"/g, '').replace(/ pointer-events="[^"]*"/g, ''));

describe.each(FAMILIES)('the drawing of a %s chart', (_name, kind, type) => {
  const p = project(kind, type);

  it('is the same at any zoom: viewBox, coordinates, font sizes and stroke widths are those of the page in pt', () => {
    const small = svgOf(p, '300px');
    expect(small).toContain('viewBox=');
    expect(plain(small)).toBe(plain(svgOf(p, '1800px')));
    expect(small).not.toContain('NaN');
  });

  it('has the same marks in the editor as in an export', () => {
    const exported = marks(svgOf(p, '600px'));
    expect(exported.length).toBeGreaterThan(5);
    expect(marks(svgOf(p, '600px', true))).toEqual(exported);
  });

  it('draws an annotation with a stable id, and none of the editor in an export', () => {
    const exported = chartToSvgString(p.charts.find((c) => c.id === 'c')!, p.dataTables.find((t) => t.id === 't')!);
    expect(exported).toContain('id="annotation-n1"');
    expect(exported).not.toContain('data-hit');
    expect(exported).not.toContain('data-editor-only');
  });
});
