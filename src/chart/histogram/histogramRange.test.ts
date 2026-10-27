import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import type { DataTable } from '../../model/types';
import { buildHistogramModel } from './histogramModel';

const model = (values: number[], direction: 'atOrBelow' | 'above', units: 'fraction' | 'percent' | 'count') => {
  const table: DataTable = createColumnTable('Data', false);
  table.groups.forEach((g, i) => g.observations.forEach((o, r) => (o.value = i === 0 ? (values[r] ?? null) : null)));
  const chart = createChart(table.id, undefined, 'ecdf');
  chart.histogram = { ...chart.histogram, ecdfDirection: direction, ecdfUnits: units };
  return buildHistogramModel(chart, table);
};

describe('cumulative distribution Y range', () => {
  const samples: Record<string, number[]> = { ties: [1, 1, 2, 3], single: [5], plain: [1, 2, 3, 4, 5] };
  for (const [name, values] of Object.entries(samples)) {
    for (const direction of ['atOrBelow', 'above'] as const) {
      for (const units of ['fraction', 'percent', 'count'] as const) {
        it(`holds the whole step path: ${name}, ${direction}, ${units}`, () => {
          const m = model(values, direction, units);
          const [lo, hi] = m.y.domain;
          const top = units === 'percent' ? 100 : units === 'count' ? values.length : 1;
          // The start level of "above" and the final level of "at or below" are inside the domain.
          expect(lo).toBeLessThanOrEqual(0);
          expect(hi).toBeGreaterThanOrEqual(top);
          // Every vertical coordinate of the drawn path lies inside the plot.
          const ys = [...m.series[0].linePath.matchAll(/[MV](?:[-\d.]+,)?([-\d.]+)/g)].map((r) => Number(r[1]));
          const { y, height } = m.layout.plot;
          for (const v of ys) {
            expect(v).toBeGreaterThanOrEqual(y - 1e-6);
            expect(v).toBeLessThanOrEqual(y + height + 1e-6);
          }
        });
      }
    }
  }
  it('starts [1,1,2,3] above at its start level inside the domain', () => {
    const m = model([1, 1, 2, 3], 'above', 'fraction');
    expect(m.series[0].points[0].y).toBe(0.5);
    expect(m.y.domain[1]).toBeGreaterThanOrEqual(1);
    const start = Number(/^M[-\d.]+,([-\d.]+)/.exec(m.series[0].linePath)![1]);
    expect(start).toBeCloseTo(m.yScale(1), 1);
    expect(start).toBeGreaterThanOrEqual(m.layout.plot.y - 1e-6);
  });
});
