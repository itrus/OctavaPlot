import { describe, expect, it } from 'vitest';
import { createChart, createGroupedTable } from '../model/defaults';
import type { DataTable, HeatmapOptions, Project } from '../model/types';
import { addChart, patchLook, setChartType } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { chartToSvgString } from './export';
import { contrastColour, paletteColour, scalePosition } from './heatColours';
import { buildHeatModel } from './heatmapModel';
import { heatTooltipLines, tooltipFmt } from './tooltip';

// Series A: Male 4.2, Female 3.1; series B: Male 6.5, Female 5.2.
const setup = (patch: Partial<HeatmapOptions> = {}, table: DataTable = createGroupedTable('Grouped', true)) => {
  const chart = createChart(table.id, undefined, 'heatmap');
  chart.heatmap = { ...chart.heatmap, ...patch };
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};

describe('heat map model', () => {
  it('has a cell for each category and series, coloured by its value', () => {
    const { table, chart } = setup();
    const m = buildHeatModel(chart, table);
    expect(m.rows).toEqual(['Male', 'Female']);
    expect(m.cols).toEqual(['Group A', 'Group B']);
    expect(m.cells).toHaveLength(4);
    const byValue = [...m.cells].sort((a, b) => a.value! - b.value!);
    expect(byValue.map((c) => c.value)).toEqual([3.1, 4.2, 5.2, 6.5]);
    // The smallest value has the low colour and the largest the high one.
    expect(byValue[0].fill).toBe(paletteColour('viridis', 0, false));
    expect(byValue[3].fill).toBe(paletteColour('viridis', 1, false));
    expect(byValue[1].fill).not.toBe(byValue[2].fill);
  });
  it('lays the cells out in a grid inside the plotting region, with the space between them', () => {
    const { table, chart } = setup({ cellGapPt: 4 });
    const m = buildHeatModel(chart, table);
    const { plot } = m.layout;
    const [a, b, c] = m.cells;
    expect(a.x).toBeCloseTo(plot.x + 2, 9);
    expect(a.y).toBeCloseTo(plot.y + 2, 9);
    expect(b.x - (a.x + a.width)).toBeCloseTo(4, 9);
    expect(c.y - (a.y + a.height)).toBeCloseTo(4, 9);
    expect((a.width + 4) * 2).toBeCloseTo(plot.width, 9);
  });
  it('reverses the colours, and uses the range set by hand, holding values outside it at the ends', () => {
    const { table, chart } = setup({ reverse: true, min: 4, max: 6 });
    const m = buildHeatModel(chart, table);
    const low = m.cells.find((c) => c.value === 3.1)!;
    const high = m.cells.find((c) => c.value === 6.5)!;
    expect(low.fill).toBe(paletteColour('viridis', 0, true));
    expect(high.fill).toBe(paletteColour('viridis', 1, true));
    expect(m.warnings.join(' ')).toMatch(/2 values lie outside the colour range/);
    expect(m.bar!.lo).toBe(4);
    expect(m.bar!.hi).toBe(6);
  });
  it('swaps rows and columns, each cell keeping its value', () => {
    const { table, chart } = setup({ transpose: true });
    const m = buildHeatModel(chart, table);
    expect(m.rows).toEqual(['Group A', 'Group B']);
    expect(m.cols).toEqual(['Male', 'Female']);
    // Group B, Male is 6.5: now row 2, column 1.
    const cell = m.cells.find((c) => c.rowLabel === 'Group B' && c.colLabel === 'Male')!;
    expect(cell.value).toBe(6.5);
  });
  it('normalises each row to z-scores, and calls the cell of a row with no spread missing', () => {
    const { table, chart } = setup({ normalise: 'row', method: 'zscore' });
    const m = buildHeatModel(chart, table);
    // Two values in a row: z-scores are -0.707 and 0.707.
    expect(m.cells.map((c) => Number(c.value!.toFixed(3)))).toEqual([-0.707, 0.707, -0.707, 0.707]);
    expect(m.cells[0].original).toBe(4.2);
    const single = createGroupedTable('One', true);
    single.groups = single.groups.slice(0, 1);
    const one = buildHeatModel({ ...createChart(single.id, undefined, 'heatmap'), heatmap: { ...chart.heatmap } }, single);
    expect(one.cells.every((c) => c.value === null)).toBe(true);
    expect(one.warnings.join(' ')).toMatch(/no z-score/);
  });
  it('colours a missing cell with the missing colour and never as zero', () => {
    const table = createGroupedTable('Grouped', true);
    table.groups[0].observations[0].value = null;
    const { chart } = setup({ missingColour: '#abcdef' }, table);
    const m = buildHeatModel(chart, table);
    const missing = m.cells.find((c) => c.value === null)!;
    expect(missing.fill).toBe('#abcdef');
    expect(missing.text).toBeNull();
    expect(m.bar!.lo).toBe(3.1);
  });
  it('writes the numbers of the cells in a colour that can be read on them', () => {
    const { table, chart } = setup({ showValues: true, decimals: 1 });
    const m = buildHeatModel(chart, table);
    expect(m.cells.map((c) => c.text)).toEqual(['4.2', '6.5', '3.1', '5.2']);
    for (const c of m.cells) expect(c.textColour).toBe(contrastColour(c.fill));
    expect(contrastColour('#000000')).toBe('#ffffff');
    expect(contrastColour('#ffffff')).toBe('#000000');
    expect(contrastColour('#ffff00')).toBe('#000000');
    expect(buildHeatModel(setup({ showValues: true }).chart, table).cells[0].text).toBe('4.2');
  });
  it('has a colour bar with the high end at the top, and none when asked not to', () => {
    const { table, chart } = setup();
    const bar = buildHeatModel(chart, table).bar!;
    // High end at the top, low end at the bottom (colours compared within rounding: a step of the scale is a few units).
    const near = (a: string, b: string) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);
    expect(near(bar.strips[0].fill, paletteColour('viridis', 1 - 0.5 / 64, false))).toBe(true);
    expect(near(bar.strips.at(-1)!.fill, paletteColour('viridis', 0.5 / 64, false))).toBe(true);
    expect(bar.ticks.every((t) => t.y >= bar.rect.y && t.y <= bar.rect.y + bar.rect.height)).toBe(true);
    expect(bar.ticks.length).toBeGreaterThan(1);
    expect(buildHeatModel(setup({ colourbar: false }).chart, table).bar).toBeNull();
  });
  it('uses the mean or the median of replicates', () => {
    const table = createGroupedTable('Replicates', true, { kind: 'replicates', n: 3 });
    // Make the first cell of the first series 1, 2, 9: mean 4, median 2.
    const cols = table.groups.slice(0, 3);
    [1, 2, 9].forEach((v, i) => (cols[i].observations[0].value = v));
    const mean = buildHeatModel(setup({ summary: 'mean' }, table).chart, table).cells[0].value;
    const median = buildHeatModel(setup({ summary: 'median' }, table).chart, table).cells[0].value;
    expect(mean).toBe(4);
    expect(median).toBe(2);
  });
});

describe('heat colours', () => {
  it('run from the low to the high end of the scale, and the other way when reversed', () => {
    for (const p of ['viridis', 'magma', 'blue', 'greenred', 'grayscale'] as const) {
      expect(paletteColour(p, 0, false)).toBe(paletteColour(p, 1, true));
      expect(paletteColour(p, 0, false)).toMatch(/^#[0-9a-f]{6}$/);
      expect(paletteColour(p, 0, false)).not.toBe(paletteColour(p, 1, false));
    }
    // Held within the scale.
    expect(paletteColour('viridis', -5, false)).toBe(paletteColour('viridis', 0, false));
    expect(paletteColour('viridis', 5, false)).toBe(paletteColour('viridis', 1, false));
  });
  it('gives the diverging scale black in the middle, and places values in two halves', () => {
    expect(paletteColour('greenred', 0.5, false)).toBe('#000000');
    const s = { palette: 'greenred' as const, reverse: false, lo: -2, hi: 6, centre: 0 };
    expect(scalePosition(-2, s, true)).toBe(0);
    expect(scalePosition(0, s, true)).toBe(0.5);
    expect(scalePosition(6, s, true)).toBe(1);
    expect(scalePosition(3, s, true)).toBe(0.75);
    // Not diverging: linear.
    expect(scalePosition(0, s, false)).toBe(0.25);
    // No range: the middle.
    expect(scalePosition(3, { ...s, lo: 3, hi: 3 }, false)).toBe(0.5);
  });
});

describe('heat map chart', () => {
  it('is drawn with its cells, labels and colour bar, and nothing is NaN', () => {
    const { table, chart } = setup({ showValues: true });
    const svg = chartToSvgString(chart, table);
    expect(svg).toContain('>Male</text>');
    expect(svg).toContain('>Group B</text>');
    expect(svg).not.toContain('NaN');
    expect((svg.match(/<rect/g) ?? []).length).toBeGreaterThan(4 + 64);
  });
  it('tells row, column and value in the tooltip, and the value before normalising', () => {
    const { table, chart } = setup({ normalise: 'row' });
    const m = buildHeatModel(chart, table);
    const c = m.cells[0];
    expect(heatTooltipLines(m, { kind: 'bar', groupId: c.seriesId, objectId: c.id })).toEqual(['Group A', 'Male', `Value: ${tooltipFmt(c.value!)}`, 'Before normalising: 4.2']);
  });
  it('is made with the colour scale of the gallery entry, and switched to from a grouped chart', () => {
    const { p } = setup();
    const made = addChart('h2', p.dataTables[0].id, undefined, 'heatmap', { heatPalette: 'greenred' })(p);
    expect(made.charts[1].heatmap.palette).toBe('greenred');
    const flipped = setChartType(p.charts[0].id, 'groupedBar')(p);
    expect(flipped.charts[0].type).toBe('groupedBar');
  });
  it('keeps its settings in a file; bad values fall back, and old files get the defaults', () => {
    const { p } = setup();
    const next = patchLook(p.charts[0].id, { heatmap: { ...p.charts[0].heatmap, palette: 'magma', min: 1, max: 9, normalise: 'column', cellGapPt: 99 } })(p);
    expect(next.charts[0].heatmap.cellGapPt).toBe(20);
    const back = parseProject(stringifyProject(next));
    expect(back.charts[0].heatmap).toMatchObject({ palette: 'magma', min: 1, max: 9, normalise: 'column' });
    const text = JSON.parse(stringifyProject(next));
    text.project.charts[0].heatmap = { palette: 'rainbow', min: 9, max: 2, missingColour: 'red', normalise: 7 };
    expect(parseProject(JSON.stringify(text)).charts[0].heatmap).toMatchObject({ palette: 'viridis', min: null, max: null, missingColour: '#d9d9d9', normalise: 'none' });
    delete text.project.charts[0].heatmap;
    expect(parseProject(JSON.stringify(text)).charts[0].heatmap.palette).toBe('viridis');
  });
});
