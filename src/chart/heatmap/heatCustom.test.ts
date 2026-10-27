import { describe, expect, it } from 'vitest';
import { createChart, createGroupedTable } from '../../model/defaults';
import { HEAT_GRADIENTS } from '../../model/options/heatGradients';
import { DEFAULT_CUSTOM_COLOURS, HEAT_PALETTES, HEAT_PALETTE_GROUPS, isDiverging, sanitizeHeatmap } from '../../model/options/heatmapOptions';
import type { HeatmapOptions, Project } from '../../model/types';
import { patchLook } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { editScale, paletteColour, scalePosition, seedCustom } from './heatColours';
import { buildHeatModel } from './heatmapModel';

const custom = DEFAULT_CUSTOM_COLOURS;

const setup = (patch: Partial<HeatmapOptions> = {}) => {
  const table = createGroupedTable('Grouped', true);
  const chart = createChart(table.id, undefined, 'heatmap');
  chart.heatmap = { ...chart.heatmap, ...patch };
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const opts = (patch: Partial<HeatmapOptions> = {}): HeatmapOptions => setup(patch).chart.heatmap;
/** The colours of the scale as drawn at the two ends and the middle. */
const drawn = (o: HeatmapOptions) => [0, 0.5, 1].map((t) => paletteColour(o.palette, t, o.reverse, o.customColours));

describe('heat palette groups', () => {
  it('put every gradient in exactly one group, in the order of the gradients, with the family dropped from the label', () => {
    const grouped = HEAT_PALETTE_GROUPS.flatMap((g) => g.options.map((p) => p.value));
    expect(grouped.filter((v) => v !== 'custom')).toEqual(HEAT_GRADIENTS.map((p) => p.value));
    expect(new Set(grouped).size).toBe(grouped.length);
    expect(HEAT_PALETTE_GROUPS.slice(0, 3).map((g) => g.label)).toEqual(['GSEA', 'Bootstrap 5', 'Material Design']);
    for (const g of HEAT_PALETTE_GROUPS.slice(0, 3)) {
      for (const p of g.options) expect(HEAT_GRADIENTS.find((x) => x.value === p.value)!.family).toBe(g.label);
    }
    expect(HEAT_PALETTE_GROUPS[0].options).toEqual([{ value: 'gsea', label: 'Default (diverging)' }]);
    expect(HEAT_PALETTE_GROUPS[1].options[0]).toEqual({ value: 'bs-blue', label: 'Blue' });
  });
  it('end with Custom as the last option', () => {
    expect(HEAT_PALETTES.at(-1)).toEqual({ value: 'custom', label: 'Custom' });
    expect(HEAT_PALETTE_GROUPS.at(-1)!.options).toHaveLength(1);
    expect(HEAT_PALETTES.map((p) => p.value)).not.toContain('two');
  });
});

describe('the custom scale', () => {
  it('runs from white to black, and swaps when reversed', () => {
    expect(paletteColour('custom', 0, false, custom)).toBe('#ffffff');
    expect(paletteColour('custom', 1, false, custom)).toBe('#000000');
    expect(paletteColour('custom', 0.5, false, custom)).toBe('#808080');
    expect(paletteColour('custom', 0, true, custom)).toBe('#000000');
    expect(paletteColour('custom', 1, true, custom)).toBe('#ffffff');
  });
  it('uses the colours given, joined in RGB', () => {
    const c = { low: '#ff0000', mid: null, high: '#0000ff' };
    expect([0, 0.5, 1].map((t) => paletteColour('custom', t, false, c))).toEqual(['#ff0000', '#800080', '#0000ff']);
  });
  it('with a middle colour passes exactly through low, mid and high, and is diverging', () => {
    const c = { low: '#2166ac', mid: '#ffffff', high: '#b2182b' };
    expect([0, 0.5, 1].map((t) => paletteColour('custom', t, false, c))).toEqual(['#2166ac', '#ffffff', '#b2182b']);
    expect([0, 0.5, 1].map((t) => paletteColour('custom', t, true, c))).toEqual(['#b2182b', '#ffffff', '#2166ac']);
    expect(isDiverging({ palette: 'custom', customColours: c })).toBe(true);
  });
  it('without a middle colour is not diverging; of the gradients only GSEA is', () => {
    expect(isDiverging({ palette: 'custom', customColours: custom })).toBe(false);
    for (const p of HEAT_GRADIENTS) expect(isDiverging({ palette: p.value as HeatmapOptions['palette'], customColours: custom })).toBe(p.value === 'gsea');
  });
  it('puts the centre value at the middle colour', () => {
    const c = { low: '#2166ac', mid: '#ffffff', high: '#b2182b' };
    const s = { palette: 'custom' as const, reverse: false, lo: -2, hi: 6, centre: 0, custom: c };
    expect(scalePosition(0, s, true)).toBe(0.5);
    expect(paletteColour('custom', scalePosition(0, s, true), false, c)).toBe('#ffffff');
  });
  it('is drawn in the cells, the value labels and the colour bar', () => {
    const { table, chart } = setup({ palette: 'custom', customColours: { low: '#102030', mid: null, high: '#a0b0c0' } });
    const m = buildHeatModel(chart, table);
    const byValue = [...m.cells].sort((a, b) => a.value! - b.value!);
    expect(byValue[0].fill).toBe('#102030');
    expect(byValue[3].fill).toBe('#a0b0c0');
    const near = (a: string, b: string) => [1, 3, 5].every((i) => Math.abs(parseInt(a.slice(i, i + 2), 16) - parseInt(b.slice(i, i + 2), 16)) <= 3);
    expect(near(m.bar!.strips[0].fill, '#a0b0c0')).toBe(true);
    expect(near(m.bar!.strips.at(-1)!.fill, '#102030')).toBe(true);
    expect(m.bar!.diverging).toBe(false);
    expect(byValue[0].textColour).toBe('#ffffff');
  });
  it('with a middle colour draws it at the centre value in the model', () => {
    const { table, chart } = setup({ palette: 'custom', customColours: { low: '#2166ac', mid: '#ffffff', high: '#b2182b' }, centre: 4.65, min: 3.1, max: 6.2 });
    const m = buildHeatModel(chart, table);
    expect(m.bar!.diverging).toBe(true);
    expect(m.cells.find((x) => x.value === 3.1)!.fill).toBe('#2166ac');
    expect(m.cells.find((x) => x.value === 6.5)!.fill).toBe('#b2182b');
  });
});

describe('custom colours in settings', () => {
  const base = opts();
  it('start white to black with no middle, not shared between charts', () => {
    expect(base.customColours).toEqual({ low: '#ffffff', mid: null, high: '#000000' });
    expect(base.customColours).not.toBe(opts().customColours);
  });
  it('fall back slot by slot', () => {
    expect(sanitizeHeatmap({ palette: 'custom', customColours: { low: 'red', mid: '#AABBCC', high: '#112233' } }, base).customColours).toEqual({ low: '#ffffff', mid: '#aabbcc', high: '#112233' });
    expect(sanitizeHeatmap({ customColours: { low: '#445566', mid: 7, high: 3 } }, base).customColours).toEqual({ low: '#445566', mid: null, high: '#000000' });
    expect(sanitizeHeatmap({ customColours: { low: '#445566', mid: 'nope', high: '#778899' } }, base).customColours.mid).toBeNull();
    expect(sanitizeHeatmap({ customColours: { low: '#445566', mid: null, high: '#778899' } }, base).customColours).toEqual({ low: '#445566', mid: null, high: '#778899' });
  });
  it('fall back to the defaults for a missing field, the wrong shapes or the old shape', () => {
    expect(sanitizeHeatmap({}, base).customColours).toEqual(custom);
    for (const bad of [5, null, 'x', [], { two: ['#111111', '#222222'], three: ['#000000', '#111111', '#222222'] }]) {
      expect(sanitizeHeatmap({ customColours: bad }, base).customColours).toEqual(custom);
    }
  });
  it('keep the old gradient names working', () => {
    expect(sanitizeHeatmap({ palette: 'greenred' }, base).palette).toBe('gsea');
  });
  it('survive a file round trip, and old files open with the defaults', () => {
    const { p } = setup();
    const own = { low: '#010203', mid: '#808080', high: '#fafbfc' };
    const next = patchLook(p.charts[0].id, { heatmap: { ...p.charts[0].heatmap, palette: 'custom', customColours: own } })(p);
    expect(parseProject(stringifyProject(next)).charts[0].heatmap).toMatchObject({ palette: 'custom', customColours: own });
    const text = JSON.parse(stringifyProject(next));
    delete text.project.charts[0].heatmap.customColours;
    expect(parseProject(JSON.stringify(text)).charts[0].heatmap.customColours).toEqual(custom);
    text.project.charts[0].heatmap = { palette: 'md-red', min: 1 };
    expect(parseProject(JSON.stringify(text)).charts[0].heatmap).toMatchObject({ palette: 'md-red', min: 1, customColours: custom });
  });
});

describe('turning the scale on screen into a custom scale', () => {
  it('copies the ends of a gradient, with no middle', () => {
    const o = opts({ palette: 'bs-blue' });
    expect(seedCustom(o, false)).toEqual({ palette: 'custom', reverse: false, customColours: { low: paletteColour('bs-blue', 0, false), mid: null, high: paletteColour('bs-blue', 1, false) } });
  });
  it('copies the middle of GSEA, which is diverging', () => {
    const s = seedCustom(opts({ palette: 'gsea' }), true);
    expect(s.customColours.mid).toBe(paletteColour('gsea', 0.5, false));
    expect(isDiverging(s)).toBe(true);
  });
  it('swaps the colours of a reversed gradient and clears reverse', () => {
    const s = seedCustom(opts({ palette: 'bs-blue', reverse: true }), false);
    expect(s.reverse).toBe(false);
    expect(s.customColours.low).toBe(paletteColour('bs-blue', 1, false));
    expect(s.customColours.high).toBe(paletteColour('bs-blue', 0, false));
  });
  it('draws the same colours at 0, 0.5 and 1 before and after when the middle is kept', () => {
    for (const palette of ['bs-blue', 'gsea', 'md-deep-purple'] as const) {
      for (const reverse of [false, true]) {
        const o = opts({ palette, reverse });
        expect(drawn({ ...o, ...seedCustom(o, true) })).toEqual(drawn(o));
      }
    }
  });
  it('keeps the two ends, but not the shades between, of a gradient made a two colour scale', () => {
    for (const reverse of [false, true]) {
      const o = opts({ palette: 'bs-blue', reverse });
      const [a, , c] = drawn(o);
      const after = drawn({ ...o, ...seedCustom(o, false) });
      expect([after[0], after[2]]).toEqual([a, c]);
    }
  });
});

describe('editing a colour of the scale', () => {
  it('on a gradient makes a custom scale with the edit, in one patch', () => {
    const e = editScale(opts({ palette: 'bs-blue' }), 'low', '#ff0000');
    expect(e).toEqual({ palette: 'custom', reverse: false, customColours: { low: '#ff0000', mid: null, high: paletteColour('bs-blue', 1, false) } });
  });
  it('on a reversed gradient changes the end drawn at that side', () => {
    const o = opts({ palette: 'bs-blue', reverse: true });
    const after = { ...o, ...editScale(o, 'low', '#ff0000') };
    expect(drawn(after)[0]).toBe('#ff0000');
    expect(drawn(after)[2]).toBe(paletteColour('bs-blue', 0, false));
  });
  it('on a reversed custom scale keeps reverse and edits the end drawn at that side', () => {
    const o = opts({ palette: 'custom', reverse: true, customColours: { low: '#111111', mid: null, high: '#eeeeee' } });
    const e = editScale(o, 'high', '#00ff00');
    expect(e.reverse).toBe(true);
    expect(e.customColours).toEqual({ low: '#00ff00', mid: null, high: '#eeeeee' });
  });
  it('adds a middle colour to a gradient from the colour at the middle, and removes it again', () => {
    const o = opts({ palette: 'bs-green' });
    const on = { ...o, ...editScale(o, 'mid', paletteColour('bs-green', 0.5, false)) };
    expect(isDiverging(on)).toBe(true);
    expect(drawn(on)).toEqual(drawn(o));
    expect(isDiverging({ ...on, ...editScale(on, 'mid', null) })).toBe(false);
  });
  it('turns GSEA into a two colour scale from its ends when the middle is removed', () => {
    const e = editScale(opts({ palette: 'gsea' }), 'mid', null);
    expect(e.palette).toBe('custom');
    expect(e.customColours).toEqual({ low: paletteColour('gsea', 0, false), mid: null, high: paletteColour('gsea', 1, false) });
  });
  it('on GSEA keeps the middle when an end is edited', () => {
    const e = editScale(opts({ palette: 'gsea' }), 'high', '#000000');
    expect(e.customColours.mid).toBe(paletteColour('gsea', 0.5, false));
    expect(e.customColours.high).toBe('#000000');
  });
});
