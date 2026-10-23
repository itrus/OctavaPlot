import { describe, expect, it } from 'vitest';
import { createChart, createXyTable } from '../model/defaults';
import { sanitizeFit } from '../model/fitOptions';
import type { Chart, DataTable, FitSettings } from '../model/types';
import { parseProject, stringifyProject } from '../state/serialize';
import { chartToSvgString } from './export';
import { fitLines } from './fitCurve';
import { buildXyModel } from './xyModel';

const setup = (fit: Partial<FitSettings>): { chart: Chart; table: DataTable } => {
  const table = createXyTable('XY', true);
  const chart = createChart(table.id, undefined, 'xyScatter');
  return { table, chart: { ...chart, fit: { ...chart.fit, ...fit } } };
};

describe('fitted curves on an XY chart', () => {
  it('draw nothing until a model is chosen', () => {
    const { chart, table } = setup({});
    expect(buildXyModel(chart, table).series.every((s) => s.fit === undefined)).toBe(true);
    expect(chartToSvgString(chart, table)).not.toContain('fit-');
  });

  it('draw a curve for each series, with its parameters', () => {
    const { chart, table } = setup({ model: 'linear' });
    const m = buildXyModel(chart, table);
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
    const plain = buildXyModel(...Object.values(setup({ model: 'linear' })).reverse() as [Chart, DataTable]);
    expect(plain.series[0].fit?.bandPath).toBe('');
    const conf = setup({ model: 'linear', band: 'confidence' });
    const pred = setup({ model: 'linear', band: 'prediction' });
    const c = buildXyModel(conf.chart, conf.table).series[0].fit!.bandPath;
    const p = buildXyModel(pred.chart, pred.table).series[0].fit!.bandPath;
    expect(c.endsWith('Z')).toBe(true);
    expect(area(p)).toBeGreaterThan(area(c));
  });

  it('say why no curve was fitted, and draw the points all the same', () => {
    // A 4-parameter model needs more than the 2 rows of data left.
    const { chart, table } = setup({ model: 'hill_4pl' });
    const few = { ...table, groups: table.groups.map((g) => ({ ...g, observations: g.observations.map((o, i) => (i < 2 ? o : { ...o, value: null })) })) };
    const m = buildXyModel(chart, few);
    expect(m.series[0].fit?.path).toBe('');
    expect(m.series[0].fit?.failure).toMatch(/needs at least/);
    expect(m.warnings.join(' ')).toMatch(/no curve was fitted/);
    expect(m.series[0].points.length).toBeGreaterThan(0);
  });

  it('are drawn, and their parameters written, in the picture', () => {
    const { chart, table } = setup({ model: 'polynomial', degree: 2, band: 'confidence', showParameters: true });
    const svg = chartToSvgString(chart, table);
    expect(svg).toContain('a2 = ');
    expect(svg).toContain('R² = ');
    expect(svg).not.toContain('NaN');
  });

  it('keep the axis wide enough for the curve', () => {
    const { chart, table } = setup({ model: 'polynomial', degree: 6 });
    const m = buildXyModel(chart, table);
    const ys = m.series.flatMap((s) => [...s.fit!.path.matchAll(/,([-\d.]+)/g)].map((q) => Number(q[1])));
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(m.layout.plot.y - 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(m.layout.plot.y + m.layout.plot.height + 1);
  });

  it('work on log axes', () => {
    const { chart, table } = setup({ model: 'hyperbola', extend: true });
    const log = { ...chart, xAxis: { ...chart.xAxis, scale: 'log10' as const } };
    const svg = chartToSvgString(log, table);
    expect(svg).not.toContain('NaN');
    expect(svg).not.toContain('Infinity');
  });
});

describe('settings of fitted curves', () => {
  it('fall back to what is valid', () => {
    const base = setup({}).chart.fit;
    expect(sanitizeFit({ model: 'nonsense', degree: 99, band: 'x', level: 5, extend: 'yes' }, base)).toEqual({ ...base, degree: 6, level: 0.999 });
    expect(sanitizeFit(undefined, base)).toEqual(base);
  });
  it('are saved and loaded, and an old file loads without them', () => {
    const { chart, table } = setup({ model: 'hill_4pl', band: 'prediction', level: 0.9, showParameters: true });
    const project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
    expect(parseProject(stringifyProject(project)).charts[0].fit).toEqual(chart.fit);
    const old = JSON.parse(stringifyProject(project));
    delete old.project.charts[0].fit;
    expect(parseProject(JSON.stringify(old)).charts[0].fit.model).toBe('none');
  });
  it('are written as lines: a parameter with its interval, then R²', () => {
    const lines = fitLines({ modelLabel: 'm', formula: 'f', params: [{ name: 'A', value: 1.23456, se: 0.1, lower: 1, upper: 1.5 }, { name: 'B', value: 2, se: null, lower: null, upper: null }], n: 5, df: 3, rSquared: 0.98765, converged: true, message: null }, 0.95);
    expect(lines).toEqual(['A = 1.235 (95% CI 1 to 1.5)', 'B = 2', 'R² = 0.9877']);
  });
});
