import { applyOrder } from '../model/table/groupOrder';
import { foldGroupGaps } from '../model/options/columnOptions';
import { createRows, MAX_TABLE_ROWS } from '../model/table/rows';
import type { Project } from '../model/types';

/**
 * How an older project file is brought to the shape this version reads (docs/FILE_FORMAT.md, "Older files"). There are two chains.
 *
 * The version chain takes a file of an earlier envelope `version` up one version at a time: each step turns version N into N+1
 * and the last one lands on FILE_VERSION. The chain is empty because version 1 is the only one that has been written.
 * Raising FILE_VERSION means adding the step that reads the previous version, and a test of it against a file of that version.
 *
 * The shape chain deals with version 1 files that earlier builds wrote before a field existed or while it still had another
 * shape. Those files carry no revision, so each step looks for the old shape itself and does nothing to a file that does not have it.
 * Steps run in order, and each one is tested against an old file (src/state/fixtures, written by the commits named there).
 */
export const FILE_FORMAT = 'octavaplot-project';
export const FILE_VERSION = 1;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

export interface VersionStep {
  /** The version this step reads; it writes `from + 1`. */
  from: number;
  label: string;
  run: (project: Obj, notes: string[]) => Obj;
}

export const VERSION_STEPS: readonly VersionStep[] = [];

/** The project of an envelope, taken up to `current` version by version. A version that is not whole, newer, or without a step to read it is refused. */
export function upgradeToCurrent(env: Obj, notes: string[], steps: readonly VersionStep[] = VERSION_STEPS, current = FILE_VERSION): Obj {
  let version = env.version;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) throw new Error(`Invalid project file: version must be a whole number from 1 to ${current}.`);
  if (version > current) throw new Error(`Invalid project file: version is ${version}; this app reads version ${current} and earlier (it was written by a newer OctavaPlot).`);
  let project = env.project;
  if (!isObj(project)) throw new Error('Invalid project file: project must be an object.');
  while (version < current) {
    const step = steps.find((s) => s.from === version);
    if (!step) throw new Error(`Invalid project file: this app cannot read version ${version} (no step takes it to version ${version + 1}).`);
    project = step.run(project as Obj, notes);
    notes.push(`The file was of version ${version}: ${step.label}`);
    version += 1;
  }
  return project as Obj;
}

interface ShapeStep {
  id: string;
  /** What was different, and where the old files come from. */
  label: string;
  run: (project: Obj, notes: string[]) => void;
}

/** The shape steps that work on the file's own text, before it is read. */
export const SHAPE_STEPS: readonly ShapeStep[] = [
  {
    id: 'rows-generated',
    label: 'A table without a rows list (files written by hand or by a program) gets empty row titles, one row for each of its values.',
    run: (project) => {
      for (const t of Array.isArray(project.dataTables) ? project.dataTables : []) {
        if (isObj(t) && t.rows === undefined && typeof t.rowCount === 'number' && Number.isInteger(t.rowCount) && t.rowCount >= 0 && t.rowCount <= MAX_TABLE_ROWS) t.rows = createRows(t.rowCount);
      }
    },
  },
  {
    id: 'one-layer',
    label: 'A graph was once a stack of layers; it has one now (see dataLayer in model/graph/style.ts). The first layer is read, the others are dropped.',
    run: (project, notes) => {
      (Array.isArray(project.charts) ? project.charts : []).forEach((c, ci) => {
        if (!isObj(c) || !Array.isArray(c.layers) || c.layers.length < 2) return;
        const more = c.layers.length - 1;
        notes.push(`project.charts[${ci}].layers: a graph has one layer in this version; the other ${more} ${more === 1 ? 'was' : 'were'} not read.`);
        c.layers = c.layers.slice(0, 1);
      });
    },
  },
];

/** The part of a read project the steps after reading need. */
type ReadProject = Pick<Project, 'dataTables' | 'charts'>;

/** The shape steps that need the file read first. */
const READ_STEPS: ReadonlyArray<{ id: string; label: string; run: (project: ReadProject, notes: string[]) => void }> = [
  {
    id: 'group-gaps-folded',
    label: 'Each data set once had a space of its own before it (groupGaps); it is now the single setting Space between columns.',
    run: (project, notes) => {
      for (const [ci, c] of project.charts.entries()) {
        const holder = c as unknown as Record<string, unknown>;
        const legacy = holder.groupGaps;
        delete holder.groupGaps;
        const table = project.dataTables.find((t) => t.id === c.dataTableId);
        if (!table || legacy === undefined) continue;
        const folded = foldGroupGaps(legacy, applyOrder(table.groups, c.groupOrder).map((g) => g.id), c.bars);
        c.bars = folded.bars;
        if (folded.note) notes.push(`project.charts[${ci}] ("${c.name}"): ${folded.note}`);
      }
    },
  },
];

export function migrateShape(project: Obj, notes: string[]): void {
  for (const step of SHAPE_STEPS) step.run(project, notes);
}

export function migrateRead(project: ReadProject, notes: string[]): void {
  for (const step of READ_STEPS) step.run(project, notes);
}
