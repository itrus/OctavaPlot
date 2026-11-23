import { describe, expect, it } from 'vitest';
import { createExampleProject, DEFAULT_STYLE } from '../../model/defaults';
import { resolveSummary } from '../../model/graph/summary';
import type { Project } from '../../model/types';
import { patchAxis, patchLegend, patchStyle, setChartType, patchBothAxes, removeGroup } from '../../state/commands';
import { statsFor } from '../../stats/summary';
import { bindLeft, bindRight, dualAxisFixture, DUAL_AXIS_DATA } from '../../testing/dualAxisFixture';
import { buildColumnModel } from './columnModel';
import { parseProject, parseProjectWithNotes, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { n2 } from '../../model/units';
import { ChartCanvas } from '../anyModel';

const modelOf = (p: Project) => buildColumnModel(p.charts[0], p.dataTables[0]);
const idsOf = (p: Project) => p.dataTables[0].groups.map((g) => g.id);
const meanChart = (p: Project): Project => {
  const withType = setChartType(p.charts[0].id, 'mean')(p);
  return patchStyle(withType.charts[0].id, 'all', { showLines: true })(withType);
};
const titled = (p: Project): Project =>
  patchLegend(p.charts[0].id, { visible: true })(
    patchAxis(p.charts[0].id, 'y2Axis', { title: 'Right' })(patchAxis(p.charts[0].id, 'yAxis', { title: 'Left' })(p)),
  );
const withSymbols = (p: Project): Project => patchStyle(p.charts[0].id, 'all', { showSymbols: true })(p);

describe('per-axis domains', () => {
  it('ranges each axis from its own data sets: [0,7] and [0,400]', () => {
    const m = modelOf(dualAxisFixture());
    expect(m.y.domain).toEqual([0, 7]);
    expect(m.y2?.domain).toEqual([0, 400]);
    expect(m.groups.map((g) => g.axis)).toEqual(['primary', 'primary', 'secondary', 'secondary']);
  });
  it('maps bars and error bars through their own axis', () => {
    const m = modelOf(dualAxisFixture());
    const [a, , c] = m.groups;
    const base = m.layout.plot.y + m.layout.plot.height;
    expect(a.bar!.y).toBeCloseTo(m.yScale(2), 9);
    expect(a.bar!.y + a.bar!.height).toBeCloseTo(base, 9);
    expect(c.bar!.y).toBeCloseTo(m.y2Scale!(200), 9);
    expect(c.bar!.y + c.bar!.height).toBeCloseTo(base, 9);
    // The error bar of C runs from 300 down to 100 on the right scale.
    const ends = c.errorBar!.d.match(/^M[-\d.]+,([-\d.]+)V([-\d.]+)/)!;
    expect(Number(ends[1])).toBeCloseTo(m.y2Scale!(300), 9);
    expect(Number(ends[2])).toBeCloseTo(m.y2Scale!(100), 9);
    expect(c.errorBar!.clippedUpper || c.errorBar!.clippedLower).toBe(false);
  });
  it('a single pool means no right axis and no warnings', () => {
    const m = modelOf(dualAxisFixture({ bindRight: false }));
    expect(m.y2).toBeNull();
    expect(m.y2Scale).toBeNull();
    expect(m.layout.y2Title).toBeNull();
    expect(m.y.domain[1]).toBeGreaterThanOrEqual(400);
    expect(m.warnings).toEqual([]);
  });
  it('binding moves only the value coordinate', () => {
    const p = withSymbols(dualAxisFixture({ bindRight: false }));
    const q = bindRight(p, [idsOf(p)[2]]);
    const a = modelOf(p).groups[2];
    const b = modelOf(q).groups[2];
    // The plot narrows for the right axis block; jitter scales with the bar width, so compare in bar widths.
    const offsets = (g: typeof a) => g.points.map((pt) => (pt.cx - g.centerX) / g.bar!.width);
    expect(a.points.length).toBe(3);
    offsets(b).forEach((o, i) => expect(o).toBeCloseTo(offsets(a)[i], 9));
    expect(b.bar!.x + b.bar!.width / 2).toBeCloseTo(b.centerX, 9);
    expect(b.points.map((pt) => pt.cy)).not.toEqual(a.points.map((pt) => pt.cy));
  });
  it('right marks use right pixels', () => {
    const m = modelOf(withSymbols(dualAxisFixture()));
    const d = m.groups[3];
    expect(d.points.length).toBe(3);
    expect(d.points.map((pt) => pt.cy)).toEqual(d.points.map((pt) => m.y2Scale!(pt.value)));
    const a = m.groups[0];
    expect(a.points.map((pt) => pt.cy)).toEqual(a.points.map((pt) => m.yScale(pt.value)));
  });
  it('binding does not change statistics', () => {
    const p = dualAxisFixture();
    const q = bindLeft(p, idsOf(p));
    const stats = (pr: Project) => modelOf(pr).groups.map((g) => g.stats);
    expect(stats(p)).toEqual(stats(q));
    const g = p.dataTables[0].groups[2];
    expect(modelOf(p).groups[2].stats).toEqual(statsFor(g.observations, resolveSummary(p.charts[0].layers[0], g.id)));
  });
});

describe('scope and corrupt bindings', () => {
  it('type switch keeps bindings; Global rebinds every data set; group scope binds one', () => {
    const p = dualAxisFixture();
    const mean = modelOf(setChartType(p.charts[0].id, 'mean')(p));
    expect(mean.groups.map((g) => g.axis)).toEqual(['primary', 'primary', 'secondary', 'secondary']);
    const all = modelOf(patchStyle(p.charts[0].id, 'all', { axisBinding: 'secondary' })(p));
    expect(all.groups.map((g) => g.axis)).toEqual(['secondary', 'secondary', 'secondary', 'secondary']);
    const base = dualAxisFixture({ bindRight: false });
    const one = modelOf(bindRight(base, [idsOf(base)[1]]));
    expect(one.groups.map((g) => g.axis)).toEqual(['primary', 'secondary', 'primary', 'primary']);
  });
  it('a hand-edited unknown binding is the left axis', () => {
    const p = dualAxisFixture({ bindRight: false });
    const q = patchStyle(p.charts[0].id, idsOf(p)[0], { axisBinding: 'sideways' as never })(p);
    const m = modelOf(q);
    expect(m.groups[0].axis).toBe('primary');
    expect(m.y2).toBeNull();
  });
  it('all data sets on the right leaves an empty left axis and says so', () => {
    const p = dualAxisFixture();
    const q = patchStyle(p.charts[0].id, 'all', { axisBinding: 'secondary' })(p);
    const m = modelOf(titled(q));
    expect(m.y.domain).toEqual([0, 1]);
    expect(m.warnings).toContain('No data sets use the left Y axis; it shows an empty scale.');
  });
});

describe('manual limits, notices and legend', () => {
  it('applies manual limits per axis and prefixes scale warnings', () => {
    const p = titled(dualAxisFixture());
    const left = patchAxis(p.charts[0].id, 'yAxis', { min: 1, max: 20 })(p);
    const m = modelOf(patchAxis(p.charts[0].id, 'y2Axis', { min: 10, max: 5 })(left));
    expect(m.y.domain).toEqual([1, 20]);
    expect(m.y2!.domain[1]).toBeGreaterThan(m.y2!.domain[0]);
    expect(m.warnings).toContain('Right Y axis: Y minimum must be below the maximum; using automatic limits.');
    expect(m.warnings.some((w) => w.startsWith('Left Y axis: ') && w.includes('start at 1 instead of zero'))).toBe(true);
  });
  it('single axis warnings carry no prefix', () => {
    const p = dualAxisFixture({ bindRight: false });
    const m = modelOf(patchAxis(p.charts[0].id, 'yAxis', { min: 10, max: 5 })(p));
    expect(m.warnings).toContain('Y minimum must be below the maximum; using automatic limits.');
  });
  it('tags right-axis legend entries only', () => {
    const m = modelOf(titled(dualAxisFixture()));
    expect(m.layout.legend?.items.map((i) => i.label)).toEqual(['A', 'B', 'C (right axis)', 'D (right axis)']);
    expect(m.groups.map((g) => g.label)).toEqual(['A', 'B', 'C', 'D']);
    expect(modelOf(titled(dualAxisFixture({ bindRight: false }))).layout.legend?.items.map((i) => i.label)).toEqual(['A', 'B', 'C', 'D']);
  });
  it('reports two-axis notices through the model', () => {
    const p = dualAxisFixture();
    expect(modelOf(p).warnings).toContain('Two Y axes are in use; give each a title so they can be told apart.');
    const hidden = patchLegend(p.charts[0].id, { visible: false })(titled(p));
    expect(modelOf(hidden).warnings).toContain('The legend is hidden, so data sets on the right axis are not marked.');
    expect(modelOf(titled(p)).warnings).toEqual([]);
  });
  it('ignores right axis settings while unused', () => {
    const p = dualAxisFixture({ bindRight: false });
    const q = patchAxis(p.charts[0].id, 'y2Axis', { title: 'R', min: 1, max: 2, visible: false })(p);
    const a = modelOf(p);
    const b = modelOf(q);
    expect(b.y2).toBeNull();
    expect(b.layout.plot).toEqual(a.layout.plot);
    expect(b.warnings).toEqual(a.warnings);
  });
  it('the example project has no right axis and no warnings', () => {
    const m = modelOf(createExampleProject());
    expect(m.y2).toBeNull();
    expect(m.warnings).toEqual([]);
  });
});

describe('connectors', () => {
  it('connects same-axis neighbours only and counts the skipped segments', () => {
    const p = dualAxisFixture();
    const m = modelOf(titled(meanChart(p)));
    expect(m.groups.map((g) => g.connector !== null)).toEqual([true, false, true, false]);
    expect(m.warnings).toEqual(['1 connector segment between data sets on different Y axes was not drawn.']);
    const alt = bindRight(bindLeft(p, idsOf(p)), [idsOf(p)[1], idsOf(p)[3]]);
    const n = modelOf(titled(meanChart(alt)));
    expect(n.groups.map((g) => g.connector !== null)).toEqual([false, false, false, false]);
    expect(n.warnings).toEqual(['3 connector segments between data sets on different Y axes were not drawn.']);
  });
  it('a connector on the right axis uses the right scale', () => {
    const m = modelOf(meanChart(dualAxisFixture()));
    expect(m.groups[2].connector!.d).toBe(
      `M${m.groups[2].centerX},${m.y2Scale!(200)}L${m.groups[3].centerX},${m.y2Scale!(250)}`,
    );
  });
  it('with one axis every neighbour is connected', () => {
    const m = modelOf(meanChart(dualAxisFixture({ bindRight: false })));
    expect(m.groups.filter((g) => g.connector).length).toBe(3);
  });
});

describe('clipped marks and baseline note', () => {
  it('counts clipped bars and points per axis, strictly', () => {
    const p = withSymbols(titled(dualAxisFixture()));
    const left = patchAxis(p.charts[0].id, 'yAxis', { min: 0, max: 3 })(p);
    const m = modelOf(patchAxis(p.charts[0].id, 'y2Axis', { min: 120, max: 260 })(left));
    // Left [0,3]: the centre of B (4) is outside, and so are the points 4 and 6.
    expect(m.clipped.primary).toEqual({ bars: 1, points: 2 });
    // Right [120,260]: bars at 200 and 250 are inside; points 100, 300 and 350 are outside.
    expect(m.clipped.secondary).toEqual({ bars: 0, points: 3 });
    expect(m.warnings).toContain('Left Y axis: 1 bar extends beyond the axis range and is clipped.');
    expect(m.warnings).toContain('Right Y axis: 3 points lie outside the axis range and are clipped.');
  });
  it('a value exactly on the limit is not clipped', () => {
    const p = dualAxisFixture({ bindRight: false });
    const m = modelOf(patchAxis(p.charts[0].id, 'yAxis', { min: 0, max: 350 })(p));
    expect(m.clipped.primary.points).toBe(0);
  });
  it('single axis: unprefixed counts, empty secondary', () => {
    const p = dualAxisFixture({ bindRight: false });
    const m = modelOf(patchAxis(p.charts[0].id, 'yAxis', { min: 0, max: 3 })(p));
    expect(m.clipped.secondary).toEqual({ bars: 0, points: 0 });
    expect(m.clipped.primary.bars).toBe(3);
    expect(m.warnings).toContain('3 bars extend beyond the axis range and are clipped.');
  });
  it('notes a truncated baseline per axis', () => {
    const p = titled(dualAxisFixture());
    const m = modelOf(patchAxis(p.charts[0].id, 'y2Axis', { min: 50 })(p));
    expect(m.warnings).toContain('Right Y axis: The axis range excludes zero, so bars start at 50 instead of zero.');
    expect(m.warnings.some((w) => w.startsWith('Left Y axis: The axis range'))).toBe(false);
  });
});

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
  it('a file without the right axis loads and exports identically', () => {
    const p = createExampleProject();
    const old = JSON.parse(stringifyProject(p)) as Any;
    for (const c of old.project.charts) {
      delete c.y2Axis;
      delete c.defaults.axisBinding;
    }
    const loaded = parseProject(JSON.stringify(old));
    expect(loaded.charts[0].y2Axis).toEqual(p.charts[0].y2Axis);
    expect(loaded.charts[0].defaults.axisBinding).toBe('primary');
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
  const modelOf = (p: Project) => buildColumnModel(p.charts[0], p.dataTables[0]);
  const withY2 = (p: Project, patch: Partial<Project['charts'][0]['y2Axis']>) => patchAxis(p.charts[0].id, 'y2Axis', patch)(p);
  const rightTicks = (svg: string, x: string) =>
    [...svg.matchAll(/<path d="M([\d.]+),([\d.]+)h11"/g)].filter((m) => m[1] === x);
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
    const x = n2(m.layout.plot.x + m.layout.plot.width + 11 + 6);
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
      createElement(ChartCanvas, { chart: p.charts[0], any: { family: 'column' as const, model: modelOf(p) }, editor: { selection: { kind: 'chart' } as never }, cssWidth: '1px', cssHeight: '1px' }),
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
