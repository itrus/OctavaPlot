import { leadingColumns } from '../../model/graph/chartTypes';
import { MAX_TABLE_CELLS, MAX_TABLE_ROWS, canonicalObservationId, canonicalRowId, sanitizeRowTitle } from '../../model/table/rows';
import { MAX_REPLICATES, MIN_REPLICATES, seriesWidth, SUMMARY_FORMATS } from '../../model/table/tableLayout';
import type { DataRow, DataTable, Group, Observation, Project, ReplicateLayout, SummaryFormat, TableKind } from '../../model/types';
import { timeColumnOf, type TimeColumn } from '../../util/timeColumn';
import { arr, fail, isObj, num, obj, str } from './fileChecks';
/**
 * How a data table is written in a project file (docs/FILE_FORMAT.md, "Data tables"; reading is in serialize.ts). Only what
 * is there is stored: an empty cell is left out, and so is every ID that is the canonical one of its place (see
 * canonicalRowId in model/table/rows.ts), because reading makes it again. Any other ID is stored, so the marks of a graph,
 * its jitter and everything that refers to a row or a value keep their IDs through saving and opening.
 */

/** Every text in a value, keys included: an ID is referred to by a text, whatever key holds it. */
function collectTexts(value: unknown, into: Set<string>): void {
  if (typeof value === 'string') into.add(value);
  else if (Array.isArray(value)) for (const v of value) collectTexts(v, into);
  else if (typeof value === 'object' && value !== null) {
    for (const [k, v] of Object.entries(value)) {
      into.add(k);
      collectTexts(v, into);
    }
  }
}

/** Short entries are written on one line each; the pretty printer would put every number on its own line. */
class InlineEntries {
  private readonly mark = `@${Math.random().toString(36).slice(2, 12)}:`;
  private readonly list: string[] = [];

  put(entry: unknown[]): string {
    this.list.push(JSON.stringify(entry));
    return `${this.mark}${this.list.length - 1}`;
  }

  restore(text: string): string {
    const pattern = new RegExp(`"${this.mark}(\\d+)"`, 'g');
    return text.replace(pattern, (_m, i: string) => this.list[Number(i)]);
  }
}

/** The IDs an encoding asked the referenced set about, with the answers: the encoding is reused only while the answers stay the same. */
type Asked = Array<[string, boolean]>;

function encodeTable(t: DataTable, referenced: ReadonlySet<string>, inline: InlineEntries, asked: Asked): unknown {
  const rows: string[] = [];
  t.rows.forEach((r, i) => {
    const id = r.id === canonicalRowId(i) ? undefined : r.id;
    if (r.title === '' && id === undefined) return;
    rows.push(inline.put(id === undefined ? [i, r.title] : [i, r.title, id]));
  });
  const groups = t.groups.map((g) => {
    const observations: string[] = [];
    g.observations.forEach((o, i) => {
      const extras: Record<string, unknown> = {};
      // The ID of an empty cell matters only if something refers to it: no mark is drawn from it.
      if (o.id !== canonicalObservationId(g.id, i)) {
        if (o.value !== null) extras.id = o.id;
        else {
          const used = referenced.has(o.id);
          asked.push([o.id, used]);
          if (used) extras.id = o.id;
        }
      }
      if (o.excluded) {
        extras.excluded = true;
        if (o.excludedReason !== undefined) extras.excludedReason = o.excludedReason;
      }
      const bare = Object.keys(extras).length === 0;
      // A missing value with nothing to say about it is an empty cell: not written.
      if (o.value === null && bare) return;
      observations.push(inline.put(bare ? [i, o.value] : [i, o.value, extras]));
    });
    return { ...g, observations };
  });
  const { rows: _rows, groups: _groups, ...head } = t;
  return { ...head, ...(rows.length > 0 ? { rows } : {}), groups };
}

/** The text of each table as written, kept for as long as the table object is the same one: an autosave then encodes only what changed. */
const tableTexts = new WeakMap<DataTable, { text: string; asked: Asked }>();

/** The text of one table (indented as a top-level value), from the cache when the answers of the referenced set are the same. */
function tableText(t: DataTable, referenced: ReadonlySet<string>): string {
  const known = tableTexts.get(t);
  if (known && known.asked.every(([id, used]) => referenced.has(id) === used)) return known.text;
  const inline = new InlineEntries();
  const asked: Asked = [];
  const text = inline.restore(JSON.stringify(encodeTable(t, referenced, inline, asked), null, 2));
  tableTexts.set(t, { text, asked });
  return text;
}

/** The text of a project file. */
export function writeProject(project: Project, envelope: { format: string; version: number }): string {
  const { dataTables, ...rest } = project;
  const referenced = new Set<string>();
  collectTexts(rest, referenced);
  // Each table stands in the pretty printer as a placeholder text, replaced by its own text at the indent where the placeholder stands.
  const mark = `@table${Math.random().toString(36).slice(2, 12)}:`;
  const text = JSON.stringify({ ...envelope, project: { ...project, dataTables: dataTables.map((_, i) => `${mark}${i}`) } }, null, 2);
  const pattern = new RegExp(`^( *)"${mark}(\\d+)"`, 'gm');
  return text.replace(pattern, (_m, indent: string, i: string) => {
    const lines = tableText(dataTables[Number(i)], referenced).split('\n');
    return indent + lines.join(`\n${indent}`);
  });
}

// ---- Reading: the other direction (the rest of a table is read by serialize.ts). ----

/** A stored list holds only the cells that are not empty, each as `[index, ...]`, in ascending order of index. */
function storedEntries(raw: unknown, path: string, size: number, min: number, max: number): Array<{ index: number; entry: unknown[]; path: string }> {
  const out: Array<{ index: number; entry: unknown[]; path: string }> = [];
  let previous = -1;
  arr(raw, path).forEach((e, i) => {
    const ep = `${path}[${i}]`;
    const entry = arr(e, ep);
    if (entry.length < min || entry.length > max) fail(ep, `must have ${min} to ${max} entries`);
    const index = entry[0];
    if (typeof index !== 'number' || !Number.isInteger(index) || index < 0 || index >= size) fail(`${ep}[0]`, `must be a row index from 0 to ${size - 1}`);
    if (index <= previous) fail(`${ep}[0]`, 'must be larger than the index before it');
    previous = index;
    out.push({ index, entry, path: ep });
  });
  return out;
}

/**
 * Gives each place that the file did not name its canonical ID or, if an ID of the file has that one (a moved row or value
 * that was stored), that ID followed by as many plus signs as it takes to be free. An ID the file names twice is refused.
 */
function fillIds(named: Array<string | undefined>, canonical: (i: number) => string, path: string, taken: Set<string>): string[] {
  const out: string[] = [];
  named.forEach((id, i) => {
    if (id === undefined) return;
    if (taken.has(id)) fail(`${path}[${i}]`, `has the ID ${id}, which another one has too`);
    taken.add(id);
    out[i] = id;
  });
  named.forEach((id, i) => {
    if (id !== undefined) return;
    let made = canonical(i);
    while (taken.has(made)) made += '+';
    taken.add(made);
    out[i] = made;
  });
  return out;
}

/** Rows are stored as `[index, title]` or `[index, title, id]`: only those with a title or an ID that is not the canonical one of their place. */
function parseRows(raw: unknown, path: string, rowCount: number): DataRow[] {
  const named: Array<string | undefined> = Array.from({ length: rowCount }, () => undefined);
  const titles: string[] = Array.from({ length: rowCount }, () => '');
  if (raw !== undefined) {
    for (const { index, entry, path: ep } of storedEntries(raw, path, rowCount, 2, 3)) {
      if (typeof entry[1] !== 'string') fail(`${ep}[1]`, 'must be a string');
      if (entry.length === 3) {
        named[index] = str(entry[2], `${ep}[2]`);
        if (named[index] === '') fail(`${ep}[2]`, 'must not be empty');
      }
      titles[index] = sanitizeRowTitle(entry[1]);
    }
  }
  return fillIds(named, canonicalRowId, path, new Set()).map((id, i) => ({ id, title: titles[i] }));
}

/**
 * The values of a column: `[index, value]`, or `[index, value, {id, excluded, excludedReason}]` for a cell with
 * something to say besides its value. A cell that is not listed is empty: null, not excluded. A `subject` that older files
 * stored on a cell is ignored (subjects were removed). The ID of a cell
 * is stored unless it is the canonical one of its place.
 */
function parseObservations(raw: unknown, path: string, rowCount: number, groupId: string, taken: Set<string>): Observation[] {
  const named: Array<string | undefined> = Array.from({ length: rowCount }, () => undefined);
  const cells: Array<Omit<Observation, 'id'>> = Array.from({ length: rowCount }, () => ({ value: null }));
  for (const { index, entry, path: ep } of storedEntries(raw, path, rowCount, 2, 3)) {
    const value = entry[1] === null ? null : num(entry[1], `${ep}[1]`);
    const o = entry.length === 3 ? obj(entry[2], `${ep}[2]`) : {};
    if (o.id !== undefined) {
      named[index] = str(o.id, `${ep}[2].id`);
      if (named[index] === '') fail(`${ep}[2].id`, 'must not be empty');
    }
    // An excluded value is kept, with its reason, but not used (model/table/exclusion.ts).
    cells[index] = { value, ...(o.excluded === true ? { excluded: true as const, ...(typeof o.excludedReason === 'string' && o.excludedReason !== '' ? { excludedReason: o.excludedReason } : {}) } : {}) };
  }
  return fillIds(named, (i) => canonicalObservationId(groupId, i), path, taken).map((id, i) => ({ id, ...cells[i] }));
}

/**
 * A stored layout. Absent or {"kind":"single"} means a single Y value. Anything else that is not a valid replicate or
 * summary layout is refused: reading it as single values would change what the columns mean.
 */
function parseLayout(raw: unknown, path: string): ReplicateLayout | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isObj(raw)) fail(path, 'must be an object');
  if (raw.kind === 'single') return undefined;
  if (raw.kind === 'replicates') {
    if (typeof raw.n === 'number' && Number.isInteger(raw.n) && raw.n >= MIN_REPLICATES && raw.n <= MAX_REPLICATES) return { kind: 'replicates', n: raw.n };
    fail(`${path}.n`, `must be a whole number from ${MIN_REPLICATES} to ${MAX_REPLICATES}`);
  }
  if (raw.kind === 'sized') return { kind: 'sized' };
  if (raw.kind === 'xerror') return { kind: 'xerror' };
  if (raw.kind === 'summary') {
    if (SUMMARY_FORMATS.some((f) => f.id === raw.format)) return { kind: 'summary', format: raw.format as SummaryFormat };
    fail(`${path}.format`, `must be one of ${SUMMARY_FORMATS.map((f) => f.id).join(', ')}`);
  }
  fail(`${path}.kind`, 'must be single, replicates, summary, sized or xerror');
}

/** The type of a column, `{"kind":"date","unit":"d"}`; a kind or unit that is not one, or a unit that does not belong to the kind, refuses the file. */
function parseTime(raw: unknown, path: string): TimeColumn {
  const col = timeColumnOf(raw);
  if (!col) fail(path, 'must be {"kind": date, "unit": d}, {"kind": datetime, "unit": s} or {"kind": duration, "unit": s, min, h or d}');
  return col;
}

const TABLE_KINDS: readonly TableKind[] = ['column', 'xy', 'grouped', 'contingency', 'survival'];

export function parseTable(raw: unknown, path: string): DataTable {
  const t = obj(raw, path);
  const rowCount = num(t.rowCount, `${path}.rowCount`);
  if (!Number.isInteger(rowCount) || rowCount < 0) fail(`${path}.rowCount`, 'must be a non-negative integer');
  // Declared sizes are checked before anything is allocated for them.
  if (rowCount > MAX_TABLE_ROWS) fail(`${path}.rowCount`, `is ${rowCount.toLocaleString('en-US')}; a table holds at most ${MAX_TABLE_ROWS.toLocaleString('en-US')} rows`);
  const columns = arr(t.groups, `${path}.groups`).length;
  if (rowCount * columns > MAX_TABLE_CELLS) fail(path, `declares ${rowCount.toLocaleString('en-US')} rows in ${columns} columns; a table holds at most ${MAX_TABLE_CELLS.toLocaleString('en-US')} cells`);
  const ids = new Set<string>();
  const obsIds = new Set<string>();
  const groups: Group[] = arr(t.groups, `${path}.groups`).map((rg, gi) => {
    const gp = `${path}.groups[${gi}]`;
    const g = obj(rg, gp);
    const id = str(g.id, `${gp}.id`);
    if (ids.has(id)) fail(`${gp}.id`, 'is duplicated');
    ids.add(id);
    const observations = parseObservations(g.observations, `${gp}.observations`, rowCount, id, obsIds);
    return {
      id,
      name: str(g.name, `${gp}.name`),
      title: typeof g.title === 'string' ? g.title : '',
      paletteIndex: Number.isInteger(g.paletteIndex) && (g.paletteIndex as number) >= 0 ? (g.paletteIndex as number) : gi,
      ...(Number.isInteger(g.slot) && (g.slot as number) >= 0 ? { slot: g.slot as number } : {}),
      ...(typeof g.factor === 'string' && g.factor.trim() !== '' ? { factor: g.factor.trim() } : {}),
      ...(g.time !== undefined ? { time: parseTime(g.time, `${gp}.time`) } : {}),
      observations,
    };
  });
  const kind: TableKind = TABLE_KINDS.find((k) => k === t.kind) ?? 'column';
  const lead = leadingColumns(kind);
  if (groups.length < lead) fail(`${path}.groups`, `a ${kind} table needs its first column (${kind === 'survival' ? 'time' : 'X'})`);
  // A column type is read for the X column of an XY table only: what a date or a duration means anywhere else is not built, and reading it as plain numbers would change its meaning.
  groups.forEach((g, gi) => {
    if (g.time && !(kind === 'xy' && gi === 0)) fail(`${path}.groups[${gi}].time`, 'is only read for the X column of an XY table');
  });
  const layout = kind === 'xy' || kind === 'grouped' ? parseLayout(t.layout, `${path}.layout`) : undefined;
  if (layout && (groups.length - lead) % seriesWidth(layout) !== 0) fail(`${path}.groups`, `do not fit the table layout: the columns must come in blocks of ${seriesWidth(layout)}`);
  return { id: str(t.id, `${path}.id`), name: str(t.name, `${path}.name`), kind, ...(layout ? { layout } : {}), rowCount, rows: parseRows(t.rows, `${path}.rows`, rowCount), groups };
}
