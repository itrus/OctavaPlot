import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { resolveSummary } from '../model/summary';
import type { Project } from '../model/types';
import { patchAxis, patchLegend, patchStyle, setChartType } from '../state/commands';
import { statsFor } from '../stats/summary';
import { bindLeft, bindRight, dualAxisFixture } from '../testing/dualAxisFixture';
import { buildChartModel } from './model';

const modelOf = (p: Project) => buildChartModel(p.charts[0], p.dataTables[0]);
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
    expect(modelOf(p).groups[2].stats).toBe(statsFor(g.observations, resolveSummary(p.charts[0].layers[0], g.id)));
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
