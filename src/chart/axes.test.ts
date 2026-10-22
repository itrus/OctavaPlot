import { describe, expect, it } from 'vitest';
import { DEFAULT_STYLE, DEFAULT_SUMMARY, createChart } from '../model/defaults';
import { resolveSummary } from '../model/summary';
import { resolveStyle } from '../model/style';
import { computeGroupStats, statsFor } from '../stats/summary';
import { dualAxisFixture } from './dualAxisFixture';
import {
  AXIS_BINDINGS,
  AXIS_NAME,
  AXIS_SHORT,
  AXIS_TAG,
  axisConfigFor,
  axisNotices,
  bindingOf,
  bindingSelectState,
  errorShown,
  groupRangeContribution,
  populateAxes,
  type AxisNoticeInput,
  type RangeRow,
} from './axes';
import { resolveYAxis } from './scales';

const fixtureRows = (opts: { bindRight?: boolean } = {}): { rows: RangeRow[]; type: 'bar' } => {
  const project = dualAxisFixture(opts);
  const chart = project.charts[0];
  const table = project.dataTables[0];
  const layer = chart.layers[0];
  const rows = table.groups.map((g): RangeRow => {
    const style = resolveStyle(chart, layer, g);
    return {
      binding: bindingOf(style),
      stats: statsFor(g.observations, resolveSummary(layer, g.id)),
      style,
      values: g.observations.map((o) => o.value),
    };
  });
  return { rows, type: 'bar' };
};

const axisOf = (pool: { values: number[]; hasBars: boolean }) =>
  resolveYAxis({ values: pool.values, includeZero: pool.hasBars, min: null, max: null, majorInterval: null, tickCountHint: 5 });

const rowOf = (values: (number | null)[], style: Partial<RangeRow['style']> = {}, spread: 'none' | 'sd' = 'sd'): RangeRow => ({
  binding: 'primary',
  stats: computeGroupStats(values, { ...DEFAULT_SUMMARY, spread }),
  style: { showBars: false, showSymbols: false, showErrorBars: true, errorDirection: 'both', ...style },
  values,
});

describe('bindingOf', () => {
  it('only the exact value secondary rebinds', () => {
    expect(bindingOf({ axisBinding: 'secondary' })).toBe('secondary');
    expect(bindingOf({ axisBinding: 'primary' })).toBe('primary');
    for (const v of [undefined, null, 'Secondary', 'right', 1, true, {}]) expect(bindingOf({ axisBinding: v })).toBe('primary');
    expect(bindingOf({})).toBe('primary');
  });
});

describe('axis names and config', () => {
  it('maps bindings to config, names and tags', () => {
    const chart = createChart('t');
    expect(axisConfigFor(chart, 'primary')).toBe(chart.yAxis);
    expect(axisConfigFor(chart, 'secondary')).toBe(chart.y2Axis);
    expect(AXIS_BINDINGS).toEqual(['primary', 'secondary']);
    expect(AXIS_NAME).toEqual({ primary: 'Left Y axis', secondary: 'Right Y axis' });
    expect(AXIS_SHORT).toEqual({ primary: 'Left', secondary: 'Right' });
    expect(AXIS_TAG).toEqual({ primary: '', secondary: ' (right axis)' });
  });

  it('errorShown follows showErrorBars only', () => {
    expect(errorShown({ showErrorBars: true })).toBe(true);
    expect(errorShown({ showErrorBars: false })).toBe(false);
    expect(errorShown(DEFAULT_STYLE)).toBe(DEFAULT_STYLE.showErrorBars);
  });
});

describe('groupRangeContribution', () => {
  it('centre and both endpoints when error bars are shown', () => {
    const c = groupRangeContribution(rowOf([1, 2, 3]), 'bar');
    expect([...c.values].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(c.hasBars).toBe(false);
  });

  it('hidden error bars contribute only the centre (known deviation)', () => {
    expect(groupRangeContribution(rowOf([1, 2, 3], { showErrorBars: false }), 'bar').values).toEqual([2]);
  });

  it('one-sided direction filters the endpoints', () => {
    const pos = groupRangeContribution(rowOf([1, 2, 3], { errorDirection: 'positive' }), 'bar').values;
    expect(pos).toEqual([2, 3]);
  });

  it('raw points join when symbols are on and the type is not mean', () => {
    const row = rowOf([1, null, 9], { showSymbols: true }, 'none');
    expect(groupRangeContribution(row, 'scatter').values).toEqual([5, 1, 9]);
    expect(groupRangeContribution(row, 'mean').values).toEqual([5]);
  });

  it('hasBars needs showBars and a centre', () => {
    expect(groupRangeContribution(rowOf([1, 2], { showBars: true }, 'none'), 'bar').hasBars).toBe(true);
    expect(groupRangeContribution(rowOf([null, null], { showBars: true }, 'none'), 'bar').hasBars).toBe(false);
  });

  it('no centre gives nothing', () => {
    expect(groupRangeContribution(rowOf([null]), 'bar').values).toEqual([]);
  });
});

describe('populateAxes', () => {
  it('splits by binding', () => {
    const { rows, type } = fixtureRows();
    const pools = populateAxes(rows, type);
    expect(pools.secondaryInUse).toBe(true);
    expect(pools.primary.count).toBe(2);
    expect(pools.secondary.count).toBe(2);
    expect(Math.max(...pools.primary.values)).toBeLessThan(10);
    expect(Math.min(...pools.secondary.values)).toBeGreaterThan(50);
  });

  it('all on the left equals one pool of every contribution', () => {
    const { rows, type } = fixtureRows({ bindRight: false });
    const pools = populateAxes(rows, type);
    expect(pools.secondaryInUse).toBe(false);
    expect(pools.secondary).toEqual({ values: [], hasBars: false, count: 0 });
    const all = rows.flatMap((r) => groupRangeContribution(r, type).values);
    expect(pools.primary.values).toEqual(all);
    expect(pools.primary.count).toBe(rows.length);
  });

  it('hasBars is an OR per axis', () => {
    const bars = rowOf([1, 2], { showBars: true }, 'none');
    const none = rowOf([3, 4], { showBars: false }, 'none');
    const pools = populateAxes([bars, { ...none, binding: 'secondary' }], 'bar');
    expect(pools.primary.hasBars).toBe(true);
    expect(pools.secondary.hasBars).toBe(false);
    const both = populateAxes([none, { ...bars, binding: 'primary' }, none], 'bar');
    expect(both.primary.hasBars).toBe(true);
  });

  it('resolves each axis on its own scale', () => {
    const { rows, type } = fixtureRows();
    const pools = populateAxes(rows, type);
    expect(axisOf(pools.primary).domain).toEqual([0, 7]);
    expect(axisOf(pools.secondary).domain).toEqual([0, 400]);
  });

  it('axes without bars do not include zero', () => {
    const a = rowOf([100, 110, 120], { showBars: false }, 'none');
    const b = { ...rowOf([5, 6, 7], { showBars: false }, 'none'), binding: 'secondary' as const };
    const pools = populateAxes([a, b], 'mean');
    expect(axisOf(pools.primary).domain[0]).toBeGreaterThan(50);
    expect(axisOf(pools.secondary).domain[0]).toBeGreaterThan(0);
    expect(axisOf(pools.secondary).domain[1]).toBeLessThan(10);
  });

  it('empty input has an unused right axis', () => {
    const pools = populateAxes([], 'bar');
    expect(pools.secondaryInUse).toBe(false);
    expect(pools.primary.count).toBe(0);
  });
});

describe('bindingSelectState', () => {
  it('offered for Cartesian types and reads the stored binding', () => {
    for (const t of ['bar', 'scatter', 'mean'] as const) expect(bindingSelectState(t, {}).offered).toBe(true);
    expect(bindingSelectState('bar', { axisBinding: 'secondary' }).value).toBe('secondary');
    expect(bindingSelectState('bar', {}).options).toEqual([
      { value: 'primary', label: 'Left' },
      { value: 'secondary', label: 'Right' },
    ]);
  });

  it('missing axisBinding (old file) is the left axis', () => {
    expect(bindingSelectState('mean', { axisBinding: undefined }).value).toBe('primary');
  });
});

describe('axisNotices', () => {
  const pool = (count: number, n = count) => ({ values: Array.from({ length: n }, (_, i) => i), hasBars: false, count });
  const base = (patch: Partial<AxisNoticeInput> = {}): AxisNoticeInput => ({
    y: { title: 'Left', visible: true, min: null, max: null },
    y2: { title: 'Right', visible: true, min: null, max: null },
    legendVisible: true,
    pools: { primary: pool(2), secondary: pool(2), secondaryInUse: true },
    skippedConnectors: 0,
    ...patch,
  });

  it('silent when the right axis is unused, whatever the settings', () => {
    const pools = { primary: pool(2), secondary: pool(0), secondaryInUse: false };
    expect(axisNotices(base({ pools, legendVisible: false, y2: { title: '', visible: false, min: null, max: null } }))).toEqual([]);
  });

  it('clean two-axis setup is silent', () => {
    expect(axisNotices(base())).toEqual([]);
  });

  it('hidden right axis', () => {
    expect(axisNotices(base({ y2: { title: 'Right', visible: false, min: null, max: null } }))).toEqual([
      'The right Y axis is hidden, so data sets bound to it have no visible scale.',
    ]);
  });

  it('missing and duplicate titles', () => {
    const missing = 'Two Y axes are in use; give each a title so they can be told apart.';
    expect(axisNotices(base({ y: { title: '  ', visible: true, min: null, max: null } }))).toEqual([missing]);
    expect(axisNotices(base({ y2: { title: '', visible: true, min: null, max: null } }))).toEqual([missing]);
    expect(axisNotices(base({ y2: { title: ' Left ', visible: true, min: null, max: null } }))).toEqual(['Both Y axes have the same title.']);
  });

  it('hidden legend', () => {
    expect(axisNotices(base({ legendVisible: false }))).toEqual(['The legend is hidden, so data sets on the right axis are not marked.']);
  });

  it('no left data sets', () => {
    const pools = { primary: pool(0), secondary: pool(2), secondaryInUse: true };
    expect(axisNotices(base({ pools }))).toEqual(['No data sets use the left Y axis; it shows an empty scale.']);
  });

  it('empty axis only when a limit is automatic', () => {
    const pools = { primary: pool(2), secondary: pool(1, 0), secondaryInUse: true };
    expect(axisNotices(base({ pools }))).toEqual(['The right Y axis has no values and no manual limits; its scale is a placeholder.']);
    const limited = base({ pools, y2: { title: 'Right', visible: true, min: 0, max: 10 } });
    expect(axisNotices(limited)).toEqual([]);
    const half = base({ pools, y2: { title: 'Right', visible: true, min: 0, max: null } });
    expect(axisNotices(half)).toHaveLength(1);
  });

  it('skipped connectors are counted without names', () => {
    expect(axisNotices(base({ skippedConnectors: 1 }))).toEqual(['1 connector segment between data sets on different Y axes was not drawn.']);
    expect(axisNotices(base({ skippedConnectors: 3 }))).toEqual(['3 connector segments between data sets on different Y axes were not drawn.']);
  });

  it('keeps a fixed order and plain ASCII', () => {
    const out = axisNotices(
      base({
        pools: { primary: pool(0), secondary: pool(1, 0), secondaryInUse: true },
        y: { title: '', visible: true, min: null, max: null },
        y2: { title: '', visible: false, min: null, max: null },
        legendVisible: false,
        skippedConnectors: 2,
      }),
    );
    expect(out.map((s) => s.split(' ').slice(0, 3).join(' '))).toEqual([
      'The right Y',
      'No data sets',
      'Two Y axes',
      'The legend is',
      'The right Y',
      '2 connector segments',
    ]);
    for (const s of out) expect(s).toMatch(/^[\x20-\x7e]+$/);
  });
});
