import type { Selection } from '../model/types';
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
  if (marks.length === 0 || sel.kind === 'annotation') return null;
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

/** What a screen reader is told about the selection. */
export function describeSelection(marks: readonly StepGroup[], sel: Selection, annotationText?: string): string {
  if (sel.kind === 'annotation') return `Text annotation${annotationText ? ` "${annotationText}"` : ''}`;
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
export function nextFocus(marks: readonly StepGroup[], stops: readonly ChromeStop[], focus: Focus, key: string): Focus | null {
  const chart: Selection = { kind: 'chart' };
  if (focus.stop !== null) {
    const i = stops.indexOf(focus.stop);
    switch (key) {
      case 'Escape':
        return { selection: chart, stop: null };
      case 'ArrowRight':
      case 'ArrowDown':
        return i >= 0 && i < stops.length - 1 ? { selection: chart, stop: stops[i + 1] } : null;
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
  if (stops.length > 0 && atEnd && (key === 'ArrowRight' || (key === 'ArrowDown' && focus.selection.kind !== 'point'))) return { selection: chart, stop: stops[0] };
  return null;
}

/** What a screen reader is told about the place of the keyboard. */
export function describeFocus(marks: readonly StepGroup[], focus: Focus, annotationText?: string): string {
  return focus.stop === null ? describeSelection(marks, focus.selection, annotationText) : `${STOP_NAME[focus.stop]}. Press Enter to open its settings.`;
}
