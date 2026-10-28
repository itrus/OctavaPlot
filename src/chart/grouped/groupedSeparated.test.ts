import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { galleryItems } from '../../model/graph/chartGallery';
import { applyVariant } from '../../model/graph/chartVariant';
import { FACTOR_GAP } from '../../model/table/factors';
import { xySeries } from '../../model/table/tableLayout';
import type { ChartType, Project } from '../../model/types';
import { addChart, addDataTable, addGroup, patchChart, patchLook, setCells, setFactor } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildGroupedModel } from './groupedModel';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const model = (p: Project) => buildGroupedModel(chartOf(p), tableOf(p));

/** A grouped table of replicates with three series (the sample has two) and the sample's categories; grouped by series when asked. */
const setup = (groupedBy: 'category' | 'series' = 'series', type: ChartType = 'groupedBar'): Project => {
  let p = addDataTable('t', 'grouped', { layout: { kind: 'replicates', n: 2 }, sample: true })(createExampleProject());
  while (xySeries(tableOf(p)).length < 3) p = addGroup('t')(p);
  // Every category row (a title or a value in the first series) gets a value in the added series.
  const categoryRows = tableOf(p).rows.map((_, i) => i).filter((i) => tableOf(p).rows[i].title.trim() !== '' || tableOf(p).groups[0].observations[i].value !== null);
  const filled = xySeries(tableOf(p)).slice(2).flatMap((sr) => sr.columns.flatMap((c, k) => categoryRows.map((row) => ({ col: tableOf(p).groups.findIndex((g) => g.id === c.id), row, value: 5 + row + k + sr.index }))));
  p = setCells('t', filled)(p);
  p = addChart('c', 't', undefined, type)(p);
  return patchLook('c', { groupedBy })(p);
};
/** The centre of the bar of series `si` in category `ci`. */
const centre = (p: Project, si: number, ci: number) => {
  const b = model(p).series[si].bars.find((q) => q.categoryIndex === ci)!;
  return b.x + b.width / 2;
};

describe('separated scatter: the columns grouped by series', () => {
  it('puts the columns of a series together, one for each category, and the series one after another', () => {
    const p = setup();
    const m = model(p);
    const nCat = m.categories.length;
    expect(nCat).toBeGreaterThanOrEqual(2);
    const unit = centre(p, 0, 1) - centre(p, 0, 0);
    expect(unit).toBeGreaterThan(0);
    // Inside a group the columns are one unit apart; between groups there is also the gap.
    expect(centre(p, 0, nCat - 1) - centre(p, 0, 0)).toBeCloseTo(unit * (nCat - 1), 6);
    expect(centre(p, 1, 0) - centre(p, 0, nCat - 1)).toBeCloseTo(unit * (1 + FACTOR_GAP), 6);
    expect(centre(p, 2, 0) - centre(p, 1, nCat - 1)).toBeCloseTo(unit * (1 + FACTOR_GAP), 6);
  });
  it('is the transpose of the usual layout: by category the series stand inside each category, and nothing is added', () => {
    const usual = model(setup('category'));
    expect(usual.axisColumns).toBeUndefined();
    expect(usual.factorLabels).toEqual([]);
    expect(usual.layout.categoryRow).toBeNull();
    const sep = model(setup());
    expect(sep.axisColumns).toBeDefined();
  });
  it('keeps every column inside the plot', () => {
    const m = model(setup());
    const { plot } = m.layout;
    for (const s of m.series) for (const b of s.bars) {
      expect(b.x).toBeGreaterThanOrEqual(plot.x - 1e-6);
      expect(b.x + b.width).toBeLessThanOrEqual(plot.x + plot.width + 1e-6);
    }
  });
  it('has a tick and a category name for each column of each group, the keys all different', () => {
    const m = model(setup());
    const n = m.series.length * m.categories.length;
    expect(m.axisColumns).toHaveLength(n);
    expect(new Set(m.axisColumns!.map((c) => c.key)).size).toBe(n);
    expect(m.axisColumns!.slice(0, m.categories.length).map((c) => c.label)).toEqual(m.categories.map((c) => c.label));
    expect(m.axisColumns![m.categories.length].label).toBe(m.categories[0].label);
  });
  it('writes the name of each series under its group, in a row the plot made room for', () => {
    const p = setup();
    const m = model(p);
    expect(m.layout.categoryRow).not.toBeNull();
    expect(m.factorLabels.map((f) => f.text)).toEqual(m.series.map((s) => s.label));
    m.factorLabels.forEach((f, si) => {
      expect(f.y).toBe(m.layout.categoryRow!.y);
      expect(f.x1).toBeLessThan(centre(p, si, 0));
      expect(f.x2).toBeGreaterThan(centre(p, si, m.categories.length - 1));
    });
    const svg = chartToSvgString(chartOf(p), tableOf(p));
    for (const s of m.series) expect(svg).toContain(`>${s.label}<`);
    expect(svg).not.toContain('NaN');
  });
  it('gives each series its own colour, even where factors are named, and says the factors are not used', () => {
    let p = setup();
    const series = xySeries(tableOf(p));
    p = setFactor('t', [series[0].id, series[2].id], 'A')(p);
    p = setFactor('t', [series[1].id], 'B')(p);
    const m = model(p);
    expect(new Set(m.series.map((s) => s.style.barFill)).size).toBe(3);
    expect(m.warnings.join(' ')).toMatch(/factors of the series are not used while the columns are grouped by series/);
    expect(model(patchLook('c', { groupedBy: 'category' })(p)).warnings.join(' ')).not.toMatch(/not used while/);
  });
  it('applies to the side-by-side types, and leaves stacked bars and lines alone', () => {
    for (const type of ['groupedFloating', 'groupedBox', 'groupedViolin'] as const) expect(model(setup('series', type)).axisColumns).toBeDefined();
    for (const type of ['groupedStacked', 'groupedLine'] as const) expect(model(setup('series', type)).axisColumns).toBeUndefined();
  });
  it('says the names of the series are not written on a horizontal chart', () => {
    const m = model(patchChart('c', { orientation: 'horizontal' })(setup()));
    expect(m.factorLabels).toEqual([]);
    expect(m.warnings.join(' ')).toMatch(/names of the series are not written under their groups on a horizontal chart/);
  });
  it('is kept in the file, and a value that is not a choice reads as by category', () => {
    const p = setup();
    expect(chartOf(parseProject(stringifyProject(p))).groupedBy).toBe('series');
    const bad = JSON.parse(stringifyProject(p));
    (bad.project ?? bad).charts.find((c: { id: string }) => c.id === 'c').groupedBy = 'x';
    expect(chartOf(parseProject(JSON.stringify(bad))).groupedBy).toBe('category');
  });
  it('is offered in the gallery as the dots of each series in a group of columns', () => {
    const item = galleryItems('grouped').find((i) => i.id === 'grp.scatterS');
    expect(item?.type).toBe('groupedBar');
    const made = applyVariant(chartOf(setup('category')), item?.variant);
    expect(made.groupedBy).toBe('series');
    expect(made.layers[0].style.showBars).toBe(false);
  });
});
