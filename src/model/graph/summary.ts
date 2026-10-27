/**
 * Summary calculation settings (spec 9.1) kept on the layer, separate from
 * style: layer summary < data set (groupSummary). There is no object level.
 * Defaults and the layer/group split are P (spec 1.2 L57).
 */

import { DEFAULT_SUMMARY } from '../defaults';
import type { ChartLayer, Id, SummarySpec } from '../types';

export const SUMMARY_KEYS: ReadonlyArray<keyof SummarySpec> = [
  'centre',
  'spread',
  'confidenceLevel',
  'smallSamplePolicy',
  'invalidPolicy',
];

const CENTRES: readonly string[] = ['mean', 'geometricMean', 'median'];
const SPREADS: readonly string[] = ['none', 'sd', 'sem', 'ci', 'range', 'iqr', 'gsd'];
const SMALL_SAMPLE: readonly string[] = ['drawCentre', 'reject'];
const INVALID: readonly string[] = ['omit', 'rejectGroup'];

/** Confidence level C must satisfy 0 < C < 1 (spec 9.1). */
export const isValidConfidenceLevel = (v: unknown): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 && v < 1;

const VALID: { [K in keyof SummarySpec]: (v: unknown) => boolean } = {
  centre: (v) => typeof v === 'string' && CENTRES.includes(v),
  spread: (v) => typeof v === 'string' && SPREADS.includes(v),
  confidenceLevel: isValidConfidenceLevel,
  smallSamplePolicy: (v) => typeof v === 'string' && SMALL_SAMPLE.includes(v),
  invalidPolicy: (v) => typeof v === 'string' && INVALID.includes(v),
};

const has = (o: object, k: string): boolean => Object.prototype.hasOwnProperty.call(o, k);

/** Valid keys of an unknown value; invalid keys, unknown keys and undefined are dropped. */
export function sanitizeSummaryPatch(raw: unknown): Partial<SummarySpec> {
  const out: Record<string, unknown> = {};
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return out as Partial<SummarySpec>;
  const o = raw as Record<string, unknown>;
  for (const k of SUMMARY_KEYS) {
    if (has(o, k) && VALID[k](o[k])) out[k] = o[k];
  }
  return out as Partial<SummarySpec>;
}

/** Layer summary from an unknown value: every invalid or missing key falls back to the default. */
export const sanitizeSummary = (raw: unknown): SummarySpec => ({ ...DEFAULT_SUMMARY, ...sanitizeSummaryPatch(raw) });

/** True when every present key is known and valid. Explicit undefined counts as invalid; {} is valid. */
export function validateSummaryPatch(patch: unknown): boolean {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) return false;
  const o = patch as Record<string, unknown>;
  for (const k of Object.keys(o)) {
    if (!(SUMMARY_KEYS as readonly string[]).includes(k)) return false;
    if (!VALID[k as keyof SummarySpec](o[k])) return false;
  }
  return true;
}

/** Group over layer; an explicit undefined in the group entry is ignored. */
export function resolveSummary(layer: ChartLayer, groupId: Id): SummarySpec {
  const out: SummarySpec = { ...layer.summary };
  const g = has(layer.groupSummary, groupId) ? layer.groupSummary[groupId] : undefined;
  if (g) {
    for (const k of SUMMARY_KEYS) {
      if (has(g, k) && g[k] !== undefined) (out as unknown as Record<string, unknown>)[k] = g[k];
    }
  }
  return out;
}

export function isSummaryOverridden(layer: ChartLayer, groupId: Id, key: keyof SummarySpec): boolean {
  const g = has(layer.groupSummary, groupId) ? layer.groupSummary[groupId] : undefined;
  return g !== undefined && has(g, key) && g[key] !== undefined;
}

const definedKeys = (patch: Partial<SummarySpec>): Array<keyof SummarySpec> =>
  SUMMARY_KEYS.filter((k) => has(patch, k) && patch[k] !== undefined);

/** Set layer values and clear the group overrides of the patched keys. Same layer when nothing changes. */
export function patchAllSummary(layer: ChartLayer, patch: Partial<SummarySpec>): ChartLayer {
  const keys = definedKeys(patch);
  let changed = false;
  const summary: SummarySpec = { ...layer.summary };
  for (const k of keys) {
    if (summary[k] !== patch[k]) {
      (summary as unknown as Record<string, unknown>)[k] = patch[k];
      changed = true;
    }
  }
  const groupSummary: Record<Id, Partial<SummarySpec>> = {};
  for (const id of Object.keys(layer.groupSummary)) {
    const g = layer.groupSummary[id];
    if (!keys.some((k) => has(g, k))) {
      groupSummary[id] = g;
      continue;
    }
    changed = true;
    const copy = { ...g };
    for (const k of keys) delete copy[k];
    if (Object.keys(copy).length > 0) groupSummary[id] = copy;
  }
  return changed ? { ...layer, summary, groupSummary } : layer;
}

/** Set a data set override. Same layer when the stored override already has those values. */
export function patchGroupSummary(layer: ChartLayer, groupId: Id, patch: Partial<SummarySpec>): ChartLayer {
  const keys = definedKeys(patch);
  const current = has(layer.groupSummary, groupId) ? layer.groupSummary[groupId] : undefined;
  if (keys.every((k) => current !== undefined && has(current, k) && current[k] === patch[k])) return layer;
  const next: Partial<SummarySpec> = { ...current };
  for (const k of keys) (next as Record<string, unknown>)[k] = patch[k];
  return { ...layer, groupSummary: { ...layer.groupSummary, [groupId]: next } };
}

/** Remove keys from a data set's summary override, so the graph's value shows again; an emptied override is dropped. Same layer when none of them was set. */
export function clearGroupSummaryKeys(layer: ChartLayer, groupId: Id, keys: ReadonlyArray<keyof SummarySpec>): ChartLayer {
  const g = has(layer.groupSummary, groupId) ? layer.groupSummary[groupId] : undefined;
  if (!g || !keys.some((k) => has(g, k) && g[k] !== undefined)) return layer;
  const copy = { ...g };
  for (const k of keys) delete copy[k];
  const groupSummary = { ...layer.groupSummary };
  if (Object.keys(copy).length > 0) groupSummary[groupId] = copy;
  else delete groupSummary[groupId];
  return { ...layer, groupSummary };
}

/** Remove a data set's overrides. Same layer when it has none. */
export function clearGroupSummary(layer: ChartLayer, groupId: Id): ChartLayer {
  if (!has(layer.groupSummary, groupId)) return layer;
  const groupSummary = { ...layer.groupSummary };
  delete groupSummary[groupId];
  return { ...layer, groupSummary };
}
