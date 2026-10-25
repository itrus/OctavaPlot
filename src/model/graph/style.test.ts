import { describe, expect, it } from 'vitest';
import { buildColumnModel } from '../../chart/column/columnModel';
import { historyReducer, initialHistory } from '../../state/history';
import { clearPointStyle, patchPointStyle, setChartType } from '../../state/commands';
import { createExampleProject } from '../defaults';
import { permuteRows } from '../../testing/tableChecks';
import { LABEL_STYLE_KEYS, clearObjectKeys, patchAllGroups, patchObject, resetGroupStyle, resolveStyle } from './style';
import type { ChartLayer } from '../types';

const setup = () => {
  const p = createExampleProject();
  const chart = p.charts[0];
  const table = p.dataTables[0];
  return { p, chart, table, layer: chart.layers[0], group: table.groups[0] };
};
const withLabels = (layer: ChartLayer): ChartLayer => ({ ...layer, objectOverrides: { o1: { showPointLabels: true, pointLabelBold: true, symbolSizePt: 5 } } });

describe('patchObject and clearObjectKeys', () => {
  it('sets keys on the object override', () => {
    const { layer } = setup();
    const next = patchObject(layer, 'o1', { showPointLabels: true });
    expect(next.objectOverrides.o1).toEqual({ showPointLabels: true });
    expect(next.objectOverrides.o1.pointLabelBold).toBeUndefined();
    expect(layer.objectOverrides.o1).toBeUndefined();
  });
  it('returns the same layer on a no-op', () => {
    const { layer } = setup();
    const l = withLabels(layer);
    expect(patchObject(l, 'o1', { showPointLabels: true })).toBe(l);
    expect(patchObject(l, 'o1', {})).toBe(l);
    expect(patchObject(layer, 'o1', {})).toBe(layer);
  });
  it('stores null as an override (Auto colour)', () => {
    const { layer } = setup();
    const next = patchObject(layer, 'o1', { pointLabelColor: null });
    expect(next.objectOverrides.o1.pointLabelColor).toBeNull();
    expect(patchObject(next, 'o1', { pointLabelColor: null })).toBe(next);
  });
  it('clears keys, drops an emptied entry and keeps the others', () => {
    const { layer } = setup();
    const l = withLabels(layer);
    const part = clearObjectKeys(l, 'o1', ['showPointLabels']);
    expect(part.objectOverrides.o1).toEqual({ pointLabelBold: true, symbolSizePt: 5 });
    const all = clearObjectKeys(l, 'o1', LABEL_STYLE_KEYS);
    expect(all.objectOverrides.o1).toEqual({ symbolSizePt: 5 });
    const gone = clearObjectKeys(patchObject(layer, 'o2', { pointLabelBold: true }), 'o2', ['pointLabelBold']);
    expect('o2' in gone.objectOverrides).toBe(false);
  });
  it('returns the same layer when no key is set', () => {
    const { layer } = setup();
    const l = withLabels(layer);
    expect(clearObjectKeys(l, 'o1', ['pointLabelItalic'])).toBe(l);
    expect(clearObjectKeys(l, 'missing', LABEL_STYLE_KEYS)).toBe(l);
  });
});

describe('overrides in the hierarchy', () => {
  it('patchAllGroups strips object overrides of the same key only', () => {
    const { layer } = setup();
    const next = patchAllGroups(withLabels(layer), { showPointLabels: false });
    expect(next.objectOverrides.o1).toEqual({ pointLabelBold: true, symbolSizePt: 5 });
    expect(next.style.showPointLabels).toBe(false);
  });
  it('resetGroupStyle prunes the group point overrides', () => {
    const { layer, group } = setup();
    const id = group.observations[0].id;
    const l = patchObject({ ...layer, objectOverrides: { keep: { pointLabelBold: true } } }, id, { showPointLabels: true });
    const next = resetGroupStyle(l, group);
    expect(next.objectOverrides[id]).toBeUndefined();
    expect(next.objectOverrides.keep).toEqual({ pointLabelBold: true });
  });
  it('a point override wins over the data set', () => {
    const { p, chart, layer, group } = setup();
    const id = group.observations[0].id;
    const q = patchPointStyle(chart.id, id, { showPointLabels: true })(p);
    const l = q.charts[0].layers[0];
    expect(resolveStyle(q.charts[0], l, group, id).showPointLabels).toBe(true);
    expect(resolveStyle(q.charts[0], l, group, group.observations[1].id).showPointLabels).toBe(false);
    expect(layer.objectOverrides[id]).toBeUndefined();
  });
});

describe('patchPointStyle and clearPointStyle', () => {
  it('are undoable', () => {
    const { p, chart, group } = setup();
    const id = group.observations[0].id;
    let h = historyReducer(initialHistory(p), { type: 'commit', label: 'label', command: patchPointStyle(chart.id, id, { showPointLabels: true }), now: 0 });
    expect(h.present.charts[0].layers[0].objectOverrides[id]).toEqual({ showPointLabels: true });
    h = historyReducer(h, { type: 'commit', label: 'reset', command: clearPointStyle(chart.id, id), now: 5000 });
    expect(h.present.charts[0].layers[0].objectOverrides[id]).toBeUndefined();
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.charts[0].layers[0].objectOverrides[id]).toEqual({ showPointLabels: true });
  });
  it('return the same project on a no-op', () => {
    const { p, chart, group } = setup();
    const id = group.observations[0].id;
    expect(clearPointStyle(chart.id, id)(p)).toBe(p);
    expect(patchPointStyle(chart.id, id, {})(p)).toBe(p);
    expect(patchPointStyle('missing', id, { showPointLabels: true })(p)).toBe(p);
    const q = patchPointStyle(chart.id, id, { showPointLabels: true })(p);
    expect(patchPointStyle(chart.id, id, { showPointLabels: true })(q)).toBe(q);
  });
  it('clear only the label keys by default', () => {
    const { p, chart, group } = setup();
    const id = group.observations[0].id;
    const q = clearPointStyle(chart.id, id)(patchPointStyle(chart.id, id, { showPointLabels: true, symbolSizePt: 6 })(p));
    expect(q.charts[0].layers[0].objectOverrides[id]).toEqual({ symbolSizePt: 6 });
  });
  it('survive permuteRows because they follow the observation id', () => {
    const { p, chart, table, group } = setup();
    const row0 = group.observations.findIndex((o) => o.value !== null);
    const id = group.observations[row0].id;
    const q = patchPointStyle(chart.id, id, { showPointLabels: true, pointLabelColor: '#ff0000' })(setChartType(chart.id, 'scatter')(p));
    const order = Array.from({ length: table.rowCount }, (_, i) => table.rowCount - 1 - i);
    const permuted = permuteRows(table, order);
    const project = { ...q, dataTables: [permuted] };
    const model = buildColumnModel(project.charts[0], permuted);
    const pt = model.groups[0].points.find((x) => x.id === id);
    expect(pt?.row).toBe(table.rowCount - 1 - row0);
    expect(project.charts[0].layers[0].objectOverrides[id]?.showPointLabels).toBe(true);
    expect(model.labels.report.eligible).toBeGreaterThan(0);
  });
  it('a label override labels only that point', () => {
    const { p, chart, group } = setup();
    const scatter = setChartType(chart.id, 'scatter')(p);
    const id = group.observations[0].id;
    const q = patchPointStyle(chart.id, id, { showPointLabels: true, pointLabelSource: 'value' })(scatter);
    const model = buildColumnModel(q.charts[0], q.dataTables[0]);
    expect(model.labels.items.map((i) => i.id)).toEqual([id]);
  });
});
