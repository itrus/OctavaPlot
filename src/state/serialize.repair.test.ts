import { describe, expect, it } from 'vitest';
import { createChart, createExampleProject, createXyTable } from '../model/defaults';
import type { Project } from '../model/types';
import { parseProjectWithNotes, stringifyProject } from './serialize';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = Record<string, any>;

/** A project with an XY table (3 replicates), an analysis of each kind and a layout, as the text of a file. */
function base(): Project {
  const p = createExampleProject();
  const xy = createXyTable('Dose', true, { kind: 'replicates', n: 3 });
  return {
    ...p,
    dataTables: [...p.dataTables, xy],
    charts: [...p.charts, createChart(xy.id, undefined, 'xyLine')],
    analyses: [
      { id: 'an-1', name: 'Stats', kind: 'descriptive', dataTableId: p.dataTables[0].id, level: 0.95 },
      { id: 'an-2', name: 'Fit', kind: 'curvefit', dataTableId: xy.id, level: 0.95, model: 'hyperbola' as never, degree: 2 },
    ],
  };
}
const edit = (mutate: (j: Any) => void): string => {
  const j = JSON.parse(stringifyProject(base())) as Any;
  mutate(j);
  return JSON.stringify(j);
};
const xyIndex = 1;

describe('a damaged scientific structure refuses the file', () => {
  it('a replicate layout with a bad n names the path', () => {
    const text = edit((j) => (j.project.dataTables[xyIndex].layout = { kind: 'replicates', n: 99 }));
    expect(() => parseProjectWithNotes(text)).toThrow(/project\.dataTables\[1\]\.layout\.n/);
  });
  it('a summary layout with an unknown format names the path', () => {
    const text = edit((j) => (j.project.dataTables[xyIndex].layout = { kind: 'summary', format: 'nope' }));
    expect(() => parseProjectWithNotes(text)).toThrow(/project\.dataTables\[1\]\.layout\.format/);
  });
  it('a layout of an unknown kind is refused, not read as single values', () => {
    const text = edit((j) => (j.project.dataTables[xyIndex].layout = { kind: 'triplicates' }));
    expect(() => parseProjectWithNotes(text)).toThrow(/project\.dataTables\[1\]\.layout\.kind/);
  });
  it('a single layout and a missing layout are read as single values', () => {
    const one = edit((j) => {
      j.project.dataTables[xyIndex].layout = { kind: 'single' };
      j.project.dataTables[xyIndex].groups = j.project.dataTables[xyIndex].groups.slice(0, 2);
    });
    expect(parseProjectWithNotes(one).project.dataTables[xyIndex].layout).toBeUndefined();
  });
  it('two analyses with the same id are refused', () => {
    const text = edit((j) => (j.project.analyses[1].id = 'an-1'));
    expect(() => parseProjectWithNotes(text)).toThrow(/project\.analyses\[1\]\.id.*duplicated/);
  });
  it('a curve fit with an unknown model is refused, not dropped', () => {
    const text = edit((j) => (j.project.analyses[1].model = 'wiggle'));
    expect(() => parseProjectWithNotes(text)).toThrow(/project\.analyses\[1\]\.model/);
  });
  it('a graph data set entry that cannot be read is refused', () => {
    const t = edit((j) => (j.project.charts[0].extraGroups = [{ groupId: 'x' }]));
    expect(() => parseProjectWithNotes(t)).toThrow(/project\.charts\[0\]\.extraGroups\[0\]\.tableId/);
  });
  it('a data set listed twice on a graph is refused', () => {
    const text = edit((j) => {
      const e = { tableId: j.project.dataTables[1].id, groupId: j.project.dataTables[1].groups[0].id };
      j.project.charts[0].extraGroups = [e, e];
    });
    expect(() => parseProjectWithNotes(text)).toThrow(/project\.charts\[0\]\.extraGroups\[1\]/);
  });
  it('a layout without an id is refused', () => {
    const text = edit((j) => (j.project.layouts = [{ name: 'Page' }]));
    expect(() => parseProjectWithNotes(text)).toThrow(/project\.layouts\[0\]\.id/);
  });
});

describe('stale items are dropped with a note, and the rest of the file opens', () => {
  it('an analysis of a table that is gone is dropped, with its path', () => {
    const text = edit((j) => (j.project.analyses[0].dataTableId = 'gone'));
    const { project, notes } = parseProjectWithNotes(text);
    expect(project.analyses?.map((a) => a.id)).toEqual(['an-2']);
    expect(notes.some((n) => n.startsWith('project.analyses[0]') && n.includes('dropped'))).toBe(true);
  });
  it('a graph data set from a table or data set that is gone is dropped, the others stay', () => {
    const text = edit((j) => {
      const ok = { tableId: j.project.dataTables[1].id, groupId: j.project.dataTables[1].groups[0].id };
      j.project.charts[0].extraGroups = [{ tableId: 'gone', groupId: 'x' }, ok, { tableId: j.project.dataTables[1].id, groupId: 'gone' }];
    });
    const { project, notes } = parseProjectWithNotes(text);
    expect(project.charts[0].extraGroups).toHaveLength(1);
    expect(notes.filter((n) => n.startsWith('project.charts[0].extraGroups'))).toHaveLength(2);
  });
});

describe('presentation repairs are reset with a note that has the path', () => {
  it('reports every repair, each with its path', () => {
    const text = edit((j) => {
      j.project.charts[0].defaults.symbolShape = 'blob';
      j.project.charts[1].defaults.errorCap = 'x';
      j.project.charts[1].annotations = [{ nope: true }];
      j.project.analyses[0].level = 7;
    });
    const { notes } = parseProjectWithNotes(text);
    expect(notes.length).toBeGreaterThanOrEqual(4);
    expect(notes.some((n) => n.startsWith('project.charts[0].defaults.symbolShape'))).toBe(true);
    expect(notes.some((n) => n.startsWith('project.charts[1].defaults.errorCap'))).toBe(true);
    expect(notes.some((n) => n.startsWith('project.charts[1].annotations[0]'))).toBe(true);
    expect(notes.some((n) => n.startsWith('project.analyses[0].level'))).toBe(true);
  });
  it('a panel of a missing graph is emptied with a note', () => {
    const text = edit((j) => (j.project.layouts = [{ id: 'l1', name: 'Page', panels: ['no-such-graph'] }]));
    const { project, notes } = parseProjectWithNotes(text);
    expect(project.layouts?.[0].panels.every((x) => x === null)).toBe(true);
    expect(notes.some((n) => n.startsWith('project.layouts[0].panels[0]'))).toBe(true);
  });
  it('every note starts with a path', () => {
    const text = edit((j) => {
      j.project.charts[0].linkedTo = 'gone';
      j.project.charts[0].type = 'xyLine';
      j.project.charts[0].groupGaps = [3];
    });
    for (const n of parseProjectWithNotes(text).notes) expect(n).toMatch(/^project\./);
  });
});

describe('a valid file', () => {
  it('round trips with no notes', () => {
    const p = base();
    const r = parseProjectWithNotes(stringifyProject(p));
    expect(r.notes).toEqual([]);
    const once = stringifyProject(r.project);
    expect(stringifyProject(parseProjectWithNotes(once).project)).toBe(once);
  });
});
