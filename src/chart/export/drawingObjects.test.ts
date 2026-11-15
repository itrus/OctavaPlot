import { describe, expect, it } from 'vitest';
import { chartToSvgString } from './export';
import { layoutToSvgString } from './layoutExport';
import { svgToPdf } from './svgPdf';
import { createExampleProject } from '../../model/defaults';
import { createDrawing, presetById } from '../../model/graph/drawingPresets';
import type { Drawing, Project } from '../../model/types';
import { addDrawing, addLayout, patchDrawings, removeDrawings, resetAllDataSets } from '../../state/commands';
import { parseProjectWithNotes, stringifyProject } from '../../state/serialize';

const look = { color: '#336699', fontSizePt: 10 };
const drawingOf = (preset: string, id: string): Drawing => createDrawing(presetById(preset)!, { xFrac: 0.2, yFrac: 0.3 }, { xFrac: 0.6, yFrac: 0.3 }, look, id);

const withLayout = (): Project => addLayout('l1')(createExampleProject());

describe('drawing objects in the project', () => {
  it('are added to a chart or a page, changed together, and taken off; the list is left out when it is empty', () => {
    let p = withLayout();
    const chartId = p.charts[0].id;
    p = addDrawing({ chartId }, drawingOf('arrow', 'a'))(p);
    p = addDrawing({ chartId }, drawingOf('bracketText', 'b'))(p);
    p = addDrawing({ layoutId: 'l1' }, drawingOf('ellipse', 'c'))(p);
    expect(p.charts[0].drawings?.map((d) => d.id)).toEqual(['a', 'b']);
    expect(p.layouts?.[0].drawings?.map((d) => d.id)).toEqual(['c']);
    p = patchDrawings({ chartId }, ['a', 'b'], { widthPt: 2 })(p);
    expect(p.charts[0].drawings?.map((d) => d.widthPt)).toEqual([2, 2]);
    // A key set to undefined is taken off: the text of a line is removed.
    p = patchDrawings({ chartId }, ['b'], { text: undefined, fontSizePt: undefined })(p);
    expect('text' in p.charts[0].drawings![1]).toBe(false);
    expect(patchDrawings({ chartId }, ['missing'], { widthPt: 3 })(p)).toBe(p);
    p = removeDrawings({ chartId }, ['a', 'b'])(p);
    expect('drawings' in p.charts[0]).toBe(false);
    p = removeDrawings({ layoutId: 'l1' }, ['c'])(p);
    expect('drawings' in p.layouts![0]).toBe(false);
  });

  it('are kept when a graph is reset to the settings of a new graph', () => {
    let p = createExampleProject();
    const chartId = p.charts[0].id;
    p = resetAllDataSets(chartId)(addDrawing({ chartId }, drawingOf('rect', 'r'))(p));
    expect(p.charts[0].drawings?.map((d) => d.id)).toEqual(['r']);
  });

  it('are written to the file and read back as they were, on a chart and on a page', () => {
    let p = withLayout();
    const chartId = p.charts[0].id;
    const anchored: Drawing = { ...drawingOf('capsText', 'a'), anchor: 'data', from: { xFrac: 0.1, yFrac: 0.2, y: 3 }, to: { xFrac: 0.5, yFrac: 0.2, y: 3 }, textSide: 'below', bold: true, endSizePt: 9 };
    p = addDrawing({ chartId }, anchored)(p);
    p = addDrawing({ chartId }, { ...drawingOf('rounded', 'b'), fill: '#ff0000', fillOpacity: 0.5 })(p);
    p = addDrawing({ layoutId: 'l1' }, drawingOf('elbowArrows', 'c'))(p);
    const r = parseProjectWithNotes(stringifyProject(p));
    expect(r.notes).toEqual([]);
    expect(r.project.charts[0].drawings).toEqual(p.charts[0].drawings);
    expect(r.project.layouts?.[0].drawings).toEqual(p.layouts?.[0].drawings);
  });

  it('keeps a figure drawn beyond page edges unchanged after saving and reopening', () => {
    let p = withLayout();
    const d = createDrawing(presetById('rect')!, { xFrac: -0.1, yFrac: 0.9 }, { xFrac: 1.2, yFrac: 1.3 }, look, 'edge');
    expect(d.from).toEqual({ xFrac: 0, yFrac: 0.9 });
    expect(d.to).toEqual({ xFrac: 1, yFrac: 1 });
    p = addDrawing({ chartId: p.charts[0].id }, d)(p);
    p = addDrawing({ layoutId: 'l1' }, { ...d, id: 'page-edge' })(p);
    const r = parseProjectWithNotes(stringifyProject(p));
    expect(r.notes).toEqual([]);
    expect(r.project.charts[0].drawings).toEqual(p.charts[0].drawings);
    expect(r.project.layouts![0].drawings).toEqual(p.layouts![0].drawings);
  });

  it('are checked when a file is read: an entry that cannot be read is dropped with a note, wrong values take their defaults, a page never anchors to data', () => {
    let p = withLayout();
    const env = JSON.parse(stringifyProject(p));
    env.project.charts[0].drawings = [
      { id: 'ok', shape: 'line', from: { xFrac: 2, yFrac: 0.5 }, to: { xFrac: 0.5, yFrac: 0.5 }, color: 'red', opacity: 5, widthPt: 900, lineStyle: 'wavy', start: 'boom', end: 'arrow', fill: '#ffffff', text: 'ns', fontSizePt: 1 },
      { id: 'ok', shape: 'line', from: { xFrac: 0, yFrac: 0 }, to: { xFrac: 1, yFrac: 1 } },
      { id: 'noShape', shape: 'star', from: { xFrac: 0, yFrac: 0 }, to: { xFrac: 1, yFrac: 1 } },
      { id: 'noPoints', shape: 'rect' },
    ];
    env.project.layouts[0].drawings = [{ id: 'pg', shape: 'ellipse', anchor: 'data', from: { xFrac: 0, yFrac: 0, x: 1, y: 2 }, to: { xFrac: 1, yFrac: 1, x: 3, y: 4 }, color: '#000000', opacity: 1, widthPt: 1, lineStyle: 'solid' }];
    const r = parseProjectWithNotes(JSON.stringify(env));
    expect(r.notes.filter((n) => n.includes('drawings')).length).toBe(3);
    expect(r.project.charts[0].drawings).toEqual([{ id: 'ok', shape: 'line', from: { xFrac: 1, yFrac: 0.5 }, to: { xFrac: 0.5, yFrac: 0.5 }, end: 'arrow', color: '#000000', opacity: 1, widthPt: 20, lineStyle: 'solid', text: 'ns', fontSizePt: 4 }]);
    expect(r.project.layouts?.[0].drawings).toEqual([{ id: 'pg', shape: 'ellipse', from: { xFrac: 0, yFrac: 0 }, to: { xFrac: 1, yFrac: 1 }, color: '#000000', opacity: 1, widthPt: 1, lineStyle: 'solid' }]);
  });

  it('are drawn in the SVG of a graph and of a page, without the marks of the editor, and written into a PDF', async () => {
    let p = withLayout();
    const chartId = p.charts[0].id;
    p = addDrawing({ chartId }, drawingOf('bracketText', 'b'))(p);
    p = addDrawing({ layoutId: 'l1' }, drawingOf('arrow', 'c'))(p);
    const svg = chartToSvgString(p.charts[0], p.dataTables[0]);
    expect(svg).toContain('id="drawing-b"');
    expect(svg).toContain('>ns</text>');
    expect(svg).not.toContain('data-hit');
    expect(svg).not.toContain('data-editor-only');
    const page = layoutToSvgString(p.layouts![0], p);
    expect(page).toContain('id="drawing-c"');
    const pdf = await svgToPdf(page, { title: 'x' });
    expect(pdf.notes).toEqual([]);
  });
});
