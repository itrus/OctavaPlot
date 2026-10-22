import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { PALETTES, paletteById } from '../model/palettes';
import { buildChartModel } from '../chart/model';
import { applyPalette, patchPointStyle, patchStyle, patchSummary, resetAllDataSets, setLegendItemVisible } from './commands';

describe('palettes', () => {
  it('assigns colours to the data sets in order and records the palette', () => {
    const p0 = createExampleProject();
    const vibrant = paletteById('vibrant')!;
    const p = applyPalette(p0.charts[0].id, vibrant)(p0);
    const model = buildChartModel(p.charts[0], p.dataTables[0]);
    expect(p.charts[0].paletteId).toBe('vibrant');
    model.groups.forEach((g, i) => expect(g.style.barFill).toBe(vibrant.colors[i % vibrant.colors.length]));
  });

  it('offers the five required palettes', () => {
    expect(PALETTES.map((x) => x.name)).toEqual(['Vibrant', 'Pastel', 'Colorblind-friendly', 'Monochrome', 'Black and White']);
  });
});

describe('legend items', () => {
  it('hides and shows one data set at a time', () => {
    const p0 = createExampleProject();
    const chartId = p0.charts[0].id;
    const [a, b] = p0.dataTables[0].groups;
    let p = setLegendItemVisible(chartId, a.id, false)(p0);
    p = { ...p, charts: p.charts.map((c) => ({ ...c, legend: { ...c.legend, visible: true } })) };
    const model = buildChartModel(p.charts[0], p.dataTables[0]);
    expect(model.legendGroups).not.toContain(0);
    expect(model.legendGroups).toContain(1);
    expect(model.layout.legend?.items.length).toBe(p.dataTables[0].groups.length - 1);
    p = setLegendItemVisible(chartId, a.id, true)(p);
    expect(p.charts[0].legend.hiddenGroupIds).toEqual([]);
    expect(setLegendItemVisible(chartId, b.id, false)(p).charts[0].legend.hiddenGroupIds).toEqual([b.id]);
  });
});

describe('reset all data sets', () => {
  it('returns every data set setting to the defaults, at global, data set and point level', () => {
    const p0 = createExampleProject();
    const chartId = p0.charts[0].id;
    const t = p0.dataTables[0];
    let p = patchStyle(chartId, 'all', { barBorderWidthPt: 9, showSymbols: false })(p0);
    p = patchStyle(chartId, t.groups[1].id, { barFill: '#123456' })(p);
    p = patchPointStyle(chartId, t.groups[0].observations[0].id, { symbolColor: '#ff00ff' })(p);
    p = patchSummary(chartId, 'all', { spread: 'sd' })(p);
    p = applyPalette(chartId, paletteById('pastel')!)(p);
    expect(p.charts[0].layers).not.toEqual(p0.charts[0].layers);
    const r = resetAllDataSets(chartId)(p);
    expect(r.charts[0].layers).toEqual(p0.charts[0].layers);
    expect(r.charts[0].defaults).toEqual(p0.charts[0].defaults);
    expect(r.charts[0].paletteId).toBe(p0.charts[0].paletteId);
    // Titles, axes, legend and size are left alone.
    expect(r.charts[0].widthPx).toBe(p.charts[0].widthPx);
  });
});
