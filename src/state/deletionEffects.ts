import type { FolderKey, Id, Project } from '../model/types';
import { removeItems } from './commands';

/** What a deletion takes with the items asked for: the graphs and results that used a deleted table, and the layouts left with no graph. */
export interface DeletionEffects {
  charts: Array<{ id: Id; name: string }>;
  analyses: Array<{ id: Id; name: string }>;
  layouts: Array<{ id: Id; name: string }>;
}

/** Whether the deletion takes nothing but what was asked for. */
export const noEffects = (e: DeletionEffects): boolean => e.charts.length === 0 && e.analyses.length === 0 && e.layouts.length === 0;

/**
 * What deleting these items of a folder would also delete, found by making the deletion on a copy: the very command that is run afterwards,
 * so the notice says exactly what happens. A layout is also deleted when it is left with no graph at all (it had one before).
 */
export function deletionEffects(p: Project, folder: FolderKey, ids: ReadonlyArray<Id>): DeletionEffects {
  const after = removeItems(folder, ids)(p);
  const asked = new Set(ids);
  const gone = <T extends { id: Id; name: string }>(before: readonly T[], now: readonly T[], own: boolean): Array<{ id: Id; name: string }> => {
    const kept = new Set(now.map((x) => x.id));
    return before.filter((x) => !kept.has(x.id) && !(own && asked.has(x.id))).map((x) => ({ id: x.id, name: x.name }));
  };
  return {
    charts: gone(p.charts, after.charts, folder === 'graphs'),
    analyses: gone(p.analyses ?? [], after.analyses ?? [], folder === 'results'),
    layouts: gone(p.layouts ?? [], after.layouts ?? [], folder === 'layouts'),
  };
}
