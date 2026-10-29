import type { Selection } from '../model/types';
import { selectedGroupIds } from '../model/graph/selection/scope';
import type { AnyModel } from './anyModel';

/** A data set (or part of a pie) a key can select, with the points it holds that can be selected too, in drawing order. */
export interface StepGroup {
  groupId: string;
  label: string;
  points: Array<{ id: string; text: string }>;
}

const num = (v: number): string => String(Math.round(v * 1e6) / 1e6);

/**
 * What the keyboard can select on a chart, in order: the data sets, and the single points of each. The same choices a click
 * makes: mean markers are not selectable, and a heat map has nothing to step through.
 */
export function selectableMarks(any: AnyModel): StepGroup[] {
  switch (any.family) {
    case 'column':
      return any.model.groups.map((g) => ({ groupId: g.groupId, label: g.label, points: g.points.filter((p) => p.observationId !== null).map((p) => ({ id: p.id, text: `value ${num(p.value)}` })) }));
    case 'xy':
    case 'survival':
    case 'histogram':
      return any.model.series.map((s) => ({ groupId: s.groupId, label: s.label, points: s.points.map((p) => ({ id: p.id, text: `x ${num(p.x)}, y ${num(p.y)}` })) }));
    case 'grouped':
      return any.model.series.map((s) => ({ groupId: s.groupId, label: s.label, points: [] }));
    case 'pie':
      return any.model.parts.map((p) => ({ groupId: p.groupId, label: p.label, points: [] }));
    default:
      return [];
  }
}

const PAGE = 10;

const where = (marks: readonly StepGroup[], sel: Selection): { g: number; p: number } => {
  // Several points selected together: the keys go on from the last picked.
  if (sel.kind === 'points') {
    const last = sel.points[sel.points.length - 1];
    const g = marks.findIndex((m) => m.groupId === last.groupId);
    return g >= 0 ? { g, p: marks[g].points.findIndex((q) => q.id === last.pointId) } : { g: -1, p: -1 };
  }
  // Several data sets selected together: the keys go on from the last of them.
  if (sel.kind === 'groups') {
    const g = Math.max(...sel.groupIds.map((id) => marks.findIndex((m) => m.groupId === id)));
    return { g, p: -1 };
  }
  if (sel.kind === 'group' || sel.kind === 'point') {
    const g = marks.findIndex((m) => m.groupId === sel.groupId);
    if (g >= 0) return { g, p: sel.kind === 'point' ? marks[g].points.findIndex((q) => q.id === sel.pointId) : -1 };
  }
  return { g: -1, p: -1 };
};

const group = (marks: readonly StepGroup[], g: number): Selection => (g < 0 ? { kind: 'chart' } : { kind: 'group', groupId: marks[g].groupId });
const point = (marks: readonly StepGroup[], g: number, p: number): Selection => ({ kind: 'point', groupId: marks[g].groupId, pointId: marks[g].points[p].id });

/**
 * The selection a key leads to, or null when the key does nothing here. Left and Right go from data set to data set (Left from the
 * first returns to the whole chart); Down goes into the points of the data set and along them, Up back out; Home and End go to the first and last
 * (of the points when one is selected); Page Up and Down jump ten points; Escape returns to the whole chart.
 */
export function nextSelection(marks: readonly StepGroup[], sel: Selection, key: string): Selection | null {
  if (key === 'Escape') return sel.kind === 'chart' ? null : { kind: 'chart' };
  if (marks.length === 0 || sel.kind === 'annotation' || sel.kind === 'annotations') return null;
  const { g, p } = where(marks, sel);
  const points = g >= 0 ? marks[g].points : [];
  switch (key) {
    case 'ArrowRight':
      return g >= marks.length - 1 ? null : group(marks, g + 1);
    case 'ArrowLeft':
      return g < 0 ? null : group(marks, g - 1);
    case 'ArrowDown':
      if (g < 0 || points.length === 0) return null;
      return p < 0 ? point(marks, g, 0) : p >= points.length - 1 ? null : point(marks, g, p + 1);
    case 'ArrowUp':
      return p < 0 ? null : p === 0 ? group(marks, g) : point(marks, g, p - 1);
    case 'PageDown':
      return p < 0 || p >= points.length - 1 ? null : point(marks, g, Math.min(points.length - 1, p + PAGE));
    case 'PageUp':
      return p <= 0 ? null : point(marks, g, Math.max(0, p - PAGE));
    case 'Home':
      return p >= 0 ? point(marks, g, 0) : group(marks, 0);
    case 'End':
      return p >= 0 ? point(marks, g, points.length - 1) : group(marks, marks.length - 1);
    default:
      return null;
  }
}

/**
 * Shift with Left or Right: the selection grows by the data set next to it (after the last selected one for Right, before the first for Left).
 * A single data set, or the whole chart, becomes the start of the selection. Null at the end of the chart, or for another key.
 */
export function extendGroups(marks: readonly StepGroup[], sel: Selection, key: string): Selection | null {
  if (key !== 'ArrowRight' && key !== 'ArrowLeft') return null;
  if (marks.length === 0 || sel.kind === 'annotation' || sel.kind === 'annotations') return null;
  const chosen = selectedGroupIds(sel).map((id) => marks.findIndex((m) => m.groupId === id)).filter((i) => i >= 0);
  const at = chosen.length === 0 ? (key === 'ArrowRight' ? 0 : marks.length - 1) : key === 'ArrowRight' ? Math.max(...chosen) + 1 : Math.min(...chosen) - 1;
  if (at < 0 || at >= marks.length) return null;
  const all = [...new Set([...chosen, at])].sort((a, b) => a - b).map((i) => marks[i].groupId);
  return all.length === 1 ? { kind: 'group', groupId: all[0] } : { kind: 'groups', groupIds: all };
}

/**
 * Shift with Down or Up on a selected point: the selection grows by the point next to the picked ones, in the data set of the last picked
 * (after the last of them for Down, before the first for Up). Null at the ends, for a data set, or for another key.
 */
export function extendPoints(marks: readonly StepGroup[], sel: Selection, key: string): Selection | null {
  if ((key !== 'ArrowDown' && key !== 'ArrowUp') || (sel.kind !== 'point' && sel.kind !== 'points')) return null;
  const { g } = where(marks, sel);
  if (g < 0) return null;
  const refs = sel.kind === 'point' ? [{ groupId: sel.groupId, pointId: sel.pointId }] : sel.points;
  const have = refs.filter((r) => r.groupId === marks[g].groupId).map((r) => marks[g].points.findIndex((q) => q.id === r.pointId)).filter((i) => i >= 0);
  if (have.length === 0) return null;
  const at = key === 'ArrowDown' ? Math.max(...have) + 1 : Math.min(...have) - 1;
  if (at < 0 || at >= marks[g].points.length) return null;
  const added = { groupId: marks[g].groupId, pointId: marks[g].points[at].id };
  return { kind: 'points', points: key === 'ArrowDown' ? [...refs, added] : [added, ...refs] };
}

/**
 * Shift with Page Down or Page Up on a selected annotation: the selection grows by the annotation next to it in the list (after the last
 * selected for Page Down, before the first for Page Up). Null at the ends, or for another key or selection.
 */
export function extendAnnotations(ids: readonly string[], sel: Selection, key: string): Selection | null {
  if ((key !== 'PageDown' && key !== 'PageUp') || (sel.kind !== 'annotation' && sel.kind !== 'annotations')) return null;
  const chosen = (sel.kind === 'annotation' ? [sel.annotationId] : sel.annotationIds).map((id) => ids.indexOf(id)).filter((i) => i >= 0);
  if (chosen.length === 0) return null;
  const at = key === 'PageDown' ? Math.max(...chosen) + 1 : Math.min(...chosen) - 1;
  if (at < 0 || at >= ids.length) return null;
  return { kind: 'annotations', annotationIds: [...new Set([...chosen, at])].sort((a, b) => a - b).map((i) => ids[i]) };
}

/** What a screen reader is told about the selection. `notes` are the annotations of the chart, in their order. */
export function describeSelection(marks: readonly StepGroup[], sel: Selection, annotationText?: string, notes?: ReadonlyArray<{ id: string; text: string }>): string {
  if (sel.kind === 'annotation') {
    const i = notes?.findIndex((n) => n.id === sel.annotationId) ?? -1;
    const text = annotationText ?? (notes && i >= 0 ? notes[i].text.split('\n')[0] : undefined);
    return `Text annotation${notes && i >= 0 ? ` ${i + 1} of ${notes.length}` : ''}${text ? ` "${text}"` : ''}`;
  }
  if (sel.kind === 'annotations') return `${sel.annotationIds.length} text annotations edited together`;
  if (sel.kind === 'points') {
    const one = new Set(sel.points.map((p) => p.groupId)).size === 1 ? marks.find((m) => m.groupId === sel.points[0].groupId)?.label : undefined;
    return `${one ? `${one}: ` : ''}${sel.points.length} points edited together`;
  }
  if (sel.kind === 'groups') {
    const names = sel.groupIds.map((id) => marks.find((m) => m.groupId === id)?.label ?? id);
    return `${names.join(', ')}: ${sel.groupIds.length} data sets edited together`;
  }
  const { g, p } = where(marks, sel);
  if (g < 0) return 'Whole chart';
  const m = marks[g];
  const set = `${m.label}, data set ${g + 1} of ${marks.length}`;
  return p < 0 ? `${set}, ${m.points.length} points` : `${m.label}, point ${p + 1} of ${m.points.length}: ${m.points[p].text}`;
}

/** Parts of a chart besides its data sets that the keyboard can stop at; each is the id of its element in the drawing. */
export type ChromeStop = 'chart-title' | 'legend' | 'x-axis' | 'y-axis';

/** The stops in the order the keys visit them (after the last data set). */
export const CHROME_STOPS: readonly ChromeStop[] = ['chart-title', 'legend', 'x-axis', 'y-axis'];

const STOP_NAME: Record<ChromeStop, string> = { 'chart-title': 'Chart title', legend: 'Legend', 'x-axis': 'X axis', 'y-axis': 'Y axis' };

/** Where the keyboard is: a selection (the chart, a data set, a point, an annotation) or a part of the chart besides its data sets. */
export interface Focus {
  selection: Selection;
  stop: ChromeStop | null;
}

/**
 * The next place of the keyboard, or null when the key does nothing. Over the data sets the keys are those of `nextSelection`;
 * Right (or Down) from the last data set goes on to the first of `stops` (the ones the chart has), and Left (or Up) from the
 * first stop back to the last data set; Right and Left, Home and End move along the stops; Escape leaves for the whole chart.
 */
export function nextFocus(marks: readonly StepGroup[], stops: readonly ChromeStop[], focus: Focus, key: string, annotationIds: readonly string[] = []): Focus | null {
  const chart: Selection = { kind: 'chart' };
  const note = (id: string): Focus => ({ selection: { kind: 'annotation', annotationId: id }, stop: null });
  // The annotations come last, after the stops. The arrows move a selected annotation (the chart handles that), so Page Down and Page Up step along them.
  if (focus.stop === null && (focus.selection.kind === 'annotation' || focus.selection.kind === 'annotations')) {
    const picked = focus.selection.kind === 'annotation' ? [focus.selection.annotationId] : focus.selection.annotationIds;
    const i = annotationIds.indexOf(picked[picked.length - 1]);
    if (key === 'Escape') return { selection: chart, stop: null };
    if (key === 'PageDown') return i >= 0 && i < annotationIds.length - 1 ? note(annotationIds[i + 1]) : null;
    if (key === 'PageUp') {
      if (i > 0) return note(annotationIds[i - 1]);
      if (stops.length > 0) return { selection: chart, stop: stops[stops.length - 1] };
      return { selection: marks.length > 0 ? group(marks, marks.length - 1) : chart, stop: null };
    }
    return null;
  }
  if (focus.stop !== null) {
    const i = stops.indexOf(focus.stop);
    switch (key) {
      case 'Escape':
        return { selection: chart, stop: null };
      case 'ArrowRight':
      case 'ArrowDown':
        if (i >= 0 && i < stops.length - 1) return { selection: chart, stop: stops[i + 1] };
        return i === stops.length - 1 && annotationIds.length > 0 ? note(annotationIds[0]) : null;
      case 'ArrowLeft':
      case 'ArrowUp':
        if (i > 0) return { selection: chart, stop: stops[i - 1] };
        return { selection: marks.length > 0 ? group(marks, marks.length - 1) : chart, stop: null };
      case 'Home':
        return stops.length > 0 ? { selection: chart, stop: stops[0] } : null;
      case 'End':
        return stops.length > 0 ? { selection: chart, stop: stops[stops.length - 1] } : null;
      default:
        return null;
    }
  }
  const next = nextSelection(marks, focus.selection, key);
  if (next) return { selection: next, stop: null };
  // Past the last data set (or on a chart with none) the stops follow.
  const { g } = where(marks, focus.selection);
  const atEnd = focus.selection.kind === 'chart' ? marks.length === 0 : g === marks.length - 1;
  const forward = key === 'ArrowRight' || (key === 'ArrowDown' && focus.selection.kind !== 'point' && focus.selection.kind !== 'points');
  if (atEnd && forward) {
    if (stops.length > 0) return { selection: chart, stop: stops[0] };
    if (annotationIds.length > 0) return note(annotationIds[0]);
  }
  return null;
}

/** What a screen reader is told about the place of the keyboard. */
export function describeFocus(marks: readonly StepGroup[], focus: Focus, annotationText?: string, notes?: ReadonlyArray<{ id: string; text: string }>): string {
  return focus.stop === null ? describeSelection(marks, focus.selection, annotationText, notes) : `${STOP_NAME[focus.stop]}. Press Enter to open its settings.`;
}
