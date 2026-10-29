import type { Chart, ChartLayer, ChartStyle, Group, Id, Selection, SummarySpec } from '../../types';
import { resolveStyle } from '../style';
import { resolveSummary } from '../summary';

/** Which data sets an edit of the style or the summary reaches: all of them, one, or several. */
export type StyleScope = 'all' | Id | readonly Id[];

/** The data sets a scope reaches, out of `allIds` (in their order). */
export function scopeGroupIds(scope: StyleScope, allIds: readonly Id[]): Id[] {
  if (scope === 'all') return [...allIds];
  const wanted = typeof scope === 'string' ? [scope] : scope;
  return allIds.filter((id) => wanted.includes(id));
}

/** The data sets a selection stands for: the data set (or the one of the point) that is selected, or the several. */
export function selectedGroupIds(selection: Selection): Id[] {
  switch (selection.kind) {
    case 'group':
    case 'point':
      return [selection.groupId];
    case 'groups':
      return [...selection.groupIds];
    case 'points':
      return [...new Set(selection.points.map((p) => p.groupId))];
    default:
      return [];
  }
}

/** The scope an inspector edits for a selection: all data sets for none, the one, or the several selected. */
export function scopeOfSelection(selection: Selection): StyleScope {
  const ids = selectedGroupIds(selection);
  return ids.length === 0 ? 'all' : ids.length === 1 ? ids[0] : ids;
}

/** The selection of these data sets: the whole chart for none, the data set for one, 'groups' for several. */
export function selectionOfGroups(ids: readonly Id[]): Selection {
  return ids.length === 0 ? { kind: 'chart' } : ids.length === 1 ? { kind: 'group', groupId: ids[0] } : { kind: 'groups', groupIds: [...ids] };
}

/**
 * A click with Ctrl, Cmd or Shift on a data set: it joins the selected data sets, or leaves them when it was one of them. The result
 * keeps the order of `order` (the data sets as they are drawn). A point stands for its data set.
 */
export function toggleGroupSelection(selection: Selection, groupId: Id, order: readonly Id[]): Selection {
  const now = selectedGroupIds(selection);
  const next = now.includes(groupId) ? now.filter((id) => id !== groupId) : [...now, groupId];
  return selectionOfGroups(order.filter((id) => next.includes(id)).concat(next.filter((id) => !order.includes(id))));
}

const same = (a: unknown, b: unknown): boolean => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);

/** The style settings whose value is not the same in every one of these data sets (as each is drawn: its own overrides over the graph's). */
export function mixedStyleKeys(chart: Chart, layer: ChartLayer, groups: ReadonlyArray<Pick<Group, 'id' | 'paletteIndex'>>): Set<keyof ChartStyle> {
  const mixed = new Set<keyof ChartStyle>();
  if (groups.length < 2) return mixed;
  const styles = groups.map((g) => resolveStyle(chart, layer, g));
  for (const key of Object.keys(styles[0]) as Array<keyof ChartStyle>) if (styles.some((s) => !same(s[key], styles[0][key]))) mixed.add(key);
  return mixed;
}

/** The summary settings whose value is not the same in every one of these data sets. */
export function mixedSummaryKeys(layer: ChartLayer, ids: readonly Id[]): Set<keyof SummarySpec> {
  const mixed = new Set<keyof SummarySpec>();
  if (ids.length < 2) return mixed;
  const specs = ids.map((id) => resolveSummary(layer, id));
  for (const key of Object.keys(specs[0]) as Array<keyof SummarySpec>) if (specs.some((s) => !same(s[key], specs[0][key]))) mixed.add(key);
  return mixed;
}
