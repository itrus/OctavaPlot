import { describe, expect, it } from 'vitest';
import { createExampleProject, DEFAULT_STYLE } from '../model/defaults';
import { resolveSummary } from '../model/summary';
import type { Project } from '../model/types';
import { statsFor } from '../stats/summary';
import { patchAxis, patchBothAxes, patchStyle, removeGroup } from '../state/commands';
import { parseProject, parseProjectWithNotes, stringifyProject } from '../state/serialize';
import { chartToSvgString } from './export';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { n2 } from '../model/units';
import { ChartSvg } from './ChartSvg';
import { buildChartModel } from './model';
import { bindLeft, bindRight, DUAL_AXIS_DATA, dualAxisFixture } from '../testing/dualAxisFixture';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;
const normalize = (s: string): string => s.replace(/-?\d+\.\d+(e-?\d+)?/g, (m) => Number(m).toFixed(6));
const svgOf = (p: Project): string => chartToSvgString(p.charts[0], p.dataTables[0]);
const groupsOf = (p: Project) => p.dataTables[0].groups;

describe('defaults', () => {
  it('binds to the primary axis and has a visible, untitled right axis without grid', () => {
    expect(DEFAULT_STYLE.axisBinding).toBe('primary');
    expect('yAxis' in DEFAULT_STYLE).toBe(false);
    const c = createExampleProject().charts[0];
    expect(c.y2Axis).toMatchObject({ title: '', visible: true, showGrid: false, min: null, max: null, majorInterval: null });
    expect(c.y2Axis.tickFontSizePt).toBe(c.yAxis.tickFontSizePt);
    expect(c.y2Axis.titleFontSizePt).toBe(c.yAxis.titleFontSizePt);
    expect(c.y2Axis).not.toBe(c.yAxis);
  });
});

describe('fixture', () => {
  it('has the spec 22.3 data and statistics', () => {
    expect(DUAL_AXIS_DATA.map(([n, v]) => [n, [...v]])).toEqual([
      ['A', [1, 2, 3]],
      ['B', [2, 4, 6]],
      ['C', [100, 200, 300]],
      ['D', [150, 250, 350]],
    ]);
    const p = dualAxisFixture();
    expect(groupsOf(p).map((g) => g.name)).toEqual(['A', 'B', 'C', 'D']);
    const layer = p.charts[0].layers[0];
    const stats = groupsOf(p).map((g) => statsFor(g.observations, resolveSummary(layer, g.id)));
    expect(stats.map((s) => s.centre)).toEqual([2, 4, 200, 250]);
    expect(stats.map((s) => s.interval.status)).toEqual(['ok', 'ok', 'ok', 'ok']);
    expect(stats.map((s) => (s.interval.upper as number) - (s.centre as number))).toEqual([1, 2, 100, 100]);
  });
  it('binds C and D to the right axis, or nobody', () => {
    const p = dualAxisFixture();
    const binding = (i: number) =>
      ({ ...p.charts[0].defaults, ...p.charts[0].layers[0].groupOverrides[groupsOf(p)[i].id] }).axisBinding;
    expect([0, 1, 2, 3].map(binding)).toEqual(['primary', 'primary', 'secondary', 'secondary']);
    expect(Object.keys(dualAxisFixture({ bindRight: false }).charts[0].layers[0].groupOverrides)).toEqual([]);
  });
});

describe('bindRight / bindLeft', () => {
  it('are pure and reversible per data set', () => {
    const p = dualAxisFixture({ bindRight: false });
    const before = JSON.stringify(p);
    const ids = groupsOf(p).map((g) => g.id);
    const right = bindRight(p, [ids[0]]);
    expect(JSON.stringify(p)).toBe(before);
    expect(right.charts[0].layers[0].groupOverrides[ids[0]].axisBinding).toBe('secondary');
    expect(right.charts[0].layers[0].groupOverrides[ids[1]]).toBeUndefined();
    const left = bindLeft(right, [ids[0]]);
    expect(left.charts[0].layers[0].groupOverrides[ids[0]].axisBinding).toBe('primary');
  });
  it('a Global write reaches every data set and clears their overrides', () => {
    const p = dualAxisFixture();
    const q = patchStyle(p.charts[0].id, 'all', { axisBinding: 'secondary' })(p);
    expect(q.charts[0].layers[0].style.axisBinding ?? q.charts[0].defaults.axisBinding).toBe('secondary');
    expect(Object.values(q.charts[0].layers[0].groupOverrides).some((o) => 'axisBinding' in o)).toBe(false);
  });
});

describe('axis commands', () => {
  it('patchAxis y2Axis changes only y2Axis', () => {
    const p = createExampleProject();
    const q = patchAxis(p.charts[0].id, 'y2Axis', { title: 'Right', max: 5 })(p);
    expect(q.charts[0].y2Axis).toMatchObject({ title: 'Right', max: 5 });
    expect(q.charts[0].xAxis).toEqual(p.charts[0].xAxis);
    expect(q.charts[0].yAxis).toEqual(p.charts[0].yAxis);
  });
  it('patchBothAxes patches x, y and y2', () => {
    const p = createExampleProject();
    const c = patchBothAxes(p.charts[0].id, { lineWidthPt: 3, tickFontSizePt: 9 })(p).charts[0];
    for (const a of [c.xAxis, c.yAxis, c.y2Axis]) expect(a).toMatchObject({ lineWidthPt: 3, tickFontSizePt: 9 });
  });
  it('removeGroup keeps y2Axis', () => {
    const f = dualAxisFixture();
    const p = patchAxis(f.charts[0].id, 'y2Axis', { title: 'Right' })(f);
    const q = removeGroup(p.dataTables[0].id, groupsOf(p)[3].id)(p);
    expect(q.charts[0].y2Axis.title).toBe('Right');
  });
});

describe('persistence', () => {
  it('round trips y2Axis and bindings', () => {
    const f = dualAxisFixture();
    const p = patchAxis(f.charts[0].id, 'y2Axis', { title: 'Right', min: 0 })(f);
    expect(parseProject(stringifyProject(p))).toEqual(p);
  });
  it('an old file without the feature loads and exports identically', () => {
    const p = createExampleProject();
    const old = JSON.parse(stringifyProject(p)) as Any;
    for (const c of old.project.charts) {
      delete c.y2Axis;
      c.defaults.yAxis = 'primary';
      delete c.defaults.axisBinding;
      for (const l of c.layers) l.style.yAxis = 'primary';
    }
    const loaded = parseProject(JSON.stringify(old));
    expect(loaded.charts[0].y2Axis).toEqual(p.charts[0].y2Axis);
    expect('yAxis' in loaded.charts[0].defaults).toBe(false);
    expect(loaded.charts[0].defaults.axisBinding).toBe('primary');
    expect('yAxis' in loaded.charts[0].layers[0].style).toBe(false);
    expect(normalize(svgOf(loaded))).toBe(normalize(svgOf(p)));
  });
  it('partial or invalid y2Axis in a file falls back to defaults', () => {
    const p = createExampleProject();
    const text = (y2: unknown) => {
      const env = JSON.parse(stringifyProject(p)) as Any;
      env.project.charts[0].y2Axis = y2;
      return JSON.stringify(env);
    };
    const base = p.charts[0].y2Axis;
    expect(parseProject(text({ title: 'R', visible: false })).charts[0].y2Axis).toEqual({ ...base, title: 'R', visible: false });
    for (const bad of [null, 'x', 5, [1, 2]]) expect(parseProjectWithNotes(text(bad)).project.charts[0].y2Axis).toEqual(base);
  });
});

describe('right axis settings', () => {
  it('unused right axis settings do not change the output; a binding makes the axis count', () => {
    const p = createExampleProject();
    const a = svgOf(p);
    const q = patchAxis(p.charts[0].id, 'y2Axis', { title: 'Right', min: 1, max: 9, showGrid: true, visible: false })(p);
    expect(svgOf(q)).toBe(a);
    expect(svgOf(bindRight(q, [groupsOf(q)[0].id]))).not.toBe(a);
  });
});

describe('right axis rendering', () => {
  const modelOf = (p: Project) => buildChartModel(p.charts[0], p.dataTables[0]);
  const withY2 = (p: Project, patch: Partial<Project['charts'][0]['y2Axis']>) => patchAxis(p.charts[0].id, 'y2Axis', patch)(p);
  const rightTicks = (svg: string, x: string) =>
    [...svg.matchAll(/<path d="M([\d.]+),([\d.]+)h5\.6"/g)].filter((m) => m[1] === x);
  const rightLabels = (svg: string) => [...svg.matchAll(/<text x="([\d.]+)"[^>]*text-anchor="start"[^>]*>([^<]*)<\/text>/g)];

  it('draws the line and one outward tick per right tick at the high edge', () => {
    const p = dualAxisFixture();
    const m = modelOf(p);
    const svg = svgOf(p);
    const right = n2(m.layout.plot.x + m.layout.plot.width);
    expect(m.y2).not.toBeNull();
    expect(svg).toContain(`d="M${right},${n2(m.layout.plot.y)}V${n2(m.layout.plot.y + m.layout.plot.height)}"`);
    expect(rightTicks(svg, right)).toHaveLength(m.y2!.ticks.length);
    expect(m.y2!.ticks.length).toBeGreaterThan(1);
  });
  it('start-anchors bold labels with the right axis format', () => {
    const p = dualAxisFixture();
    const m = modelOf(p);
    const labels = rightLabels(svgOf(p));
    expect(labels.map((l) => l[2])).toEqual(m.y2!.ticks.map(m.y2!.tickLabel));
    const x = n2(m.layout.plot.x + m.layout.plot.width + 5.6 + 3);
    for (const l of labels) expect(Number(l[1])).toBeCloseTo(Number(x), 2);
    expect(svgOf(p)).toContain('font-weight="bold"');
  });
  it('the right format is independent of the left one', () => {
    const m = modelOf(dualAxisFixture());
    expect(m.y.ticks.map(m.y.tickLabel)).not.toEqual(m.y2!.ticks.map(m.y2!.tickLabel));
  });
  it('draws a rotated right title', () => {
    const p = withY2(dualAxisFixture(), { title: 'Right title' });
    const m = modelOf(p);
    const t = m.layout.y2Title!;
    expect(svgOf(p)).toMatch(new RegExp(`transform="rotate\\(-90 ${n2(t.x)} ${n2(t.y)}\\)"[^>]*>Right title</text>`));
  });
  it('leaks no editor attributes into export, and only the editor marks the axes as clickable', () => {
    const p = withY2(dualAxisFixture(), { title: 'Right title', showGrid: true });
    const svg = svgOf(p);
    expect(svg).not.toContain('data-');
    const html = renderToStaticMarkup(
      createElement(ChartSvg, { chart: p.charts[0], model: modelOf(p), editor: { selection: { kind: 'chart' } as never }, cssWidth: '1px', cssHeight: '1px' }),
    );
    // Axes are clickable in the editor (they open the axis settings); only the editor render carries the attribute.
    expect(html).toContain('data-hit="axis"');
    const right = n2(modelOf(p).layout.plot.x + modelOf(p).layout.plot.width);
    expect(html).toContain(`d="M${right},`);
  });
  it('is byte-identical when no data set uses the right axis', () => {
    const p = createExampleProject();
    const q = withY2(p, { title: 'Right', showGrid: true, visible: true });
    expect(svgOf(q)).toBe(svgOf(p));
    // One fixture: its symbols (on by default) are jittered from their ids, which differ between fixtures.
    const f = dualAxisFixture({ bindRight: false });
    expect(svgOf(withY2(f, { title: 'R' }))).toBe(svgOf(f));
  });
  it('a hidden right axis draws no line, ticks, labels, title or grid', () => {
    const p = dualAxisFixture();
    const hidden = withY2(p, { visible: false, title: 'Right title', showGrid: true });
    const svg = svgOf(hidden);
    expect(rightLabels(svg)).toHaveLength(0);
    expect(svg).not.toContain('Right title');
    expect(svg).not.toContain('stroke-dasharray');
    const m = modelOf(hidden);
    expect(rightTicks(svg, n2(m.layout.plot.x + m.layout.plot.width))).toHaveLength(0);
  });
  it('right gridlines are dashed only when the left grid is drawn', () => {
    const p = dualAxisFixture();
    const m = modelOf(withY2(p, { showGrid: true }));
    const dashed = svgOf(withY2(patchAxis(p.charts[0].id, 'yAxis', { showGrid: true })(p), { showGrid: true }));
    const plain = svgOf(withY2(patchAxis(p.charts[0].id, 'yAxis', { showGrid: false })(p), { showGrid: true }));
    expect(dashed).toContain('stroke-dasharray="3 3"');
    expect(plain).not.toContain('stroke-dasharray');
    const lines = (s: string) =>
      [...s.matchAll(/<g stroke="#d0d0d0"[^>]*>(.*?)<\/g>/g)].reduce((n, g) => n + (g[1].match(/<path/g)?.length ?? 0), 0);
    expect(lines(plain)).toBe(m.y2!.ticks.length);
    expect(lines(dashed)).toBe(m.y2!.ticks.length + m.y.ticks.length);
  });
});
