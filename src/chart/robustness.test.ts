import { describe, expect, it } from 'vitest';
import { CHART_TYPES, supportsHorizontal } from '../model/chartTypes';
import { createChart, createColumnTable, createContingencyTable, createGroupedTable, createSurvivalTable, createXyTable } from '../model/defaults';
import { NO_FIT_SETTINGS } from '../model/fitOptions';
import { FIT_MODELS } from '../stats/fit';
import type { Chart, DataTable, FitSettings, TableKind } from '../model/types';
import { buildAnyModel } from './anyModel';
import { chartToSvgString } from './export';

/**
 * Every chart type against awkward data and awkward settings: whatever the data, the drawing must be made, with no
 * NaN or Infinity in it. (A chart with nothing to show draws an empty plot, and says so in its notices.)
 */

type Scenario = { name: string; fill: (v: number, i: number, row: number) => number | null };

const SCENARIOS: Scenario[] = [
  { name: 'no values', fill: () => null },
  { name: 'one value', fill: (_v, i, row) => (i === 0 && row === 0 ? 4 : null) },
  { name: 'all equal', fill: () => 7 },
  { name: 'negative', fill: (v) => -Math.abs(v) - 1 },
  { name: 'zeros', fill: () => 0 },
  { name: 'huge', fill: (v, i) => (i % 2 === 0 ? 1e300 : -1e300) * (1 + v / 100) },
  { name: 'tiny', fill: (v) => 1e-300 * (v + 1) },
  { name: 'spread', fill: (v, i, row) => (row % 2 ? v * 10 : v / 10) + i },
];

const TABLES: Record<TableKind, () => DataTable> = {
  column: () => createColumnTable('Column', true),
  xy: () => createXyTable('XY', true),
  grouped: () => createGroupedTable('Grouped', true),
  contingency: () => createContingencyTable('Contingency', true),
  survival: () => createSurvivalTable('Survival', true),
};

/** The table with every value replaced by the scenario's (the first column of an XY or survival table is its X or time). */
function withScenario(table: DataTable, s: Scenario): DataTable {
  const first = table.kind === 'xy' || table.kind === 'survival' ? 1 : 0;
  return {
    ...table,
    groups: table.groups.map((g, gi) => ({
      ...g,
      observations: g.observations.map((o, row) => {
        if (gi < first) return o;
        // A survival status is 0 or 1; keep it valid and let the times and the other tables take the scenario.
        if (table.kind === 'survival') return o;
        return { ...o, value: o.value === null && s.name !== 'spread' ? o.value : s.fill(o.value ?? row + 1, gi, row) };
      }),
    })),
  };
}

const check = (chart: Chart, table: DataTable, what: string, fit?: FitSettings) => {
  let svg = '';
  expect(() => {
    buildAnyModel(chart, table, fit);
    svg = chartToSvgString(chart, table, fit);
  }, what).not.toThrow();
  expect(svg, `${what}: NaN`).not.toContain('NaN');
  expect(svg, `${what}: Infinity`).not.toContain('Infinity');
};

describe('every chart type with awkward data', () => {
  for (const info of CHART_TYPES) {
    for (const s of SCENARIOS) {
      it(`${info.type}: ${s.name}`, () => {
        const table = withScenario(TABLES[info.tableKind](), s);
        const chart = createChart(table.id, undefined, info.type);
        check(chart, table, `${info.type} / ${s.name}`);
      });
    }
  }
});

describe('every chart type with the axis settings switched on', () => {
  const settings: Array<[string, (c: Chart) => Chart]> = [
    ['log scale', (c) => ({ ...c, yAxis: { ...c.yAxis, scale: 'log10' }, xAxis: { ...c.xAxis, scale: 'log10' } })],
    ['reversed', (c) => ({ ...c, yAxis: { ...c.yAxis, reverse: true }, xAxis: { ...c.xAxis, reverse: true } })],
    ['breaks', (c) => ({ ...c, yAxis: { ...c.yAxis, breaks: [{ from: 1, to: 3 }] }, xAxis: { ...c.xAxis, breaks: [{ from: 2, to: 5 }] } })],
    ['origin', (c) => ({ ...c, origin: { x: 1, y: 1 } })],
    ['hidden axes with scale bars', (c) => ({ ...c, yAxis: { ...c.yAxis, visible: false, scaleBar: true }, xAxis: { ...c.xAxis, visible: false, scaleBar: true } })],
    ['minor ticks and grids', (c) => ({ ...c, yAxis: { ...c.yAxis, minorTicks: 3, showGrid: true, showMinorGrid: true }, xAxis: { ...c.xAxis, minorTicks: 1, showGrid: true } })],
    ['horizontal', (c) => ({ ...c, orientation: supportsHorizontal(c.type) ? ('horizontal' as const) : ('vertical' as const) })],
    ['frame, colours, bar labels', (c) => ({ ...c, frame: 'box', pageColor: null, plotColor: null, barLabels: { ...c.barLabels, show: 'value' } })],
  ];
  for (const info of CHART_TYPES) {
    for (const [name, apply] of settings) {
      for (const s of [SCENARIOS[2], SCENARIOS[3], SCENARIOS[0], SCENARIOS[5]]) {
        it(`${info.type}: ${name}, ${s.name}`, () => {
          const table = withScenario(TABLES[info.tableKind](), s);
          const chart = apply(createChart(table.id, undefined, info.type));
          check(chart, table, `${info.type} / ${name} / ${s.name}`);
        });
      }
    }
  }
});

describe('every fitted curve with awkward data', () => {
  const xyTypes = CHART_TYPES.filter((i) => i.tableKind === 'xy');
  for (const info of xyTypes) {
    for (const m of FIT_MODELS) {
      for (const s of SCENARIOS) {
        it(`${info.type}: ${m.id}, ${s.name}`, () => {
          const table = withScenario(TABLES.xy(), s);
          const fit: FitSettings = { ...NO_FIT_SETTINGS, model: m.id, degree: 6, band: 'prediction', extend: true, showParameters: true };
          const chart = createChart(table.id, undefined, info.type);
          check(chart, table, `${info.type} / ${m.id} / ${s.name}`, fit);
          check({ ...chart, xAxis: { ...chart.xAxis, scale: 'log10' }, yAxis: { ...chart.yAxis, scale: 'log10' } }, table, `${info.type} / ${m.id} / ${s.name} / log`, fit);
        });
      }
    }
  }
});

describe('very long data', () => {
  it('plots 200,000 points without overflowing the stack', () => {
    const table = createXyTable('XY', false);
    const n = 200_000;
    const grow = (o: { id: string; value: number | null }, row: number, f: (r: number) => number) => ({ ...o, value: f(row) });
    const long: DataTable = {
      ...table,
      rowCount: n,
      groups: table.groups.map((g, gi) => ({
        ...g,
        observations: Array.from({ length: n }, (_, row) => grow({ id: `${g.id}-${row}`, value: null }, row, (r) => (gi === 0 ? r : Math.sin(r / 1000) * 50 + gi))),
      })),
    };
    const chart = createChart(long.id, undefined, 'xyScatter');
    expect(() => buildAnyModel(chart, long)).not.toThrow();
  });
});
