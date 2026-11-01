import { canonicalObservationId, canonicalRowId } from '../../model/table/rows';
import type { DataTable, Project } from '../../model/types';

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

function encodeTable(t: DataTable, referenced: ReadonlySet<string>, inline: InlineEntries): unknown {
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
      if (o.id !== canonicalObservationId(g.id, i) && (o.value !== null || referenced.has(o.id))) extras.id = o.id;
      if (o.subject !== undefined) extras.subject = o.subject;
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

/** The text of a project file. */
export function writeProject(project: Project, envelope: { format: string; version: number }): string {
  const { dataTables, ...rest } = project;
  const referenced = new Set<string>();
  collectTexts(rest, referenced);
  const inline = new InlineEntries();
  const encoded = dataTables.map((t) => encodeTable(t, referenced, inline));
  const text = JSON.stringify({ ...envelope, project: { ...project, dataTables: encoded } }, null, 2);
  return inline.restore(text);
}
