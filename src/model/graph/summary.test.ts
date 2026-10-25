import { describe, expect, it } from 'vitest';
import { createChart, createExampleProject, DEFAULT_SUMMARY } from '../defaults';
import {
  clearGroupSummary,
  isSummaryOverridden,
  isValidConfidenceLevel,
  patchAllSummary,
  patchGroupSummary,
  resolveSummary,
  sanitizeSummary,
  sanitizeSummaryPatch,
  SUMMARY_KEYS,
  validateSummaryPatch,
} from './summary';
import { clearSummaryOverrides, patchSummary, removeGroup, resetStyle } from '../../state/commands';
import { historyReducer, initialHistory } from '../../state/history';
import type { ChartLayer } from '../types';

const layer = (): ChartLayer => createChart('t').layers[0];

describe('defaults', () => {
  it('DEFAULT_SUMMARY values', () => {
    expect(DEFAULT_SUMMARY).toEqual({
      centre: 'mean',
      spread: 'none',
      confidenceLevel: 0.95,
      smallSamplePolicy: 'drawCentre',
      invalidPolicy: 'omit',
    });
    expect(SUMMARY_KEYS).toHaveLength(5);
  });
  it('createChart copies the defaults', () => {
    const l = layer();
    expect(l.summary).toEqual(DEFAULT_SUMMARY);
    expect(l.summary).not.toBe(DEFAULT_SUMMARY);
    expect(l.groupSummary).toEqual({});
  });
});

describe('resolveSummary', () => {
  it('group overrides layer, undefined is ignored', () => {
    const l: ChartLayer = { ...layer(), groupSummary: { g1: { spread: 'sd', centre: undefined } } };
    expect(resolveSummary(l, 'g1')).toEqual({ ...DEFAULT_SUMMARY, spread: 'sd' });
    expect(resolveSummary(l, 'g2')).toEqual(DEFAULT_SUMMARY);
    expect(isSummaryOverridden(l, 'g1', 'spread')).toBe(true);
    expect(isSummaryOverridden(l, 'g1', 'centre')).toBe(false);
  });
  it('does not check spread against centre', () => {
    const l: ChartLayer = { ...layer(), summary: { ...DEFAULT_SUMMARY, centre: 'median', spread: 'sd' } };
    expect(resolveSummary(l, 'g').spread).toBe('sd');
  });
  it('ignores inherited prototype names as group ids', () => {
    const l = layer();
    expect(resolveSummary(l, 'constructor')).toEqual(DEFAULT_SUMMARY);
    expect(resolveSummary(l, '__proto__')).toEqual(DEFAULT_SUMMARY);
    const p = patchGroupSummary(l, 'constructor', { spread: 'sem' });
    expect(resolveSummary(p, 'constructor').spread).toBe('sem');
    expect(resolveSummary(p, 'toString').spread).toBe('none');
  });
});

describe('validate and sanitize', () => {
  it('validateSummaryPatch accepts valid and {} and rejects the whole patch otherwise', () => {
    expect(validateSummaryPatch({})).toBe(true);
    expect(validateSummaryPatch({ spread: 'ci', confidenceLevel: 0.9 })).toBe(true);
    expect(validateSummaryPatch({ spread: 'ci', confidenceLevel: 1 })).toBe(false);
    expect(validateSummaryPatch({ confidenceLevel: 0 })).toBe(false);
    expect(validateSummaryPatch({ confidenceLevel: NaN })).toBe(false);
    expect(validateSummaryPatch({ spread: 'bogus' })).toBe(false);
    expect(validateSummaryPatch({ centre: 'mode' })).toBe(false);
    expect(validateSummaryPatch({ smallSamplePolicy: 'x' })).toBe(false);
    expect(validateSummaryPatch({ invalidPolicy: 'x' })).toBe(false);
    expect(validateSummaryPatch({ unknown: 1 })).toBe(false);
    expect(validateSummaryPatch({ spread: undefined })).toBe(false);
    expect(validateSummaryPatch(null)).toBe(false);
    expect(validateSummaryPatch([])).toBe(false);
  });
  it('isValidConfidenceLevel', () => {
    expect([0.5, 0.95, 1e-9].every(isValidConfidenceLevel)).toBe(true);
    expect([0, 1, -1, 2, NaN, Infinity, '0.5', null].some(isValidConfidenceLevel)).toBe(false);
  });
  it('sanitizeSummaryPatch keeps valid keys only', () => {
    expect(sanitizeSummaryPatch({ spread: 'sd', centre: 'nope', extra: 1, confidenceLevel: 2 })).toEqual({ spread: 'sd' });
    expect(sanitizeSummaryPatch('x')).toEqual({});
  });
  it('sanitizeSummary falls back to defaults per key', () => {
    expect(sanitizeSummary({ spread: 'sd', centre: 'nope' })).toEqual({ ...DEFAULT_SUMMARY, spread: 'sd' });
    expect(sanitizeSummary(undefined)).toEqual(DEFAULT_SUMMARY);
  });
});

describe('patch and clear', () => {
  it('patchAllSummary sets layer values and clears group overrides of patched keys', () => {
    const l: ChartLayer = { ...layer(), groupSummary: { a: { spread: 'sd', centre: 'median' }, b: { spread: 'sem' } } };
    const n = patchAllSummary(l, { spread: 'iqr' });
    expect(n.summary.spread).toBe('iqr');
    expect(n.groupSummary).toEqual({ a: { centre: 'median' } });
  });
  it('same reference on no-ops', () => {
    const l: ChartLayer = { ...layer(), groupSummary: { a: { centre: 'median' } } };
    expect(patchAllSummary(l, {})).toBe(l);
    expect(patchAllSummary(l, { spread: 'none' })).toBe(l);
    expect(patchAllSummary(l, { spread: undefined })).toBe(l);
    expect(patchGroupSummary(l, 'a', { centre: 'median' })).toBe(l);
    expect(clearGroupSummary(l, 'zzz')).toBe(l);
  });
  it('patchGroupSummary merges and clearGroupSummary removes', () => {
    const l = patchGroupSummary(patchGroupSummary(layer(), 'a', { spread: 'sd' }), 'a', { centre: 'median' });
    expect(l.groupSummary.a).toEqual({ spread: 'sd', centre: 'median' });
    expect(l.summary).toEqual(DEFAULT_SUMMARY);
    expect(clearGroupSummary(l, 'a').groupSummary).toEqual({});
  });
});

describe('commands', () => {
  const p0 = createExampleProject();
  const chartId = p0.charts[0].id;
  const g0 = p0.dataTables[0].groups[0].id;

  it('scope all and group', () => {
    const all = patchSummary(chartId, 'all', { spread: 'sd' })(p0);
    expect(all.charts[0].layers[0].summary.spread).toBe('sd');
    const one = patchSummary(chartId, g0, { spread: 'sem' })(all);
    expect(resolveSummary(one.charts[0].layers[0], g0).spread).toBe('sem');
    expect(one.charts[0].layers[0].summary.spread).toBe('sd');
  });
  it('invalid and no-op patches return the same project, history is unchanged', () => {
    expect(patchSummary(chartId, 'all', { spread: 'nope' as never })(p0)).toBe(p0);
    expect(patchSummary(chartId, 'all', { spread: 'none' })(p0)).toBe(p0);
    expect(patchSummary('missing', 'all', { spread: 'sd' })(p0)).toBe(p0);
    const h = initialHistory(p0);
    const n = historyReducer(h, { type: 'commit', label: 'x', command: patchSummary(chartId, 'all', { spread: 'none' }), now: 0 });
    expect(n).toBe(h);
  });
  it('a centre change keeps the stored spread', () => {
    const a = patchSummary(chartId, 'all', { spread: 'sd' })(p0);
    const b = patchSummary(chartId, 'all', { centre: 'median' })(a);
    expect(b.charts[0].layers[0].summary).toMatchObject({ centre: 'median', spread: 'sd' });
  });
  it('edits layer 0 only', () => {
    const two = { ...p0, charts: [{ ...p0.charts[0], layers: [p0.charts[0].layers[0], { ...layer(), id: 'l2' }] }] };
    const n = patchSummary(chartId, 'all', { spread: 'sd' })(two);
    expect(n.charts[0].layers[1]).toBe(two.charts[0].layers[1]);
  });
  it('clearSummaryOverrides', () => {
    const a = patchSummary(chartId, g0, { spread: 'sd' })(p0);
    expect(clearSummaryOverrides(chartId, g0)(a).charts[0].layers[0].groupSummary).toEqual({});
    expect(clearSummaryOverrides(chartId, 'all')(a).charts[0].layers[0].groupSummary).toEqual({});
    expect(clearSummaryOverrides(chartId, 'all')(p0)).toBe(p0);
  });
  it('removeGroup prunes groupSummary', () => {
    const a = patchSummary(chartId, g0, { spread: 'sd' })(p0);
    const n = removeGroup(p0.dataTables[0].id, g0)(a);
    expect(n.charts[0].layers[0].groupSummary).toEqual({});
  });
  it('resetStyle is style-only', () => {
    const a = patchSummary(chartId, g0, { spread: 'sd' })(p0);
    const n = resetStyle(chartId, 'all', a.dataTables[0])(a);
    expect(n.charts[0].layers[0].groupSummary).toEqual({ [g0]: { spread: 'sd' } });
  });
});
