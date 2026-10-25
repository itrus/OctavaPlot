import { describe, expect, it } from 'vitest';
import { createChart, createXyTable } from '../../model/defaults';
import { layerRows, layersOf } from '../../model/graph/layers';
import type { Chart, Project } from '../../model/types';
import { setLayerRange } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { buildXyModel } from './xyModel';

const table = createXyTable('XY', true, { kind: 'replicates', n: 3 });
const withErrors = (c: Chart): Chart => ({ ...c, layers: c.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, showErrorBars: true, showRawPoints: true } } : l)) });
const base = withErrors(createChart(table.id, undefined, 'xyLineSymbols'));
const project = (chart: Chart): Project => ({ id: 'p', name: 'p', dataTables: [table], charts: [chart] });
const first = layersOf(base, table);
const idOf = (kind: string) => first.find((l) => l.kind === kind)!.id;

describe('which layers the axis range is fitted to', () => {
  it('is what it was when nothing is left out', () => {
    expect(buildXyModel(base, table).y.domain).toEqual(buildXyModel({ ...base, rangeExcludedLayerIds: [] }, table).y.domain);
  });

  it('leaves out the error bars when asked: the axis no longer holds their ends, and they are still drawn', () => {
    const all = buildXyModel(base, table);
    const without = buildXyModel({ ...base, rangeExcludedLayerIds: first.filter((l) => l.kind === 'errorBars').map((l) => l.id) }, table);
    expect(without.y.domain[1]).toBeLessThanOrEqual(all.y.domain[1]);
    expect(without.series.every((s) => s.errorPath !== '')).toBe(true);
    // The numbers are those of the chart with them in: only the scale changed.
    expect(without.series.map((s) => s.points.map((p) => p.y))).toEqual(all.series.map((s) => s.points.map((p) => p.y)));
  });

  it('can leave out the individual values: one far replicate no longer stretches the axis', () => {
    const far = structuredClone(table);
    far.groups[1].observations[0].value = 500;
    const include = buildXyModel(base, far);
    const exclude = buildXyModel({ ...base, rangeExcludedLayerIds: [idOf('rawPoints'), idOf('errorBars')] }, far);
    expect(include.y.domain[1]).toBeGreaterThanOrEqual(500);
    expect(exclude.y.domain[1]).toBeLessThan(include.y.domain[1]);
    // The point of that row is its mean: with the points left out as well nothing is left to fit the axis to.
    const only = buildXyModel({ ...base, rangeExcludedLayerIds: first.filter((l) => l.kind !== 'points').map((l) => l.id) }, far);
    expect(only.y.domain[1]).toBeGreaterThanOrEqual(far.groups[1].observations.slice(0, 3).reduce((n, o) => n + (o.value ?? 0), 0) / 3);
  });

  it('is not what hiding does: a hidden layer still counts', () => {
    const all = buildXyModel(base, table);
    const hidden = buildXyModel({ ...base, hiddenLayerIds: first.filter((l) => l.kind === 'errorBars').map((l) => l.id) }, table);
    expect(hidden.y.domain).toEqual(all.y.domain);
  });

  it('is offered only for the layers the range reads, and says what it is now', () => {
    const rows = layerRows(base, table);
    const kinds = rows.filter((r) => r.inRange !== null).map((r) => r.layer.kind);
    expect(new Set(kinds)).toEqual(new Set(['points', 'rawPoints', 'errorBars']));
    expect(rows.filter((r) => r.layer.kind === 'line').every((r) => r.inRange === null)).toBe(true);
    const out = layerRows({ ...base, rangeExcludedLayerIds: [idOf('errorBars')] }, table).find((r) => r.layer.id === idOf('errorBars'))!;
    expect(out.inRange).toBe(false);
  });

  it('is set and given back by a command, and is idempotent', () => {
    const id = idOf('errorBars');
    const out = setLayerRange(base.id, id, false)(project(base));
    expect(out.charts[0].rangeExcludedLayerIds).toEqual([id]);
    expect(setLayerRange(base.id, id, false)(out).charts[0]).toBe(out.charts[0]);
    expect(setLayerRange(base.id, id, true)(out).charts[0].rangeExcludedLayerIds).toEqual([]);
    expect(setLayerRange(base.id, id, true)(project(base)).charts[0]).toBe(base);
  });

  it('is saved and read back, and anything that is not an id is dropped', () => {
    const id = idOf('errorBars');
    const saved = stringifyProject({ ...project({ ...base, rangeExcludedLayerIds: [id] }) });
    expect(parseProject(saved).charts[0].rangeExcludedLayerIds).toEqual([id]);
    const broken = JSON.parse(saved) as { project: { charts: Array<Record<string, unknown>> } };
    broken.project.charts[0].rangeExcludedLayerIds = [id, 5, null];
    expect(parseProject(JSON.stringify(broken)).charts[0].rangeExcludedLayerIds).toEqual([id]);
    delete broken.project.charts[0].rangeExcludedLayerIds;
    expect(parseProject(JSON.stringify(broken)).charts[0].rangeExcludedLayerIds).toEqual([]);
  });
});
