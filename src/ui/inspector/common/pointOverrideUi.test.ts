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
  dragLabelPatch,
  multiPointState,
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

describe('moving a label by dragging it', () => {
  const point = { cx: 100, cy: 50 };
  const box = { x0: 103.04, y0: 33.26, x1: 120, y1: 45 };
  it('stores the label as Custom, with the offsets of its corner from the point after the move', () => {
    expect(dragLabelPatch(point, box, 10, -5.04)).toEqual({ pointLabelPlacement: 'custom', pointLabelOffsetXPt: 13, pointLabelOffsetYPt: -21.8 });
  });
  it('a drag that returns to the start stores the offsets of where the label is now, so it does not jump', () => {
    expect(dragLabelPatch(point, box, 0, 0)).toEqual({ pointLabelPlacement: 'custom', pointLabelOffsetXPt: 3, pointLabelOffsetYPt: -16.7 });
  });
  it('keeps the offsets within the limits', () => {
    expect(dragLabelPatch(point, box, 900, -900)).toEqual({ pointLabelPlacement: 'custom', pointLabelOffsetXPt: 400, pointLabelOffsetYPt: -400 });
  });
  it('is relative to the point: the same move of the point and the label gives the same offsets', () => {
    const shifted = dragLabelPatch({ cx: 300, cy: 250 }, { x0: 303.04, y0: 233.26, x1: 320, y1: 245 }, 10, -5.04);
    expect(shifted).toEqual(dragLabelPatch(point, box, 10, -5.04));
  });
});

describe('several points selected together', () => {
  const p = createExampleProject();
  const table = p.dataTables[0];
  const [g1, g2] = table.groups;
  const ref = (g: typeof g1, i: number) => ({ groupId: g.id, pointId: g.observations[i].id });
  it('lists the points that exist, with their rows, across data sets', () => {
    const r = multiPointState(table, { kind: 'points', points: [ref(g1, 0), ref(g2, 2)] }, 'scatter');
    expect(r.points.map((x) => [x.group.id, x.pointId, x.row])).toEqual([[g1.id, g1.observations[0].id, 0], [g2.id, g2.observations[2].id, 2]]);
    expect(r.fallback).toBeNull();
  });
  it('is empty for any other selection', () => {
    expect(multiPointState(table, { kind: 'point', ...ref(g1, 0) }, 'scatter')).toEqual({ points: [], fallback: null });
    expect(multiPointState(table, { kind: 'chart' }, 'scatter')).toEqual({ points: [], fallback: null });
  });
  it('drops a point that is gone and falls back to the smaller selection; none left is the chart', () => {
    const gone = { groupId: g1.id, pointId: 'gone' };
    expect(multiPointState(table, { kind: 'points', points: [ref(g1, 0), gone, ref(g2, 1)] }, 'scatter').fallback).toEqual({ kind: 'points', points: [ref(g1, 0), ref(g2, 1)] });
    expect(multiPointState(table, { kind: 'points', points: [ref(g1, 0), gone] }, 'scatter').fallback).toEqual({ kind: 'point', ...ref(g1, 0) });
    expect(multiPointState(table, { kind: 'points', points: [gone, { groupId: 'x', pointId: 'y' }] }, 'scatter').fallback).toEqual({ kind: 'chart' });
  });
  it('a mean chart draws no observations, so the points fall back to the data sets they are in', () => {
    expect(multiPointState(table, { kind: 'points', points: [ref(g1, 0), ref(g2, 0)] }, 'mean').fallback).toEqual({ kind: 'groups', groupIds: [g1.id, g2.id] });
  });
});
