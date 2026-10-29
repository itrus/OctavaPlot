import type { Annotation, Chart, ChartLayer, ChartStyle, Group, Id, Selection } from '../../types';
import { resolveStyle } from '../style';

/** A point of a chart: the data set it is in and the ID of its observation. */
export interface PointRef {
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
export type AnnotationSharedKey = 'fontSizePt' | 'color' | 'opacity';
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
