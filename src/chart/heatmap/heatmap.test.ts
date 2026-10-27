import { describe, expect, it } from 'vitest';
import { createChart, createGroupedTable } from '../../model/defaults';
import { HEAT_GRADIENTS } from '../../model/options/heatGradients';
import { HEAT_PALETTES } from '../../model/options/heatmapOptions';
import type { DataTable, HeatPalette, HeatmapOptions, Project } from '../../model/types';
import { addChart, patchLook, setChartType } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { contrastColour, paletteColour, scalePosition } from './heatColours';
import { buildHeatModel } from './heatmapModel';
import { heatTooltipLines, tooltipFmt } from '../tooltip';
import { withoutExcluded } from '../../model/table/exclusion';

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
    expect(byValue[0].fill).toBe(paletteColour('bs-blue', 0, false));
    expect(byValue[3].fill).toBe(paletteColour('bs-blue', 1, false));
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
    expect(low.fill).toBe(paletteColour('bs-blue', 0, true));
    expect(high.fill).toBe(paletteColour('bs-blue', 1, true));
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
    expect(near(bar.strips[0].fill, paletteColour('bs-blue', 1 - 0.5 / 64, false))).toBe(true);
    expect(near(bar.strips.at(-1)!.fill, paletteColour('bs-blue', 0.5 / 64, false))).toBe(true);
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
    for (const { value: p } of HEAT_PALETTES) {
      expect(paletteColour(p, 0, false)).toBe(paletteColour(p, 1, true));
      expect(paletteColour(p, 0, false)).toMatch(/^#[0-9a-f]{6}$/);
      expect(paletteColour(p, 0, false)).not.toBe(paletteColour(p, 1, false));
    }
    // Held within the scale.
    expect(paletteColour('bs-blue', -5, false)).toBe(paletteColour('bs-blue', 0, false));
    expect(paletteColour('bs-blue', 5, false)).toBe(paletteColour('bs-blue', 1, false));
  });
  it('has the 16 ggsci gradients, 151 stops, and passes through every stop', () => {
    expect(HEAT_GRADIENTS).toHaveLength(16);
    expect(HEAT_GRADIENTS.reduce((n, p) => n + p.colors.length, 0)).toBe(151);
    for (const p of HEAT_GRADIENTS) {
      expect(paletteColour(p.value as HeatPalette, 0, false)).toBe(p.colors[0].toLowerCase());
      expect(paletteColour(p.value as HeatPalette, 1, false)).toBe(p.colors.at(-1)!.toLowerCase());
    }
    expect(HEAT_GRADIENTS.filter((p) => p.diverging).map((p) => p.value)).toEqual(['gsea']);
  });
  it('places values in two halves on the diverging scale', () => {
    const s = { palette: 'gsea' as const, reverse: false, lo: -2, hi: 6, centre: 0 };
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
    expect(heatTooltipLines(m, { kind: 'bar', groupId: c.seriesId, objectId: c.id })).toEqual(['Group A', 'Male', `Row z-score of mean: ${tooltipFmt(c.value!)}`, 'Before normalising: 4.2']);
  });
  it('is made with the colour scale of the gallery entry, and switched to from a grouped chart', () => {
    const { p } = setup();
    const made = addChart('h2', p.dataTables[0].id, undefined, 'heatmap', { heatPalette: 'gsea' })(p);
    expect(made.charts[1].heatmap.palette).toBe('gsea');
    const flipped = setChartType(p.charts[0].id, 'groupedBar')(p);
    expect(flipped.charts[0].type).toBe('groupedBar');
  });
  it('keeps its settings in a file; bad values fall back, and old files get the defaults', () => {
    const { p } = setup();
    const next = patchLook(p.charts[0].id, { heatmap: { ...p.charts[0].heatmap, palette: 'md-red', min: 1, max: 9, normalise: 'column', cellGapPt: 99 } })(p);
    expect(next.charts[0].heatmap.cellGapPt).toBe(40);
    const back = parseProject(stringifyProject(next));
    expect(back.charts[0].heatmap).toMatchObject({ palette: 'md-red', min: 1, max: 9, normalise: 'column' });
    const text = JSON.parse(stringifyProject(next));
    text.project.charts[0].heatmap = { palette: 'rainbow', min: 9, max: 2, missingColour: 'red', normalise: 7 };
    expect(parseProject(JSON.stringify(text)).charts[0].heatmap).toMatchObject({ palette: 'bs-blue', min: null, max: null, missingColour: '#d9d9d9', normalise: 'none' });
    // A scale of the earlier five opens as the nearest new one.
    text.project.charts[0].heatmap = { palette: 'greenred' };
    expect(parseProject(JSON.stringify(text)).charts[0].heatmap.palette).toBe('gsea');
    delete text.project.charts[0].heatmap;
    expect(parseProject(JSON.stringify(text)).charts[0].heatmap.palette).toBe('bs-blue');
  });
});

describe('colour range limits', () => {
  it('uses the automatic range when a manual minimum lies above the automatic maximum', () => {
    const { table, chart } = setup({ min: 100 });
    const m = buildHeatModel(chart, table);
    expect(m.bar!.hi).toBeGreaterThan(m.bar!.lo);
    expect(m.bar!.ticks.length).toBeGreaterThan(0);
    expect(m.warnings.some((w) => /colour range/.test(w))).toBe(true);
  });
});

describe('cell labels', () => {
  it('fit the cell in width and height, shrink when needed, and are left out when they cannot be read', async () => {
    const { fitCellLabel } = await import('./heatMarks');
    expect(fitCellLabel('4.2', 120, 80, 20)).toBe(20);
    const narrow = fitCellLabel('123456.789', 60, 80, 20)!;
    expect(narrow).toBeLessThan(20);
    expect(narrow).toBeGreaterThanOrEqual(8);
    expect(fitCellLabel('123456.789', 16, 80, 20)).toBeNull();
    expect(fitCellLabel('4.2', 120, 8, 20)).toBeNull();
  });
});

describe('heat map of variation', () => {
  // Replicates, 3 per series. Series A row 0: [9,10,11]; series B row 0: [0,10,20]; row 1 of A has one value, of B none.
  const make = () => {
    const table = createGroupedTable('Replicates', true, { kind: 'replicates', n: 3 });
    const put = (g: number, r: number, v: number | null) => (table.groups[g].observations[r].value = v);
    [9, 10, 11].forEach((v, i) => put(i, 0, v));
    [0, 10, 20].forEach((v, i) => put(3 + i, 0, v));
    [5, null, null].forEach((v, i) => put(i, 1, v));
    [null, null, null].forEach((v, i) => put(3 + i, 1, v));
    return table;
  };
  const model = (patch: Partial<HeatmapOptions>, table = make()) => buildHeatModel(setup(patch, table).chart, table);

  it('gives equal means different SD and %CV', () => {
    expect(model({ summary: 'mean' }).cells.slice(0, 3).map((c) => c.value)).toEqual([10, 10, 5]);
    expect(model({ summary: 'sd' }).cells.map((c) => c.value)).toEqual([1, 10, null, null]);
    expect(model({ summary: 'cv' }).cells.map((c) => c.value)).toEqual([10, 100, null, null]);
  });
  it('draws a cell with one value as missing for the SD, says so, and counts the values for n', () => {
    const m = model({ summary: 'sd' });
    expect(m.cells[2].value).toBeNull();
    expect(m.cells[2].fill).toBe(m.cells[3].fill);
    expect(m.warnings).toContain('1 cell has fewer than 2 values, so their SD is not available.');
    expect(model({ summary: 'n' }).cells.map((c) => c.value)).toEqual([3, 3, 1, null]);
  });
  it('does not count excluded or missing values', () => {
    const table = make();
    table.groups[0].observations[0].excluded = true;
    expect(buildHeatModel(setup({ summary: 'n' }, table).chart, withoutExcluded(table)).cells[0].value).toBe(2);
  });
  it('takes the geometric mean only of values above zero', () => {
    const table = make();
    [1, 10, 100].forEach((v, i) => (table.groups[i].observations[0].value = v));
    const m = model({ summary: 'geomean' }, table);
    expect(m.cells[0].value).toBeCloseTo(10, 12);
    expect(m.cells[1].value).toBeNull();
    expect(m.warnings).toContain('1 cell has a value that is not above zero, so their geometric mean is not available.');
  });
  it('normalises after the statistic and names both in the colour bar and the tooltip', () => {
    const m = model({ summary: 'sd', normalise: 'row', method: 'centre' });
    expect(m.cells.slice(0, 2).map((c) => c.value)).toEqual([-4.5, 4.5]);
    expect(m.cells[0].original).toBe(1);
    expect(m.bar!.title).toBe('Row centred of SD');
    expect(model({ summary: 'sd' }).bar!.title).toBe('SD');
    expect(model({}).bar!.title).toBeNull();
    const c = m.cells[0];
    expect(heatTooltipLines(m, { kind: 'bar', groupId: c.seriesId, objectId: c.id })![2]).toBe(`Row centred of SD: ${tooltipFmt(-4.5)}`);
  });
  it('draws the title of the colour bar, and nothing new for the plain mean', () => {
    const table = make();
    expect(chartToSvgString(setup({ summary: 'sd' }, table).chart, table)).toContain('>SD</text>');
    expect(chartToSvgString(setup({}, table).chart, table)).not.toContain('>Mean</text>');
  });
  it('shows the SD or SEM entered for values already calculated, and the rest as unavailable', () => {
    const table = createGroupedTable('Supplied', true, { kind: 'summary', format: 'mean-sd-n' });
    // Series A: Mean, SD, N of row 0.
    [8, 2, 4].forEach((v, i) => (table.groups[i].observations[0].value = v));
    expect(model({ summary: 'mean' }, table).cells[0].value).toBe(8);
    expect(model({ summary: 'sd' }, table).cells[0].value).toBe(2);
    expect(model({ summary: 'cv' }, table).cells[0].value).toBe(25);
    expect(model({ summary: 'n' }, table).cells[0].value).toBe(4);
    const sem = model({ summary: 'sem' }, table);
    expect(sem.cells[0].value).toBeNull();
    expect(sem.warnings.some((w) => w.includes('entered as calculated values that do not give their SEM'))).toBe(true);
    expect(model({ summary: 'geomean' }, table).cells[0].value).toBeNull();
  });
  it('is kept through a file, and a value that is not valid falls back to the mean', () => {
    const { p } = setup({ summary: 'cv' });
    expect(parseProject(stringifyProject(p)).charts[0].heatmap.summary).toBe('cv');
    const raw = JSON.parse(stringifyProject(p));
    raw.project.charts[0].heatmap.summary = 'variance';
    expect(parseProject(JSON.stringify(raw)).charts[0].heatmap.summary).toBe('mean');
  });
});
