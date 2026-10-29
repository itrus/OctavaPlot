import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../defaults';
import type { Annotation, Selection } from '../../types';
import { addAnnotation, composeCommands, patchAnnotations, patchPointStyle } from '../../../state/commands';
import { dataLayer } from '../style';
import { mixedAnnotationKeys, mixedPointStyleKeys, selectedAnnotationIds, selectedPoints, selectionOfAnnotations, selectionOfPoints, toggleAnnotationSelection, togglePointSelection } from './multi';
import { selectedGroupIds } from './scope';

const note = (id: string, over: Partial<Annotation> = {}): Annotation => ({ id, text: id, xFrac: 0.2, yFrac: 0.2, fontSizePt: 12, color: '#000000', opacity: 1, ...over });
const ref = (groupId: string, pointId: string) => ({ groupId, pointId });

describe('several points selected together', () => {
  it('reads the points of a point, the several, and none for anything else', () => {
    expect(selectedPoints({ kind: 'point', groupId: 'a', pointId: 'p1' })).toEqual([ref('a', 'p1')]);
    expect(selectedPoints({ kind: 'points', points: [ref('a', 'p1'), ref('b', 'p2')] })).toEqual([ref('a', 'p1'), ref('b', 'p2')]);
    expect(selectedPoints({ kind: 'group', groupId: 'a' })).toEqual([]);
    expect(selectedPoints({ kind: 'chart' })).toEqual([]);
  });
  it('makes the smallest selection that stands for them', () => {
    expect(selectionOfPoints([])).toEqual({ kind: 'chart' });
    expect(selectionOfPoints([ref('a', 'p1')])).toEqual({ kind: 'point', groupId: 'a', pointId: 'p1' });
    expect(selectionOfPoints([ref('a', 'p1'), ref('a', 'p2')])).toEqual({ kind: 'points', points: [ref('a', 'p1'), ref('a', 'p2')] });
  });
  it('adds a point to the points, takes it out when it is there, and starts afresh from anything else', () => {
    const one: Selection = { kind: 'point', groupId: 'a', pointId: 'p1' };
    const two = togglePointSelection(one, ref('b', 'p9'));
    expect(two).toEqual({ kind: 'points', points: [ref('a', 'p1'), ref('b', 'p9')] });
    expect(togglePointSelection(two, ref('a', 'p1'))).toEqual({ kind: 'point', groupId: 'b', pointId: 'p9' });
    expect(togglePointSelection({ kind: 'group', groupId: 'a' }, ref('a', 'p1'))).toEqual(one);
    expect(togglePointSelection({ kind: 'annotation', annotationId: 'n' }, ref('a', 'p1'))).toEqual(one);
  });
  it('stands for the data sets of its points, each once, in the order they were picked', () => {
    expect(selectedGroupIds({ kind: 'points', points: [ref('b', 'x'), ref('a', 'y'), ref('b', 'z')] })).toEqual(['b', 'a']);
  });
});

describe('several annotations selected together', () => {
  it('reads the annotations of an annotation or the several, and none for anything else', () => {
    expect(selectedAnnotationIds({ kind: 'annotation', annotationId: 'n1' })).toEqual(['n1']);
    expect(selectedAnnotationIds({ kind: 'annotations', annotationIds: ['n1', 'n2'] })).toEqual(['n1', 'n2']);
    expect(selectedAnnotationIds({ kind: 'point', groupId: 'a', pointId: 'p' })).toEqual([]);
  });
  it('makes the smallest selection that stands for them', () => {
    expect(selectionOfAnnotations([])).toEqual({ kind: 'chart' });
    expect(selectionOfAnnotations(['n1'])).toEqual({ kind: 'annotation', annotationId: 'n1' });
    expect(selectionOfAnnotations(['n1', 'n2'])).toEqual({ kind: 'annotations', annotationIds: ['n1', 'n2'] });
  });
  it('toggles an annotation and keeps the order of the chart', () => {
    const order = ['n1', 'n2', 'n3'];
    const a = toggleAnnotationSelection({ kind: 'annotation', annotationId: 'n3' }, 'n1', order);
    expect(a).toEqual({ kind: 'annotations', annotationIds: ['n1', 'n3'] });
    expect(toggleAnnotationSelection(a, 'n3', order)).toEqual({ kind: 'annotation', annotationId: 'n1' });
    expect(toggleAnnotationSelection({ kind: 'chart' }, 'n2', order)).toEqual({ kind: 'annotation', annotationId: 'n2' });
    expect(toggleAnnotationSelection({ kind: 'group', groupId: 'g' }, 'n2', order)).toEqual({ kind: 'annotation', annotationId: 'n2' });
  });
  it('finds the settings in which the annotations differ', () => {
    const same = mixedAnnotationKeys([note('a'), note('b')]);
    expect([...same]).toEqual([]);
    const differ = mixedAnnotationKeys([note('a'), note('b', { fontSizePt: 20, color: '#ff0000' }), note('c', { opacity: 0.5 })]);
    expect([...differ].sort()).toEqual(['color', 'fontSizePt', 'opacity']);
    expect([...mixedAnnotationKeys([note('a', { fontSizePt: 20 })])]).toEqual([]);
  });
  it('changes the settings of the annotations asked for, and no others, in one command', () => {
    const p = [note('n1'), note('n2'), note('n3')].reduce((acc, a) => addAnnotation('chart-x', a)(acc), (() => {
      const base = createExampleProject();
      return { ...base, charts: base.charts.map((c, i) => (i === 0 ? { ...c, id: 'chart-x' } : c)) };
    })());
    const after = patchAnnotations('chart-x', ['n1', 'n3'], { fontSizePt: 30, color: '#00ff00' })(p);
    const notes = after.charts[0].annotations;
    expect(notes.map((a) => a.fontSizePt)).toEqual([30, 12, 30]);
    expect(notes.map((a) => a.color)).toEqual(['#00ff00', '#000000', '#00ff00']);
    expect(notes.map((a) => a.text)).toEqual(['n1', 'n2', 'n3']);
  });
});

describe('the label settings in which several points differ', () => {
  const p = createExampleProject();
  const chart = p.charts[0];
  const table = p.dataTables.find((t) => t.id === chart.dataTableId)!;
  const g = table.groups[0];
  const [o1, o2, o3] = g.observations.map((o) => o.id);
  const edited = composeCommands(patchPointStyle(chart.id, o2, { pointLabelBold: true, pointLabelOffsetXPt: 7 }), patchPointStyle(chart.id, o3, { pointLabelBold: true }))(p);
  const chart2 = edited.charts[0];
  it('names the keys where the resolved values differ, and none for equal points', () => {
    const layer = dataLayer(chart2);
    expect([...mixedPointStyleKeys(chart2, layer, [{ group: g, pointId: o2 }, { group: g, pointId: o3 }])]).toEqual(['pointLabelOffsetXPt']);
    const keys = [...mixedPointStyleKeys(chart2, layer, [{ group: g, pointId: o1 }, { group: g, pointId: o2 }])].sort();
    expect(keys).toEqual(['pointLabelBold', 'pointLabelOffsetXPt']);
    expect([...mixedPointStyleKeys(chart2, layer, [{ group: g, pointId: o1 }])]).toEqual([]);
  });
});
