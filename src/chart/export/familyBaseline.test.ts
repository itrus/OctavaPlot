import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable, createContingencyTable, createGroupedTable } from '../../model/defaults';
import type { Chart, ChartType, DataTable, Project } from '../../model/types';
import { addAnnotation, addReferenceLine, patchAxis, patchBarLabels, patchChart, patchStyle, patchSummary, setLayerHidden } from '../../state/commands';
import { chartToSvgString } from './export';
import { layersOf } from '../../model/graph/layers';

/**
 * A record of what the column, grouped, histogram, pie and heat map families draw today, for many setups, as a hash of the SVG of
 * each (`__snapshots__/family-baseline.json`). It was written before the parts of these families were given looks of their own and
 * a range switch, and it says that with no new look and no part kept out of the range, the drawing has not changed by a single
 * character. Never regenerate it to make a test pass: a change of drawing has to be decided and explained first.
 */
type Setup = { name: string; table: DataTable; type: ChartType; edit: Array<(chartId: string) => (p: Project) => Project> };

const sha = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 24);

/** The ids of a table are random and the marks are named from them, so they are fixed here to compare one run with another. */
const frozen = (t: DataTable, id: string): DataTable => ({
  ...t,
  id,
  rows: t.rows.map((r, i) => ({ ...r, id: `${id}_row${i}` })),
  groups: t.groups.map((g, gi) => ({ ...g, id: `${id}_g${gi}`, observations: g.observations.map((o, ri) => ({ ...o, id: `${id}_o${gi}_${ri}` })) })),
});
const columnTable = frozen(createColumnTable('Column', true, 3), 'tc');
const groupedSingle = frozen(createGroupedTable('Grouped', true), 'tg');
const groupedRep = frozen(createGroupedTable('Grouped reps', true, { kind: 'replicates', n: 4 }), 'tr');
const contingency = frozen(createContingencyTable('Counts', true), 'tn');

const style = (patch: Parameters<typeof patchStyle>[2]) => (id: string) => patchStyle(id, 'all', patch);
const note = (id: string) => addAnnotation(id, { id: 'note1', text: 'p < 0.05', xFrac: 0.4, yFrac: 0.2, fontSizePt: 10, color: '#000000', opacity: 1 });
const line = (id: string) => addReferenceLine(id, { id: 'ref1', axis: 'y', value: 5, color: '#cc0000', widthPt: 1, style: 'dashed', opacity: 1, label: 'cut-off' } as never);
const hideFirst = (kind: string) => (id: string) => (p: Project): Project => {
  const chart = p.charts.find((c) => c.id === id)!;
  const table = p.dataTables.find((t) => t.id === chart.dataTableId)!;
  const layer = layersOf(chart, table).find((l) => l.kind === kind);
  return layer ? setLayerHidden(id, layer.id, true)(p) : p;
};

const setups: Setup[] = [];
const add = (name: string, table: DataTable, type: ChartType, ...edit: Setup['edit']) => setups.push({ name: `${type}-${name}`, table, type, edit });
const sd = (id: string) => patchSummary(id, 'all', { spread: 'sd' });

for (const type of ['bar', 'scatter', 'mean', 'box', 'floating', 'paired', 'violin'] as const) {
  add('default', columnTable, type);
  add('all-parts', columnTable, type, sd, style({ showErrorBars: true, showMeanLine: true, showSymbols: true, showLines: true }));
  add('no-symbols', columnTable, type, sd, style({ showSymbols: false, showBars: false }));
  add('on-top', columnTable, type, sd, style({ showErrorBars: true, showMeanLine: true, showSymbols: true, showLines: true }), (id) => patchChart(id, { lineOrder: 'onTop' }));
  add('underneath', columnTable, type, sd, style({ showErrorBars: true, showMeanLine: true, showSymbols: true, showLines: true }), (id) => patchChart(id, { lineOrder: 'underneath' }));
  add('notes', columnTable, type, sd, note, line, (id) => patchBarLabels(id, { show: 'value' }));
  add('hidden', columnTable, type, sd, style({ showErrorBars: true, showSymbols: true }), hideFirst('errorBars'), hideFirst('points'));
}
for (const type of ['bar', 'scatter', 'mean', 'box'] as const) {
  add('horizontal', columnTable, type, sd, style({ showErrorBars: true }), (id) => patchChart(id, { orientation: 'horizontal' }));
}
add('log', columnTable, 'bar', sd, style({ showErrorBars: true }), (id) => patchAxis(id, 'yAxis', { scale: 'log10' } as never));

for (const type of ['groupedBar', 'groupedStacked', 'groupedFloating', 'groupedLine'] as const) {
  add('single', groupedSingle, type);
  add('single-notes', groupedSingle, type, note, line, (id) => patchBarLabels(id, { show: 'value' }));
  add('reps', groupedRep, type, sd, style({ showErrorBars: true, showSymbols: true, showMeanLine: true, showLines: true }));
  add('reps-no-symbols', groupedRep, type, sd, style({ showSymbols: false }));
  add('reps-hidden', groupedRep, type, sd, style({ showErrorBars: true, showSymbols: true }), hideFirst('errorBars'), hideFirst('rawPoints'));
  add('reps-on-top', groupedRep, type, sd, style({ showErrorBars: true, showSymbols: true }), (id) => patchChart(id, { lineOrder: 'onTop' }));
}
for (const type of ['groupedBox', 'groupedViolin'] as const) {
  add('reps', groupedRep, type);
  add('reps-no-symbols', groupedRep, type, style({ showSymbols: false }));
  add('reps-hidden', groupedRep, type, hideFirst('bars'));
}

for (const type of ['histogram', 'ecdf'] as const) {
  add('default', columnTable, type);
  add('lines', columnTable, type, style({ showSymbols: true, showLines: true }), note, line);
  add('on-top', columnTable, type, style({ showSymbols: true, showLines: true }), (id) => patchChart(id, { lineOrder: 'onTop' }));
  add('hidden', columnTable, type, hideFirst('bars'), hideFirst('line'));
}

for (const type of ['pie', 'doughnut'] as const) {
  add('default', contingency, type);
  add('notes', contingency, type, note, (id) => patchChart(id, { pie: { ...createChart('x', undefined, type).pie, labels: 'percent', showTotal: true } }));
  add('hidden', contingency, type, hideFirst('labels'));
}
add('default', groupedSingle, 'heatmap');
add('values', groupedSingle, 'heatmap', note, (id) => patchChart(id, { heatmap: { ...createChart('x', undefined, 'heatmap').heatmap, showValues: true, colourbar: true } }));
add('hidden', groupedSingle, 'heatmap', hideFirst('colourBar'));
add('reps', groupedRep, 'heatmap');

const svgOf = (s: Setup): string => {
  const chart: Chart = { ...createChart(s.table.id, undefined, s.type), id: 'chart1' };
  let p: Project = { id: 'p', name: 'p', dataTables: [s.table], charts: [chart] };
  for (const e of s.edit) p = e(chart.id)(p);
  return chartToSvgString(p.charts[0], p.dataTables[0]);
};

const file = resolve(__dirname, '__snapshots__', 'family-baseline.json');

describe('the drawing of the column, grouped, histogram, pie and heat map families', () => {
  it('has a record of many setups', () => {
    expect(setups.length).toBeGreaterThan(100);
    expect(new Set(setups.map((s) => s.name)).size).toBe(setups.length);
  });

  it('is the same as when the record was made, for every setup', () => {
    const now: Record<string, string> = {};
    for (const s of setups) now[s.name] = sha(svgOf(s));
    if (!existsSync(file)) {
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, `${JSON.stringify(now, null, 1)}\n`);
    }
    const recorded = JSON.parse(readFileSync(file, 'utf8')) as Record<string, string>;
    expect(Object.keys(now).sort()).toEqual(Object.keys(recorded).sort());
    const changed = Object.keys(now).filter((k) => now[k] !== recorded[k]);
    expect(changed).toEqual([]);
  });

  it('is deterministic', () => {
    for (const s of setups.slice(0, 20)) expect(sha(svgOf(s))).toBe(sha(svgOf(s)));
  });
});
