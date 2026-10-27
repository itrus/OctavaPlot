import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import type { ChartType, Project, Selection, TableKind } from '../model/types';
import { addChart, addDataTable } from '../state/commands';
import { buildAnyModel } from './anyModel';
import { describeSelection, nextSelection, selectableMarks, type StepGroup } from './selectionOrder';

const marksOf = (kind: TableKind, type: ChartType): StepGroup[] => {
  const p: Project = addChart('c', 't', undefined, type)(addDataTable('t', kind, { sample: true })(createExampleProject()));
  return selectableMarks(buildAnyModel(p.charts.find((c) => c.id === 'c')!, p.dataTables.find((t) => t.id === 't')!));
};

/** A small chart by hand: three data sets of 2, 12 and 0 points. */
const marks: StepGroup[] = [
  { groupId: 'a', label: 'A', points: [{ id: 'a1', text: 'v 1' }, { id: 'a2', text: 'v 2' }] },
  { groupId: 'b', label: 'B', points: Array.from({ length: 12 }, (_, i) => ({ id: `b${i + 1}`, text: `v ${i + 1}` })) },
  { groupId: 'c', label: 'C', points: [] },
];
const chart: Selection = { kind: 'chart' };
const g = (groupId: string): Selection => ({ kind: 'group', groupId });
const pt = (groupId: string, pointId: string): Selection => ({ kind: 'point', groupId, pointId });

describe('what the keyboard can select', () => {
  it('is the data sets of a column chart with their dots, without the mean markers', () => {
    const m = marksOf('column', 'scatter');
    expect(m.length).toBeGreaterThan(1);
    expect(m.every((s) => s.points.length > 0 && s.points.every((p) => !p.id.endsWith(':mean')))).toBe(true);
  });
  it('is the series of an XY chart with their points, the parts of a pie, and nothing on a heat map', () => {
    const xy = marksOf('xy', 'xyLineSymbols');
    expect(xy.length).toBeGreaterThan(0);
    expect(xy[0].points[0].text).toMatch(/^x .*, y /);
    expect(marksOf('contingency', 'pie').every((s) => s.points.length === 0)).toBe(true);
    expect(marksOf('contingency', 'pie').length).toBeGreaterThan(0);
    expect(marksOf('grouped', 'heatmap')).toEqual([]);
  });
});

describe('moving the selection with the keys', () => {
  it('Right and Left step along the data sets, and Left from the first returns to the whole chart', () => {
    expect(nextSelection(marks, chart, 'ArrowRight')).toEqual(g('a'));
    expect(nextSelection(marks, g('a'), 'ArrowRight')).toEqual(g('b'));
    expect(nextSelection(marks, g('c'), 'ArrowRight')).toBeNull();
    expect(nextSelection(marks, g('b'), 'ArrowLeft')).toEqual(g('a'));
    expect(nextSelection(marks, g('a'), 'ArrowLeft')).toEqual(chart);
    expect(nextSelection(marks, chart, 'ArrowLeft')).toBeNull();
  });
  it('Down goes into the points and along them, Up comes back out', () => {
    expect(nextSelection(marks, g('a'), 'ArrowDown')).toEqual(pt('a', 'a1'));
    expect(nextSelection(marks, pt('a', 'a1'), 'ArrowDown')).toEqual(pt('a', 'a2'));
    expect(nextSelection(marks, pt('a', 'a2'), 'ArrowDown')).toBeNull();
    expect(nextSelection(marks, pt('a', 'a2'), 'ArrowUp')).toEqual(pt('a', 'a1'));
    expect(nextSelection(marks, pt('a', 'a1'), 'ArrowUp')).toEqual(g('a'));
    expect(nextSelection(marks, g('a'), 'ArrowUp')).toBeNull();
    expect(nextSelection(marks, g('c'), 'ArrowDown')).toBeNull();
    expect(nextSelection(marks, chart, 'ArrowDown')).toBeNull();
  });
  it('Right and Left from a point go to the next and previous data set', () => {
    expect(nextSelection(marks, pt('a', 'a2'), 'ArrowRight')).toEqual(g('b'));
    expect(nextSelection(marks, pt('b', 'b3'), 'ArrowLeft')).toEqual(g('a'));
  });
  it('Page Down and Page Up jump ten points, stopping at the ends', () => {
    expect(nextSelection(marks, pt('b', 'b1'), 'PageDown')).toEqual(pt('b', 'b11'));
    expect(nextSelection(marks, pt('b', 'b11'), 'PageDown')).toEqual(pt('b', 'b12'));
    expect(nextSelection(marks, pt('b', 'b12'), 'PageDown')).toBeNull();
    expect(nextSelection(marks, pt('b', 'b12'), 'PageUp')).toEqual(pt('b', 'b2'));
    expect(nextSelection(marks, pt('b', 'b1'), 'PageUp')).toBeNull();
    expect(nextSelection(marks, g('b'), 'PageDown')).toBeNull();
  });
  it('Home and End go to the first and last, of the points when a point is selected', () => {
    expect(nextSelection(marks, g('b'), 'Home')).toEqual(g('a'));
    expect(nextSelection(marks, g('a'), 'End')).toEqual(g('c'));
    expect(nextSelection(marks, pt('b', 'b5'), 'Home')).toEqual(pt('b', 'b1'));
    expect(nextSelection(marks, pt('b', 'b5'), 'End')).toEqual(pt('b', 'b12'));
  });
  it('Escape returns to the whole chart, and other keys do nothing', () => {
    expect(nextSelection(marks, pt('b', 'b5'), 'Escape')).toEqual(chart);
    expect(nextSelection(marks, annotationSel, 'Escape')).toEqual(chart);
    expect(nextSelection(marks, chart, 'Escape')).toBeNull();
    expect(nextSelection(marks, g('a'), 'x')).toBeNull();
    expect(nextSelection(marks, annotationSel, 'ArrowRight')).toBeNull();
    expect(nextSelection([], chart, 'ArrowRight')).toBeNull();
  });
  it('treats a selection that is no longer on the chart as the whole chart', () => {
    expect(nextSelection(marks, g('gone'), 'ArrowRight')).toEqual(g('a'));
  });
});

const annotationSel: Selection = { kind: 'annotation', annotationId: 'n' };

describe('what is read out', () => {
  it('names the whole chart, a data set with its place and size, and a point with its value', () => {
    expect(describeSelection(marks, chart)).toBe('Whole chart');
    expect(describeSelection(marks, g('b'))).toBe('B, data set 2 of 3, 12 points');
    expect(describeSelection(marks, pt('a', 'a2'))).toBe('A, point 2 of 2: v 2');
    expect(describeSelection(marks, annotationSel, 'Limit')).toBe('Text annotation "Limit"');
  });
});
