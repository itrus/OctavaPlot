import { describe, expect, it } from 'vitest';
import type { Project } from '../model/types';
import { patchStyle, setRowTitles } from '../state/commands';
import { bindLeft, bindRight, dualAxisFixture } from '../testing/dualAxisFixture';
import type { HitTarget } from './shared/scene/hitTest';
import { buildColumnModel } from './column/columnModel';
import { tooltipLines } from './tooltip';

const single = (): Project => {
  const p = dualAxisFixture({ bindRight: false });
  return patchStyle(p.charts[0].id, 'all', { showSymbols: true })(p);
};
const linesFor = (p: Project, hit: HitTarget) => tooltipLines(buildColumnModel(p.charts[0], p.dataTables[0]), p.dataTables[0], hit);
const gid = (p: Project, i = 0) => p.dataTables[0].groups[i].id;
const withTitle = (p: Project, title: string): Project => setRowTitles(p.dataTables[0].id, [{ row: 0, title }])(p);
const pointHit = (p: Project, kind: HitTarget['kind'] = 'point'): HitTarget => ({
  kind,
  groupId: gid(p),
  objectId: p.dataTables[0].groups[0].observations[0].id,
});

describe('tooltipLines', () => {
  it('returns null for background, annotation and unknown group', () => {
    const p = single();
    expect(linesFor(p, { kind: 'background' })).toBeNull();
    expect(linesFor(p, { kind: 'annotation', groupId: gid(p) })).toBeNull();
    expect(linesFor(p, { kind: 'bar', groupId: 'nope' })).toBeNull();
  });
  it('bar hit on a single axis: title then summary lines, no Axis line', () => {
    const p = single();
    const m = buildColumnModel(p.charts[0], p.dataTables[0]);
    const lines = linesFor(p, { kind: 'bar', groupId: gid(p) })!;
    expect(lines[0]).toBe(m.groups[0].label);
    expect(lines[1]).toMatch(/^n = /);
    expect(lines.some((l) => l.startsWith('Axis:'))).toBe(false);
  });
  it('has no Axis line while the right axis is unused', () => {
    const base = dualAxisFixture();
    const p = bindLeft(base, [gid(base, 2), gid(base, 3)]);
    expect(buildColumnModel(p.charts[0], p.dataTables[0]).y2).toBeNull();
    expect(linesFor(p, { kind: 'bar', groupId: gid(p, 2) })!.some((l) => l.startsWith('Axis:'))).toBe(false);
  });
  it('has an Axis line when data sets are bound right', () => {
    const p = dualAxisFixture();
    expect(linesFor(p, { kind: 'bar', groupId: gid(p, 0) })![1]).toBe('Axis: Left Y axis');
    expect(linesFor(p, { kind: 'bar', groupId: gid(p, 2) })![1]).toBe('Axis: Right Y axis');
    const m = buildColumnModel(p.charts[0], p.dataTables[0]);
    expect(linesFor(p, { kind: 'bar', groupId: gid(p, 2) })![0]).toBe(m.groups[2].label);
  });
  it('shows Row title and Value for a raw point', () => {
    const p = withTitle(single(), 'S-1');
    const lines = linesFor(p, pointHit(p))!;
    expect(lines).toContain('Row title: S-1');
    expect(lines.find((l) => l.startsWith('Value: '))).toMatch(/\(row 1\)$/);
  });
  it('omits an empty or whitespace title', () => {
    for (const t of ['', '   ']) {
      const p = withTitle(single(), t);
      const lines = linesFor(p, pointHit(p))!;
      expect(lines.some((l) => l.startsWith('Row title'))).toBe(false);
      expect(lines.some((l) => l.startsWith('Value: '))).toBe(true);
    }
  });
  it('a label hit gives the same lines as a point hit', () => {
    const p = withTitle(single(), 'S-1');
    expect(linesFor(p, pointHit(p, 'label'))).toEqual(linesFor(p, pointHit(p)));
  });
  it('a mean marker has neither Row title nor Value', () => {
    const p = withTitle(single(), 'S-1');
    const lines = linesFor(p, { kind: 'point', groupId: gid(p), objectId: `${gid(p)}:mean` })!;
    expect(lines.some((l) => l.startsWith('Row title') || l.startsWith('Value'))).toBe(false);
  });
  it('a label hit for an unfound point gives only title and summary', () => {
    const p = withTitle(single(), 'S-1');
    const lines = linesFor(p, { kind: 'label', groupId: gid(p), objectId: 'missing' })!;
    expect(lines.some((l) => l.startsWith('Row title') || l.startsWith('Value'))).toBe(false);
    expect(lines[1]).toMatch(/^n = /);
  });
  it('puts Axis before Row title', () => {
    const d = dualAxisFixture();
    const p = withTitle(patchStyle(d.charts[0].id, 'all', { showSymbols: true })(d), 'S-1');
    const lines = linesFor(p, pointHit(p))!;
    expect(lines.indexOf('Axis: Left Y axis')).toBe(1);
    expect(lines.indexOf('Row title: S-1')).toBe(2);
  });
  it('a legend hit gives title and summary lines', () => {
    const base = single();
    const p = bindRight(base, [gid(base, 1)]);
    const lines = linesFor(p, { kind: 'legend', groupId: gid(p, 1) })!;
    expect(lines[1]).toBe('Axis: Right Y axis');
    expect(lines[2]).toMatch(/^n = /);
  });
  it('passes the error-bar hit kind so the interval comes before the centre', () => {
    const p = single();
    const centre = linesFor(p, { kind: 'bar', groupId: gid(p) })!;
    const error = linesFor(p, { kind: 'error', groupId: gid(p) })!;
    expect([...error].sort()).toEqual([...centre].sort());
    expect(error).not.toEqual(centre);
  });
});
