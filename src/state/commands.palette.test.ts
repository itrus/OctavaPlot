import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { PALETTES, paletteById } from '../model/graph/palettes';
import { buildColumnModel } from '../chart/column/columnModel';
import { applyPalette, patchAxis, patchPointStyle, patchStyle, patchSummary, resetAllDataSets, setLegendItemVisible } from './commands';

describe('palettes', () => {
  it('assigns colours to the data sets in order and records the palette', () => {
    const p0 = createExampleProject();
    const vibrant = paletteById('vibrant')!;
    const p = applyPalette(p0.charts[0].id, vibrant)(p0);
    const model = buildColumnModel(p.charts[0], p.dataTables[0]);
    expect(p.charts[0].paletteId).toBe('vibrant');
    model.groups.forEach((g, i) => expect(g.style.barFill).toBe(vibrant.colors[i % vibrant.colors.length]));
  });

  it('lists the ggsci palettes first with Science first, then the app own ones', () => {
    const names = PALETTES.map((x) => x.name);
    expect(names[0]).toBe('Science (AAAS)');
    expect(names.slice(-5)).toEqual(['Vibrant', 'Pastel', 'Colorblind-friendly', 'Monochrome', 'Black and White']);
    expect(PALETTES.filter((x) => x.source === 'ggsci')).toHaveLength(15);
    expect(PALETTES.every((x) => x.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c)))).toBe(true);
  });
});

describe('legend items', () => {
  it('hides and shows one data set at a time', () => {
    const p0 = createExampleProject();
    const chartId = p0.charts[0].id;
    const [a, b] = p0.dataTables[0].groups;
    let p = setLegendItemVisible(chartId, a.id, false)(p0);
    p = { ...p, charts: p.charts.map((c) => ({ ...c, legend: { ...c.legend, visible: true } })) };
    const model = buildColumnModel(p.charts[0], p.dataTables[0]);
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
    p = patchAxis(chartId, 'yAxis', { lineWidthPt: 9 })(p);
    p = { ...p, charts: p.charts.map((c) => ({ ...c, widthPx: 400, heightPx: 300, aspect: '4:3' as const })) };
    const r = resetAllDataSets(chartId)(p);
    expect(r.charts[0].yAxis).toEqual(p0.charts[0].yAxis);
    expect(r.charts[0].layers).toEqual(p0.charts[0].layers);
    expect(r.charts[0].defaults).toEqual(p0.charts[0].defaults);
    expect(r.charts[0].paletteId).toBe(p0.charts[0].paletteId);
    // Titles are kept; the rest of the look, size included, goes back to a new graph's.
    expect(r.charts[0]).toMatchObject({ widthPx: p0.charts[0].widthPx, heightPx: p0.charts[0].heightPx, aspect: p0.charts[0].aspect });
    expect(r.charts[0].title).toBe(p.charts[0].title);
  });
});
