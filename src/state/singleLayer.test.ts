import { describe, expect, it } from 'vitest';
import { createExampleProject } from '../model/defaults';
import { parseProject, parseProjectWithNotes, stringifyProject } from './serialize';

type Raw = { project: { charts: Array<{ layers: Array<Record<string, unknown>> }> } };
const saved = (): Raw => JSON.parse(stringifyProject(createExampleProject())) as Raw;

describe('the one data layer of a graph', () => {
  it('is what a graph has when it is made, saved and read: no note', () => {
    const p = createExampleProject();
    expect(p.charts.every((c) => c.layers.length === 1)).toBe(true);
    const { project, notes } = parseProjectWithNotes(stringifyProject(p));
    expect(notes).toEqual([]);
    expect(project.charts.every((c) => c.layers.length === 1)).toBe(true);
  });

  it('is the first of the layers of a file that has more, and the file says so', () => {
    const raw = saved();
    const chart = raw.project.charts[0];
    chart.layers.push({ ...chart.layers[0], id: 'second', name: 'Second' }, { ...chart.layers[0], id: 'third', name: 'Third' });
    const { project, notes } = parseProjectWithNotes(JSON.stringify(raw));
    expect(project.charts[0].layers.map((l) => l.id)).toEqual([chart.layers[0].id]);
    expect(notes.some((n) => n.includes('layers') && n.includes('one layer') && n.includes('2'))).toBe(true);
    // Saved again, the graph has its one layer and reads without a note.
    expect(parseProjectWithNotes(stringifyProject(project)).notes).toEqual([]);
  });

  it('says "was" for one layer that is not read', () => {
    const raw = saved();
    raw.project.charts[0].layers.push({ ...raw.project.charts[0].layers[0], id: 'second' });
    expect(parseProjectWithNotes(JSON.stringify(raw)).notes.join(' ')).toMatch(/the other 1 was not read/);
  });

  it('does not report the faults of a layer that is not read', () => {
    const raw = saved();
    raw.project.charts[0].layers.push({ id: 'broken', style: 'nonsense' });
    const { notes } = parseProjectWithNotes(JSON.stringify(raw));
    expect(notes.filter((n) => n.includes('layers[1]'))).toEqual([]);
    expect(notes.some((n) => n.includes('not read'))).toBe(true);
  });

  it('is still required: a graph without a layer is not a graph', () => {
    const raw = saved();
    raw.project.charts[0].layers = [];
    expect(() => parseProject(JSON.stringify(raw))).toThrow(/at least one layer/);
  });
});
