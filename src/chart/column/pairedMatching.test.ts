import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import type { DataTable, Id, Project } from '../../model/types';
import { patchLook } from '../../state/commands';
import { buildColumnModel } from './columnModel';

/** A small seeded generator (mulberry32), so a failure can be repeated. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

const build = (rows: number, columns: number, next: () => number, bridge: boolean, missing: number) => {
  const table: DataTable = createColumnTable('Data', false);
  while (table.groups.length < columns) table.groups.push(structuredClone(table.groups[0]));
  table.groups.forEach((g, gi) => {
    g.id = `g${gi}` as Id;
    g.observations = Array.from({ length: rows }, (_, r) => ({
      ...structuredClone(table.groups[0].observations[0] ?? { id: '', value: null }),
      id: `o${gi}-${r}` as Id,
      // Few distinct values, so many rows repeat the same value.
      value: next() < missing ? null : Math.floor(next() * 5) + 1,
    }));
  });
  const chart = createChart(table.id, undefined, 'paired');
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { table, chart: patchLook(chart.id, { pairs: { bridge } })(p).charts[0] };
};

/** The straightforward matching: for every row and data set, find the point of that row (the first wins). */
const reference = (m: ReturnType<typeof buildColumnModel>, bridge: boolean) => {
  const rowsSeen = new Set<number>();
  for (const g of m.groups) for (const p of g.points) if (p.observationId !== null) rowsSeen.add(p.row);
  const out: Array<{ row: number; runs: number[][][] }> = [];
  for (const row of [...rowsSeen].sort((a, b) => a - b)) {
    const runs: number[][][] = [];
    let joined = false;
    for (const g of m.groups) {
      const p = g.points.find((q) => q.row === row && q.observationId !== null);
      if (!p || !Number.isFinite(p.cy)) {
        if (!bridge) joined = false;
        continue;
      }
      if (!joined) runs.push([]);
      runs[runs.length - 1].push([Math.round(p.cx * 100) / 100, Math.round(p.cy * 100) / 100]);
      joined = true;
    }
    if (runs.some((r) => r.length > 1)) out.push({ row, runs: runs.filter((r) => r.length > 1) });
  }
  return out;
};

const parse = (d: string) =>
  d.split('M').filter(Boolean).map((run) => [...run.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((x) => [Number(x[1]), Number(x[2])]));

describe('paired line matching', () => {
  it.each([false, true])('gives what a find-per-row loop gives, on random tables with gaps and repeated values (bridge %s)', (bridge) => {
    const next = seeded(bridge ? 7 : 11);
    for (let trial = 0; trial < 12; trial++) {
      const { table, chart } = build(1 + Math.floor(next() * 40), 2 + Math.floor(next() * 4), next, bridge, next() * 0.6);
      const m = buildColumnModel(chart, table);
      const got = m.pairLines.map((l) => ({ row: l.row, runs: parse(l.d) }));
      expect(got).toEqual(reference(m, bridge));
    }
  });

  it('builds 10,000 rows x 4 data sets quickly', () => {
    const { table, chart } = build(10000, 4, seeded(3), false, 0.1);
    const times: number[] = [];
    let lines = 0;
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      lines = buildColumnModel(chart, table).pairLines.length;
      times.push(performance.now() - t0);
    }
    expect(lines).toBeGreaterThan(5000);
    expect(times.sort((a, b) => a - b)[1]).toBeLessThan(1000);
  });
});
