import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../defaults';
import type { Annotation, Chart, DataTable, Project } from '../types';
import { addAnnotation, addBracket, addChart, addDataTable, addReferenceLine } from '../../state/commands';
import { buildAnyModel, chartTexts } from '../../chart/anyModel';
import { fillResultTokens, resolveChartTokens, resultValue } from './resultTokens';

/**
 * Reference values worked out by hand for 2, 4, 4, 4, 5, 5, 7, 9: n 8, sum 40, mean 5; the squared deviations are
 * 9 + 1 + 1 + 1 + 0 + 0 + 4 + 16 = 32, so the sample variance is 32 / 7 and SD = sqrt(32 / 7) = 2.1380899..., SEM = SD / sqrt(8) = 0.7559289...;
 * the middle two of the sorted values are 4 and 5, so the median is 4.5.
 */
const CONTROL = [2, 4, 4, 4, 5, 5, 7, 9];

type Grp = DataTable['groups'][number];
const fill = (values: Array<number | null>) => (g: Grp) => g.observations.map((o, k) => ({ ...o, value: k < values.length ? values[k] : null }));

const tableWith = (): DataTable => {
  const t = createExampleProject().dataTables[0];
  return {
    ...t,
    groups: t.groups.map((g, i) => (i === 0 ? { ...g, name: 'Control', observations: fill(CONTROL)(g) } : i === 1 ? { ...g, name: 'Drug A', observations: fill([1, 2, 3])(g) } : i === 2 ? { ...g, name: 'Solo', observations: fill([6])(g) } : i === 3 ? { ...g, name: 'Empty', observations: fill([])(g) } : g)),
  };
};
const control = (t: DataTable) => t.groups[0].id;

describe('the result of a data set, by name', () => {
  const t = tableWith();
  it('is n, sum, mean, SD, SEM, median, min and max of its values', () => {
    const id = control(t);
    expect(resultValue(t, id, 'n')).toBe(8);
    expect(resultValue(t, id, 'sum')).toBe(40);
    expect(resultValue(t, id, 'mean')).toBe(5);
    expect(resultValue(t, id, 'sd')).toBeCloseTo(2.1380899, 6);
    expect(resultValue(t, id, 'sem')).toBeCloseTo(0.7559289, 6);
    expect(resultValue(t, id, 'median')).toBe(4.5);
    expect(resultValue(t, id, 'min')).toBe(2);
    expect(resultValue(t, id, 'max')).toBe(9);
  });
  it('leaves excluded values out, as a chart does', () => {
    const o = t.groups[0].observations;
    const excluded: DataTable = { ...t, groups: t.groups.map((g, i) => (i === 0 ? { ...g, observations: o.map((x, k) => (k === 7 ? { ...x, excluded: true } : x)) } : g)) };
    expect(resultValue(excluded, control(excluded), 'n')).toBe(7);
    expect(resultValue(excluded, control(excluded), 'max')).toBe(7);
  });
  it('is null when it cannot be calculated: no such data set, no values, or a spread of one value', () => {
    expect(resultValue(t, 'nobody', 'mean')).toBeNull();
    expect(resultValue(t, t.groups[2].id, 'sd')).toBeNull();
    expect(resultValue(t, t.groups[2].id, 'mean')).toBe(6);
    expect(resultValue(t, t.groups[3].id, 'mean')).toBeNull();
    expect(resultValue(t, t.groups[3].id, 'n')).toBe(0);
  });
});

describe('tokens in a text', () => {
  const t = tableWith();
  it('are replaced by the result, to five significant digits', () => {
    expect(fillResultTokens('n = {{n Control}}, mean = {{mean Control}}', t)).toEqual({ text: 'n = 8, mean = 5', problems: [] });
    expect(fillResultTokens('SD {{sd Control}}; SEM {{sem Control}}; median {{median Control}}', t).text).toBe('SD 2.1381; SEM 0.75593; median 4.5');
  });
  it('take a number of decimals after a bar, and a name with spaces or capitals', () => {
    expect(fillResultTokens('{{sd Control|2}} {{mean Control|3}}', t).text).toBe('2.14 5.000');
    expect(fillResultTokens('{{n drug a}}', t).text).toBe('3');
    expect(fillResultTokens('{{ mean   Drug A }}', t).text).toBe('2');
  });
  it('use the name the data set has on the chart when it was renamed there, and still the name in the table', () => {
    expect(fillResultTokens('{{n Placebo}}', t, { [control(t)]: 'Placebo' }).text).toBe('8');
    expect(fillResultTokens('{{n Control}}', t, { [control(t)]: 'Placebo' }).text).toBe('8');
  });
  it('are left as typed, and reported once each, when the data set is unknown or missing, the result is not available, or the name is not a result', () => {
    const r = fillResultTokens('{{n Nope}} {{n Nope}} {{sd Solo}} {{n}} {{bogus Control}}', t);
    expect(r.text).toBe('{{n Nope}} {{n Nope}} {{sd Solo}} {{n}} {{bogus Control}}');
    expect(r.problems).toEqual([
      'No data set is called "Nope" (in {{n Nope}}).',
      'The SD of "Solo" cannot be calculated (in {{sd Solo}}).',
      'Name a data set: {{n}} needs one, for example {{n Control}}.',
      '"bogus" is not a result: use n, sum, mean, sd, sem, median, min or max (in {{bogus Control}}).',
    ]);
  });
  it('take the only data set when a table has just one, and leave text without tokens alone', () => {
    const one: DataTable = { ...t, groups: [t.groups[0]] };
    expect(fillResultTokens('n = {{n}}', one).text).toBe('n = 8');
    expect(fillResultTokens('Mouse_3 {x} {{ }} {single}', t)).toEqual({ text: 'Mouse_3 {x} {{ }} {single}', problems: [] });
  });
  it('fill before rich text is read, so a result can stand in a superscript', () => {
    expect(fillResultTokens('10^{{{n Control}}}', t).text).toBe('10^{8}');
  });
});

describe('the chart with its tokens filled in', () => {
  const t = tableWith();
  const note = (text: string): Annotation => ({ id: 'a1', text, xFrac: 0.2, yFrac: 0.1, fontSizePt: 12, color: '#000000', opacity: 1 });
  const chart = (over: Partial<Chart> = {}): Chart => ({ ...createExampleProject().charts[0], dataTableId: t.id, annotations: [], referenceLines: [], brackets: [], ...over });
  const line = (over: object = {}) => ({ id: 'r1', axis: 'y' as const, value: 3, color: '#000000', widthPt: 2, style: 'dashed' as const, opacity: 1, label: '', showLabel: true, ...over });

  it('is the very same chart when nothing has a token', () => {
    const c = chart({ annotations: [note('plain')], referenceLines: [line({ label: 'target' })] });
    const r = resolveChartTokens(c, t);
    expect(r.chart).toBe(c);
    expect(r.notices).toEqual([]);
  });
  it('fills the text of annotations, the labels of reference lines and the labels of brackets, and changes nothing else', () => {
    const c = chart({
      annotations: [note('n = {{n Control}}')],
      referenceLines: [line({ label: 'mean {{mean Control}}' })],
      brackets: [{ id: 'b1', from: t.groups[0].id, to: t.groups[1].id, label: '{{n Drug A}} vs {{n Control}}', color: '#000000', widthPt: 1, fontSizePt: 12 }],
    });
    const r = resolveChartTokens(c, t).chart;
    expect(r.annotations[0]).toEqual({ ...c.annotations[0], text: 'n = 8' });
    expect(r.referenceLines[0]).toEqual({ ...c.referenceLines[0], label: 'mean 5' });
    expect(r.brackets[0].label).toBe('3 vs 8');
    expect(c.annotations[0].text).toBe('n = {{n Control}}');
  });
  it('puts a reference line at a result when its value is bound to one, and not drawn (with a notice) when there is none', () => {
    const bound = chart({ referenceLines: [line({ value: 99, valueFrom: { stat: 'mean', groupId: control(t) } }), line({ id: 'r2', value: 1, valueFrom: { stat: 'sd', groupId: t.groups[2].id } })] });
    const r = resolveChartTokens(bound, t);
    expect(r.chart.referenceLines.map((l) => [l.id, l.value])).toEqual([['r1', 5]]);
    expect(r.notices).toEqual(['A reference line is bound to the SD of "Solo", which cannot be calculated, so it is not drawn.']);
  });
  it('reports the tokens it could not fill', () => {
    const r = resolveChartTokens(chart({ annotations: [note('{{n Nope}}')] }), t);
    expect(r.chart.annotations[0].text).toBe('{{n Nope}}');
    expect(r.notices).toEqual(['Text of an annotation: No data set is called "Nope" (in {{n Nope}}).']);
  });
});

describe('a graph shows the results, and shows new ones when the data change', () => {
  const base = (): Project => addChart('c', 't', undefined, 'bar')(addDataTable('t', 'column', { sample: true })(createExampleProject()));
  const withTable = (p: Project, table: DataTable): Project => ({ ...p, dataTables: p.dataTables.map((x) => (x.id === 't' ? { ...table, id: 't' } : x)) });
  const texts = (p: Project) => chartTexts(p.charts.find((c) => c.id === 'c')!, buildAnyModel(p.charts.find((c) => c.id === 'c')!, p.dataTables.find((x) => x.id === 't')!));
  it('draws n and the mean in an annotation, a reference line label and a bracket label, and follows the data', () => {
    let p = withTable(base(), tableWith());
    const [g0, g1] = p.dataTables.find((x) => x.id === 't')!.groups;
    p = addAnnotation('c', { id: 'a1', text: 'n = {{n Control}}', xFrac: 0.4, yFrac: 0.08, fontSizePt: 20, color: '#000000', opacity: 1 })(p);
    p = addReferenceLine('c', { id: 'r1', axis: 'y', value: 1, color: '#000000', widthPt: 1, style: 'solid', opacity: 1, label: 'mean {{mean Control}}', showLabel: true, valueFrom: { stat: 'mean', groupId: g0.id } })(p);
    p = addBracket('c', { id: 'b1', from: g0.id, to: g1.id, label: 'n={{n Drug A}}', color: '#000000', widthPt: 1, fontSizePt: 12 })(p);
    const out = texts(p);
    expect(out).toContain('n = 8');
    expect(out).toContain('mean 5');
    expect(out).toContain('n=3');
    // The same chart over changed data (the first value 2 becomes 12): the numbers follow the data, the chart is untouched.
    const t2 = p.dataTables.find((x) => x.id === 't')!;
    const changed = withTable(p, { ...t2, groups: t2.groups.map((g, i) => (i === 0 ? { ...g, observations: g.observations.map((o, k) => (k === 0 ? { ...o, value: 12 } : o)) } : g)) });
    expect(texts(changed)).toContain('mean 6.25');
    expect(changed.charts[0]).toBe(p.charts[0]);
  });
});
