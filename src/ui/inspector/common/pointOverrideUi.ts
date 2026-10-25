import type { ChartStyle, ChartType, DataTable, Id, PointLabelPlacement, Selection } from '../../../model/types';
import { LABEL_OFFSET_LIMITS, type Box, type PlacementCode, type PointLabelModel } from '../../../chart/shared/parts/labels';
import { LABEL_STYLE_KEYS } from '../../../model/graph/style';
import { describePointLabelUi, placementPatch, type PointLabelUi } from './pointLabelUi';

/** What the Inspector edits for the current selection, and the selection to fall back to when it is stale. */
interface PointSelectionState {
  /** 'all' (Global) or the data set the controls edit. */
  scope: 'all' | Id;
  groupId: Id | null;
  /** The selected observation; null unless a valid point is selected. */
  pointId: Id | null;
  /** Row of the selected point, -1 when none. */
  row: number;
  /** Raw row title (may be empty), '' when none. */
  rowTitle: string;
  /** Set when the stored selection points at something that no longer exists. */
  fallback: Selection | null;
}

/**
 * Selection scope: a point or data set selection edits its data set, anything else edits all of them.
 * A point whose data set is gone falls back to the chart; a point whose observation is gone, or which
 * the chart type does not draw (mean charts draw markers, not observations), falls back to its data set.
 */
export function pointSelectionState(table: DataTable, selection: Selection, type: ChartType): PointSelectionState {
  const none: PointSelectionState = { scope: 'all', groupId: null, pointId: null, row: -1, rowTitle: '', fallback: null };
  if (selection.kind !== 'group' && selection.kind !== 'point') return none;
  const group = table.groups.find((g) => g.id === selection.groupId);
  if (!group) return selection.kind === 'point' ? { ...none, fallback: { kind: 'chart' } } : none;
  const inGroup = { ...none, scope: group.id, groupId: group.id };
  if (selection.kind === 'group') return inGroup;
  const row = type === 'mean' ? -1 : group.observations.findIndex((o) => o.id === selection.pointId);
  if (row < 0) return { ...inGroup, fallback: { kind: 'group', groupId: group.id } };
  return { ...inGroup, pointId: selection.pointId, row, rowTitle: table.rows[row]?.title ?? '' };
}

type PointLabelMode = 'inherit' | 'show' | 'hide';

export const LABEL_MODE_OPTIONS: Array<{ value: PointLabelMode; label: string }> = [
  { value: 'inherit', label: 'Inherit' },
  { value: 'show', label: 'Show' },
  { value: 'hide', label: 'Hide' },
];

export const MEAN_POINT_REASON = 'Mean markers are labelled per data set, not per point.';
export const MISSING_ROW_REASON = 'This point is no longer in the data table.';
export const NO_TITLE_NOTE = 'This row has no title, so this label is not drawn.';

interface PointOverrideCtx {
  type: ChartType;
  /** The point's own overrides (object level only); decides Inherit and the override dots. */
  overrides: Partial<ChartStyle>;
  /** Row title; null when the row is missing. */
  rowTitle: string | null;
}

interface PointOverrideUi extends Omit<PointLabelUi, 'placements'> {
  /** The point can carry label overrides at all. */
  available: boolean;
  reason: string | null;
  mode: PointLabelMode;
  /** Labels are on for this point once inheritance is resolved. */
  labelled: boolean;
  /** The row has no title although the title is the source, so nothing is drawn. */
  noTitle: boolean;
  placements: Array<{ value: PointLabelPlacement; label: string; disabled: boolean }>;
}

/** Controls state for one selected point; style is the point's resolved style. Tolerates hand-edited values. */
export function describePointOverrideUi(style: ChartStyle, ctx: PointOverrideCtx): PointOverrideUi {
  const base = describePointLabelUi(ctx.type, style);
  const rowMissing = ctx.rowTitle === null;
  let reason: string | null = null;
  if (ctx.type === 'mean') reason = MEAN_POINT_REASON;
  else if (rowMissing) reason = MISSING_ROW_REASON;
  else if (!base.checkboxEnabled) reason = base.checkboxReason;
  const available = reason === null;
  const shown = ctx.overrides.showPointLabels;
  const labelled = available && style.showPointLabels === true;
  const optionsEnabled = labelled;
  const noTitle = labelled && base.source === 'rowTitle' && (ctx.rowTitle ?? '').trim() === '';
  return {
    ...base,
    checkboxEnabled: available,
    checkboxReason: reason,
    optionsEnabled,
    available,
    reason,
    mode: shown === true ? 'show' : shown === false ? 'hide' : 'inherit',
    labelled,
    noTitle,
    showIdentifierNote: false,
    // Custom is allowed here: it is the per-point placement.
    placements: base.placements.map((o) => ({ ...o, disabled: false })),
    placementReason: null,
    offsets: { enabled: optionsEnabled && base.placement !== 'centre', note: base.offsets.note },
  };
}

/** Label Inherit / Show / Hide: show and hide store a value, inherit removes the key. */
export function labelModeAction(mode: string): { set?: Partial<ChartStyle>; clear?: Array<keyof ChartStyle> } | null {
  if (mode === 'show') return { set: { showPointLabels: true } };
  if (mode === 'hide') return { set: { showPointLabels: false } };
  if (mode === 'inherit') return { clear: ['showPointLabels'] };
  return null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;
const clampOffset = (v: number) => Math.min(LABEL_OFFSET_LIMITS.max, Math.max(LABEL_OFFSET_LIMITS.min, round1(v)));

/**
 * Offsets that keep a label where it is drawn now when it becomes Custom: the signed distance from the
 * point to the label's top-left corner (spec 7.1 is silent; P). Without a drawn label the named
 * placement's offsets are used as an approximation (the label above the point).
 */
export function seedCustomOffsets(
  style: Pick<ChartStyle, 'pointLabelOffsetXPt' | 'pointLabelOffsetYPt' | 'pointLabelFontSizePt'>,
  point: { cx: number; cy: number } | null,
  box: Box | null,
): Partial<ChartStyle> {
  if (point && box && [point.cx, point.cy, box.x0, box.y0].every(Number.isFinite)) {
    return { pointLabelOffsetXPt: clampOffset(box.x0 - point.cx), pointLabelOffsetYPt: clampOffset(box.y0 - point.cy) };
  }
  const x = Number.isFinite(style.pointLabelOffsetXPt) ? style.pointLabelOffsetXPt : 0;
  const y = Number.isFinite(style.pointLabelOffsetYPt) ? style.pointLabelOffsetYPt : 0;
  const size = Number.isFinite(style.pointLabelFontSizePt) ? style.pointLabelFontSizePt : 11.2;
  return { pointLabelOffsetXPt: clampOffset(x), pointLabelOffsetYPt: clampOffset(-(Math.max(0, y) + size)) };
}

/**
 * Placement choice for one point. Custom stores seeded offsets; leaving Custom drops the signed offsets so
 * the named placement does not inherit them. Null for an unknown value.
 */
export function pointPlacementAction(
  value: string,
  current: PointLabelPlacement,
  seed: Partial<ChartStyle>,
): { set: Partial<ChartStyle>; clear?: Array<keyof ChartStyle> } | null {
  if (value === 'custom') return { set: current === 'custom' ? { pointLabelPlacement: 'custom' } : { pointLabelPlacement: 'custom', ...seed } };
  const patch = placementPatch(value);
  if (!patch) return null;
  return current === 'custom' ? { set: patch, clear: ['pointLabelOffsetXPt', 'pointLabelOffsetYPt'] } : { set: patch };
}

/** Keep this label: draw it even where it overlaps another label. */
export const KEEP_LABEL_PATCH: Partial<ChartStyle> = { pointLabelCollision: 'keep' };

export const POINT_LABEL_KEYS = LABEL_STYLE_KEYS;

const CODE_TEXT: Record<PlacementCode, string> = {
  placed: 'Label drawn.',
  'flipped-h': 'Label drawn, flipped to stay inside the plot.',
  'flipped-v': 'Label drawn, flipped to stay inside the plot.',
  'flipped-hv': 'Label drawn, flipped to stay inside the plot.',
  clamped: 'Label drawn, moved to stay inside the plot.',
  moved: 'Label drawn, moved to avoid overlap.',
};

interface PointStatus {
  text: string;
  /** The label was hidden because it overlaps another one, so Keep this label applies. */
  canKeep: boolean;
}

/** One status line for the selected point, from the label model of the whole graph. */
export function pointStatus(ui: Pick<PointOverrideUi, 'available' | 'reason' | 'labelled' | 'noTitle'>, labels: PointLabelModel, pointId: Id): PointStatus {
  if (!ui.available) return { text: ui.reason ?? '', canKeep: false };
  const item = labels.items.find((it) => it.id === pointId);
  if (item) return { text: CODE_TEXT[item.code] ?? 'Label drawn.', canKeep: false };
  const hidden = labels.suppressed.find((s) => s.id === pointId);
  if (hidden) {
    return hidden.reason === 'overlap'
      ? { text: 'Label hidden: it overlaps another label.', canKeep: true }
      : { text: 'Label hidden: it is too large for the plot area.', canKeep: false };
  }
  if (!ui.labelled) return { text: 'No label for this point.', canKeep: false };
  if (ui.noTitle) return { text: NO_TITLE_NOTE, canKeep: false };
  return { text: 'Label not drawn: the point lies outside the plot or the label limit was reached.', canKeep: false };
}
