import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { capabilitiesOf } from '../../model/graph/capabilities';
import { xySeries } from '../../model/table/tableLayout';
import { NO_FIT_SETTINGS } from '../../model/options/fitOptions';
import type { Annotation, Bracket, ChartType, Project } from '../../model/types';
import { n2 } from '../../model/units';
import { addAnnotation, addBracket, addChart, addDataTable, addReferenceLine, patchAxis, patchChart, patchStyle, replaceTableData } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { annotationPlacer } from '../shared/scene/annotationPlace';
import { referenceLinesOf } from '../shared/scene/referenceLines';
import { chartToSvgString } from '../export/export';
import { placeXyBrackets } from './xyBrackets';
import { buildXyModel } from './xyModel';
import { xyTooltipLines } from '../tooltip';

const tableOf = (p: Project) => p.dataTables.find((t) => t.id === 't')!;
const chartOf = (p: Project) => p.charts.find((c) => c.id === 'c')!;
const model = (p: Project) => buildXyModel(chartOf(p), tableOf(p));
const svg = (p: Project) => chartToSvgString(chartOf(p), tableOf(p));
const sid = (p: Project) => xySeries(tableOf(p)).map((s) => s.id);

/** X = 1 to 4; A on a small scale, B on a large one, C small again. */
const X = [1, 2, 3, 4];
const A = [2, 3, 5, 6];
const B = [100, 200, 300, 400];
const C = [3, 4, 8, 9];
const setup = (type: ChartType = 'xyScatter'): Project => {
  let p = addDataTable('t', 'xy', { sample: true })(createExampleProject());
  p = replaceTableData('t', { names: ['X', 'A', 'B', 'C'], titles: null, values: X.map((x, i) => [x, A[i], B[i], C[i]]) })(p);
  return addChart('c', 't', undefined, type)(p);
};
/** Series B on the right axis. */
const dual = (type: ChartType = 'xyScatter', p: Project = setup(type)): Project => {
  return patchStyle('c', sid(p)[1], { axisBinding: 'secondary' })(p);
};

/** Where a value falls on the page by an axis with the given domain, worked out here from the plot rectangle (no call into the scale). */
const at = (v: number, domain: [number, number], plot: { y: number; height: number }, log = false) => {
  const [f, lo, hi] = log ? [Math.log10(v), Math.log10(domain[0]), Math.log10(domain[1])] : [v, domain[0], domain[1]];
  return plot.y + plot.height - ((f - lo) / (hi - lo)) * plot.height;
};

const numbersIn = (path: string): number[] => [...path.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0]));

/** A cheap hash (FNV-1a) of a drawing, with the random part of the ids left out and numbers rounded so that the last digit of a float does not matter. */
const hash = (s: string): string => {
  let h = 0x811c9dc5;
  for (const ch of s.replace(/(grp|obs|row|tbl|table)_[a-z0-9]+/g, '$1_').replace(/-?\d+\.\d+/g, (m) => Number(m).toFixed(3))) h = Math.imul(h ^ ch.charCodeAt(0), 0x01000193) >>> 0;
  return h.toString(16);
};

describe('the right Y axis of an XY chart', () => {
  it('is offered for the charts of points, lines, bars, spikes and areas, not for offset traces and vectors', () => {
    for (const t of ['xyScatter', 'xyLine', 'xyLineSymbols', 'xyBubble', 'xyBars', 'xySpikes', 'xyArea'] as const) expect(capabilitiesOf(t).secondaryAxis).toBe(true);
    for (const t of ['xyOffset', 'xyVector', 'survival', 'histogram'] as const) expect(capabilitiesOf(t).secondaryAxis).toBe(false);
  });

  it('gives each axis the range of its own series, and places each series by its own axis', () => {
    const m = model(dual());
    expect(m.y2).not.toBeNull();
    // A and C (2 to 9) are on the left, B (100 to 400, starting near zero, so zero is in range) on the right.
    expect(m.y.domain[1]).toBeLessThan(20);
    expect(m.y2!.domain[0]).toBe(0);
    expect(m.y2!.domain[1]).toBeGreaterThanOrEqual(400);
    expect(m.y2!.domain[1]).toBeLessThan(500);
    const { plot } = m.layout;
    const [a, b, c] = m.series;
    expect([a.axis, b.axis, c.axis]).toEqual(['primary', 'secondary', 'primary']);
    a.points.forEach((p, i) => expect(p.py).toBeCloseTo(at(A[i], m.y.domain, plot), 9));
    b.points.forEach((p, i) => expect(p.py).toBeCloseTo(at(B[i], m.y2!.domain, plot), 9));
    // The top of the right axis is a value of the order of 400, which is far above the top of the left axis.
    expect(m.y2!.domain[1]).toBeGreaterThan(10 * m.y.domain[1]);
  });

  it('draws the plot narrower than without it, to leave room for its numbers and its title', () => {
    const single = model(setup());
    const two = model(dual());
    expect(two.layout.plot.width).toBeLessThan(single.layout.plot.width);
    expect(two.layout.y2Title).toBeNull();
    const titled = model(patchAxis('c', 'y2Axis', { title: 'Right' })(dual()));
    expect(titled.layout.y2Title).not.toBeNull();
    expect(titled.layout.plot.width).toBeLessThan(two.layout.plot.width);
    // The title stands beyond the numbers, inside the chart.
    expect(titled.layout.y2Title!.x).toBeGreaterThan(titled.layout.plot.x + titled.layout.plot.width);
    expect(titled.layout.y2Title!.x).toBeLessThan(titled.widthPt);
  });

  it('is drawn in the figure with its line, its ticks, its numbers, its title and the dashed right gridlines', () => {
    const p = patchAxis('c', 'y2Axis', { title: 'Right', showGrid: true })(patchAxis('c', 'yAxis', { title: 'Left', showGrid: true })(dual()));
    const s = svg(p);
    expect(s).toContain('id="y2-axis"');
    expect(s).toContain('id="y2-axis-title"');
    expect(s).toContain('>Right<');
    for (const t of model(p).y2!.ticks) expect(s).toContain(`>${model(p).y2!.tickLabel(t)}<`);
    expect(s).toContain('stroke-dasharray="3 3"');
  });

  it('puts a note in the legend for the series on the right axis', () => {
    const s = svg(dual());
    expect(s).toContain('(right axis)');
    expect(svg(setup())).not.toContain('(right axis)');
  });

  it('has its own scale rules: a log scale on the right and a linear one on the left, each with its own positions', () => {
    const m = model(patchAxis('c', 'y2Axis', { scale: 'log10' })(dual()));
    expect(m.y2!.log).toBeTruthy();
    expect(m.y.log).toBeFalsy();
    const { plot } = m.layout;
    m.series[1].points.forEach((p, i) => expect(p.py).toBeCloseTo(at(B[i], m.y2!.domain, plot, true), 9));
    m.series[0].points.forEach((p, i) => expect(p.py).toBeCloseTo(at(A[i], m.y.domain, plot), 9));
    // A value of 0 or less on the log right axis is left out and counted; the left axis keeps it.
    const zero = replaceTableData('t', { names: ['X', 'A', 'B', 'C'], titles: null, values: X.map((x, i) => [x, i === 0 ? 0 : A[i], i === 0 ? 0 : B[i], C[i]]) })(patchAxis('c', 'y2Axis', { scale: 'log10' })(dual()));
    const mz = model(zero);
    expect(mz.series[0].points).toHaveLength(4);
    expect(mz.series[1].points).toHaveLength(3);
    expect(mz.warnings).toContain('1 point has a value of 0 or less on a log axis and is not drawn.');
  });

  it('breaks only the left axis: a stored break of the right axis is ignored, as is its absence', () => {
    const left = patchAxis('c', 'yAxis', { breaks: [{ from: 4, to: 5 }] })(dual());
    const m = model(left);
    expect(m.y.segments).toBeTruthy();
    expect(m.y2!.segments).toBeUndefined();
    const right = model(patchAxis('c', 'y2Axis', { breaks: [{ from: 150, to: 250 }] })(dual()));
    expect(right.y2!.segments).toBeUndefined();
    expect(right.series[1].points).toHaveLength(4);
  });

  it('takes manual limits and a reversed direction on its own', () => {
    const m = model(patchAxis('c', 'y2Axis', { min: 0, max: 500, reverse: true })(dual()));
    expect(m.y2!.domain).toEqual([0, 500]);
    const { plot } = m.layout;
    // Reversed: 0 at the top.
    m.series[1].points.forEach((p, i) => expect(p.py).toBeCloseTo(plot.y + (B[i] / 500) * plot.height, 9));
    expect(m.y.domain[1]).toBeLessThan(20);
  });

  it('is not drawn, and takes no room, while it is hidden; the notice says the scale is missing', () => {
    // With the legend hidden on both, so that the longer name of a series on the right does not take room.
    const quiet = (q: Project) => patchChart('c', { legend: { ...chartOf(q).legend, visible: false } })(q);
    const p = quiet(patchAxis('c', 'y2Axis', { visible: false })(dual()));
    const m = model(p);
    // The right edge of the plot is where it is without a right axis (the left numbers may differ: the left axis holds fewer series).
    const edge = (q: ReturnType<typeof model>) => q.layout.plot.x + q.layout.plot.width;
    expect(edge(m)).toBeCloseTo(edge(model(quiet(setup()))), 9);
    expect(svg(p)).not.toContain('id="y2-axis"');
    expect(m.warnings).toContain('The right Y axis is hidden, so data sets bound to it have no visible scale.');
  });

  it('notices: two axes with no titles, the same title, no series on the left, the legend hidden', () => {
    const untitled = model(dual()).warnings;
    expect(untitled).toContain('Two Y axes are in use; give each a title so they can be told apart.');
    const same = model(patchAxis('c', 'y2Axis', { title: 'Same' })(patchAxis('c', 'yAxis', { title: 'Same' })(dual()))).warnings;
    expect(same).toContain('Both Y axes have the same title.');
    expect(same).not.toContain('Two Y axes are in use; give each a title so they can be told apart.');
    let allRight = setup();
    for (const id of sid(allRight)) allRight = patchStyle('c', id, { axisBinding: 'secondary' })(allRight);
    expect(model(allRight).warnings).toContain('No data sets use the left Y axis; it shows an empty scale.');
    expect(model(patchChart('c', { legend: { ...chartOf(dual()).legend, visible: false } })(dual())).warnings).toContain('The legend is hidden, so data sets on the right axis are not marked.');
    // No notice at all while no series is on the right.
    expect(model(setup()).warnings.filter((w) => /Y axes|right/i.test(w))).toEqual([]);
  });

  it('keeps a stored binding that the chart type cannot honour, and ignores it', () => {
    for (const t of ['xyOffset', 'xyVector'] as const) {
      const p = dual(t);
      expect(model(p).y2 ?? null).toBeNull();
      expect(svg(p)).not.toContain('id="y2-axis"');
    }
  });

  it('draws spikes, areas and bars from the baseline of their own axis', () => {
    for (const t of ['xySpikes', 'xyArea', 'xyBars'] as const) {
      const m = model(dual(t));
      const { plot } = m.layout;
      const b = m.series[1];
      const bottom = plot.y + plot.height;
      if (t === 'xyBars') {
        b.bars!.forEach((bar, i) => {
          expect(bar.y + bar.height).toBeCloseTo(bottom, 9);
          expect(bar.height).toBeCloseTo((B[i] / m.y2!.domain[1]) * plot.height, 9);
        });
        m.series[0].bars!.forEach((bar, i) => expect(bar.y).toBeCloseTo(at(A[i], m.y.domain, plot), 9));
      } else if (t === 'xySpikes') {
        // Each stem runs from the bottom (0 on the right axis) up to its point.
        expect(b.linePath.startsWith(`M${n2(b.points[0].px)},${n2(bottom)}L${n2(b.points[0].px)},${n2(b.points[0].py)}`)).toBe(true);
      } else {
        expect(b.areaPath!.startsWith(`M${n2(b.points[0].px)},${n2(bottom)}L`)).toBe(true);
      }
    }
  });

  it('draws the error bars and the fitted curve of a series on the right by the right scale', () => {
    let p = addDataTable('t', 'xy', { layout: { kind: 'replicates', n: 3 }, sample: true })(createExampleProject());
    p = addChart('c', 't', undefined, 'xyScatter')(p);
    p = patchAxis('c', 'y2Axis', { min: 0, max: 50 })(patchStyle('c', sid(p)[1], { axisBinding: 'secondary' })(p));
    const fit = { ...NO_FIT_SETTINGS, model: 'linear' as const };
    const m = buildXyModel(chartOf(p), tableOf(p), fit);
    const { plot } = m.layout;
    const s = m.series[1];
    const lo = (v: number) => at(v, [0, 50], plot);
    expect(m.y2!.domain).toEqual([0, 50]);
    for (const pt of s.points) {
      expect(pt.py).toBeCloseTo(lo(pt.y), 9);
      // The ends of the bar are where the right axis puts the ends of the interval.
      const { lower, upper } = pt.stats!.interval;
      expect(numbersIn(s.errorPath).some((v) => Math.abs(v - lo(upper!)) < 1e-6)).toBe(true);
      expect(numbersIn(s.errorPath).some((v) => Math.abs(v - lo(lower!)) < 1e-6)).toBe(true);
    }
    // The curve starts at the first X of the data, at the height the right axis gives the value of the fitted line there (its two parameters are the result of the fit; where it is drawn is what is checked).
    const [ia, sl] = s.fit!.summary!.params.map((q) => q.value);
    const x0 = Math.min(...s.points.map((q) => q.x));
    const start = /^M([-\d.]+),([-\d.]+)/.exec(s.fit!.path)!;
    expect(Number(start[1])).toBeCloseTo(s.points[0].px, 1);
    expect(Number(start[2])).toBeCloseTo(lo(ia + sl * x0), 1);
    // The same series on the left axis has its curve elsewhere: the curve does not follow the left scale.
    const left = buildXyModel(chartOf(patchStyle('c', sid(p)[1], { axisBinding: 'primary' })(p)), tableOf(p), fit).series[1];
    expect(left.fit!.path).not.toBe(s.fit!.path);
  });

  it('tells in the tooltip which axis a series is on, only while two are in use', () => {
    const m = model(dual());
    const hit = { kind: 'point', groupId: m.series[1].groupId, objectId: m.series[1].points[0].id } as const;
    expect(xyTooltipLines(m, tableOf(dual()), hit as never)).toContain('Axis: Right Y axis');
    const one = model(setup());
    expect(xyTooltipLines(one, tableOf(setup()), { kind: 'point', groupId: one.series[0].groupId, objectId: one.series[0].points[0].id } as never)!.join('|')).not.toContain('Axis:');
  });
});

describe('what stays on the left axis', () => {
  const left = (p: Project) => model(p);

  it('reference lines at a Y value, and shaded regions in Y, are the left axis', () => {
    const p = addReferenceLine('c', { id: 'r', axis: 'y', value: 4, color: '#000000', widthPt: 1, lineStyle: 'solid', label: '', labelPosition: 'end', fontSizePt: 12 } as never)(dual());
    const m = left(p);
    const placed = referenceLinesOf(chartOf(p), { family: 'xy', model: m }).placed;
    expect(placed).toHaveLength(1);
    expect(placed[0].d).toContain(`,${n2(at(4, m.y.domain, m.layout.plot))}`);
    expect(m.yScale(4)).toBeCloseTo(at(4, m.y.domain, m.layout.plot), 9);
  });

  it('annotations in data units are in the units of the left axis: the one decision about them', () => {
    const a: Annotation = { id: 'n', text: 'x', xFrac: 0.5, yFrac: 0.5, fontSizePt: 12, color: '#000000', opacity: 1, anchor: 'data', x: 2, y: 4 };
    const p = addAnnotation('c', a)(dual());
    const m = left(p);
    const placer = annotationPlacer({ family: 'xy', model: m }, m.widthPt, m.heightPt);
    const place = placer.place(a)!;
    expect(place.y).toBeCloseTo(at(4, m.y.domain, m.layout.plot), 9);
    expect(place.x).toBeCloseTo(m.xScale(2), 9);
    // Dragged back to the page, the position is read in the left units.
    expect(placer.fromPage(place.x, place.y).y).toBeCloseTo(4, 6);
    // 400 is on the right axis only: on the left it is outside the range, so the annotation is not drawn and counted.
    const high: Annotation = { ...a, id: 'h', y: 400 };
    expect(placer.place(high)).toBeNull();
    expect(placer.skipped([high])).toEqual([high]);
  });
});

describe('comparison brackets between series on the right axis', () => {
  const bracket = (id: string, from: string, to: string, atX: number): Bracket => ({ id, from, to, label: '*', color: '#000000', widthPt: 2, fontSizePt: 12, at: atX });

  it('are placed by the right axis when both series are on it, and the lanes ignore which axis a bracket is on only when it is the same', () => {
    let p = dual();
    p = patchStyle('c', sid(p)[2], { axisBinding: 'secondary' })(p);
    const [, b, c] = sid(p);
    p = addBracket('c', bracket('k', b, c, 2))(p);
    const m = model(p);
    expect(m.brackets).toHaveLength(1);
    const { plot } = m.layout;
    // C is 4 and B is 200 at X = 2; on the right axis (0 to 400) they stand at these heights.
    expect(m.y2!.domain[1]).toBeGreaterThanOrEqual(400);
    const ends = [m.brackets![0].y1, m.brackets![0].y2].sort((u, v) => u - v);
    expect(ends[0]).toBeCloseTo(at(200, m.y2!.domain, plot), 9);
    expect(ends[1]).toBeCloseTo(at(4, m.y2!.domain, plot), 9);
  });

  it('are not drawn between series on different axes, and the notice says why', () => {
    let p = dual();
    const [a, b] = sid(p);
    p = addBracket('c', bracket('k', a, b, 2))(p);
    const m = model(p);
    expect(m.brackets).toEqual([]);
    expect(m.warnings).toContain('Bracket "*" is not drawn: the two data sets it joins are on different Y axes, so their values cannot be compared on one scale.');
  });

  it('stand in separate lanes when they are at one X and on different axes, whatever their values', () => {
    const series = [
      { id: 'a', axis: 'primary' as const, points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] },
      { id: 'a2', axis: 'primary' as const, points: [{ x: 2, y: 3 }] },
      { id: 'b', axis: 'secondary' as const, points: [{ x: 2, y: 300 }] },
      { id: 'b2', axis: 'secondary' as const, points: [{ x: 2, y: 400 }] },
    ];
    const { placed } = placeXyBrackets([bracket('l', 'a', 'a2', 2), bracket('r', 'b', 'b2', 2)], series);
    expect(placed.map((q) => q.lane).sort()).toEqual([1, 2]);
    expect(placed.find((q) => q.bracket.id === 'r')!.axis).toBe('secondary');
    // Series without an axis (the older callers) are all on the left and keep their lanes as before.
    const old = placeXyBrackets([bracket('l', 'a', 'a2', 2)], series.map(({ id, points }) => ({ id, points })));
    expect(old.placed[0].lane).toBe(1);
  });
});

describe('export and storage', () => {
  it('writes the right axis into the SVG inside the page, at the size the chart has', () => {
    const p = patchAxis('c', 'y2Axis', { title: 'Right axis title' })(dual());
    const s = svg(p);
    expect(s).toContain(`viewBox="0 0 ${model(p).widthPt} ${model(p).heightPt}"`);
    const title = /id="y2-axis-title"[^>]*x="([-\d.]+)"|x="([-\d.]+)"[^>]*id="y2-axis-title"/.exec(s);
    expect(title).not.toBeNull();
    // Every number written for the right axis lies inside the drawing.
    const group = /<g[^>]*id="y2-axis"[\s\S]*?<\/g>/.exec(s)![0];
    for (const m of group.matchAll(/\bx="([-\d.]+)"/g)) expect(Number(m[1])).toBeLessThanOrEqual(model(p).widthPt);
  });

  it('is the same drawing twice, and keeps the binding and the axis through a save and an open', () => {
    const p = patchAxis('c', 'y2Axis', { title: 'R', min: 0, max: 500 })(dual());
    expect(svg(p)).toBe(svg(p));
    const back = parseProject(stringifyProject(p));
    expect(chartOf(back).y2Axis).toMatchObject({ title: 'R', min: 0, max: 500 });
    expect(svg(back)).toBe(svg(p));
    expect(model(back).series.map((s) => s.axis)).toEqual(['primary', 'secondary', 'primary']);
  });
});

describe('a chart without the right axis is drawn as it was', () => {
  it('ignores a stored right axis while no series is bound to it', () => {
    const plain = setup();
    const stale = patchAxis('c', 'y2Axis', { title: 'Right', min: 5, max: 9, showGrid: true, scale: 'log10', reverse: true })(plain);
    expect(svg(stale)).toBe(svg(plain));
    const m = model(stale);
    expect([m.y2 ?? null, m.y2Scale ?? null]).toEqual([null, null]);
    expect(m.series.every((s) => (s.axis ?? 'primary') === 'primary')).toBe(true);
  });

  it('is bound back to the left: the drawing is that of a chart that never had a right axis', () => {
    const plain = setup();
    const back = patchStyle('c', sid(plain)[1], { axisBinding: 'primary' })(dual('xyScatter', plain));
    expect(svg(back)).toBe(svg(plain));
  });

  // Recorded before the right axis was built (the drawings of 29 Oct 2026, numbers rounded to three decimals). If a change to the drawing
  // of XY charts is meant, record these again: print hash(svg(setup(type))) for each type.
  const RECORDED: Record<string, string> = { xyScatter: 'd2f50e5f', xyLine: '8769a407', xyLineSymbols: '30adbfce', xyBars: '9e1d0753', xySpikes: '17fcbbe0', xyArea: '27d0418a' };
  for (const [type, expected] of Object.entries(RECORDED)) {
    it(`${type}: the recorded drawing`, () => {
      expect(hash(svg(setup(type as ChartType)))).toBe(expected);
    });
  }
});
