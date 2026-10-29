import { describe, expect, it } from 'vitest';
import { createChart, createGroupedTable } from '../../model/defaults';
import { sanitizeHeatmap } from '../../model/options/heatmapOptions';
import { withoutExcluded } from '../../model/table/exclusion';
import type { DataTable, HeatmapOptions, Project } from '../../model/types';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { heatTooltipLines } from '../tooltip';
import { colourEdges, intervalIndex, paletteColour } from './heatColours';
import { buildHeatModel } from './heatmapModel';

// Series A: Male 4.2, Female 3.1; series B: Male 6.5, Female 5.2. The cells run by row: Male A, Male B, Female A, Female B.
const setup = (patch: Partial<HeatmapOptions> = {}, table: DataTable = createGroupedTable('Grouped', true)) => {
  const chart = createChart(table.id, undefined, 'heatmap');
  chart.heatmap = { ...chart.heatmap, ...patch };
  return { table, chart };
};
const model = (patch: Partial<HeatmapOptions> = {}, table?: DataTable) => {
  const s = setup(patch, table);
  return buildHeatModel(s.chart, withoutExcluded(s.table));
};

describe('heat map colour intervals', () => {
  it('finds the edges: equal steps, edges by hand inside the range, or none', () => {
    expect(colourEdges(0, 10, null, [])).toBeNull();
    expect(colourEdges(0, 10, 1, [])).toBeNull();
    expect(colourEdges(0, 10, 5, [])).toEqual([0, 2, 4, 6, 8, 10]);
    expect(colourEdges(0, 10, 5, [3, 7])).toEqual([0, 3, 7, 10]);
    // Edges outside the range are ignored; none left means the steps (or a continuous scale) again.
    expect(colourEdges(0, 10, 2, [-1, 10, 12])).toEqual([0, 5, 10]);
    expect(colourEdges(0, 10, null, [12])).toBeNull();
  });
  it('puts a value in the interval that holds its lower edge, the last one holding both', () => {
    const edges = [0, 2, 4, 6, 8, 10];
    expect([0, 1.99, 2, 5.5, 8, 9.99, 10].map((v) => intervalIndex(edges, v))).toEqual([0, 0, 1, 2, 4, 4, 4]);
    expect(intervalIndex([0, 3, 7, 10], 3)).toBe(1);
    expect(intervalIndex([0, 3, 7, 10], 7)).toBe(2);
  });
  it('gives each cell the colour of the middle of its interval, and the colour bar the same colours', () => {
    const m = model({ min: 3, max: 7, steps: 2 });
    // Intervals 3 to 5 and 5 to 7: their middles, 4 and 6, are at 1/4 and 3/4 of the range.
    const [low, high] = [paletteColour('bs-blue', 0.25, false), paletteColour('bs-blue', 0.75, false)];
    expect(m.edges).toEqual([3, 5, 7]);
    expect(m.cells.map((c) => c.fill)).toEqual([low, high, low, high]);
    expect(m.bar!.strips.map((s) => s.fill)).toEqual([high, low]);
    expect(m.bar!.ticks.map((t) => t.value)).toEqual([3, 5, 7]);
    const [top, bottom] = m.bar!.strips;
    expect(top.y).toBeCloseTo(m.bar!.rect.y, 9);
    expect(top.height - 0.6).toBeCloseTo(m.bar!.rect.height / 2, 9);
    expect(bottom.y).toBeCloseTo(m.bar!.rect.y + m.bar!.rect.height / 2, 9);
  });
  it('uses edges set by hand, with strips as tall as the intervals are wide', () => {
    const m = model({ min: 3, max: 7, breaks: [4, 6] });
    expect(m.edges).toEqual([3, 4, 6, 7]);
    const at = (v: number) => paletteColour('bs-blue', (v - 3) / 4, false);
    // 3.1 is in 3 to 4 (middle 3.5), 4.2 and 5.2 in 4 to 6 (middle 5), 6.5 in 6 to 7 (middle 6.5).
    expect(m.cells.map((c) => c.fill)).toEqual([at(5), at(6.5), at(3.5), at(5)]);
    expect(m.bar!.strips.map((s) => Number(((s.height - 0.6) / m.bar!.rect.height).toFixed(3)))).toEqual([0.25, 0.5, 0.25]);
  });
  it('says when no edge lies inside the range, and draws the scale without intervals', () => {
    const m = model({ min: 3, max: 7, breaks: [20] });
    expect(m.edges).toBeNull();
    expect(m.warnings.join(' ')).toMatch(/None of the interval edges lies inside the colour range; the scale is drawn continuous/);
  });
  it('leaves a continuous scale as it was by default', () => {
    const m = model();
    expect(m.edges).toBeNull();
    expect(m.bar!.strips).toHaveLength(64);
    expect(m.cells.every((c) => c.status === 'value' && c.mark === 'none')).toBe(true);
  });
});

describe('heat map cells of special kinds', () => {
  const special = () => {
    const table = createGroupedTable('Grouped', true);
    table.groups[0].observations[0].excluded = true;
    table.groups[1].observations[1].value = null;
    return table;
  };
  it('tells a cell with no value, one whose value is excluded, and one outside the colour range', () => {
    const m = model({ min: 3.5, max: 7 }, special());
    // Male A is excluded, Female A (3.1) is below the range, Female B has no value.
    expect(m.cells.map((c) => c.status)).toEqual(['excluded', 'value', 'outside', 'missing']);
  });
  it('colours them apart: excluded and outside have their own colour, else the missing colour and the end colour', () => {
    const plain = model({ min: 3.5, max: 7, missingColour: '#abcdef' }, special());
    expect(plain.cells[0].fill).toBe('#abcdef');
    expect(plain.cells[3].fill).toBe('#abcdef');
    expect(plain.cells[2].fill).toBe(paletteColour('bs-blue', 0, false));
    const own = model({ min: 3.5, max: 7, missingColour: '#abcdef', excludedColour: '#112233', outsideColour: '#445566' }, special());
    expect(own.cells.map((c) => c.fill)).toEqual(['#112233', own.cells[1].fill, '#445566', '#abcdef']);
  });
  it('draws the mark of each kind over its cells only, never taking the click', () => {
    const m = model({ min: 3.5, max: 7, excludedMark: 'cross', outsideMark: 'slash', missingMark: 'outline' }, special());
    expect(m.cells.map((c) => c.mark)).toEqual(['cross', 'none', 'slash', 'outline']);
    const marks = m.marks!;
    const paths = marks.filter((e) => e.tag === 'path').map((e) => e.attrs!.find(([k]) => k === 'd')![1] as string);
    const [cross, slash] = [m.cells[0], m.cells[2]];
    const x = (n: number) => Number(n.toFixed(2));
    expect(paths).toContain(`M${x(cross.x)},${x(cross.y)}L${x(cross.x + cross.width)},${x(cross.y + cross.height)}M${x(cross.x)},${x(cross.y + cross.height)}L${x(cross.x + cross.width)},${x(cross.y)}`);
    expect(paths).toContain(`M${x(slash.x)},${x(slash.y + slash.height)}L${x(slash.x + slash.width)},${x(slash.y)}`);
    expect(paths).toHaveLength(2);
    expect(marks.filter((e) => e.tag === 'rect' && e.attrs!.some(([k, v]) => k === 'stroke' && v === m.cells[3].textColour))).toHaveLength(1);
    expect(chartToSvgString(setup({ excludedMark: 'cross' }, special()).chart, special())).not.toContain('NaN');
  });
  it('names an excluded cell in the tooltip, not as a cell without a value', () => {
    const m = model({}, special());
    const line = (i: number) => heatTooltipLines(m, { kind: 'bar', groupId: m.cells[i].seriesId, objectId: m.cells[i].id })!.at(-1);
    expect(line(0)).toBe('Excluded');
    expect(line(3)).toBe('No value');
  });
});

describe('heat map cell size, groups, labels and colour bar', () => {
  it('sets the size of the cells, holding it at the plotting region, and the colour bar follows the grid', () => {
    const big = model({});
    const m = model({ cellWidthPt: 20, cellHeightPt: 15 });
    expect(m.cells.map((c) => [c.width, c.height])).toEqual(Array(4).fill([20, 15]));
    expect(m.gridWidth).toBe(40);
    expect(m.gridHeight).toBe(30);
    expect(m.bar!.rect.x).toBeCloseTo(m.layout.plot.x + 40 + 28, 9);
    expect(m.bar!.rect.height).toBeCloseTo(30, 9);
    const huge = model({ cellWidthPt: 400, cellHeightPt: 400 });
    expect(huge.gridWidth).toBeCloseTo(big.layout.plot.width, 9);
    expect(huge.cells[0].width).toBeCloseTo(big.cells[0].width, 9);
  });
  it('puts extra space after each group of rows or columns', () => {
    const m = model({ colGroupSize: 1, rowGroupSize: 1, groupGapPt: 10, cellGapPt: 0 });
    const [a, b, , d] = m.cells;
    expect(b.x - (a.x + a.width)).toBeCloseTo(10, 9);
    expect(d.y - (a.y + a.height)).toBeCloseTo(10, 9);
    expect(a.width * 2 + 10).toBeCloseTo(m.layout.plot.width, 9);
    // The labels follow the cells.
    expect(m.colLabelAt[1].at).toBeCloseTo(b.x + b.width / 2, 9);
    expect(m.rowLabelAt[1].at).toBeCloseTo(d.y + d.height / 2, 9);
    // One group of two cells has no space after it.
    const one = model({ colGroupSize: 2, groupGapPt: 10 });
    expect(one.cells[1].x - (one.cells[0].x + one.cells[0].width)).toBeCloseTo(0, 9);
  });
  it('writes only every this many-th label of the rows or columns', () => {
    const all = model({});
    expect(all.rowLabelAt.map((l) => l.text)).toEqual(['Male', 'Female']);
    const m = model({ rowLabelEvery: 2, colLabelEvery: 2 });
    expect(m.rowLabelAt.map((l) => [l.index, l.text])).toEqual([[0, 'Male']]);
    expect(m.colLabelAt.map((l) => [l.index, l.text])).toEqual([[0, 'Group A']]);
    const svg = chartToSvgString(setup({ rowLabelEvery: 2 }).chart, setup().table);
    expect(svg).toContain('>Male</text>');
    expect(svg).not.toContain('>Female</text>');
  });
  it('sets the width, length, ticks and title of the colour bar', () => {
    const base = model({ normalise: 'row' });
    const m = model({ normalise: 'row', barWidthPt: 40, barLengthPct: 50, barTicks: 2, barTitle: 'Spread' });
    expect(m.bar!.rect.width).toBe(40);
    expect(m.bar!.rect.height).toBeCloseTo(base.bar!.rect.height / 2, 9);
    // Centred on the grid.
    expect(m.bar!.rect.y + m.bar!.rect.height / 2).toBeCloseTo(base.bar!.rect.y + base.bar!.rect.height / 2, 9);
    expect(m.bar!.ticks.length).toBeLessThan(base.bar!.ticks.length);
    expect(m.bar!.title).toBe('Spread');
    expect(base.bar!.title).toBe('Row z-score of mean');
    expect(model({ normalise: 'row', barTitle: '' }).bar!.title).toBeNull();
    // A wider bar leaves less room for the cells.
    expect(m.layout.plot.width).toBeLessThan(base.layout.plot.width);
  });
});

describe('heat map settings in a file', () => {
  it('are kept through a file', () => {
    const { chart, table } = setup({ steps: 4, breaks: [2, 5], excludedColour: '#112233', excludedMark: 'cross', outsideMark: 'slash', missingMark: 'outline', cellWidthPt: 18, rowGroupSize: 3, groupGapPt: 9, colLabelEvery: 2, barTitle: 'Level' });
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    expect(parseProject(stringifyProject(p)).charts[0].heatmap).toEqual(chart.heatmap);
  });
  it('fall back to the base for a value that is not valid, and are held within their limits', () => {
    const base = createChart('t', undefined, 'heatmap').heatmap;
    const h = sanitizeHeatmap({ steps: 'many', breaks: ['a', 5, 3, 3, null], excludedColour: 'red', outsideColour: '#ABCDEF', excludedMark: 'dots', cellWidthPt: 'wide', rowGroupSize: 0, barLengthPct: 5, barWidthPt: 500, colLabelEvery: 0.4, barTitle: 7 }, base);
    expect(h.steps).toBeNull();
    expect(h.breaks).toEqual([3, 5]);
    expect(h.excludedColour).toBeNull();
    expect(h.outsideColour).toBe('#abcdef');
    expect(h.excludedMark).toBe('none');
    expect(h.cellWidthPt).toBeNull();
    expect(h.rowGroupSize).toBe(1);
    expect(h.barLengthPct).toBe(20);
    expect(h.barWidthPt).toBe(80);
    expect(h.colLabelEvery).toBe(1);
    expect(h.barTitle).toBeNull();
    expect(sanitizeHeatmap({ steps: 40 }, base).steps).toBe(12);
    // A file from before these settings reads as the defaults.
    expect(sanitizeHeatmap({ palette: 'gsea' }, base)).toEqual({ ...base, palette: 'gsea' });
  });
});
