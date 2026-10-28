import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import type { Project } from '../../model/types';
import { addAnnotation, addBracket, addChart, addDataTable, patchAxis, patchChart } from '../../state/commands';
import { buildAnyModel, chartTexts } from '../anyModel';
import { measureText } from '../shared/parts/text';
import { chartToSvgString } from './export';

const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const svg = (p: Project) => chartToSvgString(chartOf(p), tableOf(p));
const base = (): Project => addChart('c', 't', undefined, 'bar')(addDataTable('t', 'column', { sample: true })(createExampleProject()));
const titled = (title: string) => patchChart('c', { title, showTitle: true })(base());

describe('rich text in a figure', () => {
  it('writes a subscript in the title as a smaller, lowered piece, and brings the rest back', () => {
    const out = svg(titled('H_{2}O flux'));
    expect(out).toContain('>H<tspan font-size="70%" dy="0.4em">2</tspan><tspan dy="-0.28em">O flux</tspan><');
  });
  it('writes a superscript in an axis title, and a Greek letter written by name', () => {
    const p = patchAxis('c', 'yAxis', { title: 'Rate (\\mu mol m^{-2} s^{-1})', titleVisible: true })(base());
    const out = svg(p);
    expect(out).toContain('Rate (μ mol m');
    expect(out).toContain('<tspan font-size="70%" dy="-0.571em">-2</tspan>');
    expect(out).not.toContain('\\mu');
  });
  it('does not change text without markup, whatever characters it has: the same output as before', () => {
    const out = svg(titled('Mouse_3 vs Run_2 (a^2, H_2O)'));
    expect(out).toContain('>Mouse_3 vs Run_2 (a^2, H_2O)<');
    expect(out).not.toContain('70%');
  });
  it('works in the names of the data sets (the category labels and the legend)', () => {
    const p0 = base();
    let p = p0;
    p = { ...p, dataTables: p.dataTables.map((t) => (t.id === 't' ? { ...t, groups: t.groups.map((g, i) => (i === 0 ? { ...g, name: 'CO_{2}' } : g)) } : t)) };
    expect((svg(p).match(/<tspan font-size="70%" dy="0.4em">2<\/tspan>/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
  it('works in annotations, in the labels of comparison brackets and in reference lines', () => {
    let p = base();
    p = addAnnotation('c', { id: 'a1', text: 'n = 10^{3}', xFrac: 0.4, yFrac: 0.08, fontSizePt: 28, color: '#000000', opacity: 1 })(p);
    const [a, b] = tableOf(p).groups.map((g) => g.id);
    p = addBracket('c', { id: 'b1', from: a, to: b, label: 'p_{adj} = 0.01', color: '#000000', widthPt: 2, fontSizePt: 24 })(p);
    const out = svg(p);
    expect(out).toContain('<tspan font-size="70%" dy="-0.571em">3</tspan>');
    expect(out).toContain('<tspan font-size="70%" dy="0.4em">adj</tspan>');
  });
  it('measures text as it is written: scripts count at their smaller size and the markup characters count for nothing', () => {
    // Without a canvas (the tests) a glyph is a fixed share of the size, so the width is the sum of the pieces: H and O at 20, the 2 at 14.
    const w = measureText('H_{2}O', 20);
    expect(w).toBeCloseTo(measureText('H', 20) + measureText('2', 14) + measureText('O', 20), 9);
    expect(w).toBeLessThan(measureText('H_{2}O'.replace(/[{}_]/g, ''), 20) + 1e-9);
    expect(measureText('\\mu m', 20)).toBeCloseTo(measureText('μ m', 20), 9);
    // Text without markup is measured as before.
    expect(measureText('Mouse_3', 20)).toBeCloseTo(7 * 20 * 0.54, 9);
  });
  it('makes room for the written width in the layout, not for the markup: a marked-up legend name is narrower than the same text at full size', () => {
    const named = (name: string): Project => {
      const p = base();
      return { ...p, dataTables: p.dataTables.map((t) => (t.id === 't' ? { ...t, groups: t.groups.map((g, i) => (i === 0 ? { ...g, name } : g)) } : t)) };
    };
    const width = (name: string) => buildAnyModel(chartOf(named(name)), tableOf(named(name))).model.layout.plot.width;
    // The legend is on the right: the wider its widest name, the narrower the plot.
    expect(width('X_{subscript subscript subscript}')).toBeGreaterThan(width('Xsubscript subscript subscript'));
    // The same text without markup keeps its full width.
    expect(width('Xsubscript subscript subscript')).toBeCloseTo(width('X_subscript subscript subscript'.replace('_', '')), 6);
  });
  it('gives the glyph check the characters that are drawn, not the markup', () => {
    const p = titled('\\mu{}m and E_{\\alpha}');
    const texts = chartTexts(chartOf(p), buildAnyModel(chartOf(p), tableOf(p)));
    const joined = texts.join('|');
    expect(joined).toContain('μm and E');
    expect(joined).toContain('α');
    expect(joined).not.toContain('\\mu');
    expect(joined).not.toContain('E_{');
  });
  it('draws no number that is not a number', () => {
    expect(svg(titled('x_{i}^{2} \\Delta{}t'))).not.toContain('NaN');
  });
});
