import { describe, expect, it } from 'vitest';
import { createChart, createColumnTable } from '../../model/defaults';
import type { Chart, DataTable } from '../../model/types';
import { buildColumnModel } from './columnModel';
import { dotOffsets, hash01, swarmOffsets } from '../shared/parts/jitter';

const touching = (xs: number[], ys: number[], d: number) => {
  for (let i = 0; i < xs.length; i++) for (let j = i + 1; j < xs.length; j++) if (Math.hypot(xs[i] - xs[j], ys[i] - ys[j]) < d - 1e-6) return true;
  return false;
};

describe('swarmOffsets', () => {
  it('keeps no two symbols touching while the width allows it', () => {
    const ys = Array.from({ length: 120 }, (_, i) => 100 + ((i * 37) % 23));
    const xs = swarmOffsets(ys, 8, 400);
    expect(touching(xs, ys, 8)).toBe(false);
  });

  it('is the same every time and does not depend on the order of the values', () => {
    const ys = Array.from({ length: 60 }, (_, i) => 50 + ((i * 17) % 11));
    const a = swarmOffsets(ys, 6, 100);
    expect(swarmOffsets(ys, 6, 100)).toEqual(a);
    const reversed = [...ys].reverse();
    const b = swarmOffsets(reversed, 6, 100).reverse();
    expect(touching(b, ys, 6)).toBe(false);
  });

  it('puts a lone symbol and well-separated symbols in the middle', () => {
    expect(swarmOffsets([10], 8, 50)).toEqual([0]);
    expect(swarmOffsets([0, 20, 40], 8, 50)).toEqual([0, 0, 0]);
  });

  it('spreads equal values to both sides of the middle, in a row', () => {
    const xs = swarmOffsets([5, 5, 5, 5, 5], 10, 100);
    expect([...xs].sort((a, b) => a - b)).toEqual([-20, -10, 0, 10, 20]);
  });

  it('holds the swarm to the widest allowed, and leaves unplaceable heights in the middle', () => {
    const xs = swarmOffsets(Array(40).fill(5), 10, 25);
    expect(Math.max(...xs.map(Math.abs))).toBeLessThanOrEqual(25);
    expect(swarmOffsets([NaN, 1], 10, 25)[0]).toBe(0);
    expect(swarmOffsets([1, 1], 0, 25)).toEqual([0, 0]);
  });

  it('copes with a large pile of equal values', () => {
    const xs = swarmOffsets(Array(5000).fill(1), 6, 60);
    expect(xs.length).toBe(5000);
  });
});

describe('dotOffsets', () => {
  const ids = ['a', 'b', 'c'];
  const ys = [1, 1, 1];
  it('has none when the dots are aligned, jitter from the ID, and the swarm otherwise', () => {
    expect(dotOffsets({ enabled: false, swarm: true }, ids, ys, 8, 40)).toEqual([0, 0, 0]);
    expect(dotOffsets({ enabled: true, swarm: false }, ids, ys, 8, 40)).toEqual(ids.map((id) => (hash01(id) - 0.5) * 40));
    expect(dotOffsets({ enabled: true, swarm: true }, ids, ys, 8, 40)).toEqual(swarmOffsets(ys, 8, 20));
  });
});

describe('a scatter dot plot as a beeswarm', () => {
  const build = (patch: Partial<Chart['jitter']>) => {
    const table: DataTable = createColumnTable('Data', false);
    table.groups[0].observations.forEach((o, r) => {
      o.value = r < 6 ? 10 + (r % 3) : null;
    });
    const chart: Chart = { ...createChart(table.id, undefined, 'scatter') };
    chart.jitter = { ...chart.jitter, widthFraction: 1, ...patch };
    const m = buildColumnModel(chart, table);
    return m.groups[0].points.filter((q) => q.observationId !== null);
  };

  it('leaves no two dots touching, keeps each at its height, and is the same every time', () => {
    const swarm = build({ enabled: true, swarm: true });
    expect(swarm.length).toBeGreaterThan(5);
    for (let i = 0; i < swarm.length; i++) for (let j = i + 1; j < swarm.length; j++) expect(Math.hypot(swarm[i].cx - swarm[j].cx, swarm[i].cy - swarm[j].cy)).toBeGreaterThanOrEqual(swarm[i].size - 1e-6);
    const jitter = build({ enabled: true, swarm: false });
    expect(swarm.map((q) => q.cy)).toEqual(jitter.map((q) => q.cy));
    expect(build({ enabled: true, swarm: true }).map((q) => q.cx)).toEqual(swarm.map((q) => q.cx));
  });

  it('puts every dot in the middle when the dots are aligned, whatever the swarm setting says', () => {
    const aligned = build({ enabled: false, swarm: true });
    expect(new Set(aligned.map((q) => q.cx)).size).toBe(1);
  });
});
