import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { buildAnyModel, drawingOf } from '../anyModel';
import { el } from '../shared/scene/sceneElement';
import { layoutMasterLegend, legendEntriesOf, mergeLegendEntries, type LegendEntry } from './masterLegend';

const entry = (label: string, over: Partial<LegendEntry> = {}): LegendEntry => ({
  panel: 0,
  label,
  signature: label,
  fontFamily: 'Arial',
  fontSizePt: 10,
  keyPt: 46,
  nameWidthPt: 50,
  originX: 100,
  originY: 200,
  nodes: [],
  ...over,
});

describe('the entries of a graph legend', () => {
  it('are read from the legend of the drawing: name, key and where the entry stands', () => {
    const p = createExampleProject();
    const c = p.charts[0];
    const entries = legendEntriesOf(c, drawingOf(c, buildAnyModel(c, p.dataTables[0])), 3);
    expect(entries.map((e) => e.label)).toEqual(['Group A', 'Group B', 'Group C', 'Group D']);
    expect(entries.every((e) => e.panel === 3 && e.fontSizePt === c.legend.fontSizePt && e.fontFamily === c.fontFamily)).toBe(true);
    // the entries of one legend stand one under the other at one x
    expect(new Set(entries.map((e) => e.originX)).size).toBe(1);
    expect(entries[1].originY).toBeGreaterThan(entries[0].originY);
  });
  it('are none for a drawing without a legend', () => {
    const p = createExampleProject();
    const c = { ...p.charts[0], legend: { ...p.charts[0].legend, visible: false } };
    expect(legendEntriesOf(c, drawingOf(c, buildAnyModel(c, p.dataTables[0])), 0)).toEqual([]);
  });
  it('have one look for a key at two places, and another for another colour', () => {
    const p = createExampleProject();
    const c = p.charts[0];
    const key = (x: number, fill: string) => el('rect', [['x', x], ['y', 5], ['width', 36], ['height', 10], ['fill', fill]]);
    const drawing = (x: number, fill: string) => ({ widthPt: 1, heightPt: 1, sections: [{ nodes: [el('g', [], { id: 'legend', children: [el('g', [], { children: [key(x, fill), el('text', [['x', x + 46], ['y', 10], ['font-size', 9], ['fill', '#000']], { text: 'Control' })] })] })] }] });
    const [a, b, other] = [legendEntriesOf(c, drawing(10, '#ff0000'), 0)[0], legendEntriesOf(c, drawing(300, '#ff0000'), 1)[0], legendEntriesOf(c, drawing(10, '#0000ff'), 1)[0]];
    expect(a.signature).toBe(b.signature);
    expect(a.signature).not.toBe(other.signature);
    expect(a.originX).toBe(10);
    expect(b.originX).toBe(300);
    expect(mergeLegendEntries([[a], [b, other]]).map((e) => e.panel)).toEqual([0, 1]);
  });
});

describe('setting out a master legend', () => {
  it('puts the entries in a row with a 28 pt gap, at the text size of the page', () => {
    // At the size of the graph: key and name 46 + 50 = 96 pt each. At 20 pt (twice the graph's 10 pt) 192 pt each.
    const laid = layoutMasterLegend([entry('a'), entry('b')], 20, 'bottom', 1000);
    expect(laid.items.map((i) => [i.x, i.y, i.scale])).toEqual([[0, 15.5, 2], [220, 15.5, 2]]);
    expect(laid.widthPt).toBe(412);
    expect(laid.heightPt).toBe(31);
  });
  it('wraps into a new row where the next entry would pass the width, and keeps an entry that alone is too wide', () => {
    const laid = layoutMasterLegend([entry('a'), entry('b'), entry('c')], 10, 'bottom', 200);
    // 96 pt each; two take 96 + 28 + 96 = 220 > 200, so one to a row
    expect(laid.items.map((i) => [i.x, i.y])).toEqual([[0, 7.75], [0, 23.25], [0, 38.75]]);
    expect(laid.heightPt).toBe(46.5);
    expect(layoutMasterLegend([entry('a', { nameWidthPt: 900 })], 10, 'bottom', 200).items).toHaveLength(1);
  });
  it('puts one entry in each row on the right, the width that of the widest', () => {
    const laid = layoutMasterLegend([entry('a'), entry('b', { nameWidthPt: 80 })], 10, 'right', 1000);
    expect(laid.items.map((i) => [i.x, i.y])).toEqual([[0, 7.75], [0, 23.25]]);
    expect(laid.widthPt).toBe(126);
    expect(laid.heightPt).toBe(31);
  });
  it('is empty without entries', () => {
    expect(layoutMasterLegend([], 10, 'bottom', 100)).toEqual({ items: [], widthPt: 0, heightPt: 0 });
  });
});
