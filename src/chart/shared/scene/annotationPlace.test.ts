import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../../model/defaults';
import type { Annotation, ChartType, Project, TableKind } from '../../../model/types';
import { addAnnotation, addChart, addDataTable, patchAnnotation, patchAxis } from '../../../state/commands';
import { parseProject, parseProjectWithNotes, stringifyProject } from '../../../state/serialize';
import { buildAnyModel, ChartCanvas } from '../../anyModel';
import type { ColumnModel } from '../../column/columnModel';
import type { XyModel } from '../../xy/xyModel';
import { annotationPlacer, changeAnchor, drawnFractions, nudgePatches, patchForMove } from './annotationPlace';
import { annotationElements } from './annotations';

const note = (over: Partial<Annotation> = {}): Annotation => ({ id: 'n1', text: 'A note', xFrac: 0.25, yFrac: 0.5, fontSizePt: 12, color: '#000000', opacity: 1, ...over });

const projectOf = (kind: TableKind, type: ChartType, annotation: Annotation = note()): Project => {
  const p = addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true })(createExampleProject()));
  return addAnnotation('c', annotation)(p);
};
const placerOf = (p: Project) => {
  const chart = p.charts.find((c) => c.id === 'c')!;
  const any = buildAnyModel(chart, p.dataTables.find((t) => t.id === 't')!);
  return { any, chart, placer: annotationPlacer(any, any.model.widthPt, any.model.heightPt) };
};

describe('annotations on an XY chart', () => {
  const p = projectOf('xy', 'xyLineSymbols');
  const { any, placer } = placerOf(p);
  const m = any.model as XyModel;

  it('stay at their fractions of the page with the page anchor', () => {
    expect(placer.place(note())).toEqual({ x: 0.25 * m.widthPt, y: 0.5 * m.heightPt });
  });
  it('go to their values on the axes with the data anchor', () => {
    const [x0, x1] = m.x.domain;
    const [y0, y1] = m.y.domain;
    const at = placer.place(note({ anchor: 'data', x: (x0 + x1) / 2, y: (y0 + y1) / 2 }))!;
    expect(at.x).toBeCloseTo(m.xScale((x0 + x1) / 2), 6);
    expect(at.y).toBeCloseTo(m.yScale((y0 + y1) / 2), 6);
  });
  it('have no place outside the axis range, and are reported rather than moved to the edge', () => {
    const [x0, x1] = m.x.domain;
    const out = note({ anchor: 'data', x: x1 + 1000, y: m.y.domain[0] });
    expect(placer.place(out)).toBeNull();
    expect(placer.skipped([out, note(), note({ anchor: 'data', x: x0, y: m.y.domain[0] })])).toEqual([out]);
  });
  it('read the values back at a place on the page, the other way round from place', () => {
    const [x0, x1] = m.x.domain;
    const [y0, y1] = m.y.domain;
    const a = note({ anchor: 'data', x: x0 + (x1 - x0) * 0.3, y: y0 + (y1 - y0) * 0.7 });
    const at = placer.place(a)!;
    const back = placer.fromPage(at.x, at.y);
    expect(back.x).toBeCloseTo(a.x!, 4);
    expect(back.y).toBeCloseTo(a.y!, 4);
  });
});

describe('annotations follow the axes', () => {
  it('move when the axis range changes, and a page-anchored one does not', () => {
    const base = projectOf('xy', 'xyLineSymbols');
    const { any: a0, placer: p0 } = placerOf(base);
    const m0 = a0.model as XyModel;
    const data = note({ anchor: 'data', x: m0.x.domain[0] + 1, y: m0.y.domain[0] + 0.5 });
    const wider = patchAxis('c', 'yAxis', { min: m0.y.domain[0], max: m0.y.domain[1] * 3 })(base);
    const { placer: p1 } = placerOf(wider);
    expect(p1.place(data)!.y).toBeGreaterThan(p0.place(data)!.y);
    expect(p1.place(data)!.x).toBeCloseTo(p0.place(data)!.x, 6);
    expect(p1.place(note())).toEqual(p0.place(note()));
  });
  it('work on a log axis and a reversed axis, and the values read back match', () => {
    for (const patch of [{ scale: 'log10' as const, min: 0.1, max: 1000 }, { reverse: true }]) {
      const base = patchAxis('c', 'yAxis', patch)(projectOf('xy', 'xyLineSymbols'));
      const { any, placer } = placerOf(base);
      const m = any.model as XyModel;
      const [lo, hi] = [Math.min(...m.y.domain), Math.max(...m.y.domain)];
      const y = patch.scale ? 10 : lo + (hi - lo) * 0.4;
      const a = note({ anchor: 'data', x: m.x.domain[0], y });
      const at = placer.place(a)!;
      expect(at.y).toBeCloseTo(m.yScale(y), 6);
      expect(placer.fromPage(at.x, at.y).y).toBeCloseTo(y, 3);
    }
  });
  it('have no place in the gap of a broken axis', () => {
    const base = patchAxis('c', 'yAxis', { min: 0, max: 10, breaks: [{ from: 4, to: 6 }] })(projectOf('xy', 'xyLineSymbols'));
    const { placer } = placerOf(base);
    expect(placer.place(note({ anchor: 'data', x: 1, y: 5 }))).toBeNull();
    expect(placer.place(note({ anchor: 'data', x: 1, y: 8 }))).not.toBeNull();
  });
});

describe('annotations on a chart over categories', () => {
  it('take their height from the value axis and stay a fraction of the page across the categories', () => {
    const p = projectOf('column', 'bar');
    const { any, placer } = placerOf(p);
    const m = any.model as ColumnModel;
    expect(placer.numericX).toBe(false);
    expect(placer.acrossPage).toBe('x');
    const y = (m.y.domain[0] + m.y.domain[1]) / 2;
    const at = placer.place(note({ anchor: 'data', y }))!;
    expect(at.x).toBeCloseTo(0.25 * m.widthPt, 6);
    expect(at.y).toBeCloseTo(m.yScale(y), 6);
    expect(placer.fromPage(at.x, at.y).y).toBeCloseTo(y, 4);
    expect(placer.fromPage(at.x, at.y).x).toBeUndefined();
  });
  it('have no place in a pie chart when anchored to data, and are reported as such', () => {
    const p = projectOf('contingency', 'pie');
    const { any, chart, placer } = placerOf(p);
    expect(placer.supportsData).toBe(false);
    expect(placer.place(note())).not.toBeNull();
    const data = note({ anchor: 'data', y: 1 });
    expect(placer.place(data)).toBeNull();
    const withData = addAnnotation('c', data)(p);
    const warnings = buildAnyModel(withData.charts.find((c) => c.id === 'c')!, p.dataTables.find((t) => t.id === 't')!).model.warnings;
    expect(warnings.some((w) => /anchored to data, which this chart has no axes for/.test(w))).toBe(true);
    expect(any.family).toBe('pie');
    expect(chart.annotations).toHaveLength(1);
  });
});

describe('moving and anchoring', () => {
  const p = projectOf('xy', 'xyLineSymbols');
  const { any, placer } = placerOf(p);
  const m = any.model as XyModel;

  it('a move of a page-anchored text stores only fractions; of a data-anchored one, the values too', () => {
    expect(patchForMove(note(), placer, 0.5, 0.5)).toEqual({ xFrac: 0.5, yFrac: 0.5 });
    const a = note({ anchor: 'data', x: m.x.domain[0], y: m.y.domain[0] });
    const patch = patchForMove(a, placer, 0.5, 0.5);
    expect(patch.xFrac).toBe(0.5);
    expect(patch.x).toBeCloseTo(placer.fromPage(0.5 * m.widthPt, 0.5 * m.heightPt).x!, 6);
    expect(patch.y).toBeCloseTo(placer.fromPage(0.5 * m.widthPt, 0.5 * m.heightPt).y!, 6);
    expect(placer.place({ ...a, ...patch })!.x).toBeCloseTo(0.5 * m.widthPt, 2);
  });
  it('changing the anchor keeps the text where it is drawn, both ways', () => {
    const page = note({ xFrac: 0.4, yFrac: 0.3 });
    const toData = { ...page, ...changeAnchor(page, placer, 'data')! };
    expect(toData.anchor).toBe('data');
    const drawn = placer.place(toData)!;
    expect(drawn.x).toBeCloseTo(0.4 * m.widthPt, 2);
    expect(drawn.y).toBeCloseTo(0.3 * m.heightPt, 2);
    const back = { ...toData, ...changeAnchor(toData, placer, 'page')! };
    expect(back.anchor).toBeUndefined();
    expect(back.xFrac).toBeCloseTo(0.4, 3);
    expect(back.yFrac).toBeCloseTo(0.3, 3);
    expect(changeAnchor(page, placer, 'page')).toEqual({});
    expect(drawnFractions(page, placer)!.xFrac).toBeCloseTo(0.4, 9);
    expect(drawnFractions(page, placer)!.yFrac).toBeCloseTo(0.3, 9);
  });
  it('cannot anchor to data on a chart without axes', () => {
    const { placer: none } = placerOf(projectOf('contingency', 'pie'));
    expect(changeAnchor(note(), none, 'data')).toBeNull();
  });
});

describe('drawing', () => {
  it('leaves out an annotation that has no place and draws the others', () => {
    const els = annotationElements([note(), note({ id: 'n2' })], 100, 100, null, (a) => (a.id === 'n2' ? null : { x: 10, y: 20 }));
    expect(els).toHaveLength(1);
    expect(els[0].id).toBe('annotation-n1');
  });
  it('draws a data-anchored annotation at its values in the SVG, and not at all when it is out of range', () => {
    const base = projectOf('xy', 'xyLineSymbols');
    const m = placerOf(base).any.model as { x: { domain: [number, number] }; y: { domain: [number, number] } };
    const svg = (a: Annotation) => {
      const p = addAnnotation('c', a)(projectOf('xy', 'xyLineSymbols', note({ id: 'other', text: 'Other' })));
      const chart = p.charts.find((c) => c.id === 'c')!;
      const table = p.dataTables.find((t) => t.id === 't')!;
      return renderToStaticMarkup(createElement(ChartCanvas, { chart, any: buildAnyModel(chart, table), cssWidth: '600px', cssHeight: '600px' }));
    };
    expect(svg(note({ id: 'in', text: 'Inside', anchor: 'data', x: m.x.domain[0], y: m.y.domain[0] }))).toContain('id="annotation-in"');
    expect(svg(note({ id: 'out', text: 'Outside', anchor: 'data', x: m.x.domain[1] + 1e6, y: m.y.domain[0] }))).not.toContain('id="annotation-out"');
  });
});

describe('the file', () => {
  it('keeps the data anchor and its values, and an old annotation has none', () => {
    const p = projectOf('xy', 'xyLineSymbols', note({ anchor: 'data', x: 2.5, y: 7 }));
    const a = parseProject(stringifyProject(p)).charts.find((c) => c.id === 'c')!.annotations[0];
    expect(a).toMatchObject({ anchor: 'data', x: 2.5, y: 7 });
    const old = parseProject(stringifyProject(projectOf('xy', 'xyLineSymbols'))).charts.find((c) => c.id === 'c')!.annotations[0];
    expect('anchor' in old || 'x' in old || 'y' in old).toBe(false);
  });
  it('drops a data anchor that has no value, with a note', () => {
    const p = projectOf('xy', 'xyLineSymbols', note({ anchor: 'data' }));
    const read = parseProjectWithNotes(stringifyProject(p));
    expect(read.project.charts.find((c) => c.id === 'c')!.annotations[0].anchor).toBeUndefined();
    expect(read.notes.some((n) => /anchored to data without a value/.test(n))).toBe(true);
    expect(patchAnnotation('c', 'n1', { x: 1 })(p).charts.find((c) => c.id === 'c')!.annotations[0].x).toBe(1);
  });
});

describe('moving several annotations by the same step', () => {
  const p = projectOf('xy', 'xyLineSymbols');
  const { any, placer } = placerOf(p);
  const m = any.model as XyModel;
  const page = note({ id: 'a', xFrac: 0.25, yFrac: 0.5 });
  const edge = note({ id: 'b', xFrac: 0.995, yFrac: 0.002 });
  const data = note({ id: 'c', anchor: 'data', x: (m.x.domain[0] + m.x.domain[1]) / 2, y: (m.y.domain[0] + m.y.domain[1]) / 2 });

  it('moves each by the step from where it is drawn, rounded to a tenth of a percent', () => {
    const out = nudgePatches([page], placer, 0.01, -0.001);
    expect(out).toEqual([{ id: 'a', patch: { xFrac: 0.26, yFrac: 0.499 } }]);
  });
  it('keeps each inside the chart on its own, so the others still move by the full step', () => {
    const out = nudgePatches([page, edge], placer, 0.05, -0.05);
    expect(out[0].patch).toEqual({ xFrac: 0.3, yFrac: 0.45 });
    expect(out[1].patch).toEqual({ xFrac: 1, yFrac: 0 });
  });
  it('gives a data-anchored annotation the values at its new place, so it stays there when the axes change', () => {
    const [patch] = nudgePatches([data], placer, 0.1, 0);
    const at = placer.place(data)!;
    expect(patch.patch.xFrac).toBeCloseTo(Math.round((at.x / placer.widthPt + 0.1) * 1000) / 1000, 6);
    expect(patch.patch.x).toBeGreaterThan(data.x!);
    // Y changes only by the rounding of the fraction to a tenth of a percent of the page.
    expect(Math.abs(patch.patch.y! - data.y!)).toBeLessThan((m.y.domain[1] - m.y.domain[0]) * 0.002);
  });
  it('moves an annotation that is not drawn from its stored fractions, and does nothing for none', () => {
    const hidden = note({ id: 'h', anchor: 'data', x: m.x.domain[1] + 1000, y: m.y.domain[0], xFrac: 0.4, yFrac: 0.4 });
    expect(nudgePatches([hidden], placer, 0.01, 0)[0].patch.xFrac).toBe(0.41);
    expect(nudgePatches([], placer, 0.01, 0)).toEqual([]);
  });
  it('works without a placer: the page fractions', () => {
    expect(nudgePatches([page], undefined, 0, 0.05)).toEqual([{ id: 'a', patch: { xFrac: 0.25, yFrac: 0.55 } }]);
  });
});
