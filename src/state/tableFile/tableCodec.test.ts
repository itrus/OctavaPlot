import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../../model/defaults';
import { canonicalObservationId } from '../../model/table/rows';
import type { Project } from '../../model/types';
import { addChart, addDataTable, addRows, patchStyle } from '../commands';
import { parseProject, parseProjectWithNotes, stringifyProject } from '../serialize';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

const tableJson = (p: Project): Any => (JSON.parse(stringifyProject(p)) as Any).project.dataTables[0];
const roundTrip = (p: Project): Project => parseProject(stringifyProject(p));

describe('the table as written in a file', () => {
  it('lists the cells that have a value, as [row, value], and leaves the empty ones out', () => {
    const p = createExampleProject();
    const t = tableJson(p);
    const first = p.dataTables[0].groups[0].observations.map((o) => o.value);
    expect(t.rowCount).toBe(first.length);
    expect(t.groups[0].observations).toEqual(first.flatMap((v, i) => (v === null ? [] : [[i, v]])));
    expect(t.groups[0].observations.length).toBeLessThan(first.length);
  });

  it('keeps zero: it is a value, not an empty cell', () => {
    const p = createExampleProject();
    p.dataTables[0].groups[0].observations[7] = { ...p.dataTables[0].groups[0].observations[7], value: 0 };
    expect(tableJson(p).groups[0].observations).toContainEqual([7, 0]);
    expect(roundTrip(p).dataTables[0].groups[0].observations[7].value).toBe(0);
  });

  it('keeps an empty cell that has a subject or is excluded, and reads it back as that, not as an empty cell', () => {
    const p = createExampleProject();
    const obs = p.dataTables[0].groups[0].observations;
    obs[9] = { ...obs[9], value: null, subject: 'Mouse 3' };
    obs[10] = { ...obs[10], value: null, excluded: true, excludedReason: 'dropped out' };
    const t = tableJson(p);
    expect(t.groups[0].observations).toContainEqual([9, null, { subject: 'Mouse 3' }]);
    expect(t.groups[0].observations).toContainEqual([10, null, { excluded: true, excludedReason: 'dropped out' }]);
    const back = roundTrip(p).dataTables[0].groups[0].observations;
    expect(back[9]).toMatchObject({ value: null, subject: 'Mouse 3' });
    expect(back[10]).toMatchObject({ value: null, excluded: true, excludedReason: 'dropped out' });
    expect(back[11]).toEqual({ id: canonicalObservationId(p.dataTables[0].groups[0].id, 11), value: null });
  });

  it('writes no ID for a cell or a row at its own place, and the IDs read again are the ones it had', () => {
    const p = createExampleProject();
    expect(stringifyProject(p)).not.toContain('obs_');
    expect(roundTrip(p)).toEqual(p);
  });

  it('writes the ID of a value that is not at its place, and keeps it', () => {
    const p = createExampleProject();
    const g = p.dataTables[0].groups[0];
    g.observations[0] = { ...g.observations[0], id: 'obs_moved' };
    expect(tableJson(p).groups[0].observations[0]).toEqual([0, g.observations[0].value, { id: 'obs_moved' }]);
    expect(roundTrip(p).dataTables[0].groups[0].observations[0].id).toBe('obs_moved');
  });

  it('keeps the ID of an empty cell only when a graph refers to it', () => {
    const p = createExampleProject();
    const g = p.dataTables[0].groups[0];
    g.observations[15] = { ...g.observations[15], id: 'obs_empty' };
    g.observations[16] = { ...g.observations[16], id: 'obs_named' };
    const withStyle = patchStyle(p.charts[0].id, g.id, {})(p);
    withStyle.charts[0].layers[0].objectOverrides['obs_named'] = { symbolSizePt: 9 };
    const t = tableJson(withStyle);
    expect(JSON.stringify(t)).not.toContain('obs_empty');
    expect(t.groups[0].observations).toContainEqual([16, null, { id: 'obs_named' }]);
    expect(roundTrip(withStyle).dataTables[0].groups[0].observations[16].id).toBe('obs_named');
  });

  it('a stored ID that another cell would be given is not a clash: the cell that was not named gets the next free ID', () => {
    const p = createExampleProject();
    const g = p.dataTables[0].groups[0];
    // The value at row 3 carries the canonical ID of row 4, and row 4 is empty (so not written).
    g.observations[3] = { ...g.observations[3], id: canonicalObservationId(g.id, 4) };
    g.observations[4] = { ...g.observations[4], value: null };
    const ids = roundTrip(p).dataTables[0].groups[0].observations.map((o) => o.id);
    expect(ids[3]).toBe(canonicalObservationId(g.id, 4));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('refuses entries that are out of place or out of order', () => {
    const bad = (mutate: (obs: unknown[]) => unknown) => {
      const j = JSON.parse(stringifyProject(createExampleProject())) as Any;
      const g = j.project.dataTables[0].groups[0];
      g.observations = mutate(g.observations);
      return () => parseProject(JSON.stringify(j));
    };
    expect(bad(() => [[99999, 1]])).toThrow(/row index/);
    expect(bad(() => [[2, 1], [1, 1]])).toThrow(/larger than/);
    expect(bad(() => [[1, 1], [1, 2]])).toThrow(/larger than/);
    expect(bad(() => [[1, 'x']])).toThrow(/finite number/);
    expect(bad(() => [[1]])).toThrow(/entries/);
    expect(bad(() => [[1, 1, { id: '' }]])).toThrow(/empty/);
    expect(bad(() => [{ id: 'obs_a', value: 1 }])).toThrow(/array/);
    expect(bad(() => 'nope')).toThrow(/array/);
  });

  it('stays small: a table of 1000 rows with 5 values in a column costs those 5 values, not 1000 cells', () => {
    let p = createExampleProject();
    p = addDataTable('big', 'column', {})(p);
    p = addRows('big', 1000 - p.dataTables.find((x) => x.id === 'big')!.rowCount)(p);
    const t = p.dataTables.find((x) => x.id === 'big')!;
    t.groups[0].observations.slice(0, 5).forEach((o, i) => (o.value = i + 1));
    const text = stringifyProject(p);
    expect(text.length).toBeLessThan(20000);
    const back = parseProjectWithNotes(text);
    expect(back.notes).toEqual([]);
    expect(back.project).toEqual(p);
    expect(back.project.dataTables.find((x) => x.id === 'big')!.rowCount).toBe(1000);
  });

  it('writes one entry on one line, and the same text again after a round trip', () => {
    const p = createExampleProject();
    const text = stringifyProject(p);
    expect(text).toMatch(/^ +\[0,[-\d.]+\],?$/m);
    expect(stringifyProject(roundTrip(p))).toBe(text);
  });

  it('keeps the marks of a graph the same through a save and an open (their IDs come from the cells)', () => {
    const p = addChart('c2', createExampleProject().dataTables[0].id, undefined, 'bar')(createExampleProject());
    expect(roundTrip(p)).toEqual(p);
  });
});
