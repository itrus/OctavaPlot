import { describe, expect, it } from 'vitest';
import { galleryItems } from '../../model/graph/chartGallery';
import { applyVariant } from '../../model/graph/chartVariant';
import { createChart, createGroupedTable } from '../../model/defaults';
import type { ChartType } from '../../model/types';
import { chartToSvgString } from '../export/export';
import { buildGroupedModel } from './groupedModel';

const table = createGroupedTable('Replicates', true, { kind: 'replicates', n: 5 });
const build = (type: ChartType) => {
  const chart = createChart(table.id, undefined, type);
  return { chart, model: buildGroupedModel(chart, table) };
};

describe('grouped box plots', () => {
  it('draws one box for each series in each category, side by side inside the category', () => {
    const { model } = build('groupedBox');
    const [a, b] = model.series;
    expect(a.bars).toHaveLength(model.categories.length);
    expect(b.bars).toHaveLength(model.categories.length);
    const [boxA, boxB] = [a.bars[0].dist!, b.bars[0].dist!];
    expect(boxA.kind).toBe('box');
    expect(boxA.rect!.x + boxA.rect!.width).toBeLessThanOrEqual(boxB.rect!.x + 1e-6);
    // The box lies on the median of its values, and the axis holds the whiskers.
    expect(model.y.domain[0]).toBeLessThanOrEqual(Math.min(...a.bars.map((x) => x.value)));
  });
  it('has no error bars and no bar labels', () => {
    const { model } = build('groupedBox');
    expect(model.series.every((s) => s.errorPath === '' && s.bars.every((b) => !b.label))).toBe(true);
  });
  it('exports to SVG', () => {
    const { chart } = build('groupedBox');
    expect(chartToSvgString(chart, table)).toContain('<svg');
  });
});

describe('grouped violins', () => {
  it('draws one outline for each series in each category, with the values as dots', () => {
    const { model } = build('groupedViolin');
    const [a] = model.series;
    expect(a.bars.every((b) => b.dist?.kind === 'violin')).toBe(true);
    expect(a.dots.length).toBeGreaterThan(0);
  });
});

describe('box plots and violins need replicates', () => {
  it('say so and draw nothing for single values', () => {
    const single = createGroupedTable('Single', true);
    const m = buildGroupedModel(createChart(single.id, undefined, 'groupedBox'), single);
    expect(m.series.every((s) => s.bars.length === 0)).toBe(true);
    expect(m.warnings.join(' ')).toMatch(/replicate/i);
  });
});

describe('grouped scatter', () => {
  const item = galleryItems('grouped').find((i) => i.id === 'grp.scatterI')!;
  it('is the grouped bars with the bars off and a line at each value', () => {
    const chart = applyVariant(createChart(table.id, undefined, item.type!), item.variant);
    expect(chart.layers[0].style.showBars).toBe(false);
    const m = buildGroupedModel(chart, table);
    expect(m.series[0].dots.length).toBeGreaterThan(0);
    expect(m.series[0].bars.every((b) => !!b.centerLine)).toBe(true);
  });
  it('keeps the bars of the plain grouped bar chart', () => {
    const m = buildGroupedModel(createChart(table.id, undefined, 'groupedBar'), table);
    expect(m.series[0].bars.every((b) => !b.centerLine)).toBe(true);
  });
});
