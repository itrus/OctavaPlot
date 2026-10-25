import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bindingSelectState } from '../../chart/shared/axes/axes';
import { CAPABILITIES, capabilitiesOf, capabilityTable } from './capabilities';
import { CHART_TYPES, chartFamily, supportsHorizontal } from './chartTypes';

const by = (type: string) => CAPABILITIES.find((c) => c.type === type)!;

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
});
