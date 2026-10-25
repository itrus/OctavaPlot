import { describe, expect, it } from 'vitest';
import { emptyPointLabelModel, type PointLabelGeom, type PointLabelModel } from '../../../chart/shared/parts/labels';
import { DEFAULT_STYLE, createExampleProject } from '../../../model/defaults';
import type { ChartStyle, Selection } from '../../../model/types';
import {
  KEEP_LABEL_PATCH,
  MEAN_POINT_REASON,
  MISSING_ROW_REASON,
  NO_TITLE_NOTE,
  describePointOverrideUi,
  labelModeAction,
  pointPlacementAction,
  pointSelectionState,
  pointStatus,
  seedCustomOffsets,
} from './pointOverrideUi';

const style = (patch: Partial<ChartStyle> = {}): ChartStyle => ({ ...DEFAULT_STYLE, showSymbols: true, showPointLabels: true, ...patch });
const ctx = (over: Partial<Parameters<typeof describePointOverrideUi>[1]> = {}) => ({ type: 'scatter' as const, overrides: {}, rowTitle: 'S1', ...over });

describe('describePointOverrideUi disable rules', () => {
  it('is available for a point with a row on a scatter chart', () => {
    const ui = describePointOverrideUi(style(), ctx());
    expect(ui.available).toBe(true);
    expect(ui.reason).toBeNull();
    expect(ui.optionsEnabled).toBe(true);
  });
  it('is unavailable without symbols', () => {
    const ui = describePointOverrideUi(style({ showSymbols: false }), ctx());
    expect(ui.available).toBe(false);
    expect(ui.reason).toMatch(/Symbols/);
    expect(ui.optionsEnabled).toBe(false);
  });
  it('options follow the resolved Label state', () => {
    expect(describePointOverrideUi(style({ showPointLabels: false }), ctx()).optionsEnabled).toBe(false);
    expect(describePointOverrideUi(style({ showPointLabels: true }), ctx({ overrides: { showPointLabels: true } })).optionsEnabled).toBe(true);
  });
  it('maps the stored override to Inherit, Show or Hide', () => {
    expect(describePointOverrideUi(style(), ctx()).mode).toBe('inherit');
    expect(describePointOverrideUi(style(), ctx({ overrides: { showPointLabels: true } })).mode).toBe('show');
    expect(describePointOverrideUi(style(), ctx({ overrides: { showPointLabels: false } })).mode).toBe('hide');
  });
  it('allows Custom in the placement list', () => {
    const ui = describePointOverrideUi(style(), ctx());
    expect(ui.placements.find((o) => o.value === 'custom')?.disabled).toBe(false);
  });
  it('flags a titled source with no title', () => {
    expect(describePointOverrideUi(style(), ctx({ rowTitle: '  ' })).noTitle).toBe(true);
    expect(describePointOverrideUi(style({ pointLabelSource: 'value' }), ctx({ rowTitle: '' })).noTitle).toBe(false);
    expect(describePointOverrideUi(style(), ctx()).noTitle).toBe(false);
  });
  it('tolerates hand-edited values', () => {
    const bad = style({ pointLabelPlacement: 'nope' as never, pointLabelFontSizePt: NaN, pointLabelColor: 'red' });
    const ui = describePointOverrideUi(bad, ctx());
    expect(ui.placement).toBe('above-right');
    expect(ui.colourAuto).toBe(true);
  });
});

describe('offset rules', () => {
  it('named placements enable offsets, centre disables them, custom explains the signed offsets', () => {
    expect(describePointOverrideUi(style(), ctx()).offsets.enabled).toBe(true);
    expect(describePointOverrideUi(style({ pointLabelPlacement: 'centre' }), ctx()).offsets.enabled).toBe(false);
    const custom = describePointOverrideUi(style({ pointLabelPlacement: 'custom' }), ctx());
    expect(custom.offsets.enabled).toBe(true);
    expect(custom.offsets.note).toMatch(/Signed/);
  });
  it('offsets are off while the options are off', () => {
    expect(describePointOverrideUi(style({ showPointLabels: false }), ctx()).offsets.enabled).toBe(false);
  });
});

describe('mean marker and missing row', () => {
  it('a mean chart has no per-point labels', () => {
    const ui = describePointOverrideUi(style(), ctx({ type: 'mean' }));
    expect(ui.available).toBe(false);
    expect(ui.reason).toBe(MEAN_POINT_REASON);
  });
  it('a missing row is unavailable', () => {
    const ui = describePointOverrideUi(style(), ctx({ rowTitle: null }));
    expect(ui.available).toBe(false);
    expect(ui.reason).toBe(MISSING_ROW_REASON);
    expect(ui.noTitle).toBe(false);
  });
});

describe('actions', () => {
  it('label mode', () => {
    expect(labelModeAction('show')).toEqual({ set: { showPointLabels: true } });
    expect(labelModeAction('hide')).toEqual({ set: { showPointLabels: false } });
    expect(labelModeAction('inherit')).toEqual({ clear: ['showPointLabels'] });
    expect(labelModeAction('x')).toBeNull();
  });
  it('seeds Custom offsets from the drawn label, rounded and clamped', () => {
    const s = style();
    expect(seedCustomOffsets(s, { cx: 100, cy: 50 }, { x0: 103.04, y0: 33.26, x1: 120, y1: 45 })).toEqual({ pointLabelOffsetXPt: 3, pointLabelOffsetYPt: -16.7 });
    expect(seedCustomOffsets(s, { cx: 0, cy: 0 }, { x0: 900, y0: -900, x1: 1, y1: 1 })).toEqual({ pointLabelOffsetXPt: 400, pointLabelOffsetYPt: -400 });
  });
  it('seeds from the style when no label is drawn', () => {
    const out = seedCustomOffsets(style({ pointLabelOffsetXPt: 3, pointLabelOffsetYPt: 3, pointLabelFontSizePt: 10 }), null, null);
    expect(out).toEqual({ pointLabelOffsetXPt: 3, pointLabelOffsetYPt: -13 });
  });
  it('placement to Custom seeds once; leaving Custom drops the signed offsets', () => {
    const seed = { pointLabelOffsetXPt: 3, pointLabelOffsetYPt: -16 };
    expect(pointPlacementAction('custom', 'above', seed)).toEqual({ set: { pointLabelPlacement: 'custom', ...seed } });
    expect(pointPlacementAction('custom', 'custom', seed)).toEqual({ set: { pointLabelPlacement: 'custom' } });
    expect(pointPlacementAction('below', 'custom', seed)).toEqual({ set: { pointLabelPlacement: 'below' }, clear: ['pointLabelOffsetXPt', 'pointLabelOffsetYPt'] });
    expect(pointPlacementAction('below', 'above', seed)).toEqual({ set: { pointLabelPlacement: 'below' } });
    expect(pointPlacementAction('nope', 'above', seed)).toBeNull();
  });
  it('Keep this label sets the collision rule', () => {
    expect(KEEP_LABEL_PATCH).toEqual({ pointLabelCollision: 'keep' });
  });
});

describe('pointStatus', () => {
  const geom = (id: string, code: PointLabelGeom['code']): PointLabelGeom => ({
    id, text: 't', shown: 't', x: 0, y: 0, fontSizePt: 10, box: { x0: 0, y0: 0, x1: 1, y1: 1 }, code, displaced: false, leader: null, overlap: false,
  });
  const ui = (p: Partial<Parameters<typeof pointStatus>[0]> = {}) => ({ available: true, reason: null, labelled: true, noTitle: false, ...p });
  const model = (patch: Partial<PointLabelModel>): PointLabelModel => ({ ...emptyPointLabelModel(), ...patch });
  it('drawn, with the placement outcome', () => {
    expect(pointStatus(ui(), model({ items: [geom('a', 'placed')] }), 'a').text).toBe('Label drawn.');
    expect(pointStatus(ui(), model({ items: [geom('a', 'moved')] }), 'a').text).toMatch(/avoid overlap/);
    expect(pointStatus(ui(), model({ items: [geom('a', 'flipped-h')] }), 'a').text).toMatch(/flipped/);
  });
  it('hidden by overlap offers Keep; too large does not', () => {
    const s = pointStatus(ui(), model({ suppressed: [{ id: 'a', text: 't', reason: 'overlap' }] }), 'a');
    expect(s.canKeep).toBe(true);
    expect(pointStatus(ui(), model({ suppressed: [{ id: 'a', text: 't', reason: 'tooLarge' }] }), 'a').canKeep).toBe(false);
  });
  it('explains an undrawn label', () => {
    expect(pointStatus(ui({ labelled: false }), model({}), 'a').text).toBe('No label for this point.');
    expect(pointStatus(ui({ noTitle: true }), model({}), 'a').text).toBe(NO_TITLE_NOTE);
    expect(pointStatus(ui({ available: false, reason: 'why' }), model({}), 'a').text).toBe('why');
  });
});

describe('pointSelectionState', () => {
  const p = createExampleProject();
  const table = p.dataTables[0];
  const g = table.groups[1];
  const sel = (s: Selection, type: 'bar' | 'scatter' | 'mean' = 'scatter') => pointSelectionState(table, s, type);
  it('chart and annotation selections edit all groups', () => {
    expect(sel({ kind: 'chart' })).toMatchObject({ scope: 'all', groupId: null, pointId: null, fallback: null });
    expect(sel({ kind: 'annotation', annotationId: 'x' }).scope).toBe('all');
  });
  it('a group selection edits that group', () => {
    expect(sel({ kind: 'group', groupId: g.id })).toMatchObject({ scope: g.id, groupId: g.id, pointId: null, fallback: null });
  });
  it('a point selection edits its group and finds the row', () => {
    const r = sel({ kind: 'point', groupId: g.id, pointId: g.observations[2].id });
    expect(r).toMatchObject({ scope: g.id, pointId: g.observations[2].id, row: 2, fallback: null });
    expect(r.rowTitle).toBe(table.rows[2].title);
  });
  it('falls back to the chart when the group is missing', () => {
    expect(sel({ kind: 'point', groupId: 'gone', pointId: 'o' })).toMatchObject({ scope: 'all', pointId: null, fallback: { kind: 'chart' } });
  });
  it('falls back to the group when the observation is missing', () => {
    expect(sel({ kind: 'point', groupId: g.id, pointId: 'gone' })).toMatchObject({ scope: g.id, pointId: null, fallback: { kind: 'group', groupId: g.id } });
  });
  it('a mean chart draws no observations, so a point falls back to its group', () => {
    expect(sel({ kind: 'point', groupId: g.id, pointId: g.observations[0].id }, 'mean').fallback).toEqual({ kind: 'group', groupId: g.id });
    expect(sel({ kind: 'point', groupId: g.id, pointId: `${g.id}:mean` }).fallback).toEqual({ kind: 'group', groupId: g.id });
  });
  it('a missing group on a group selection keeps the old behaviour', () => {
    expect(sel({ kind: 'group', groupId: 'gone' })).toMatchObject({ scope: 'all', fallback: null });
  });
});
