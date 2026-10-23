import { describe, expect, it } from 'vitest';
import { createChart, createContingencyTable } from '../model/defaults';
import type { DataTable, Project } from '../model/types';
import { patchLook, setCells, setChartType } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { chartToSvgString } from './export';
import { buildPieModel, pieGrid, percentText, sliceLabelText, slicePath } from './pieModel';
import { pieTooltipLines } from './tooltip';

const setup = (type: 'pie' | 'doughnut' = 'pie') => {
  const table: DataTable = createContingencyTable('Outcomes', true); // Treated 38/12, Control 21/29
  const chart = createChart(table.id, undefined, type);
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};

describe('pie model', () => {
  it('makes one pie for each row, with the parts in the table order', () => {
    const { table, chart } = setup();
    const m = buildPieModel(chart, table);
    expect(m.pies.map((p) => p.title)).toEqual(['Treated', 'Control']);
    expect(m.pies[0].slices.map((s) => s.label)).toEqual(['Cured', 'Not cured']);
    expect(m.pies[0].total).toBe(50);
    expect(m.pies[0].slices.map((s) => s.fraction)).toEqual([0.76, 0.24]);
    expect(m.parts.map((p) => p.label)).toEqual(['Cured', 'Not cured']);
  });
  it('gives each part the angle of its share, and the shares add up to 1', () => {
    const { table, chart } = setup();
    const m = buildPieModel(chart, table);
    for (const pie of m.pies) expect(pie.slices.reduce((a, s) => a + s.fraction, 0)).toBeCloseTo(1, 12);
    // The first slice of a clockwise pie that starts at the top begins at the top of the circle.
    const first = m.pies[0];
    const r2 = (v: number) => Math.round(v * 100) / 100;
    expect(first.slices[0].path).toMatch(new RegExp(`^M${r2(first.cx)},${r2(first.cy)}L${r2(first.cx)},${r2(first.cy - first.r)}A`));
    // The pie is not tiny: it fills a good part of its cell.
    expect(first.r).toBeGreaterThan(20);
  });
  it('draws a whole circle when one part has everything, and nothing for a part without a count', () => {
    const { p, table } = setup();
    const edited = setCells(table.id, [{ col: 1, row: 0, value: 0 }])(p);
    const t = edited.dataTables[0];
    const m = buildPieModel(p.charts[0], t);
    expect(m.pies[0].slices[1].path).toBe('');
    expect(m.pies[0].slices[1].text).toBeNull();
    expect(m.pies[0].slices[0].fraction).toBe(1);
    expect(m.pies[0].slices[0].path).toContain('A');
    expect(chartToSvgString(p.charts[0], t)).not.toContain('NaN');
  });
  it('does not draw a row whose counts are negative or add up to zero, and says why', () => {
    const { p, table } = setup();
    const edited = setCells(table.id, [
      { col: 0, row: 0, value: -3 },
      { col: 0, row: 1, value: 0 },
      { col: 1, row: 1, value: 0 },
    ])(p).dataTables[0];
    const m = buildPieModel(p.charts[0], edited);
    expect(m.pies).toHaveLength(0);
    expect(m.warnings.join(' ')).toMatch(/Treated: a count is negative/);
    expect(m.warnings.join(' ')).toMatch(/Control: the counts add up to zero/);
  });
  it('can run the other way and start elsewhere', () => {
    const { p, table } = setup();
    const turned = patchLook(p.charts[0].id, { pie: { ...p.charts[0].pie, direction: 'counterclockwise', startAngle: 90 } })(p).charts[0];
    const a = buildPieModel(p.charts[0], table).pies[0].slices[0].path;
    const b = buildPieModel(turned, table).pies[0].slices[0].path;
    expect(b).not.toBe(a);
    expect(chartToSvgString(turned, table)).not.toContain('NaN');
  });
  it('is a doughnut with a hole whose size is a fraction of the radius, and the total in it', () => {
    const { p, table } = setup('doughnut');
    const shown = patchLook(p.charts[0].id, { pie: { ...p.charts[0].pie, hole: 0.4, showTotal: true } })(p).charts[0];
    const m = buildPieModel(shown, table);
    expect(m.pies[0].rInner).toBeCloseTo(m.pies[0].r * 0.4, 9);
    expect(m.pies[0].totalText).toBe('Total = 50');
    const svg = chartToSvgString(shown, table);
    expect(svg).toContain('>Total = 50</text>');
    // A hole too small for the text leaves it under the pie.
    const tiny = patchLook(p.charts[0].id, { pie: { ...shown.pie, hole: 0.05 } })(p).charts[0];
    expect(buildPieModel(tiny, table).pies[0].totalInHole).toBe(false);
    // The ring: outer and inner arcs, no line to the centre.
    expect(m.pies[0].slices[0].path).not.toContain(`L${m.pies[0].cx},${m.pies[0].cy}`);
  });
  it('writes the labels the chart asks for', () => {
    expect(sliceLabelText('percent', 'Cured', 38, 0.76, 1)).toBe('76.0%');
    expect(sliceLabelText('name-percent', 'Cured', 38, 0.76, 0)).toBe('Cured 76%');
    expect(sliceLabelText('value-percent', 'Cured', 38, 0.76, 1)).toBe('38 (76.0%)');
    expect(sliceLabelText('value', 'Cured', 38, 0.76, 1)).toBe('38');
    expect(sliceLabelText('none', 'Cured', 38, 0.76, 1)).toBeNull();
    expect(percentText(1 / 3, 2)).toBe('33.33%');
  });
  it('lays the pies out in a grid that gives each the most room', () => {
    expect(pieGrid(1, 400, 300)).toMatchObject({ cols: 1, rows: 1, diameter: 300 });
    expect(pieGrid(2, 600, 300)).toMatchObject({ cols: 2, rows: 1 });
    expect(pieGrid(2, 300, 600)).toMatchObject({ cols: 1, rows: 2 });
    expect(pieGrid(4, 400, 400)).toMatchObject({ cols: 2, rows: 2, diameter: 200 });
    // Labels and titles take room from the diameter, and can make another layout the better one.
    expect(pieGrid(2, 280, 250, 50, 20, 24)).toMatchObject({ cols: 1, rows: 2 });
    expect(pieGrid(1, 100, 100, 80, 80, 0).diameter).toBe(0);
  });
  it('closes every slice path and keeps it finite', () => {
    expect(slicePath(50, 50, 40, 0, 0, Math.PI / 2)).toMatch(/^M50,50L50,10A40,40 0 0 1 90,50Z$/);
    expect(slicePath(50, 50, 40, 0, 0, 1.5 * Math.PI)).toContain(' 0 1 1 ');
    expect(slicePath(50, 50, 40, 20, 0, Math.PI / 2)).toMatch(/Z$/);
    expect(slicePath(50, 50, 40, 0, 0, 2 * Math.PI)).not.toContain('NaN');
  });
  it('shows the part, the row and the share in the tooltip', () => {
    const { table, chart } = setup();
    const m = buildPieModel(chart, table);
    const s = m.pies[1].slices[0];
    const lines = pieTooltipLines(m, { kind: 'bar', groupId: s.groupId, objectId: s.id })!;
    expect(lines).toEqual(['Cured', 'Control', 'Count: 21', 'Share: 42.0% of 50']);
  });
});

describe('pie chart', () => {
  it('is drawn with its legend and no axes', () => {
    const { table, chart } = setup();
    const svg = chartToSvgString(chart, table);
    expect(svg).toContain('>Cured</text>');
    expect(svg).toContain('>Control</text>');
    expect(svg).not.toContain('NaN');
    expect(buildPieModel(chart, table).layout.legend).not.toBeNull();
  });
  it('can be switched to a doughnut and back, and keeps its settings in a file', () => {
    const { p } = setup();
    const id = p.charts[0].id;
    let next = patchLook(id, { pie: { ...p.charts[0].pie, labels: 'name-percent', startAngle: 45, hole: 0.3, showTotal: true } })(p);
    next = setChartType(id, 'doughnut')(next);
    expect(next.charts[0].type).toBe('doughnut');
    const back = parseProject(stringifyProject(next));
    expect(back.charts[0].pie).toMatchObject({ labels: 'name-percent', startAngle: 45, hole: 0.3, showTotal: true });
    const text = JSON.parse(stringifyProject(next));
    text.project.charts[0].pie = { labels: 'everything', hole: 5, direction: 'sideways', percentDigits: 99 };
    expect(parseProject(JSON.stringify(text)).charts[0].pie).toMatchObject({ labels: 'percent', hole: 0.9, direction: 'clockwise', percentDigits: 4 });
    delete text.project.charts[0].pie;
    expect(parseProject(JSON.stringify(text)).charts[0].pie.labels).toBe('percent');
  });
});
