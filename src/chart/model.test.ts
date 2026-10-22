import { describe, expect, it } from 'vitest';
import { createExampleProject, DEFAULT_STYLE } from '../model/defaults';
import { permuteRows } from '../model/rows';
import type { ChartStyle } from '../model/types';
import { resolveStyle } from '../model/style';
import { clearSummaryOverrides, composeCommands, patchStyle, patchSummary, resetStyle, setChartType, setCells } from '../state/commands';
import { parseProject, stringifyProject } from '../state/serialize';
import { addGroup, patchAxis, setDisplayName, setRowTitles } from '../state/commands';
import { buildChartModel } from './model';
import { resolveYAxis } from './scales';

describe('resolveYAxis', () => {
  it('includes zero for bars and covers error endpoints', () => {
    const y = resolveYAxis({ values: [1.2, 1.9, 2.4], includeZero: true, min: null, max: null, majorInterval: null, tickCountHint: 6 });
    expect(y.domain[0]).toBe(0);
    expect(y.domain[1]).toBeGreaterThanOrEqual(2.4);
    expect(y.ticks[0]).toBe(0);
  });
  it('honours manual limits and interval', () => {
    const y = resolveYAxis({ values: [1, 2], includeZero: true, min: 0.5, max: 3, majorInterval: 0.5, tickCountHint: 6 });
    expect(y.domain).toEqual([0.5, 3]);
    expect(y.ticks).toEqual([0.5, 1, 1.5, 2, 2.5, 3]);
  });
  it('ignores an inverted manual range with a warning', () => {
    const y = resolveYAxis({ values: [1, 2], includeZero: true, min: 5, max: 1, majorInterval: null, tickCountHint: 6 });
    expect(y.warnings.length).toBeGreaterThan(0);
    expect(y.domain[0]).toBeLessThan(y.domain[1]);
  });
});

describe('style hierarchy and chart model', () => {
  const project = createExampleProject();
  const table = project.dataTables[0];
  const chart0 = project.charts[0];

  it('group override beats layer override beats chart defaults', () => {
    const g = table.groups[0];
    let p = patchStyle(chart0.id, 'all', { barBorderWidthPt: 3 })(project);
    p = patchStyle(chart0.id, g.id, { barBorderWidthPt: 5 })(p);
    const c = p.charts[0];
    expect(resolveStyle(c, c.layers[0], table.groups[1]).barBorderWidthPt).toBe(3);
    expect(resolveStyle(c, c.layers[0], g).barBorderWidthPt).toBe(5);
    expect(resolveStyle(chart0, chart0.layers[0], g).barBorderWidthPt).toBe(DEFAULT_STYLE.barBorderWidthPt);
  });

  it('never draws an error bar for n = 1 and reports a warning', () => {
    let p = setCells(table.id, [{ row: 0, col: 4, value: null }])(project); // no-op: only 4 groups
    p = patchSummary(chart0.id, 'all', { spread: 'sd' })(p);
    const t = p.dataTables[0];
    const cells = t.groups[0].observations.map((_, row) => ({ row, col: 0, value: row === 0 ? 2 : null }));
    p = setCells(t.id, cells)(p);
    const m = buildChartModel(p.charts[0], p.dataTables[0]);
    expect(m.groups[0].errorBar).toBeNull();
    expect(m.groups[1].errorBar).not.toBeNull();
    expect(m.warnings.some((w) => /SD is undefined for n = 1/.test(w))).toBe(true);
  });

  it('draws mean +/- SD, differs for SEM, and nothing for none or the default', () => {
    const none = buildChartModel(chart0, table);
    expect(none.groups.every((g) => g.errorBar === null)).toBe(true);
    const sd = buildChartModel(patchSummary(chart0.id, 'all', { spread: 'sd' })(project).charts[0], table);
    const sem = buildChartModel(patchSummary(chart0.id, 'all', { spread: 'sem' })(project).charts[0], table);
    expect(sd.groups.every((g) => g.errorBar !== null)).toBe(true);
    expect(sd.groups[0].errorBar!.d).not.toBe(sem.groups[0].errorBar!.d);
    expect(buildChartModel(patchSummary(chart0.id, 'all', { spread: 'none' })(project).charts[0], table).groups[0].errorBar).toBeNull();
  });

  it('applies the spread per data set and Global clears the overrides', () => {
    const g = table.groups[0];
    let p = patchSummary(chart0.id, g.id, { spread: 'sd' })(project);
    let m = buildChartModel(p.charts[0], table);
    expect(m.groups[0].errorBar).not.toBeNull();
    expect(m.groups[1].errorBar).toBeNull();
    p = patchSummary(chart0.id, 'all', { spread: 'sem' })(p);
    expect(p.charts[0].layers[0].groupSummary).toEqual({});
    m = buildChartModel(p.charts[0], table);
    expect(m.groups.every((x) => x.errorBar !== null)).toBe(true);
  });

  it('draws a CI bar and widens the scale to its endpoints', () => {
    const ci = buildChartModel(patchSummary(chart0.id, 'all', { spread: 'ci' })(project).charts[0], table);
    expect(ci.groups.every((x) => x.errorBar !== null)).toBe(true);
    expect(ci.y.domain[1]).toBeGreaterThanOrEqual(Math.max(...ci.groups.map((g) => g.stats.interval.upper ?? 0)));
  });

  it('reset keeps behaviour in one command and one history entry', () => {
    const g = table.groups[0];
    let p = patchSummary(chart0.id, g.id, { spread: 'sd' })(project);
    p = patchStyle(chart0.id, g.id, { barFill: '#ff0000' })(p);
    const reset = composeCommands(resetStyle(chart0.id, g.id, table), clearSummaryOverrides(chart0.id, g.id))(p);
    expect(reset.charts[0].layers[0].groupSummary).toEqual({});
    expect(resolveStyle(reset.charts[0], reset.charts[0].layers[0], g).barFill).not.toBe('#ff0000');
    expect(buildChartModel(reset.charts[0], table).groups[0].errorBar).toBeNull();
  });

  it('errorType is no longer a style key', () => {
    // @ts-expect-error errorType was removed from ChartStyle
    patchStyle(chart0.id, 'all', { errorType: 'sd' });
    expect('errorType' in chart0.defaults).toBe(false);
  });

  it('switching chart type keeps data and colours but applies the visibility preset', () => {
    const g = table.groups[0];
    let p = patchStyle(chart0.id, g.id, { barFill: '#ff0000' })(project);
    p = setChartType(chart0.id, 'scatter')(p);
    const c = p.charts[0];
    expect(p.dataTables).toBe(project.dataTables);
    expect(resolveStyle(c, c.layers[0], g).barFill).toBe('#ff0000');
    const m = buildChartModel(c, p.dataTables[0]);
    expect(m.groups[0].points).toHaveLength(5);
    expect(m.groups[0].bar).toBeNull();
    const back = buildChartModel(setChartType(c.id, 'bar')(p).charts[0], p.dataTables[0]);
    expect(back.groups[0].bar).not.toBeNull();
  });

  it('changing presentation settings does not change summaries', () => {
    const a = buildChartModel(chart0, table);
    const p = patchStyle(chart0.id, 'all', { symbolSizePt: 20, barFill: '#00ff00' })(project);
    const b = buildChartModel(p.charts[0], table);
    expect(b.groups.map((g) => g.summary)).toEqual(a.groups.map((g) => g.summary));
  });
});

describe('summary pipeline (S15)', () => {
  const project = createExampleProject();
  const table = project.dataTables[0];
  const chartId = project.charts[0].id;
  const setGroup = (p: typeof project, col: number, values: (number | null)[]) =>
    setCells(p.dataTables[0].id, values.map((value, row) => ({ row, col, value })))(p);
  const model = (p: typeof project) => buildChartModel(p.charts[0], p.dataTables[0]);

  it('centre moves the bar, marker, mean line and connector (median, geometric)', () => {
    let p = setGroup(project, 0, [1, 2, 3, 4, 100]);
    p = patchSummary(chartId, 'all', { centre: 'median' })(p);
    const bar = model(p);
    expect(bar.groups[0].centreValue).toBe(3);
    expect(bar.groups[0].bar!.y).toBeCloseTo(bar.yScale(3), 9);
    const mean = model(patchStyle(chartId, 'all', { showLines: true })(setChartType(chartId, 'mean')(p)));
    expect(mean.groups[0].points[0].cy).toBeCloseTo(mean.yScale(3), 9);
    expect(mean.groups[0].points[0].id).toBe(`${table.groups[0].id}:mean`);
    expect(mean.groups[0].connector!.d).toBe(
      `M${mean.groups[0].centerX},${mean.yScale(3)}L${mean.groups[1].centerX},${mean.yScale(mean.groups[1].centreValue!)}`,
    );
    const scatter = model(patchStyle(chartId, 'all', { showMeanLine: true })(setChartType(chartId, 'scatter')(p)));
    expect(scatter.groups[0].meanLine!.d).toContain(`,${scatter.yScale(3)}H`);
    const geo = model(patchSummary(chartId, 'all', { centre: 'geometricMean' })(setGroup(project, 0, [1, 10, 100, 10, 10])));
    expect(geo.groups[0].centreValue).toBeCloseTo(10, 9);
  });

  it('a data set without a centre keeps its slot and breaks the connector', () => {
    const mean = patchStyle(chartId, 'all', { showLines: true })(setChartType(chartId, 'mean')(project));
    const m = model(setGroup(mean, 1, [null, null, null, null, null]));
    const ref = model(mean);
    expect(m.groups[1].slotX).toBe(ref.groups[1].slotX);
    expect(m.groups[1].points).toHaveLength(0);
    expect(m.groups[0].connector).toBeNull();
    expect(m.groups[1].connector).toBeNull();
    expect(m.groups[2].connector).not.toBeNull();
    expect(m.warnings.some((w) => /Group B: No valid observations/.test(w))).toBe(true);
  });

  it('draws 5 pt caps, and only the upper cap for the positive direction', () => {
    let p = patchSummary(chartId, 'all', { spread: 'sd' })(project);
    p = patchStyle(chartId, 'all', { errorCap: 'bar', errorCapWidthPt: 5 })(p);
    const both = model(p).groups[0].errorBar!;
    expect((both.d.match(/H/g) ?? []).length).toBe(2);
    const cx = model(p).groups[0].centerX;
    expect(both.d).toContain(`M${cx - 2.5},`);
    expect(both.d).toContain(`H${cx + 2.5}`);
    const up = model(patchStyle(chartId, 'all', { errorDirection: 'positive' })(p)).groups[0].errorBar!;
    expect((up.d.match(/H/g) ?? []).length).toBe(1);
  });

  it('auto-range includes the drawn endpoints and respects the direction', () => {
    let p = patchSummary(chartId, 'all', { spread: 'range' })(setGroup(project, 0, [1, 2, 3, 4, 50]));
    expect(model(p).y.domain[1]).toBeGreaterThanOrEqual(50);
    // The raw points (symbols are on by default) also set the range, so they are off to isolate the error bar.
    p = patchStyle(chartId, 'all', { errorDirection: 'negative', showSymbols: false })(p);
    expect(model(p).y.domain[1]).toBeLessThan(50);
  });

  it('draws an asymmetric geometric SD bar', () => {
    const p = patchSummary(chartId, 'all', { centre: 'geometricMean', spread: 'gsd' })(setGroup(project, 0, [1, 2, 4, 8, 16]));
    const g = model(p).groups[0];
    const { lower, upper } = g.stats.interval;
    expect(g.errorBar).not.toBeNull();
    expect(g.errorBar!.meaning).toMatch(/geometric SD/);
    expect(upper! - g.centreValue!).not.toBeCloseTo(g.centreValue! - lower!, 6);
  });

  it('an unavailable interval keeps the central geometry (median CI n = 5 and n = 6)', () => {
    let p = patchSummary(chartId, 'all', { centre: 'median', spread: 'ci' })(project);
    const m5 = model(p);
    expect(m5.groups[0].bar).not.toBeNull();
    expect(m5.groups[0].errorBar).toBeNull();
    expect(m5.warnings.some((w) => /Group A: .*covers only 93.75%/.test(w))).toBe(true);
    p = setGroup(p, 0, [1, 2, 3, 4, 5, 6]);
    const m6 = model(p);
    expect(m6.groups[0].errorBar).not.toBeNull();
    expect(m6.warnings.some((w) => /Group A/.test(w))).toBe(false);
  });

  it('the reject policy hides the summary marks and keeps the raw points', () => {
    const rejected = patchSummary(chartId, 'all', { centre: 'median', spread: 'ci', smallSamplePolicy: 'reject' })(project);
    const scatter = patchStyle(chartId, 'all', { showMeanLine: true })(setChartType(chartId, 'scatter')(rejected));
    const m = model(scatter);
    expect(m.groups[0].centreValue).toBeNull();
    expect(m.groups[0].meanLine).toBeNull();
    expect(m.groups[0].points).toHaveLength(5);
    expect(model(rejected).groups[0].bar).toBeNull();
  });

  it('a stale spread stays stored, is inactive and comes back', () => {
    const sd = patchSummary(chartId, 'all', { spread: 'sd' })(project);
    const median = patchSummary(chartId, 'all', { centre: 'median' })(sd);
    expect(median.charts[0].layers[0].summary.spread).toBe('sd');
    const m = model(median);
    expect(m.groups[0].errorBar).toBeNull();
    expect(m.warnings).toEqual([]);
    expect(model(patchSummary(chartId, 'all', { centre: 'mean' })(median)).groups[0].errorBar).not.toBeNull();
  });

  it('warns once, with exact text, when drawn error ends are clipped', () => {
    let p = patchSummary(chartId, 'all', { spread: 'sd' })(project);
    p = patchAxis(chartId, 'yAxis', { max: 1.3 })(p);
    const m = model(p);
    const clipped = m.groups.reduce((n, g) => n + (g.errorBar?.clippedUpper ? 1 : 0) + (g.errorBar?.clippedLower ? 1 : 0), 0);
    expect(clipped).toBeGreaterThan(0);
    const text = clipped === 1 ? '1 error bar end lies outside the axis range and is clipped.' : `${clipped} error bar ends lie outside the axis range and are clipped.`;
    expect(m.warnings.filter((w) => /error bar end/.test(w))).toEqual([text]);
  });

  it('hidden error bars are silent', () => {
    let p = patchSummary(chartId, 'all', { spread: 'sd' })(setGroup(project, 0, [2, null, null, null, null]));
    p = patchStyle(chartId, 'all', { showErrorBars: false })(p);
    const m = model(p);
    expect(m.warnings).toEqual([]);
    expect(m.groups.every((g) => g.errorBar === null)).toBe(true);
  });

  it('reuses GroupStats by reference after style edits', () => {
    const p = patchSummary(chartId, 'all', { spread: 'sd' })(project);
    const a = model(p);
    const b = model(patchStyle(chartId, 'all', { barFill: '#00ff00', symbolSizePt: 9 })(p));
    b.groups.forEach((g, i) => expect(g.stats).toBe(a.groups[i].stats));
  });

  it('warns when more data sets than palette colours reuse a fill', () => {
    let p = project;
    for (let i = 0; i < 7; i++) p = addGroup(p.dataTables[0].id)(p);
    const m = model(p);
    expect(m.warnings.filter((w) => /palette/.test(w))).toHaveLength(1);
    expect(m.warnings.some((w) => /1 data set reuse/.test(w))).toBe(true);
  });

  it('de-duplicates warnings by text', () => {
    let q = patchSummary(chartId, 'all', { spread: 'sd' })(setGroup(setGroup(project, 0, [2, null, null, null, null]), 1, [3, null, null, null, null]));
    q = setDisplayName(chartId, project.dataTables[0].groups[0].id, 'X')(q);
    q = setDisplayName(chartId, project.dataTables[0].groups[1].id, 'X')(q);
    const w = model(q).warnings.filter((x) => /^X: SD is undefined/.test(x));
    expect(w).toEqual(['X: SD is undefined for n = 1; no error bar is drawn.']);
  });

  it('does not jitter along the value axis', () => {
    const m = model(setChartType(chartId, 'scatter')(project));
    for (const g of m.groups) for (const pt of g.points) expect(pt.cy).toBeCloseTo(m.yScale(pt.value), 9);
  });

  it('an old v1 file with errorType sd draws the same bars', () => {
    const v2 = patchSummary(chartId, 'all', { spread: 'sd' })(project);
    const raw = JSON.parse(stringifyProject(project));
    raw.version = 1;
    delete raw.project.charts[0].layers[0].summary;
    delete raw.project.charts[0].layers[0].groupSummary;
    raw.project.charts[0].defaults.errorType = 'sd';
    const old = parseProject(JSON.stringify(raw));
    expect(model(old).groups.map((g) => g.errorBar?.d)).toEqual(model(v2).groups.map((g) => g.errorBar?.d));
  });

  it('default regression: no error bars, no warnings, centre equals the mean', () => {
    const m = model(project);
    expect(m.warnings).toEqual([]);
    expect(m.groups.every((g) => g.errorBar === null)).toBe(true);
    m.groups.forEach((g) => expect(g.centreValue).toBeCloseTo(g.summary.mean!, 12));
  });
});

describe('point labels in the chart model', () => {
  type P = ReturnType<typeof createExampleProject>;
  const base = (): P => setChartType(createExampleProject().charts[0].id, 'scatter')(createExampleProject());
  const labelled = (p: P, patch: Partial<ChartStyle> = {}): P =>
    patchStyle(p.charts[0].id, 'all', { showSymbols: true, showPointLabels: true, ...patch })(p);
  const build = (p: P) => buildChartModel(p.charts[0], p.dataTables[0]);
  const fmt = (v: number | null) => String(Number((v as number).toPrecision(6)));

  it('is off by default and always present', () => {
    const m = build(base());
    expect(m.labels.items).toEqual([]);
    expect(m.labels.report.eligible).toBe(0);
  });
  it('titles follow the observations after a reorder', () => {
    const p = base();
    const n = p.dataTables[0].rowCount;
    const titled = setRowTitles(p.dataTables[0].id, Array.from({ length: n }, (_, row) => ({ row, title: `R${row}` })))(p);
    const first = titled.dataTables[0].groups[0].observations[0].id;
    expect(build(labelled(titled)).labels.items.find((i) => i.id === first)?.text).toBe('R0');
    const order = Array.from({ length: n }, (_, i) => n - 1 - i);
    const reordered = { ...titled, dataTables: [permuteRows(titled.dataTables[0], order)] };
    const m = build(labelled(reordered));
    const labelOf = (id: string) => m.labels.items.find((i) => i.id === id)?.text;
    const obs = reordered.dataTables[0].groups[0].observations;
    let checked = 0;
    obs.forEach((o, row) => {
      const text = labelOf(o.id);
      if (text === undefined) return;
      expect(text).toBe(`R${order[row]}`);
      checked++;
    });
    expect(checked).toBeGreaterThan(0);
  });
  it('data edits update value labels', () => {
    const q = labelled(base(), { pointLabelSource: 'value', pointLabelDecimals: 1 });
    const id = q.dataTables[0].groups[0].observations[0].id;
    const edited = setCells(q.dataTables[0].id, [{ row: 0, col: 0, value: 7.25 }])(q);
    expect(build(edited).labels.items.find((i) => i.id === id)?.text).toBe('7.3');
  });
  it('mean and median charts label their centre value', () => {
    const p = base();
    const meanP = labelled(setChartType(p.charts[0].id, 'mean')(p));
    const mean = build(meanP);
    const g = mean.groups[0];
    expect(mean.labels.items.find((i) => i.id === `${g.groupId}:mean`)?.text).toBe(fmt(g.centreValue));
    const median = build(patchSummary(p.charts[0].id, 'all', { centre: 'median', spread: 'none' })(meanP));
    const mg = median.groups[0];
    expect(median.labels.items.find((i) => i.id === `${mg.groupId}:mean`)?.text).toBe(fmt(mg.centreValue));
  });
  it('per-axis anchors sit on the displayed symbols', () => {
    const p = base();
    const gid = p.dataTables[0].groups[1].id;
    const q = patchStyle(p.charts[0].id, gid, { axisBinding: 'secondary' })(labelled(p, { pointLabelSource: 'value', pointLabelPlacement: 'custom', pointLabelOffsetXPt: 0, pointLabelOffsetYPt: 0 }));
    const m = build(q);
    expect(m.y2).not.toBeNull();
    let checked = 0;
    for (const g of m.groups) {
      for (const pt of g.points) {
        const it = m.labels.items.find((i) => i.id === pt.id);
        if (!it) continue;
        expect(it.box.x0).toBeCloseTo(pt.cx, 6);
        expect(it.box.y0).toBeCloseTo(pt.cy, 6);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
  it('coincident points keep the accounting', () => {
    const p = base();
    const cells = p.dataTables[0].groups[0].observations.map((_, row) => ({ row, col: 0, value: 3 }));
    const m = build(labelled(setCells(p.dataTables[0].id, cells)(p), { pointLabelSource: 'value', pointLabelCollision: 'hide' }));
    const r = m.labels.report;
    expect(m.labels.items.length + m.labels.suppressed.length).toBe(r.eligible - r.unlabelled - r.offPlot - r.tooMany);
  });
  it('a manual range reports off-plot labels, ordered before the clipped notes', () => {
    const p = base();
    const m = build(patchAxis(p.charts[0].id, 'yAxis', { min: 0, max: 1 })(labelled(p, { pointLabelSource: 'value' })));
    expect(m.labels.report.offPlot).toBeGreaterThan(0);
    const label = m.warnings.findIndex((w) => w.includes('outside the plot area'));
    const clipped = m.warnings.findIndex((w) => w.includes('outside the axis range'));
    expect(label).toBeGreaterThanOrEqual(0);
    expect(clipped).toBeGreaterThan(label);
  });
  it('labels never change numbers', () => {
    const p = base();
    const off = build(patchStyle(p.charts[0].id, 'all', { showSymbols: true })(p));
    const on = build(labelled(p, { pointLabelSource: 'value' }));
    expect(on.layout).toEqual(off.layout);
    expect(on.y.domain).toEqual(off.y.domain);
    expect(on.y.ticks).toEqual(off.y.ticks);
    expect(on.groups.map((g) => g.stats)).toEqual(off.groups.map((g) => g.stats));
    expect(on.groups.map((g) => g.points)).toEqual(off.groups.map((g) => g.points));
  });
  it('a custom offset follows the point after a resize', () => {
    const q = labelled(base(), { pointLabelSource: 'value', pointLabelPlacement: 'custom', pointLabelOffsetXPt: 6, pointLabelOffsetYPt: -14 });
    const wide = { ...q, charts: [{ ...q.charts[0], widthPx: q.charts[0].widthPx + 150 }] };
    for (const m of [build(q), build(wide)]) {
      let checked = 0;
      for (const g of m.groups) {
        for (const pt of g.points) {
          const it = m.labels.items.find((i) => i.id === pt.id);
          if (!it) continue;
          expect(it.box.x0).toBeCloseTo(pt.cx + 6, 6);
          expect(it.box.y0).toBeCloseTo(pt.cy - 14, 6);
          checked++;
        }
      }
      expect(checked).toBeGreaterThan(0);
    }
  });
});
