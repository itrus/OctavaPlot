import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createEmptyProject } from '../../model/defaults';
import { GALLERY } from '../../model/graph/chartGallery';
import { createDrawing, presetById } from '../../model/graph/drawingPresets';
import type { Chart, Project, TableKind } from '../../model/types';
import { addAnnotation, addChart, addDataTable, addDrawing, patchLook } from '../../state/commands';
import { buildAnyModel, ChartCanvas, drawingOf } from '../anyModel';
import { chartMarkup, elementsMarkup } from './sceneMarkup';
import { el } from '../shared/scene/sceneElement';
import { SceneElements } from '../shared/scene/SceneElements';
import { SvgIdPrefix } from '../shared/scene/idPrefix';

/** The two writers of a chart must agree to the byte: React's (the editor, and the reference here) and the string writer of the exports. */
function both(p: Project, chart: Chart): { react: string; text: string } {
  const table = p.dataTables.find((t) => t.id === chart.dataTableId)!;
  const any = buildAnyModel(chart, table);
  const react = renderToStaticMarkup(<ChartCanvas chart={chart} any={any} cssWidth={`${chart.widthPx}px`} cssHeight={`${chart.heightPx}px`} />);
  const text = chartMarkup(chart, drawingOf(chart, any), `${chart.widthPx}px`, `${chart.heightPx}px`);
  return { react, text };
}

describe('the string writer of an export', () => {
  const KINDS = Object.keys(GALLERY) as TableKind[];
  for (const kind of KINDS) {
    it(`writes every ${kind} graph as React does, with texts and shapes on it`, () => {
      let p: Project = addDataTable('t1', kind, { sample: true })(createEmptyProject());
      const items = GALLERY[kind].flatMap((tab) => tab.items).filter((item) => item.type !== null);
      for (const item of items) {
        p = addChart(`c-${item.id}`, 't1', undefined, item.type!, item.variant)(p);
        p = addAnnotation(`c-${item.id}`, { id: 'n', text: 'p < 0.05 & H_{2}O, x^{2} "q" \'r\'\nsecond', xFrac: 0.4, yFrac: 0.2, fontSizePt: 10, color: '#000000', opacity: 1 })(p);
        p = addDrawing({ chartId: `c-${item.id}` }, { ...createDrawing(presetById('bracketText')!, { xFrac: 0.2, yFrac: 0.2 }, { xFrac: 0.7, yFrac: 0.2 }, { color: '#aa0000', fontSizePt: 14, widthPt: 2 }, 'b'), text: 'p = 0.003 {{mean A}}' })(p);
      }
      for (const item of items) {
        const chart = p.charts.find((c) => c.id === `c-${item.id}`)!;
        const { react, text } = both(p, chart);
        expect(text, item.id).toBe(react);
      }
    });
  }

  it('writes a page colour and a font as React does, and the ids of a prefixed drawing', () => {
    let p: Project = addDataTable('t1', 'column', { sample: true })(createEmptyProject());
    p = addChart('c', 't1', undefined, 'bar')(p);
    p = patchLook('c', { pageColor: '#f0f0f0' })(p);
    const chart = p.charts[0];
    expect(both(p, chart).text).toBe(both(p, chart).react);
    const any = buildAnyModel(chart, p.dataTables[0]);
    const drawing = drawingOf(chart, any);
    const react = renderToStaticMarkup(
      <SvgIdPrefix.Provider value="p1-">
        <ChartCanvas chart={chart} any={any} cssWidth="10px" cssHeight="20px" />
      </SvgIdPrefix.Provider>,
    );
    expect(chartMarkup(chart, drawing, '10px', '20px', 'p1-')).toBe(react);
  });

  it('writes loose elements as React does, whatever their text', () => {
    const nodes = [el('g', [['transform', 'translate(1 2)'], ['font-family', 'A "B"']], { children: [el('text', [['x', 1]], { text: '<&>"\'' }), el('rect', [['width', undefined], ['height', 3]], { id: 'r' })] })];
    expect(elementsMarkup(nodes)).toBe(renderToStaticMarkup(<SceneElements nodes={nodes} editor={false} />));
  });
});
