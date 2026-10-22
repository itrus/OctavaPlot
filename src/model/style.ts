import { BAR_PALETTE } from './defaults';
import { isSurvivalChartType, isXyChartType } from './chartTypes';
import { paletteById, paletteColor } from './palettes';
import type { Chart, ChartLayer, ChartStyle, Group, Id } from './types';

/**
 * Style hierarchy (highest priority first):
 *   object override > group override > layer override > chart defaults
 * The group's palette colour sits between chart defaults and layer overrides.
 */
export function resolveStyle(
  chart: Chart,
  layer: ChartLayer,
  group: Pick<Group, 'id' | 'paletteIndex'>,
  objectId?: Id,
): ChartStyle {
  // The chart's palette colours the data sets in order; with none (colours set by hand) the grey default applies.
  const chartPalette = paletteById(chart.paletteId);
  const palette: Partial<ChartStyle> = {
    barFill: chartPalette ? paletteColor(chartPalette, group.paletteIndex) : BAR_PALETTE[group.paletteIndex % BAR_PALETTE.length],
  };
  // On an XY chart the series colour is the colour of its symbols and its line.
  if ((isXyChartType(chart.type) || isSurvivalChartType(chart.type) || chart.type === 'groupedLine') && palette.barFill) {
    palette.symbolColor = palette.barFill;
    palette.symbolBorderColor = palette.barFill;
    palette.lineColor = palette.barFill;
    palette.errorColor = palette.barFill;
  }
  return {
    ...chart.defaults,
    ...palette,
    ...layer.style,
    ...layer.groupOverrides[group.id],
    ...(objectId ? layer.objectOverrides[objectId] : undefined),
  };
}

export function isGroupOverridden(layer: ChartLayer, groupId: Id, key: keyof ChartStyle): boolean {
  return layer.groupOverrides[groupId]?.[key] !== undefined;
}

/** Apply a patch to all groups: sets layer level and clears group/object overrides of those keys. */
export function patchAllGroups(layer: ChartLayer, patch: Partial<ChartStyle>): ChartLayer {
  const keys = Object.keys(patch) as Array<keyof ChartStyle>;
  const strip = (overrides: Record<Id, Partial<ChartStyle>>) => {
    const out: Record<Id, Partial<ChartStyle>> = {};
    for (const [id, o] of Object.entries(overrides)) {
      const copy = { ...o };
      for (const k of keys) delete copy[k];
      if (Object.keys(copy).length > 0) out[id] = copy;
    }
    return out;
  };
  return {
    ...layer,
    style: { ...layer.style, ...patch },
    groupOverrides: strip(layer.groupOverrides),
    objectOverrides: strip(layer.objectOverrides),
  };
}

export function patchGroup(layer: ChartLayer, groupId: Id, patch: Partial<ChartStyle>): ChartLayer {
  return {
    ...layer,
    groupOverrides: { ...layer.groupOverrides, [groupId]: { ...layer.groupOverrides[groupId], ...patch } },
  };
}

/** IDs of a group's style objects: its bar and its observations. */
export const groupObjectIds = (group: Group): Id[] => [`${group.id}:bar`, ...group.observations.map((o) => o.id)];

/** Remove a group's overrides and the object overrides of its bar and observations. */
export function resetGroupStyle(layer: ChartLayer, group: Group): ChartLayer {
  const groupOverrides = { ...layer.groupOverrides };
  delete groupOverrides[group.id];
  const objectOverrides = { ...layer.objectOverrides };
  for (const id of groupObjectIds(group)) delete objectOverrides[id];
  return { ...layer, groupOverrides, objectOverrides };
}

/** Set keys on one object's override; the same layer when every key already has that value. */
export function patchObject(layer: ChartLayer, objectId: Id, patch: Partial<ChartStyle>): ChartLayer {
  const current = layer.objectOverrides[objectId];
  const keys = (Object.keys(patch) as Array<keyof ChartStyle>).filter((k) => patch[k] !== undefined);
  if (keys.every((k) => current !== undefined && Object.is(current[k], patch[k]))) return layer;
  return { ...layer, objectOverrides: { ...layer.objectOverrides, [objectId]: { ...current, ...patch } } };
}

/** Remove keys from one object's override; an emptied override is dropped. The same layer when nothing was set. */
export function clearObjectKeys(layer: ChartLayer, objectId: Id, keys: ReadonlyArray<keyof ChartStyle>): ChartLayer {
  const current = layer.objectOverrides[objectId];
  if (!current || !keys.some((k) => current[k] !== undefined)) return layer;
  const copy = { ...current };
  for (const k of keys) delete copy[k];
  const objectOverrides = { ...layer.objectOverrides };
  if (Object.keys(copy).length > 0) objectOverrides[objectId] = copy;
  else delete objectOverrides[objectId];
  return { ...layer, objectOverrides };
}

export function isObjectOverridden(layer: ChartLayer, objectId: Id, key: keyof ChartStyle): boolean {
  return layer.objectOverrides[objectId]?.[key] !== undefined;
}

/** The 12 point-label keys, in ChartStyle order (spec 7.1 L479-485). */
export const LABEL_STYLE_KEYS = [
  'showPointLabels',
  'pointLabelSource',
  'pointLabelPlacement',
  'pointLabelOffsetXPt',
  'pointLabelOffsetYPt',
  'pointLabelCollision',
  'pointLabelLeader',
  'pointLabelFontSizePt',
  'pointLabelBold',
  'pointLabelItalic',
  'pointLabelColor',
  'pointLabelDecimals',
] as const satisfies ReadonlyArray<keyof ChartStyle>;
