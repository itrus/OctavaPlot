import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { AUTO_BAR_GAP_PCT } from '../model/options/columnOptions';
import { FILE_VERSION, SHAPE_STEPS, upgradeToCurrent, VERSION_STEPS, type VersionStep } from './migrate';
import { parseProjectWithNotes, stringifyProject } from './serialize';

/**
 * Old files, written by the program as it was at three commits (see the git log of src/state/serialize.ts), then cut to 12 rows
 * and, in the first, given the old shapes that the commit wrote (a second layer, a space before each data set). Nothing here is
 * produced by the current writer. Each holds a column, an XY and a survival table with one graph of each.
 *   written-f301af0  the first .oplot: one version, groupGaps, a graph of several layers, no layouts
 *   written-8bf2d86  layouts, with the earlier scaling name "equal"
 *   written-df99336  the last before the brackets, the factor of a series and the subject of an observation
 */
const OLD = ['f301af0', '8bf2d86', 'df99336'] as const;
const text = (name: string): string => readFileSync(resolve(__dirname, `fixtures/written-${name}.oplot`), 'utf8');
type Json = { version: unknown; project: Record<string, any> };
const json = (name: string): Json => JSON.parse(text(name));

describe('old files', () => {
  it.each(OLD)('%s opens as version 1 and is read again as it is saved', (name) => {
    const env = json(name);
    expect(env.version).toBe(1);
    const { project } = parseProjectWithNotes(text(name));
    expect(project.dataTables.map((t) => t.kind)).toEqual(['column', 'xy', 'survival']);
    expect(project.charts.map((c) => c.type)).toEqual(['bar', 'xyLine', 'survival']);
    for (const t of project.dataTables) {
      expect(t.rowCount).toBe(12);
      expect(t.rows).toHaveLength(12);
      for (const g of t.groups) expect(g.observations).toHaveLength(12);
    }
    // What was kept from the file: the values of the first column of the first table.
    expect(project.dataTables[0].groups[0].observations.map((o) => o.value)).toEqual(env.project.dataTables[0].groups[0].observations.map((o: { value: number | null }) => o.value));
    const saved = stringifyProject(project);
    const again = parseProjectWithNotes(saved);
    expect(again.notes).toEqual([]);
    expect(stringifyProject(again.project)).toBe(saved);
  });

  it('f301af0: reads the first layer of a graph of two, and folds the equal spaces before the data sets into Space between columns', () => {
    const env = json('f301af0');
    const c = env.project.charts[0];
    expect(c.layers).toHaveLength(2);
    expect(Object.values(c.groupGaps)).toEqual([150, 150, 150]);
    const { project, notes } = parseProjectWithNotes(text('f301af0'));
    const read = project.charts[0];
    expect(read.layers).toHaveLength(1);
    expect(read.layers[0].id).toBe(c.layers[0].id);
    expect('groupGaps' in read).toBe(false);
    // The automatic space between columns, increased by half; the arithmetic is written out here.
    expect(read.bars.gapPct).toBe(Math.round(AUTO_BAR_GAP_PCT * 150) / 100);
    expect(notes).toEqual([
      'project.charts[0].layers: a graph has one layer in this version; the other 1 was not read.',
      'project.charts[0] ("Graph 1"): The space before each data set was added to Space between columns.',
    ]);
  });

  it('f301af0: spaces that differ are dropped, with a note, and 100 means no change', () => {
    const env = json('f301af0');
    const ids = Object.keys(env.project.charts[0].groupGaps);
    env.project.charts[0].groupGaps = { [ids[0]]: 150, [ids[1]]: 80, [ids[2]]: 100 };
    const differ = parseProjectWithNotes(JSON.stringify(env));
    expect(differ.notes.filter((n) => n.includes('no longer a setting'))).toHaveLength(1);
    expect(differ.project.charts[0].bars.gapPct).toBeNull();
    env.project.charts[0].groupGaps = Object.fromEntries(ids.map((id) => [id, 100]));
    const normal = parseProjectWithNotes(JSON.stringify(env));
    expect(normal.notes.filter((n) => n.includes('Space between columns'))).toEqual([]);
    expect(normal.project.charts[0].bars.gapPct).toBeNull();
  });

  it('8bf2d86: the layout keeps its panels and its scaling "equal" is read as "smallest"', () => {
    const env = json('8bf2d86');
    expect(env.project.layouts[0].scaling).toEqual({ mode: 'equal' });
    const { project, notes } = parseProjectWithNotes(text('8bf2d86'));
    expect(notes).toEqual([]);
    expect(project.layouts).toHaveLength(1);
    expect(project.layouts![0].scaling).toEqual({ mode: 'smallest' });
    expect(project.layouts![0].panels).toEqual(env.project.layouts[0].panels);
    expect(project.layouts![0].labelStyle).toBe('A');
  });

  it('df99336: nothing in it needs a change, and the fields added since take their defaults', () => {
    const { project, notes } = parseProjectWithNotes(text('df99336'));
    expect(notes).toEqual([]);
    const c = project.charts[0];
    expect(c.brackets).toEqual([]);
    expect(project.dataTables[0].groups.some((g) => g.factor !== undefined)).toBe(false);
    expect(project.dataTables[0].groups.some((g) => g.observations.some((o) => o.subject !== undefined))).toBe(false);
  });

  it('keeps a hand-written file working: a table without rows gets one empty title for each value', () => {
    const env = json('df99336');
    for (const t of env.project.dataTables) delete t.rows;
    const { project, notes } = parseProjectWithNotes(JSON.stringify(env));
    expect(notes).toEqual([]);
    for (const t of project.dataTables) {
      expect(t.rows).toHaveLength(12);
      expect(new Set(t.rows.map((r) => r.id)).size).toBe(12);
      expect(t.rows.every((r) => r.title === '')).toBe(true);
    }
  });

  it('does not make rows for a table whose size is not valid: the file is refused, as before', () => {
    for (const rowCount of [-1, 1.5, 100001, '12']) {
      const env = json('df99336');
      delete env.project.dataTables[0].rows;
      env.project.dataTables[0].rowCount = rowCount;
      expect(() => parseProjectWithNotes(JSON.stringify(env))).toThrow(/rowCount|rows/);
    }
  });
});

describe('the shape chain', () => {
  it('has steps with their own ids, in the order they run', () => {
    expect(SHAPE_STEPS.map((s) => s.id)).toEqual(['rows-generated', 'one-layer']);
  });

  it('does nothing to a file of the present shape', () => {
    const env = json('df99336');
    const before = JSON.stringify(env.project);
    const notes: string[] = [];
    for (const s of SHAPE_STEPS) s.run(env.project, notes);
    expect(notes).toEqual([]);
    expect(JSON.stringify(env.project)).toBe(before);
  });
});

describe('the version chain', () => {
  it('is empty while version 1 is the only one written', () => {
    expect(FILE_VERSION).toBe(1);
    expect(VERSION_STEPS).toEqual([]);
  });

  // Steps of a pretend history: version 1 had "title", version 2 "name", version 3 "name" and a list of tags.
  const steps: VersionStep[] = [
    { from: 2, label: 'tags added.', run: (p) => ({ ...p, tags: [] }) },
    { from: 1, label: 'title renamed to name.', run: ({ title, ...rest }) => ({ ...rest, name: title }) },
  ];

  it('takes a file up one version at a time, whatever the order of the list, and says what it did', () => {
    const notes: string[] = [];
    const project = upgradeToCurrent({ version: 1, project: { id: 'p', title: 'Old' } }, notes, steps, 3);
    expect(project).toEqual({ id: 'p', name: 'Old', tags: [] });
    expect(notes).toEqual(['The file was of version 1: title renamed to name.', 'The file was of version 2: tags added.']);
  });

  it('starts from the version of the file', () => {
    const notes: string[] = [];
    expect(upgradeToCurrent({ version: 2, project: { id: 'p', name: 'N' } }, notes, steps, 3)).toEqual({ id: 'p', name: 'N', tags: [] });
    expect(notes).toEqual(['The file was of version 2: tags added.']);
    expect(upgradeToCurrent({ version: 3, project: { id: 'p' } }, [], steps, 3)).toEqual({ id: 'p' });
  });

  it('refuses a version that is not whole, is below 1, is newer, or has no step', () => {
    const go = (version: unknown, current = 3, list = steps) => () => upgradeToCurrent({ version, project: {} }, [], list, current);
    for (const v of [0, -1, 1.5, '1', null, undefined, NaN]) expect(go(v)).toThrow(/version must be a whole number/);
    expect(go(4)).toThrow(/newer OctavaPlot/);
    expect(go(1, 3, [steps[0]])).toThrow(/cannot read version 1/);
    expect(() => upgradeToCurrent({ version: 1, project: 5 }, [], steps, 3)).toThrow(/project must be an object/);
  });
});
