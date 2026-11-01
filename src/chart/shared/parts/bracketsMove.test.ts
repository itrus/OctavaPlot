import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../../model/defaults';
import { xySeries } from '../../../model/table/tableLayout';
import type { Bracket, Project } from '../../../model/types';
import { addBracket, addChart, addDataTable, patchBracket, replaceTableData } from '../../../state/commands';
import { parseProjectWithNotes, stringifyProject } from '../../../state/serialize';
import { buildAnyModel, ChartCanvas } from '../../anyModel';
import { buildColumnModel } from '../../column/columnModel';
import { chartToSvgString } from '../../export/export';
import { buildGroupedModel } from '../../grouped/groupedModel';
import { buildXyModel } from '../../xy/xyModel';
import { placeBrackets } from '../axes/bracketPlacement';
import { labelLines, liftAfterDrag } from './brackets';

const bracket = (id: string, from: string, to: string, extra: Partial<Bracket> = {}): Bracket => ({ id, from, to, label: 'p = 0.003', color: '#000000', widthPt: 2, fontSizePt: 24, ...extra });

const columnProject = (): Project => addChart('c', 't', undefined, 'bar')(addDataTable('t', 'column', { sample: true })(createExampleProject()));
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const columnIds = (p: Project) => tableOf(p).groups.map((g) => g.id);

describe('the lines of a label', () => {
  it('splits at line breaks and leaves out blank lines at the ends', () => {
    expect(labelLines('p = 0.003')).toEqual(['p = 0.003']);
    expect(labelLines('p = 0.003\nWelch')).toEqual(['p = 0.003', 'Welch']);
    expect(labelLines('\n\nupper\n\nlower\n \n')).toEqual(['upper', '', 'lower']);
    expect(labelLines('a\r\nb')).toEqual(['a', 'b']);
  });
});

describe('a label of several lines', () => {
  const lines = (s: string, id: string) => [...s.matchAll(new RegExp(`<text[^>]*id="${id}"[^>]*>([^<]*)</text>`, 'g'))].map((m) => m[1]);
  const yOf = (s: string, id: string) => Number(new RegExp(`<text[^>]*?\\by="([-\\d.]+)"[^>]*id="${id}"`).exec(s)?.[1] ?? NaN);

  it('is one text for each line, the last where a label of one line stands and the others above it, a line height apart', () => {
    const p0 = columnProject();
    const [a, , , d] = columnIds(p0);
    const one = chartToSvgString(chartOf(addBracket('c', bracket('b1', a, d, { label: 'p = 0.003' }))(p0)), tableOf(p0));
    const two = chartToSvgString(chartOf(addBracket('c', bracket('b1', a, d, { label: 'Welch\np = 0.003' }))(p0)), tableOf(p0));
    expect(lines(one, 'b1-bracket-label')).toEqual(['p = 0.003']);
    expect(lines(two, 'b1-bracket-label')).toEqual(['Welch']);
    expect(lines(two, 'b1-bracket-label-2')).toEqual(['p = 0.003']);
    // The axis grows to give the taller label room, so the page positions are compared from the bar: the label stands the same distance above it, and the first line one line height higher.
    const barY = (s: string) => Number(/id="b1-bracket-bar"/.test(s) ? /d="M[-\d.]+,[-\d.]+V([-\d.]+)H/.exec(s.slice(s.lastIndexOf('<path', s.indexOf('id="b1-bracket-bar"'))))?.[1] : NaN);
    expect(barY(one) - yOf(one, 'b1-bracket-label')).toBeCloseTo(barY(two) - yOf(two, 'b1-bracket-label-2'), 6);
    expect(yOf(two, 'b1-bracket-label-2') - yOf(two, 'b1-bracket-label')).toBeCloseTo(24 * 1.2, 6);
  });

  it('is the same drawing as before when it has one line', () => {
    const p0 = columnProject();
    const [a, , , d] = columnIds(p0);
    const svg = chartToSvgString(chartOf(addBracket('c', bracket('b1', a, d))(p0)), tableOf(p0));
    expect(svg).toContain('id="b1-bracket-label"');
    expect(svg).not.toContain('b1-bracket-label-2');
  });

  it('leaves the room of a taller label: stacked brackets stand further apart', () => {
    const base = { order: ['a', 'b', 'c'], tops: [10, 10, 10], primary: [true, true, true], log: false, values: [0, 10], includeZero: true, plotLengthPt: 300 };
    const gap = (label: string) => {
      const { placed } = placeBrackets({ ...base, brackets: [bracket('s', 'a', 'b', { label }), bracket('l', 'a', 'c', { label })] });
      return placed[1].value - placed[0].value;
    };
    expect(gap('p\nq')).toBeGreaterThan(gap('p'));
    // A line break at the end is not a second line.
    expect(gap('p\n')).toBeCloseTo(gap('p'), 9);
  });

  it('stays beside the middle of the bar on an XY chart, a line height apart', () => {
    let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
    p = replaceTableData('t', { names: ['X', 'A', 'B'], titles: null, values: [[1, 2, 3], [2, 3, 5], [3, 4, 8]] })(p);
    p = addChart('c', 't', undefined, 'xyScatter')(p);
    const [a, b] = xySeries(tableOf(p)).map((s) => s.id);
    const s = chartToSvgString(chartOf(addBracket('c', bracket('k', a, b, { at: 2, label: 'one\ntwo\nthree', fontSizePt: 10 }))(p)), tableOf(p));
    const y = ['k-bracket-label', 'k-bracket-label-2', 'k-bracket-label-3'].map((id) => yOf(s, id));
    expect(y[1] - y[0]).toBeCloseTo(12, 6);
    expect(y[2] - y[1]).toBeCloseTo(12, 6);
  });
});

describe('a bracket moved from where it is placed', () => {
  it('stands higher on a chart over columns by its lift, and nothing else changes', () => {
    const p0 = columnProject();
    const [a, , , d] = columnIds(p0);
    const placed = addBracket('c', bracket('b1', a, d))(p0);
    const moved = patchBracket('c', 'b1', { liftPt: 30 })(placed);
    const [m0, m1] = [buildColumnModel(chartOf(placed), tableOf(placed)), buildColumnModel(chartOf(moved), tableOf(moved))];
    expect(m0.brackets[0].y - m1.brackets[0].y).toBeCloseTo(30, 9);
    expect(m1.y.domain).toEqual(m0.y.domain);
    expect([m1.brackets[0].x1, m1.brackets[0].x2]).toEqual([m0.brackets[0].x1, m0.brackets[0].x2]);
    // A negative lift moves it toward the data.
    const down = patchBracket('c', 'b1', { liftPt: -20 })(placed);
    expect(buildColumnModel(chartOf(down), tableOf(down)).brackets[0].y - m0.brackets[0].y).toBeCloseTo(20, 9);
  });

  it('moves the other bracket of a stack only if it was moved itself', () => {
    const p0 = columnProject();
    const [a, b, c] = columnIds(p0);
    const placed = addBracket('c', bracket('long', a, c))(addBracket('c', bracket('short', a, b))(p0));
    const moved = patchBracket('c', 'short', { liftPt: 15 })(placed);
    const [m0, m1] = [buildColumnModel(chartOf(placed), tableOf(placed)), buildColumnModel(chartOf(moved), tableOf(moved))];
    const at = (m: typeof m0, id: string) => m.brackets.find((x) => x.id === id)!.y;
    expect(at(m0, 'long')).toBe(at(m1, 'long'));
    expect(at(m0, 'short') - at(m1, 'short')).toBeCloseTo(15, 9);
  });

  it('moves a bracket between series of a grouped chart', () => {
    let p = addDataTable('t', 'grouped', { sample: true })(createExampleProject());
    p = addChart('c', 't', undefined, 'groupedBar')(p);
    const series = xySeries(tableOf(p)).map((s) => s.id);
    const placed = addBracket('c', bracket('g1', series[0], series[1]))(p);
    const moved = patchBracket('c', 'g1', { liftPt: 12 })(placed);
    const [m0, m1] = [buildGroupedModel(chartOf(placed), tableOf(placed)), buildGroupedModel(chartOf(moved), tableOf(moved))];
    expect(m0.brackets).toHaveLength(1);
    expect(m0.brackets[0].y - m1.brackets[0].y).toBeCloseTo(12, 9);
  });

  it('moves a bracket to the right on an XY chart', () => {
    let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
    p = replaceTableData('t', { names: ['X', 'A', 'B'], titles: null, values: [[1, 2, 3], [2, 3, 5], [3, 4, 8]] })(p);
    p = addChart('c', 't', undefined, 'xyScatter')(p);
    const [a, b] = xySeries(tableOf(p)).map((s) => s.id);
    const placed = addBracket('c', bracket('k', a, b, { at: 2 }))(p);
    const moved = patchBracket('c', 'k', { liftPt: 25 })(placed);
    const [m0, m1] = [buildXyModel(chartOf(placed), tableOf(placed)), buildXyModel(chartOf(moved), tableOf(moved))];
    expect(m1.brackets![0].x - m0.brackets![0].x).toBeCloseTo(25, 9);
    expect(m1.x.domain).toEqual(m0.x.domain);
  });

  it('is kept in the file, within the limit, and read as not moved when it is zero', () => {
    const p0 = columnProject();
    const [a, , , d] = columnIds(p0);
    const p = patchBracket('c', 'b1', { liftPt: 42.5 })(addBracket('c', bracket('b1', a, d))(p0));
    const text = stringifyProject(p);
    expect(JSON.parse(text).project.charts.find((c: { id: string }) => c.id === 'c')!.brackets[0].liftPt).toBe(42.5);
    expect(parseProjectWithNotes(text).project.charts.find((c: { id: string }) => c.id === 'c')!.brackets[0].liftPt).toBe(42.5);
    const env = JSON.parse(text);
    env.project.charts.find((c: { id: string }) => c.id === 'c')!.brackets[0].liftPt = 99999;
    expect(parseProjectWithNotes(JSON.stringify(env)).project.charts.find((c: { id: string }) => c.id === 'c')!.brackets[0].liftPt).toBe(1000);
    env.project.charts.find((c: { id: string }) => c.id === 'c')!.brackets[0].liftPt = 'far';
    expect(parseProjectWithNotes(JSON.stringify(env)).project.charts.find((c: { id: string }) => c.id === 'c')!.brackets[0].liftPt).toBeUndefined();
    const zero = patchBracket('c', 'b1', { liftPt: 0 })(p);
    expect(parseProjectWithNotes(stringifyProject(zero)).project.charts.find((c) => c.id === 'c')!.brackets[0].liftPt).toBeUndefined();
  });

  it('keeps a label of several lines in the file', () => {
    const p0 = columnProject();
    const [a, , , d] = columnIds(p0);
    const p = addBracket('c', bracket('b1', a, d, { label: 'Welch\np = 0.003' }))(p0);
    expect(parseProjectWithNotes(stringifyProject(p)).project.charts.find((c: { id: string }) => c.id === 'c')!.brackets[0].label).toBe('Welch\np = 0.003');
  });
});

describe('dragging a bracket', () => {
  it('adds the movement away from the data to its lift: up on a vertical chart, right on a horizontal one and on XY', () => {
    expect(liftAfterDrag(0, 'up', 5, -30)).toBe(30);
    expect(liftAfterDrag(10, 'up', 100, 4)).toBe(6);
    expect(liftAfterDrag(0, 'right', 20, 90)).toBe(20);
    expect(liftAfterDrag(-5, 'right', -3, 0)).toBe(-8);
  });
  it('rounds to a tenth of a point and stays within the limit', () => {
    expect(liftAfterDrag(0, 'up', 0, -12.34)).toBe(12.3);
    expect(liftAfterDrag(0, 'up', 0, -99999)).toBe(1000);
    expect(liftAfterDrag(0, 'right', -99999, 0)).toBe(-1000);
  });
});

describe('what a press on a bracket reaches', () => {
  const html = (p: Project) =>
    renderToStaticMarkup(createElement(ChartCanvas, { chart: chartOf(p), any: buildAnyModel(chartOf(p), tableOf(p)), editor: { selection: { kind: 'chart' } as never }, cssWidth: '1px', cssHeight: '1px' }));
  it('is the bar, its transparent twin and every line of its label in the editor, and none of that in the export', () => {
    const p0 = columnProject();
    const [a, , , d] = columnIds(p0);
    const p = addBracket('c', bracket('b1', a, d, { label: 'one\ntwo' }))(p0);
    const editor = html(p);
    expect((editor.match(/data-hit="bracket"[^>]*data-object-id="b1"|data-object-id="b1"[^>]*data-hit="bracket"/g) ?? []).length).toBe(4);
    const exported = chartToSvgString(chartOf(p), tableOf(p));
    expect(exported).not.toContain('data-hit');
    expect(exported).not.toContain('transparent');
  });
});
