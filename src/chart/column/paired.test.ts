import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import { paletteById, paletteColor } from '../../model/graph/palettes';
import type { DataTable, Project, Id } from '../../model/types';
import { patchLook, patchStyle, setChartType } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { chartToSvgString } from '../export/export';
import { buildColumnModel } from './columnModel';

/** Rows are subjects; columns are conditions. */
const setup = (columns: Array<Array<number | null>>, type: 'paired' | 'scatter' = 'paired') => {
  const table: DataTable = createColumnTable('Data', false);
  table.groups.forEach((g, i) => g.observations.forEach((o, r) => (o.value = columns[i]?.[r] ?? null)));
  const chart = createChart(table.id, undefined, type);
  const p: Project = { id: 'p', name: 'p', dataTables: [table], charts: [chart] };
  return { p, table, chart };
};
const bridge = (p: Project, on: boolean) => patchLook(p.charts[0].id, { pairs: { bridge: on } })(p).charts[0];

describe('paired plot', () => {
  it('joins the values of each row across the columns, one line for each subject', () => {
    const { table, chart } = setup([[1, 2, 3], [2, 3, 5], [4, 4, 4]]);
    const m = buildColumnModel(chart, table);
    expect(m.pairLines).toHaveLength(3);
    expect(m.pairLines.map((l) => l.row)).toEqual([0, 1, 2]);
    // Subject 0 goes through its dot in each of the three columns.
    const through = m.groups.slice(0, 3).map((g) => g.points.find((q) => q.row === 0)!);
    const numbers = [...m.pairLines[0].d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((x) => [Number(x[1]), Number(x[2])]);
    expect(numbers).toEqual(through.map((q) => [Math.round(q.cx * 100) / 100, Math.round(q.cy * 100) / 100]));
    expect(m.pairLines[0].d.startsWith('M')).toBe(true);
    expect(m.pairLines[0].d.match(/L/g)).toHaveLength(2);
  });
  it('keeps every dot on the line of its column, even with jitter on', () => {
    const { table, chart } = setup([[1, 2], [2, 3]]);
    expect(chart.jitter.enabled).toBe(true);
    const m = buildColumnModel(chart, table);
    for (const g of m.groups) for (const p of g.points) expect(p.cx).toBeCloseTo(g.centerX, 9);
  });
  it('breaks a subject\'s line at a missing value, and joins across it only when asked', () => {
    const { p, table } = setup([[1, 2], [2, null], [4, 5]]);
    const broken = buildColumnModel(p.charts[0], table);
    // Subject 1 has values in columns A and C but not B: no segment, so no line at all.
    expect(broken.pairLines.map((l) => l.row)).toEqual([0]);
    const joined = buildColumnModel(bridge(p, true), table);
    expect(joined.pairLines.map((l) => l.row)).toEqual([0, 1]);
    const line = joined.pairLines.find((l) => l.row === 1)!;
    expect(line.d.match(/L/g)).toHaveLength(1);
    // The line spans A and C, so it passes the column with the gap and a value is never invented there.
    const [a, c] = [...line.d.matchAll(/(-?[\d.]+),/g)].map((x) => Number(x[1]));
    expect(c).toBeGreaterThan(a + 10);
    expect(joined.groups[1].points.find((q) => q.row === 1)).toBeUndefined();
  });
  it('has no line for a subject that has one value only', () => {
    const { table, chart } = setup([[1, 2], [3, null]]);
    expect(buildColumnModel(chart, table).pairLines.map((l) => l.row)).toEqual([0]);
  });
  it('draws lines only while the lines are on, in the colour and thickness of the data set when the lines have one colour', () => {
    const { p, table } = setup([[1, 2], [2, 3]]);
    const off = patchStyle(p.charts[0].id, 'all', { showLines: false })(p).charts[0];
    expect(buildColumnModel(off, table).pairLines).toHaveLength(0);
    const styled = patchLook(p.charts[0].id, { pairs: { lineColour: 'one' } })(patchStyle(p.charts[0].id, 'all', { lineColor: '#112233', lineWidthPt: 4 })(p)).charts[0];
    expect(buildColumnModel(styled, table).pairLines[0]).toMatchObject({ color: '#112233', strokeWidth: 4 });
    expect(chartToSvgString(styled, table)).toContain('stroke="#112233" stroke-width="4"');
  });
  describe('colour of the lines', () => {
    const colours = (c: Project['charts'][number], table: DataTable) => buildColumnModel(c, table).pairLines.map((l) => l.color);
    const dots = (c: Project['charts'][number], table: DataTable) => buildColumnModel(c, table).groups.map((g) => g.points[0]?.color);

    it('is a colour for each subject, from the palette after the colours of the data sets, by default', () => {
      const { table, chart } = setup([[1, 2, 3], [2, 3, 5], [4, 4, 4]]);
      expect(chart.pairs.lineColour).toBe('subject');
      const lines = colours(chart, table);
      expect(new Set(lines).size).toBe(3);
      const palette = paletteById(chart.paletteId)!;
      expect(lines).toEqual([0, 1, 2].map((r) => paletteColor(palette, table.groups.length + r)));
      // None of them is the colour of a column's dots.
      const columns = table.groups.map((g) => paletteColor(palette, g.paletteIndex));
      for (const colour of lines) expect(columns).not.toContain(colour);
    });
    it('keeps the colour of a subject when another subject has no line', () => {
      // Row 0 has no value at all, so no line: row 1 has the colour of the second subject, not the first.
      const { table, chart } = setup([[null, 2], [null, 3], [null, 5]]);
      expect(buildColumnModel(chart, table).pairLines.map((l) => l.row)).toEqual([1]);
      expect(colours(chart, table)).toEqual([paletteColor(paletteById(chart.paletteId)!, table.groups.length + 1)]);
    });
    it('is the one colour of the lines when the chart asks for one colour', () => {
      const { p, table } = setup([[1, 2], [2, 3]]);
      const one = patchLook(p.charts[0].id, { pairs: { lineColour: 'one' } })(p).charts[0];
      expect(colours(one, table)).toEqual([one.defaults.lineColor, one.defaults.lineColor]);
    });
    it('is the one colour when the lines were given a colour of their own in the layers, and when there is no palette', () => {
      const { p, table, chart } = setup([[1, 2], [2, 3]]);
      const own = { ...chart, layerStyles: { [`${chart.id}:pairLines`]: { color: '#aa1122' } } };
      expect(colours(own, table)).toEqual(['#aa1122', '#aa1122']);
      expect(colours({ ...chart, paletteId: null }, table)).toEqual([chart.defaults.lineColor, chart.defaults.lineColor]);
      expect(p.charts).toHaveLength(1);
    });
    it('leaves the dots the colour of their column, whatever the lines are', () => {
      const { table, chart } = setup([[1, 2], [2, 3]]);
      const one = { ...chart, pairs: { ...chart.pairs, lineColour: 'one' as const } };
      expect(dots(chart, table)).toEqual(dots(one, table));
    });
    it('reaches the SVG, a colour for each line', () => {
      const { table, chart } = setup([[1, 2], [2, 3]]);
      const svg = chartToSvgString(chart, table);
      for (const colour of colours(chart, table)) expect(svg).toContain(`stroke="${colour}"`);
    });
    it('is kept in a file; a file without it opens with the default', () => {
      const { p } = setup([[1, 2]]);
      const one = patchLook(p.charts[0].id, { pairs: { lineColour: 'one' } })(p);
      expect(parseProject(stringifyProject(one)).charts[0].pairs.lineColour).toBe('one');
      const text = JSON.parse(stringifyProject(p));
      delete text.project.charts[0].pairs.lineColour;
      expect(parseProject(JSON.stringify(text)).charts[0].pairs.lineColour).toBe('subject');
      text.project.charts[0].pairs.lineColour = 'rainbow';
      expect(parseProject(JSON.stringify(text)).charts[0].pairs.lineColour).toBe('subject');
    });
    it('keeps a line colour given before the setting existed: such a file opens with one colour', () => {
      const { p } = setup([[1, 2]]);
      const given = patchStyle(p.charts[0].id, 'all', { lineColor: '#cc0000' })(p);
      const text = JSON.parse(stringifyProject(given));
      delete text.project.charts[0].pairs.lineColour;
      const back = parseProject(JSON.stringify(text)).charts[0];
      expect(back.pairs.lineColour).toBe('one');
    });
  });
  it('is not a scatter plot: that has no lines and its dots spread out', () => {
    const { table, chart } = setup([[1, 2], [2, 3]], 'scatter');
    expect(buildColumnModel(chart, table).pairLines).toHaveLength(0);
  });
  it('can show the mean of each column, run horizontally, and be switched from other column charts', () => {
    const { p, table } = setup([[1, 2, 3], [2, 3, 5]]);
    const id = p.charts[0].id;
    const withMean = patchStyle(id, 'all', { showMeanLine: true })(p).charts[0];
    expect(buildColumnModel(withMean, table).groups[0].meanLine).not.toBeNull();
    const flipped = patchLook(id, { orientation: 'horizontal' })(p).charts[0];
    const m = buildColumnModel(flipped, table);
    expect(m.orient.horizontal).toBe(true);
    expect(chartToSvgString(flipped, table)).not.toContain('NaN');
    const back = setChartType(id, 'bar')(p);
    expect(buildColumnModel(back.charts[0], table).pairLines).toHaveLength(0);
  });
  it('keeps its setting in a file, and old files join across nothing', () => {
    const { p } = setup([[1, 2]]);
    const next = patchLook(p.charts[0].id, { pairs: { bridge: true } })(p);
    expect(parseProject(stringifyProject(next)).charts[0].pairs.bridge).toBe(true);
    const text = JSON.parse(stringifyProject(next));
    delete text.project.charts[0].pairs;
    expect(parseProject(JSON.stringify(text)).charts[0].pairs.bridge).toBe(false);
  });
});

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
