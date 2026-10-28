import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bindingSelectState } from '../../chart/shared/axes/axes';
import { CAPABILITIES, capabilitiesOf, capabilityTable } from './capabilities';
import { createChart, createColumnTable, createContingencyTable, createGroupedTable, createSurvivalTable, createXyTable } from '../defaults';
import { patchLayerStyle, setLayerRange } from '../../state/commands';
import { CHART_TYPES, chartFamily, supportsHorizontal } from './chartTypes';
import { layerRows } from './layers';
import type { DataTable, Project } from '../types';

const by = (type: string) => CAPABILITIES.find((c) => c.type === type)!;

/** A table that can show every part of a chart of the type: replicates, where the type takes them. */
const tableFor = (type: string): DataTable => {
  switch (CHART_TYPES.find((c) => c.type === type)!.tableKind) {
    case 'xy':
      return createXyTable('XY', true, { kind: 'replicates', n: 3 });
    case 'grouped':
      return createGroupedTable('Grouped', true, { kind: 'replicates', n: 3 });
    case 'contingency':
      return createContingencyTable('Counts', true);
    case 'survival':
      return createSurvivalTable('Survival', true);
    default:
      return createColumnTable('Column', true, 3);
  }
};

describe('capability registry', () => {
  it('has an entry for every chart type, in catalogue order', () => {
    expect(CAPABILITIES.map((c) => c.type)).toEqual(CHART_TYPES.map((c) => c.type));
  });

  it('agrees with the predicates it is built from', () => {
    for (const c of CAPABILITIES) {
      expect(c.horizontal).toBe(supportsHorizontal(c.type));
      expect(c.curveFit).toBe(chartFamily(c.type) === 'xy');
      expect(c.survivalOptions).toBe(chartFamily(c.type) === 'survival');
      expect(bindingSelectState(c.type, {}).offered).toBe(c.secondaryAxis);
    }
  });

  it('offers what a chart can honour…', () => {
    expect(by('xyScatter')).toMatchObject({ referenceLines: 'xy', curveFit: true, horizontal: false });
    expect(by('bar')).toMatchObject({ referenceLines: 'y', secondaryAxis: true, horizontal: true });
    expect(by('survival')).toMatchObject({ referenceLines: 'xy', survivalOptions: true });
    expect(by('histogram').referenceLines).toBe('xy');
    expect(by('groupedBar').referenceLines).toBe('y');
  });

  it('…and not what it cannot', () => {
    for (const type of ['pie', 'doughnut', 'heatmap'] as const) {
      expect(by(type)).toMatchObject({ referenceLines: 'none', numericAxes: false, curveFit: false, secondaryAxis: false });
    }
    // X lines need a numeric X axis; a column chart has categories there.
    for (const c of CAPABILITIES) if (c.referenceLines === 'xy') expect(['xy', 'survival', 'histogram']).toContain(chartFamily(c.type));
    // Only the three Cartesian column charts can be bound to the right axis.
    expect(CAPABILITIES.filter((c) => c.secondaryAxis).map((c) => c.type)).toEqual(['bar', 'scatter', 'mean']);
    expect(capabilitiesOf('violin').curveFit).toBe(false);
  });

  it('is the source of the table in the README (UPDATE_README=1 rewrites it)', () => {
    const file = resolve(__dirname, '../../../README.md');
    const readme = readFileSync(file, 'utf8');
    const start = '<!-- capabilities:start -->';
    const end = '<!-- capabilities:end -->';
    const [a, b] = [readme.indexOf(start), readme.indexOf(end)];
    expect(a).toBeGreaterThan(-1);
    expect(b).toBeGreaterThan(a);
    const fresh = `${readme.slice(0, a + start.length)}\n${capabilityTable()}\n${readme.slice(b)}`;
    if (process.env.UPDATE_README === '1' && fresh !== readme) writeFileSync(file, fresh);
    else expect(readme).toBe(fresh);
  });

  it('says what the parts of every chart type take: a look of their own and a place in the axis range, as the layer rows offer them', () => {
    for (const c of CAPABILITIES) {
      const table = tableFor(c.type);
      const chart = { ...createChart(table.id, undefined, c.type), layers: createChart(table.id, undefined, c.type).layers.map((l, i) => (i === 0 ? { ...l, summary: { ...l.summary, spread: 'sd' as const }, style: { ...l.style, showErrorBars: true, showMeanLine: true, showSymbols: true, showLines: true, showRawPoints: true } } : l)) };
      const rows = layerRows(chart, table);
      expect({ type: c.type, looks: rows.some((r) => r.takes !== null) }).toEqual({ type: c.type, looks: c.partLooks });
      expect({ type: c.type, range: rows.some((r) => r.inRange !== null) }).toEqual({ type: c.type, range: c.rangeSwitch });
    }
  });

  it('gives no look and no range switch to the parts of a pie or a heat map, which have no such setting (and none to survival axes, which are fixed)', () => {
    for (const type of ['pie', 'doughnut', 'heatmap'] as const) {
      expect(by(type).partLooks).toBe(false);
      expect(by(type).rangeSwitch).toBe(false);
      const table = tableFor(type);
      const chart = createChart(table.id, undefined, type);
      const project: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
      for (const row of layerRows(chart, table)) {
        const stored = patchLayerStyle(chart.id, row.layer.id, { color: '#ff0000', opacity: 0.5 })(project).charts[0];
        const ranged = setLayerRange(chart.id, row.layer.id, false)(project).charts[0];
        expect(row.takes).toBeNull();
        expect(row.inRange).toBeNull();
        expect(stored.layerStyles).toEqual({});
        // Taking a part of a chart without axes out of the range is stored (it is a setting of the part) but changes nothing drawn.
        expect(ranged.rangeExcludedLayerIds).toEqual([row.layer.id]);
      }
    }
    expect(by('survival').partLooks).toBe(true);
    expect(by('survival').rangeSwitch).toBe(false);
  });

  it('offers looks to column, grouped and cumulative distribution types and a range switch to the types whose range holds more than the centres', () => {
    for (const t of ['bar', 'scatter', 'mean', 'paired', 'box', 'violin', 'floating']) expect([t, by(t).partLooks, by(t).rangeSwitch]).toEqual([t, true, true]);
    expect(['groupedBar', 'groupedLine', 'groupedFloating', 'groupedBox', 'groupedViolin', 'groupedStacked', 'contingencyBars'].map((t) => [by(t).partLooks, by(t).rangeSwitch])).toEqual([[true, true], [true, true], [true, true], [true, true], [true, true], [false, false], [false, false]]);
    expect([by('histogram').partLooks, by('histogram').rangeSwitch, by('ecdf').partLooks, by('ecdf').rangeSwitch]).toEqual([false, true, true, true]);
  });
});
