import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createGroupedTable, DEFAULT_BAR_LABELS } from '../../../model/defaults';
import { resolveBarFill } from '../../../model/graph/fill';
import { sanitizeBarLabels } from '../../../model/options/columnOptions';
import type { BarLabels, DataTable, InsideBarLabel, Project } from '../../../model/types';
import { patchBarLabels, patchLook, patchStyle } from '../../../state/commands';
import { parseProject, stringifyProject } from '../../../state/serialize';
import { buildAnyModel } from '../../anyModel';
import { buildColumnModel } from '../../column/columnModel';
import { chartToSvgString } from '../../export/export';
import { barSeenColour, placeInsideBarLabel, type InsideLabelInput } from './barLabels';
import { contrastColour } from './contrast';

const solid = (color: string, opacity = 1) =>
  resolveBarFill({ barFill: color, barOpacity: opacity, barBorderColor: '#000000', barFillMode: 'solid', barPattern: 'horizontal', barPatternSpacingPt: 8, barPatternWidthPt: 1, barPatternColor: '#000000', barPatternBackground: '#ffffff' });
const input = (patch: Partial<InsideLabelInput> = {}, inside: Partial<InsideBarLabel> = {}): InsideLabelInput => ({
  id: 'g1',
  owner: 'Control',
  cfg: { ...DEFAULT_BAR_LABELS, show: 'value', sizePt: 10 },
  inside: { position: 'end', show: 'n', color: null, ...inside },
  text: '5',
  fontFamily: 'sans-serif',
  x: 50,
  width: 40,
  yEnd: 100,
  yBase: 200,
  horizontal: false,
  fill: solid('#ffffff'),
  page: '#ffffff',
  ...patch,
});

describe('placing the label inside a bar', () => {
  it('goes under the top of a bar that points up, and above its baseline at the base', () => {
    const end = placeInsideBarLabel(input()).label!;
    const base = placeInsideBarLabel(input({}, { position: 'base' })).label!;
    expect(end.y).toBeGreaterThan(100);
    expect(end.y).toBeLessThan(200);
    expect(base.y).toBeLessThan(200);
    expect(base.y).toBeGreaterThan(end.y);
    expect(end.anchor).toBe('middle');
  });
  it('goes above the bottom of a bar that points down, and below its baseline at the base', () => {
    const geom = { yEnd: 300, yBase: 200 };
    const end = placeInsideBarLabel(input(geom)).label!;
    const base = placeInsideBarLabel(input(geom, { position: 'base' })).label!;
    expect(end.y).toBeLessThan(300);
    expect(end.y).toBeGreaterThan(200);
    expect(base.y).toBeGreaterThan(200);
    expect(base.y).toBeLessThan(end.y);
  });
  it('on a horizontal bar starts at the edge and runs inwards, upright', () => {
    // Pointing up in the virtual drawing is to the right on the screen: the text at the end ends against it.
    const right = placeInsideBarLabel(input({ horizontal: true }));
    expect(right.label!.anchor).toBe('end');
    expect(right.label!.y).toBeGreaterThan(100);
    expect(placeInsideBarLabel(input({ horizontal: true }, { position: 'base' })).label).toMatchObject({ anchor: 'start' });
    expect(placeInsideBarLabel(input({ horizontal: true, yEnd: 300, yBase: 200 })).label).toMatchObject({ anchor: 'start' });
  });
  it('is dropped, with the reason and never a smaller font, when the bar is too narrow or too short', () => {
    const narrow = placeInsideBarLabel(input({ width: 6, text: '1234' }));
    expect(narrow.label).toBeNull();
    expect(narrow.warning).toMatch(/Control.*too narrow.*"1234".*10 pt/);
    const short = placeInsideBarLabel(input({ yEnd: 195 }));
    expect(short.label).toBeNull();
    expect(short.warning).toMatch(/Control.*too short/);
    // Horizontal: the length must hold the width of the text, the thickness its height.
    expect(placeInsideBarLabel(input({ horizontal: true, width: 8 })).warning).toMatch(/too thin/);
    expect(placeInsideBarLabel(input({ horizontal: true, text: '123456789', yEnd: 180 })).warning).toMatch(/too short/);
  });
  it('takes black or white by the bar as seen, or the colour that was chosen', () => {
    expect(placeInsideBarLabel(input({ fill: solid('#101010') })).label!.color).toBe('#ffffff');
    expect(placeInsideBarLabel(input({ fill: solid('#f0f0a0') })).label!.color).toBe('#000000');
    expect(placeInsideBarLabel(input({ fill: solid('#101010') }, { color: '#aa0000' })).label!.color).toBe('#aa0000');
    // A dark fill that is mostly transparent is seen as nearly the page.
    expect(barSeenColour(solid('#000000', 0.1), '#ffffff')).toBe('#e6e6e6');
    expect(placeInsideBarLabel(input({ fill: solid('#000000', 0.1) })).label!.color).toBe('#000000');
    expect(placeInsideBarLabel(input({ fill: solid('#000000', 0.1), page: '#000000' })).label!.color).toBe('#ffffff');
    expect(contrastColour('#ffffff')).toBe('#000000');
  });
  it('uses the background of a pattern, or the page when it has none', () => {
    const pattern = { ...solid('#ffffff'), mode: 'pattern' as const, patternColor: '#ffffff' };
    expect(placeInsideBarLabel(input({ fill: { ...pattern, background: '#202020' } })).label!.color).toBe('#ffffff');
    expect(placeInsideBarLabel(input({ fill: { ...pattern, background: null } })).label!.color).toBe('#000000');
    expect(placeInsideBarLabel(input({ fill: { ...pattern, background: null }, page: '#000000' })).label!.color).toBe('#ffffff');
  });
});

const column = (mutate?: (t: DataTable) => void) => {
  const table = createColumnTable('Data', true);
  mutate?.(table);
  const chart = createChart(table.id, undefined, 'bar');
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, id: chart.id };
};
const inside = (show: 'none' | 'n' | 'value', position: 'end' | 'base' = 'end', color: string | null = null): InsideBarLabel => ({ show, position, color });

describe('labels inside bars on column charts', () => {
  it('are absent by default: the model, the drawing and the saved file are as before', () => {
    const { p, table } = column();
    expect(p.charts[0].barLabels).toEqual(DEFAULT_BAR_LABELS);
    expect('inside' in p.charts[0].barLabels).toBe(false);
    expect(buildColumnModel(p.charts[0], table).groups.every((g) => !g.insideLabel)).toBe(true);
    const outside = patchBarLabels(p.charts[0].id, { show: 'value' })(p);
    const same = patchBarLabels(p.charts[0].id, { inside: inside('n') })(outside);
    const off = patchBarLabels(p.charts[0].id, { inside: inside('none') })(same);
    expect(chartToSvgString(off.charts[0], table)).toBe(chartToSvgString(outside.charts[0], table));
    expect(stringifyProject(off)).toBe(stringifyProject(outside));
  });
  it('put n at the base and the value beyond the end at once, each in its place', () => {
    const { p, table, id } = column();
    const on = patchBarLabels(id, { show: 'value', decimals: 1, sizePt: 10, inside: inside('n', 'base') })(p).charts[0];
    const m = buildColumnModel(on, table);
    for (const g of m.groups) {
      expect(g.insideLabel!.text).toBe(String(g.stats.n));
      expect(g.barLabel!.text).not.toBe(g.insideLabel!.text);
      const bar = g.bar!;
      // The bar points up: the base text is just above the baseline, the value above the top.
      expect(g.insideLabel!.y).toBeLessThanOrEqual(bar.y + bar.height);
      expect(g.insideLabel!.y).toBeGreaterThan(bar.y + bar.height - 20);
      expect(g.barLabel!.y).toBeLessThan(bar.y);
    }
    const svg = chartToSvgString(on, table);
    expect(svg).toContain(`>${m.groups[0].insideLabel!.text}</text>`);
    expect(m.groups[0].insideLabel!.id).toBe(`${m.groups[0].groupId}:label-in`);
  });
  it('sit against the bottom end of a negative bar and above its baseline-side edge', () => {
    const { p, table, id } = column((t) =>
      t.groups.forEach((g) =>
        g.observations.forEach((o) => {
          if (o.value !== null) o.value = -o.value;
        }),
      ),
    );
    const on = patchBarLabels(id, { sizePt: 10, inside: inside('n', 'end') })(p).charts[0];
    const m = buildColumnModel(on, table);
    for (const g of m.groups) {
      const bar = g.bar!;
      expect(g.insideLabel).toBeTruthy();
      // Points down: the end is the bottom edge, and the text is inside, above it.
      expect(g.insideLabel!.y).toBeLessThan(bar.y + bar.height);
      expect(g.insideLabel!.y).toBeGreaterThan(bar.y);
    }
    const base = buildColumnModel(patchBarLabels(id, { sizePt: 10, inside: inside('n', 'base') })(p).charts[0], table);
    for (const g of base.groups) expect(g.insideLabel!.y).toBeGreaterThan(g.bar!.y);
  });
  it('on a horizontal chart read along the bar, from the screen edge it is set against', () => {
    const { p, table, id } = column();
    const h = patchLook(id, { orientation: 'horizontal' })(patchBarLabels(id, { sizePt: 10, inside: inside('n', 'base') })(p)).charts[0];
    const m = buildColumnModel(h, table);
    for (const g of m.groups) {
      expect(g.insideLabel!.anchor).toBe('start');
      const at = m.orient.toScreen(g.insideLabel!.x, g.insideLabel!.y);
      const baseX = m.orient.toScreen(0, m.yScale(0)).x;
      expect(at.x).toBeGreaterThan(baseX);
    }
    expect(chartToSvgString(h, table)).toContain('text-anchor="start"');
    const end = buildColumnModel(patchBarLabels(id, { inside: inside('n', 'end') })(patchLook(id, { orientation: 'horizontal' })(p)).charts[0], table);
    for (const g of end.groups) expect(g.insideLabel!.anchor).toBe('end');
  });
  it('are left out of a narrow bar, with a note that names the group', () => {
    const { p, table, id } = column();
    const wide = patchBarLabels(id, { sizePt: 40, inside: inside('value') })(p).charts[0];
    const m = buildColumnModel(wide, table);
    const dropped = m.groups.filter((g) => !g.insideLabel);
    expect(dropped.length).toBeGreaterThan(0);
    for (const g of dropped) expect(m.warnings.join('\n')).toContain(`The label inside the bar of ${g.label} is not drawn`);
    expect(m.warnings.join('\n')).toMatch(/too (narrow|short)/);
    const small = buildColumnModel(patchBarLabels(id, { sizePt: 8, inside: inside('n') })(p).charts[0], table);
    expect(small.warnings.join('\n')).not.toContain('label inside the bar');
  });
  it('take their colour from the pattern background of a patterned bar', () => {
    const { p, table, id } = column();
    const base = patchBarLabels(id, { sizePt: 10, inside: inside('n') })(p);
    const dark = patchStyle(id, 'all', { barFillMode: 'pattern', barFill: '#ffffff', barPatternBackground: '#101010', barPatternColor: '#ffffff' })(base).charts[0];
    const light = patchStyle(id, 'all', { barFillMode: 'pattern', barFill: '#000000', barPatternBackground: '#f5f5f5', barPatternColor: '#000000' })(base).charts[0];
    expect(buildColumnModel(dark, table).groups[0].insideLabel!.color).toBe('#ffffff');
    expect(buildColumnModel(light, table).groups[0].insideLabel!.color).toBe('#000000');
    const manual = patchBarLabels(id, { inside: inside('n', 'end', '#aa0000') })(patchStyle(id, 'all', { barFillMode: 'pattern', barPatternBackground: '#101010' })(base)).charts[0];
    expect(buildColumnModel(manual, table).groups[0].insideLabel!.color).toBe('#aa0000');
  });
  it('are not drawn where there is no bar', () => {
    const { p, table, id } = column();
    const hidden = patchStyle(id, 'all', { showBars: false })(patchBarLabels(id, { inside: inside('n') })(p)).charts[0];
    expect(buildColumnModel(hidden, table).groups.every((g) => !g.insideLabel)).toBe(true);
  });
});

describe('labels inside bars on grouped bars', () => {
  it('give each side by side bar the n of its own cell', () => {
    const table = createGroupedTable('Grouped', true, { kind: 'replicates', n: 3 });
    const chart = createChart(table.id, undefined, 'groupedBar');
    const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    const on = patchBarLabels(chart.id, { show: 'value', sizePt: 10, inside: inside('n', 'base') })(p).charts[0];
    const any = buildAnyModel(on, table);
    const bars = any.family === 'grouped' ? any.model.series.flatMap((s) => s.bars) : [];
    expect(bars.length).toBeGreaterThan(0);
    for (const b of bars) {
      expect(b.insideLabel).toBeTruthy();
      expect(b.insideLabel!.text).toBe(String(b.stats!.n));
      expect(b.insideLabel!.text).toBe(b.label ? String(b.stats!.n) : '');
    }
    expect(chartToSvgString(on, table)).toContain(`>${bars[0].insideLabel!.text}</text>`);
    const none = buildAnyModel(chart, table);
    expect((none.family === 'grouped' ? none.model.series.flatMap((s) => s.bars) : []).every((b) => !b.insideLabel)).toBe(true);
  });
});

describe('the inside label in files', () => {
  const raw = (inner: unknown): BarLabels => sanitizeBarLabels({ show: 'value', inside: inner }, DEFAULT_BAR_LABELS);
  it('is sanitised: a bad value falls back, a switched off default is not kept', () => {
    expect(raw({ position: 'base', show: 'n', color: '#00aa00' }).inside).toEqual({ position: 'base', show: 'n', color: '#00aa00' });
    expect(raw({ position: 'middle', show: 'n', color: 'red' }).inside).toEqual({ position: 'end', show: 'n', color: null });
    expect(raw({ position: 'base', show: 'everything' }).inside).toEqual({ position: 'base', show: 'none', color: null });
    expect(raw('nonsense').inside).toBeUndefined();
    expect(raw({}).inside).toBeUndefined();
    expect('inside' in sanitizeBarLabels({ show: 'value' }, DEFAULT_BAR_LABELS)).toBe(false);
  });
  it('survives a round trip, and an old file opens with none', () => {
    const { p } = column();
    const next = patchBarLabels(p.charts[0].id, { show: 'value', inside: inside('n', 'base', '#112233') })(p);
    expect(parseProject(stringifyProject(next)).charts[0].barLabels.inside).toEqual({ position: 'base', show: 'n', color: '#112233' });
    const text = JSON.parse(stringifyProject(p));
    expect('inside' in text.project.charts[0].barLabels).toBe(false);
    expect(parseProject(JSON.stringify(text)).charts[0].barLabels.inside).toBeUndefined();
    text.project.charts[0].barLabels.inside = { position: 7, show: 'value' };
    expect(parseProject(JSON.stringify(text)).charts[0].barLabels.inside).toEqual({ position: 'end', show: 'value', color: null });
  });
});
