import { describe, expect, it } from 'vitest';
import { curveFitSheet, fitObservations } from '../../model/project/curveFit';
import { createChart, createExampleProject, createXyTable } from '../../model/defaults';
import { NO_FIT_SETTINGS, resolveFit, sanitizeFit } from '../../model/options/fitOptions';
import type { Chart, DataTable, FitSettings, Project } from '../../model/types';
import { addAnalysis, addChart, addDataTable, composeCommands, patchAnalysis, patchLook, removeAnalysis } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { fitLines } from './fitCurve';
import { buildXyModel } from './xyModel';

const setup = (fit: Partial<FitSettings>): { chart: Chart; table: DataTable; fit: FitSettings } => {
  const table = createXyTable('XY', true);
  return { table, chart: createChart(table.id, undefined, 'xyScatter'), fit: { ...NO_FIT_SETTINGS, ...fit } };
};
const build = (s: ReturnType<typeof setup>) => buildXyModel(s.chart, s.table, s.fit);

describe('fitted curves on an XY chart', () => {
  it('draw nothing until a curve fit is chosen', () => {
    const s = setup({});
    expect(build(s).series.every((x) => x.fit === undefined)).toBe(true);
    expect(chartToSvgString(s.chart, s.table, s.fit)).not.toContain('fit-');
  });

  it('draw a curve for each series, with its parameters', () => {
    const m = build(setup({ model: 'linear' }));
    expect(m.series).toHaveLength(2);
    for (const s of m.series) {
      expect(s.fit?.path.startsWith('M')).toBe(true);
      expect(s.fit?.summary?.params.map((p) => p.name)).toEqual(['a (intercept)', 'b (slope)']);
      expect(s.fit?.failure).toBeNull();
    }
  });

  it('give a band only when asked, and a prediction band is wider than the band of the curve', () => {
    const area = (d: string) => {
      const pts = [...d.matchAll(/[ML]([-\d.]+),([-\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
      let a = 0;
      pts.forEach(([x, y], i) => {
        const [x2, y2] = pts[(i + 1) % pts.length];
        a += x * y2 - x2 * y;
      });
      return Math.abs(a / 2);
    };
    expect(build(setup({ model: 'linear' })).series[0].fit?.bandPath).toBe('');
    const c = build(setup({ model: 'linear', band: 'confidence' })).series[0].fit!.bandPath;
    const p = build(setup({ model: 'linear', band: 'prediction' })).series[0].fit!.bandPath;
    expect(c.endsWith('Z')).toBe(true);
    expect(area(p)).toBeGreaterThan(area(c));
  });

  it('say why no curve was fitted, and draw the points all the same', () => {
    // A 4-parameter model needs more than the 2 rows of data left.
    const s = setup({ model: 'hill_4pl' });
    const few = { ...s.table, groups: s.table.groups.map((g) => ({ ...g, observations: g.observations.map((o, i) => (i < 2 ? o : { ...o, value: null })) })) };
    const m = buildXyModel(s.chart, few, s.fit);
    expect(m.series[0].fit?.path).toBe('');
    expect(m.series[0].fit?.failure).toMatch(/needs at least/);
    expect(m.warnings.join(' ')).toMatch(/no curve was fitted/);
    expect(m.series[0].points.length).toBeGreaterThan(0);
  });

  it('are drawn, and their parameters written, in the picture', () => {
    const s = setup({ model: 'polynomial', degree: 2, band: 'confidence', showParameters: true });
    const svg = chartToSvgString(s.chart, s.table, s.fit);
    expect(svg).toContain('a2 = ');
    expect(svg).toContain('R² = ');
    expect(svg).not.toContain('NaN');
  });

  it('keep the axis wide enough for the curve', () => {
    const m = build(setup({ model: 'polynomial', degree: 6 }));
    const ys = m.series.flatMap((s) => [...s.fit!.path.matchAll(/,([-\d.]+)/g)].map((q) => Number(q[1])));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(m.layout.plot.y - 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(m.layout.plot.y + m.layout.plot.height + 1);
  });

  it('work on log axes', () => {
    const s = setup({ model: 'hyperbola', extend: true });
    const log = { ...s.chart, xAxis: { ...s.chart.xAxis, scale: 'log10' as const } };
    const svg = chartToSvgString(log, s.table, s.fit);
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('Infinity');
  });
});

describe('what a chart shows of a curve fit', () => {
  it('falls back to what is valid', () => {
    const base = createChart('t').fit;
    expect(sanitizeFit({ analysisId: 7, band: 'x', extend: 'yes' }, base)).toEqual(base);
    expect(sanitizeFit({ analysisId: 'a1', band: 'prediction' }, base)).toEqual({ ...base, analysisId: 'a1', band: 'prediction' });
    expect(sanitizeFit(undefined, base)).toEqual(base);
  });
  it('takes the model and level from the analysis it points to, and draws nothing without one', () => {
    const p = addAnalysis('a', 't', 'curvefit', { model: 'hill_4pl' })({ ...createExampleProject(), dataTables: [{ ...createXyTable('XY', true), id: 't' }] });
    const analyses = patchAnalysis('a', { level: 0.99 })(p).analyses!;
    const fit = { analysisId: 'a', band: 'prediction' as const, extend: true, showParameters: false };
    expect(resolveFit(fit, analyses, 't')).toEqual({ model: 'hill_4pl', degree: 2, band: 'prediction', level: 0.99, extend: true, showParameters: false });
    expect(resolveFit({ ...fit, analysisId: 'gone' }, analyses, 't').model).toBe('none');
    expect(resolveFit({ ...fit, analysisId: null }, analyses, 't').model).toBe('none');
    // An analysis of another table is not this chart's.
    expect(resolveFit(fit, analyses, 'other').model).toBe('none');
  });
  it('is saved and loaded with the analysis, and an old file loads without a fit', () => {
    let p: Project = { ...createExampleProject() };
    p = addDataTable('x', 'xy')(p);
    p = composeCommands(addAnalysis('a', 'x', 'curvefit', { model: 'polynomial', degree: 3 }), addChart('c', 'x', undefined, 'xyScatter'))(p);
    p = patchLook('c', { fit: { analysisId: 'a', band: 'confidence', extend: true, showParameters: true } })(p);
    const back = parseProject(stringifyProject(p));
    expect(back.analyses?.find((a) => a.id === 'a')).toMatchObject({ kind: 'curvefit', model: 'polynomial', degree: 3 });
    expect(back.charts.find((c) => c.id === 'c')?.fit).toEqual({ analysisId: 'a', band: 'confidence', extend: true, showParameters: true });
    const old = JSON.parse(stringifyProject(p));
    delete old.project.charts[1].fit;
    expect(parseProject(JSON.stringify(old)).charts[1].fit.analysisId).toBeNull();
    // A curve fit that names no model, or sits on a table that is not an XY table, refuses the file.
    const bad = JSON.parse(stringifyProject(p));
    bad.project.analyses.find((a: { id: string }) => a.id === 'a').model = 'nonsense';
    expect(() => parseProject(JSON.stringify(bad))).toThrow('project.analyses[0].model');
  });
  it('is lost with the analysis: deleting the curve fit leaves the chart with no curve', () => {
    let p = addDataTable('x', 'xy')(createExampleProject());
    p = composeCommands(addAnalysis('a', 'x', 'curvefit'), addChart('c', 'x', undefined, 'xyScatter'), patchLook('c', { fit: { analysisId: 'a', band: 'none', extend: false, showParameters: false } }))(p);
    expect(removeAnalysis('a')(p).charts.find((c) => c.id === 'c')?.fit.analysisId).toBeNull();
  });
  it('is made, with its analysis, by a gallery entry with a fit', () => {
    const p = addChart('c', 'x', undefined, 'xyScatter', { fit: { model: 'linear', band: 'confidence' } })(addDataTable('x', 'xy')(createExampleProject()));
    const chart = p.charts.find((c) => c.id === 'c')!;
    const a = p.analyses?.find((x) => x.id === chart.fit.analysisId);
    expect(a).toMatchObject({ kind: 'curvefit', model: 'linear', dataTableId: 'x' });
    expect(chart.fit.band).toBe('confidence');
    // A chart that cannot show a curve fit gets none.
    const example = createExampleProject();
    const bar = addChart('b', example.dataTables[0].id, undefined, 'bar', { fit: { model: 'linear' } })(example);
    expect(bar.analyses).toBeUndefined();
  });
});

describe('the curve fit in the Results', () => {
  const table = createXyTable('XY', true);
  const analysis = { id: 'a', name: 'Curve fit', kind: 'curvefit' as const, dataTableId: table.id, level: 0.95, model: 'linear' as const };

  it('gives the numbers of the graph: the same fit, series by series', () => {
    const sheet = curveFitSheet(table, analysis);
    const m = buildXyModel(createChart(table.id, undefined, 'xyScatter'), table, { ...NO_FIT_SETTINGS, model: 'linear' });
    expect(sheet.columns.map((c) => c.label)).toEqual(m.series.map((s) => s.label));
    const slopeRow = sheet.rows.find((r) => r.label === 'b (slope)')!;
    m.series.forEach((s, i) => expect(Number(slopeRow.cells[i])).toBeCloseTo(s.fit!.summary!.params[1].value, 5));
  });
  it('lists the parameters with their errors and limits, and the goodness of fit', () => {
    const sheet = curveFitSheet(table, analysis);
    const labels = sheet.rows.filter((r) => !r.blank).map((r) => r.label);
    expect(labels).toEqual(expect.arrayContaining(['Equation', 'Number of points', 'Degrees of freedom', 'R squared', 'Sum of squares', 'Sy.x (residual SD)', 'a (intercept)', 'b (slope)', 'Std. error', '95% CI lower limit', '95% CI upper limit', 'Notes']));
    expect(sheet.corner).toContain('Straight line');
    expect(curveFitSheet(table, { ...analysis, level: 0.9 }).rows.some((r) => r.label === '90% CI lower limit')).toBe(true);
  });
  it('widens the intervals of the sheet and of the graph labels with the level, and copies at full precision', () => {
    const width = (level: number) => {
      const sheet = curveFitSheet(table, { ...analysis, level });
      const lo = sheet.rows.find((r) => r.key === 'p1lo')!;
      const hi = sheet.rows.find((r) => r.key === 'p1hi')!;
      return Number(hi.exact![0]) - Number(lo.exact![0]);
    };
    expect(width(0.99)).toBeGreaterThan(width(0.95));
    expect(width(0.95)).toBeGreaterThan(width(0.9));
    const sheet = curveFitSheet(table, analysis);
    const slope = sheet.rows.find((r) => r.key === 'p1')!;
    const m = buildXyModel(createChart(table.id, undefined, 'xyScatter'), table, { ...NO_FIT_SETTINGS, model: 'linear' });
    expect(Number(slope.exact![0])).toBe(m.series[0].fit!.summary!.params[1].value);
    const at = (level: number) => buildXyModel(createChart(table.id, undefined, 'xyScatter'), table, { ...NO_FIT_SETTINGS, model: 'linear', level }).series[0].fit!.summary!.params[1];
    expect(at(0.99).upper! - at(0.99).lower!).toBeGreaterThan(at(0.9).upper! - at(0.9).lower!);
  });
  it('follows the model, and says why a series could not be fitted', () => {
    const hill = curveFitSheet(table, { ...analysis, model: 'hill_4pl' });
    expect(hill.rows.filter((r) => !r.blank && !r.indent).map((r) => r.label)).toEqual(expect.arrayContaining(['bottom', 'top', 'h (Hill slope)']));
    const few = { ...table, groups: table.groups.map((g) => ({ ...g, observations: g.observations.map((o, i) => (i < 2 ? o : { ...o, value: null })) })) };
    const notes = curveFitSheet(few, { ...analysis, model: 'hill_4pl' }).rows.find((r) => r.key === 'notes')!;
    expect(notes.cells.every((c) => /needs at least/.test(c))).toBe(true);
  });
  it('is fitted to every replicate', () => {
    const single = fitObservations(table);
    const rep = fitObservations(createXyTable('Rep', true, { kind: 'replicates', n: 3 }));
    // The example fills every replicate of each row: three times the points of a single value.
    expect(rep[0].obs.length).toBe(3 * single[0].obs.length);
  });
  it('is only for an XY table', () => {
    const p = addAnalysis('a', createExampleProject().dataTables[0].id, 'curvefit')(createExampleProject());
    expect(p.analyses).toBeUndefined();
  });
});

describe('writing a fit', () => {
  it('is written as lines: a parameter with its interval, then R²', () => {
    const lines = fitLines({ modelLabel: 'm', formula: 'f', params: [{ name: 'A', value: 1.23456, se: 0.1, lower: 1, upper: 1.5 }, { name: 'B', value: 2, se: null, lower: null, upper: null }], n: 5, df: 3, rSquared: 0.98765, converged: true, message: null }, 0.95);
    expect(lines).toEqual(['A = 1.235 (95% CI 1 to 1.5)', 'B = 2', 'R² = 0.9877']);
  });
});

describe('fit caching', () => {
  it('does not fit again for a style edit, and fits only the series whose data changed', async () => {
    const { fitStats } = await import('./fitCurve');
    const { buildAnyModelCached } = await import('../anyModel');
    const table = createXyTable('XY', true);
    const chart = createChart(table.id, undefined, 'xyScatter');
    const fit = { ...NO_FIT_SETTINGS, model: 'linear' as const, level: 0.93 };
    const before = fitStats.calculated;
    buildXyModel(chart, table, fit);
    const first = fitStats.calculated - before;
    expect(first).toBeGreaterThan(0);
    // A style change (new chart object, same data): zero fits.
    buildXyModel({ ...chart, title: 'Another title', widthPx: chart.widthPx + 10 }, table, fit);
    expect(fitStats.calculated - before).toBe(first);
    // A data edit in one series: one fit.
    const edited = { ...table, groups: table.groups.map((g, i) => (i === 1 ? { ...g, observations: g.observations.map((o, r) => (r === 0 ? { ...o, value: (o.value ?? 0) + 5 } : o)) } : g)) };
    buildXyModel(chart, edited, fit);
    expect(fitStats.calculated - before).toBe(first + 1);
    // The drawing and the inspector share one model.
    expect(buildAnyModelCached(chart, table, fit)).toBe(buildAnyModelCached(chart, table, { ...fit }));
  });
});

describe('the fitted parameters as text to paste on the graph', () => {
  it('reads like the list in the inspector: the series, a line for each parameter, R², and the points and degrees of freedom', async () => {
    const { fitParametersText } = await import('./fitCurve');
    const table = createXyTable('XY', true);
    const chart = createChart(table.id, undefined, 'xyScatter');
    const model = buildXyModel(chart, table, { ...NO_FIT_SETTINGS, model: 'linear', level: 0.95 });
    const lines = fitParametersText(model.series, 0.95).split('\n');
    expect(lines.length).toBeGreaterThan(8);
    // One block per series: its name first, the count last.
    const names = model.series.filter((s) => s.fit?.summary).map((s) => s.label);
    expect(lines.filter((l) => names.includes(l))).toEqual(names);
    expect(lines.filter((l) => /^a \(intercept\) = -?[\d.]+ \(95% CI -?[\d.]+ to -?[\d.]+\)$/.test(l)).length).toBe(names.length);
    expect(lines.filter((l) => /^R² = [\d.]+$/.test(l)).length).toBe(names.length);
    expect(lines.filter((l) => /^\d+ points, \d+ degrees of freedom$/.test(l)).length).toBe(names.length);
    expect(lines[0]).toBe(names[0]);
  });
  it('is empty when nothing is fitted, and names no degrees of freedom when none are left', async () => {
    const { fitParametersText, fitCountLine } = await import('./fitCurve');
    const table = createXyTable('XY', true);
    const chart = createChart(table.id, undefined, 'xyScatter');
    expect(fitParametersText(buildXyModel(chart, table).series, 0.95)).toBe('');
    expect(fitCountLine({ n: 2, df: 0 } as never)).toBe('2 points');
  });
});

describe('one fit for the graph and the Results sheet', () => {
  it('calculates a fit once when both ask, and again only when an input changes', async () => {
    const { fitStats, runFit } = await import('./fitCurve');
    const { clearCalcCache } = await import('../../stats/calcCache');
    clearCalcCache();
    const table = createXyTable('XY', true);
    const obs = fitObservations(table)[0].obs;
    const analysis = { id: 'a', name: 'Curve fit', kind: 'curvefit' as const, dataTableId: table.id, level: 0.95, model: 'linear' as const };
    const before = fitStats.calculated;
    runFit(obs, { ...NO_FIT_SETTINGS, model: 'linear', level: 0.95 });
    const one = fitStats.calculated - before;
    expect(one).toBe(1);
    const sheetFits = fitObservations(table).length;
    curveFitSheet(table, analysis);
    // The sheet fits each series; the one the graph already did is not repeated.
    expect(fitStats.calculated - before).toBe(sheetFits);
    curveFitSheet(table, analysis);
    expect(fitStats.calculated - before).toBe(sheetFits);
    curveFitSheet(table, { ...analysis, level: 0.9 });
    expect(fitStats.calculated - before).toBe(2 * sheetFits);
  });
});
