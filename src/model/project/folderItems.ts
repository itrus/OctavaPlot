import type { FolderKey, Id, Project } from '../types';

/** What each folder of the navigator is called, and what one of its items is. */
export const FOLDER_TITLE: Record<FolderKey, string> = { tables: 'Data Tables', results: 'Results', graphs: 'Graphs', layouts: 'Layouts' };
export const FOLDER_NOUN: Record<FolderKey, { one: string; many: string }> = {
  tables: { one: 'table', many: 'tables' },
  results: { one: 'result', many: 'results' },
  graphs: { one: 'graph', many: 'graphs' },
  layouts: { one: 'layout', many: 'layouts' },
};

/** The items of a folder in the order of the navigator. */
export function folderItems(p: Project, folder: FolderKey): Array<{ id: Id; name: string }> {
  switch (folder) {
    case 'tables':
      return p.dataTables;
    case 'results':
      return p.analyses ?? [];
    case 'graphs':
      return p.charts;
    case 'layouts':
      return p.layouts ?? [];
  }
}

/**
 * The list with the items `moving` taken out and put together, in the order they had, before the item `before`; at the end when
 * `before` is null. `before` is never one of the moved items (dropping an item on itself changes nothing).
 */
export function reorder<T extends { id: Id }>(list: readonly T[], moving: Iterable<Id>, before: Id | null): T[] {
  const ids = new Set(moving);
  const moved = list.filter((x) => ids.has(x.id));
  if (moved.length === 0 || (before !== null && ids.has(before))) return [...list];
  const rest = list.filter((x) => !ids.has(x.id));
  const at = before === null ? rest.length : rest.findIndex((x) => x.id === before);
  if (at < 0) return [...list];
  return [...rest.slice(0, at), ...moved, ...rest.slice(at)];
}

/** The list one place earlier (-1) or later (+1) for the items `moving`, each block of neighbours moving as one. */
export function nudge<T extends { id: Id }>(list: readonly T[], moving: Iterable<Id>, step: 1 | -1): T[] {
  const ids = new Set(moving);
  const out = [...list];
  if (step === -1) {
    for (let i = 1; i < out.length; i++) if (ids.has(out[i].id) && !ids.has(out[i - 1].id)) [out[i - 1], out[i]] = [out[i], out[i - 1]];
  } else {
    for (let i = out.length - 2; i >= 0; i--) if (ids.has(out[i].id) && !ids.has(out[i + 1].id)) [out[i + 1], out[i]] = [out[i], out[i + 1]];
  }
  return out;
}

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

/** The list by name, A to Z, numbers as numbers ("Graph 2" before "Graph 10"); items with the same name keep their order. */
export function sortedByName<T extends { id: Id; name: string }>(list: readonly T[]): T[] {
  return list
    .map((x, i) => ({ x, i }))
    .sort((a, b) => collator.compare(a.x.name, b.x.name) || a.i - b.i)
    .map(({ x }) => x);
}
