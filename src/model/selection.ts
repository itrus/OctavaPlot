import type { FolderKey, Id, Annotation, Chart, ChartLayer, ChartStyle, Group, SummarySpec } from './types';
import { resolveStyle } from './graph/style';
import { resolveSummary } from './graph/summary';

/** Transient editor references; these are not part of the project document. */
export type Selection =
  | { kind: 'chart' }
  | { kind: 'group'; groupId: Id }
  /** Several data sets edited together (two or more; one is a 'group'). */
  | { kind: 'groups'; groupIds: Id[] }
  /** One raw observation's symbol (and its label); mean markers are not selectable. */
  | { kind: 'point'; groupId: Id; pointId: Id }
  /** Several points edited together (two or more; one is a 'point'), in the order they were picked; they may belong to different data sets. */
  | { kind: 'points'; points: Array<{ groupId: Id; pointId: Id }> }
  | { kind: 'annotation'; annotationId: Id }
  /** One reference line (its settings are on the Axes page). */
  | { kind: 'referenceLine'; lineId: Id }
  /** Several annotations edited together (two or more; one is an 'annotation'). */
  | { kind: 'annotations'; annotationIds: Id[] }
  /** One drawing object or several, edited together. */
  | { kind: 'drawings'; drawingIds: Id[] };

/** A page of the project, or the overview of a folder (all its pages as thumbnails). */
export type ViewRef = { kind: 'table'; id: Id } | { kind: 'chart'; id: Id } | { kind: 'analysis'; id: Id } | { kind: 'layout'; id: Id } | { kind: 'folder'; id: FolderKey };

/** A point of a chart: the data set it is in and the ID of its observation. */
interface PointRef {
  groupId: Id;
  pointId: Id;
}

/** The points a selection stands for: the point, or the several; none for anything else. */
export function selectedPoints(selection: Selection): PointRef[] {
  if (selection.kind === 'point') return [{ groupId: selection.groupId, pointId: selection.pointId }];
  return selection.kind === 'points' ? selection.points.map((p) => ({ ...p })) : [];
}

/** The selection of these points: the whole chart for none, the point for one, 'points' for several. */
export function selectionOfPoints(points: readonly PointRef[]): Selection {
  return points.length === 0 ? { kind: 'chart' } : points.length === 1 ? { kind: 'point', ...points[0] } : { kind: 'points', points: points.map((p) => ({ ...p })) };
}

/** A click with Ctrl, Cmd or Shift on a point: it joins the selected points, or leaves them when it was one of them. Anything else selected is left. */
export function togglePointSelection(selection: Selection, point: PointRef): Selection {
  const now = selectedPoints(selection);
  return selectionOfPoints(now.some((p) => p.pointId === point.pointId) ? now.filter((p) => p.pointId !== point.pointId) : [...now, point]);
}

/** The annotations a selection stands for: the annotation, or the several; none for anything else. */
export function selectedAnnotationIds(selection: Selection): Id[] {
  if (selection.kind === 'annotation') return [selection.annotationId];
  return selection.kind === 'annotations' ? [...selection.annotationIds] : [];
}

/** The selection of these annotations: the whole chart for none, the annotation for one, 'annotations' for several. */
export function selectionOfAnnotations(ids: readonly Id[]): Selection {
  return ids.length === 0 ? { kind: 'chart' } : ids.length === 1 ? { kind: 'annotation', annotationId: ids[0] } : { kind: 'annotations', annotationIds: [...ids] };
}

/** A click with Ctrl, Cmd or Shift on an annotation: it joins the selected annotations, or leaves them when it was one of them. The result keeps the order of `order` (the chart's list). */
export function toggleAnnotationSelection(selection: Selection, id: Id, order: readonly Id[]): Selection {
  const now = selectedAnnotationIds(selection);
  const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
  return selectionOfAnnotations(order.filter((x) => next.includes(x)).concat(next.filter((x) => !order.includes(x))));
}

const same = (a: unknown, b: unknown): boolean => Object.is(a, b) || JSON.stringify(a) === JSON.stringify(b);

/** The settings of an annotation that several can be edited in together (the text and the place are each its own). */
type AnnotationSharedKey = 'fontSizePt' | 'color' | 'opacity';
const SHARED: readonly AnnotationSharedKey[] = ['fontSizePt', 'color', 'opacity'];

/** The shared settings whose value is not the same in every one of these annotations. */
export function mixedAnnotationKeys(annotations: readonly Annotation[]): Set<AnnotationSharedKey> {
  const mixed = new Set<AnnotationSharedKey>();
  if (annotations.length < 2) return mixed;
  for (const key of SHARED) if (annotations.some((a) => !same(a[key], annotations[0][key]))) mixed.add(key);
  return mixed;
}

/** The style settings whose value is not the same in every one of these points (as each is drawn: its own overrides over its data set's and the graph's). */
export function mixedPointStyleKeys(chart: Chart, layer: ChartLayer, points: ReadonlyArray<{ group: Group; pointId: Id }>): Set<keyof ChartStyle> {
  const mixed = new Set<keyof ChartStyle>();
  if (points.length < 2) return mixed;
  const styles = points.map((p) => resolveStyle(chart, layer, p.group, p.pointId));
  for (const key of Object.keys(styles[0]) as Array<keyof ChartStyle>) if (styles.some((s) => !same(s[key], styles[0][key]))) mixed.add(key);
  return mixed;
}

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
