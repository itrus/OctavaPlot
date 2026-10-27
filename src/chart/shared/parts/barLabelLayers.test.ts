import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createGroupedTable, DEFAULT_BAR_LABELS } from '../../../model/defaults';
import { layersOf } from '../../../model/graph/layers';
import type { Chart, ChartType, DataTable } from '../../../model/types';
import { chartToSvgString } from '../../export/export';

const labelled = (table: DataTable, type: ChartType, patch: Partial<Chart['barLabels']> = {}): Chart => ({ ...createChart(table.id, undefined, type), barLabels: { ...DEFAULT_BAR_LABELS, show: 'value', ...patch } });
const ids = (svg: string) => [...svg.matchAll(/id="([^"]*-labels-[^"]*)"/g)].map((m) => m[1]);

describe.each([
  ['column', 'bar' as ChartType, createColumnTable('Column', true, 3)],
  ['grouped', 'groupedBar' as ChartType, createGroupedTable('Grouped', true)],
])('the bar labels of a %s chart', (_family, type, table) => {
  it('are one layer for each data set, only when the chart asks for labels', () => {
    const none = layersOf({ ...labelled(table, type), barLabels: { ...DEFAULT_BAR_LABELS, show: 'none', inside: undefined } }, table);
    expect(none.filter((l) => l.kind === 'labels')).toHaveLength(0);
    const on = layersOf(labelled(table, type), table).filter((l) => l.kind === 'labels');
    expect(on.length).toBeGreaterThan(0);
    expect(new Set(on.map((l) => l.binding?.seriesId)).size).toBe(on.length);
    expect(on.every((l) => !l.rangeContribution)).toBe(true);
  });

  it('are drawn with stable ids, and hiding a layer takes out only its labels', () => {
    const chart = labelled(table, type);
    const layers = layersOf(chart, table).filter((l) => l.kind === 'labels');
    const all = ids(chartToSvgString(chart, table));
    expect(all.length).toBeGreaterThan(0);
    expect(ids(chartToSvgString(chart, table))).toEqual(all);
    const hiddenOne = ids(chartToSvgString({ ...chart, hiddenLayerIds: [layers[0].id] }, table));
    const own = (id: string) => id.startsWith(layers[0].id.replace(/[^A-Za-z0-9_.-]/g, '-'));
    expect(all.some(own)).toBe(true);
    expect(hiddenOne.some(own)).toBe(false);
    expect(hiddenOne).toEqual(all.filter((id) => !own(id)));
  });
});
