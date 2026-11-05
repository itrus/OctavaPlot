import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { pLine, volcanoClass, volcanoY } from '../../model/options/volcanoOptions';
import type { Project } from '../../model/types';
import { addChart, addDataTable, patchVolcano, replaceTableData } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildXyModel } from './xyModel';

const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const model = (p: Project) => buildXyModel(chartOf(p), tableOf(p));

/** [log2 fold change, p-value] rows with the names of the genes. */
const ROWS: Array<[number, number | null, string]> = [
  [2.5, 0.001, 'UP1'], // up
  [-3, 0.0002, 'DOWN1'], // down
  [0.4, 0.001, 'SMALL'], // significant but small change
  [3, 0.4, 'NOISY'], // big change, not significant
  [-1, 0.05, 'EDGE'], // p is not below the threshold
  [1.2, 0, 'ZERO'], // p of 0: not drawn
  [1.5, 2, 'BIGP'], // p above 1: not drawn
];
const setup = (rows = ROWS, input: 'p' | 'neglog10' = 'p'): Project => {
  let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
  p = replaceTableData('t', { names: ['log2FC', 'p'], titles: rows.map((r) => r[2]), values: rows.map((r) => [r[0], r[1]]) })(p);
  p = addChart('c', 't', undefined, 'xyVolcano')(p);
  return input === 'p' ? p : patchVolcano('c', { yInput: input })(p);
};

describe('volcano plot', () => {
  it('plots -log10 of the p-values and says which points are up, down or not significant', () => {
    const m = model(setup());
    const pts = m.series[0].points;
    const byTitle = (i: number) => pts.find((q) => q.row === i)!;
    expect(byTitle(0).y).toBeCloseTo(3, 9);
    expect(byTitle(0).cls).toBe('up');
    expect(byTitle(1).cls).toBe('down');
    expect(byTitle(2).cls).toBe('ns');
    expect(byTitle(3).cls).toBe('ns');
    // A p of exactly the threshold is not below it.
    expect(byTitle(4).cls).toBe('ns');
    expect(m.volcanoCounts).toEqual({ up: 1, down: 1, ns: 3 });
  });

  it('leaves out a p-value outside 0 to 1 and says so', () => {
    const m = model(setup());
    expect(m.series[0].points.map((q) => q.row)).toEqual([0, 1, 2, 3, 4]);
    expect(m.warnings.join(' ')).toMatch(/2 rows have a p-value that is not between 0 and 1/);
  });

  it('takes the Y column as -log10 p when told so', () => {
    const m = model(setup([[2, 3, 'A'], [-2, 0.5, 'B']], 'neglog10'));
    expect(m.series[0].points.map((q) => [q.y, q.cls])).toEqual([[3, 'up'], [0.5, 'ns']]);
  });

  it('starts with the three threshold lines, no legend, and moves the lines with the thresholds', () => {
    const p = setup();
    const c = chartOf(p);
    expect(c.referenceLines.map((l) => [l.axis, l.value])).toEqual([['x', -1], ['x', 1], ['y', pLine(0.05)]]);
    expect(c.volcano.lineIds).toEqual(c.referenceLines.map((l) => l.id));
    expect(c.legend.visible).toBe(false);
    const moved = chartOf(patchVolcano('c', { fcThreshold: 2, pThreshold: 0.01 })(p));
    expect(moved.referenceLines.map((l) => l.value)).toEqual([-2, 2, 2]);
    // A line the user deleted is not made again, and the others still follow.
    const without = { ...p, charts: p.charts.map((x) => (x.id === 'c' ? { ...x, referenceLines: x.referenceLines.slice(0, 2) } : x)) };
    expect(chartOf(patchVolcano('c', { pThreshold: 0.001 })(without)).referenceLines).toHaveLength(2);
  });

  it('labels the up and down points only, by their row titles, and draws them in the export', () => {
    const p = patchVolcano('c', { labels: 'significant' })(setup());
    const labels = model(p).labels!;
    expect(labels.items.map((i) => i.shown).sort()).toEqual(['DOWN1', 'UP1']);
    const svg = chartToSvgString(chartOf(p), tableOf(p));
    expect(svg).toContain('UP1');
    expect(svg).not.toContain('NOISY');
    expect(model(setup()).labels).toBeUndefined();
  });

  it('colours the points by class in the export', () => {
    const p = patchVolcano('c', { upColor: '#112233', downColor: '#445566', nsColor: '#778899' })(setup());
    const svg = chartToSvgString(chartOf(p), tableOf(p)).toLowerCase();
    for (const c of ['#112233', '#445566', '#778899']) expect(svg).toContain(c);
  });

  it('survives a save and an open, and clamps what it cannot use', () => {
    const p = patchVolcano('c', { fcThreshold: 1.5, labels: 'significant' })(setup());
    const back = parseProject(stringifyProject(p));
    expect(chartOf(back).volcano).toEqual(chartOf(p).volcano);
    const raw = JSON.parse(stringifyProject(p)) as { project: { charts: Array<{ id: string; volcano: Record<string, unknown> }> } };
    Object.assign(raw.project.charts.find((x) => x.id === 'c')!.volcano, { pThreshold: 5, upColor: 'red', yInput: 'x' });
    const fixed = chartOf(parseProject(JSON.stringify(raw))).volcano;
    expect([fixed.pThreshold, fixed.upColor, fixed.yInput]).toEqual([1, '#d62728', 'p']);
  });

  it('is offered in the gallery of XY tables', () => {
    expect(galleryItems('xy').find((i) => i.id === 'xy.volcano')?.type).toBe('xyVolcano');
  });

  it('classes and converts by the rules', () => {
    const o = { fcThreshold: 1, pThreshold: 0.05 };
    expect(volcanoClass(o, 1, pLine(0.05) + 0.01)).toBe('up');
    expect(volcanoClass(o, -1, 2)).toBe('down');
    expect(volcanoClass(o, 0.99, 5)).toBe('ns');
    expect(volcanoY({ yInput: 'p' }, 0.01)).toBeCloseTo(2, 12);
    expect(volcanoY({ yInput: 'p' }, 0)).toBeNull();
    expect(volcanoY({ yInput: 'p' }, NaN)).toBeNull();
  });
});
