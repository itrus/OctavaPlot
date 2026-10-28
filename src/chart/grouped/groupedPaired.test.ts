import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { applyVariant } from '../../model/graph/chartVariant';
import { layerRows } from '../../model/graph/layers';
import { xySeries } from '../../model/table/tableLayout';
import type { Project } from '../../model/types';
import { addChart, addDataTable, patchLook, setCells, setSubject } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildGroupedModel } from './groupedModel';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
/** Index of the table column holding replicate `k` of series `s`. */
const col = (p: Project, s: number, k: number) => tableOf(p).groups.findIndex((g) => g.id === xySeries(tableOf(p))[s].columns[k].id);
/** The vertices of a path of M and L commands, run by run. */
const runsOf = (d: string): number[][][] => d.split(/(?=M)/).filter(Boolean).map((run) => [...run.matchAll(/[ML](-?[\d.]+),(-?[\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]));

/**
 * Two series (before, after) with two replicates each; category (row) 0 holds two subjects, M1 and M2:
 * before M1 = 10, M2 = 20; after M1 = 15, M2 = 18. Row 1 has values in the first series only.
 */
const setup = (bySubject = true): Project => {
  let p = addChart('c', 't', undefined, 'groupedBar')(addDataTable('t', 'grouped', { layout: { kind: 'replicates', n: 2 }, sample: true })(createExampleProject()));
  const edits = [
    { col: col(p, 0, 0), row: 0, value: 10 }, { col: col(p, 0, 1), row: 0, value: 20 },
    { col: col(p, 1, 0), row: 0, value: 15 }, { col: col(p, 1, 1), row: 0, value: 18 },
    { col: col(p, 0, 0), row: 1, value: 5 }, { col: col(p, 0, 1), row: 1, value: 6 },
  ];
  p = setCells('t', edits)(p);
  const name = (s: number, k: number, row: number, subject: string) => (q: Project) => setSubject('t', [{ col: col(q, s, k), row }], subject)(q);
  for (const step of [name(0, 0, 0, 'M1'), name(0, 1, 0, 'M2'), name(1, 0, 0, 'M1'), name(1, 1, 0, 'M2'), name(0, 0, 1, 'M1'), name(0, 1, 1, 'M2')]) p = step(p);
  // As the gallery makes it: dots only, so the replicate values are drawn.
  p = { ...p, charts: p.charts.map((c) => (c.id === 'c' ? applyVariant(c, { dotsOnly: true }) : c)) };
  return patchLook('c', { pairs: { bySubject, bridge: false } })(p);
};
const model = (p: Project) => buildGroupedModel(chartOf(p), tableOf(p));

describe('grouped before and after: one line for each subject inside each category', () => {
  it('joins each subject from the first series to the second, inside the category of its row', () => {
    const m = model(setup());
    const lines = m.pairLines.filter((l) => l.categoryIndex === 0);
    expect(lines.map((l) => l.subject)).toEqual(['M1', 'M2']);
    const m1 = runsOf(lines[0].d)[0];
    expect(m1).toHaveLength(2);
    // M1 goes from 10 to 15: the line starts lower on the page than it ends (the value axis runs up), and runs left to right.
    expect(m1[0][0]).toBeLessThan(m1[1][0]);
    expect(m1[0][1]).toBeGreaterThan(m1[1][1]);
    expect(m1[0][1]).toBeCloseTo(m.yScale(10), 1);
    expect(m1[1][1]).toBeCloseTo(m.yScale(15), 1);
  });
  it('draws a line only for a subject that has two values: row 1 has values in one series only', () => {
    const m = model(setup());
    expect(m.pairLines.filter((l) => l.categoryIndex === 1)).toHaveLength(0);
  });
  it('takes the mean of a subject\'s replicates inside one series', () => {
    let p = setup();
    // M1 now has two replicates in the first series (10 and 30): its line starts at their mean, 20.
    p = setCells('t', [{ col: col(p, 0, 1), row: 0, value: 30 }])(p);
    p = setSubject('t', [{ col: col(p, 0, 1), row: 0 }], 'M1')(p);
    const m = model(p);
    const m1 = m.pairLines.find((l) => l.categoryIndex === 0 && l.subject === 'M1')!;
    expect(runsOf(m1.d)[0][0][1]).toBeCloseTo(m.yScale(20), 1);
  });
  it('keeps the dots on the line of their series, and draws no lines when the option is off', () => {
    const on = model(setup());
    const off = model(setup(false));
    expect(off.pairLines).toHaveLength(0);
    const centreOf = (m: ReturnType<typeof model>, si: number) => m.series[si].dots.filter((d) => d.row === 0).map((d) => d.px);
    // With lines, every dot of a series in a category sits at one x; without, the jitter spreads them.
    expect(new Set(centreOf(on, 0).map((x) => Math.round(x * 100))).size).toBe(1);
    expect(new Set(centreOf(off, 0).map((x) => Math.round(x * 100))).size).toBeGreaterThan(1);
  });
  it('breaks a subject\'s line at a series with no value for it, and joins across it only when asked', () => {
    let p = setup();
    p = setCells('t', [{ col: col(p, 1, 0), row: 0, value: null }])(p);
    expect(model(p).pairLines.filter((l) => l.subject === 'M1' && l.categoryIndex === 0)).toHaveLength(0);
    expect(model(patchLook('c', { pairs: { bridge: true } })(p)).pairLines.filter((l) => l.subject === 'M2')).toHaveLength(1);
  });
  it('says so when no value has a subject or the data are not replicates, and counts values with no subject', () => {
    const plain = addChart('c', 't', undefined, 'groupedBar')(addDataTable('t', 'grouped', { layout: { kind: 'replicates', n: 2 }, sample: true })(createExampleProject()));
    expect(model(patchLook('c', { pairs: { bySubject: true } })(plain)).warnings.join(' ')).toMatch(/no value has a subject/);
    const single = addChart('c', 't', undefined, 'groupedBar')(addDataTable('t', 'grouped', { sample: true })(createExampleProject()));
    expect(model(patchLook('c', { pairs: { bySubject: true } })(single)).warnings.join(' ')).toMatch(/need the replicate values/);
    expect(model(setup()).warnings.join(' ')).toMatch(/have no subject and are not joined by a line|has no subject and is not joined by a line/);
  });
  it('is a layer of its own that can be hidden without changing the bars, the dots or the axis', () => {
    const p = setup();
    const rows = layerRows(chartOf(p), tableOf(p));
    const row = rows.find((r) => r.layer.kind === 'pairLines');
    expect(row?.label).toBe('Lines joining the subjects');
    const hidden = { ...chartOf(p), hiddenLayerIds: [row!.layer.id] };
    const before = chartToSvgString(chartOf(p), tableOf(p));
    const after = chartToSvgString(hidden, tableOf(p));
    expect(after).not.toBe(before);
    expect(buildGroupedModel(hidden, tableOf(p)).y.domain).toEqual(model(p).y.domain);
    expect(model(setup(false)).layers.some((l) => l.kind === 'pairLines')).toBe(false);
  });
  it('draws without a number that is not a number, is kept in the file, and is offered in the gallery', () => {
    const p = setup();
    expect(chartToSvgString(chartOf(p), tableOf(p))).not.toContain('NaN');
    expect(chartOf(parseProject(stringifyProject(p))).pairs.bySubject).toBe(true);
    const item = galleryItems('grouped').find((i) => i.id === 'grp.paired');
    expect(item?.type).toBe('groupedBar');
    const made = applyVariant(chartOf(addChart('c', 't', undefined, 'groupedBar')(addDataTable('t', 'grouped', { layout: { kind: 'replicates', n: 2 }, sample: true })(createExampleProject()))), item?.variant);
    expect(made.pairs.bySubject).toBe(true);
  });
});
