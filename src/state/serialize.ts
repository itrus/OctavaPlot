import { createChart, DEFAULT_STYLE, DEFAULT_SURVIVAL, TYPE_PRESETS } from '../model/defaults';
import { LABEL_DECIMALS_LIMITS, LABEL_FONT_LIMITS, LABEL_OFFSET_LIMITS } from '../chart/labels';
import { CHART_TYPES, chartTypeInfo, defaultChartTypeFor } from '../model/chartTypes';
import { leadingColumns } from '../model/chartTypes';
import { MAX_REPLICATES, MIN_REPLICATES, seriesWidth, SUMMARY_FORMATS } from '../model/tableLayout';
import { sanitizeFillKeys } from '../model/fill';
import { sanitizeAxis } from '../model/axis';
import { sanitizeLook } from '../model/look';
import { sanitizeGaps, sanitizeOrder } from '../model/groupOrder';
import { createRows, sanitizeRowTitle } from '../model/rows';
import { sanitizeSummary, sanitizeSummaryPatch } from '../model/summary';
import type { Analysis, Chart, ChartLayer, ChartType, ReplicateLayout, SummaryFormat, SurvivalOptions, TableKind, DataRow, DataTable, Group, Id, Observation, Project, SpreadKind, SummarySpec } from '../model/types';

const FORMAT = 'octavaplot-project';
/** Files and autosave written before the project was renamed from "Scientific Plotter" still load. */
const LEGACY_FORMAT = 'scientific-plotter-project';
const VERSION = 2;
export const AUTOSAVE_KEY = 'octavaplot:project:v1';
const LEGACY_AUTOSAVE_KEY = 'scientific-plotter:project:v1';

export function stringifyProject(project: Project): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, project }, null, 2);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(path: string, what: string): never {
  throw new Error(`Invalid project file: ${path} ${what}.`);
}
const str = (v: unknown, path: string): string => (typeof v === 'string' ? v : fail(path, 'must be a string'));
const num = (v: unknown, path: string): number => (typeof v === 'number' && Number.isFinite(v) ? v : fail(path, 'must be a finite number'));
const arr = (v: unknown, path: string): unknown[] => (Array.isArray(v) ? v : fail(path, 'must be an array'));
const obj = (v: unknown, path: string): Obj => (isObj(v) ? v : fail(path, 'must be an object'));

/** Rows align with observations: missing (older files) are regenerated, a wrong count or bad IDs fail. */
function parseRows(raw: unknown, path: string, rowCount: number): DataRow[] {
  if (raw === undefined) return createRows(rowCount);
  const list = arr(raw, path);
  if (list.length !== rowCount) fail(path, `must have ${rowCount} entries`);
  const ids = new Set<string>();
  return list.map((rr, i) => {
    const r = obj(rr, `${path}[${i}]`);
    const id = str(r.id, `${path}[${i}].id`);
    if (id === '') fail(`${path}[${i}].id`, 'must not be empty');
    if (ids.has(id)) fail(`${path}[${i}].id`, 'is duplicated');
    ids.add(id);
    return { id, title: typeof r.title === 'string' ? sanitizeRowTitle(r.title) : '' };
  });
}

/** A stored layout; anything unrecognised means a single Y value. */
function parseLayout(raw: unknown): ReplicateLayout | undefined {
  if (!isObj(raw)) return undefined;
  if (raw.kind === 'replicates' && typeof raw.n === 'number' && Number.isInteger(raw.n) && raw.n >= MIN_REPLICATES && raw.n <= MAX_REPLICATES) return { kind: 'replicates', n: raw.n };
  if (raw.kind === 'summary' && SUMMARY_FORMATS.some((f) => f.id === raw.format)) return { kind: 'summary', format: raw.format as SummaryFormat };
  return undefined;
}

/** Stored survival options merged over the defaults; a level outside 0 to 1 or an unknown method falls back. */
function parseSurvival(raw: unknown): SurvivalOptions {
  const r = isObj(raw) ? raw : {};
  return {
    band: typeof r.band === 'boolean' ? r.band : DEFAULT_SURVIVAL.band,
    level: typeof r.level === 'number' && r.level > 0 && r.level < 1 ? r.level : DEFAULT_SURVIVAL.level,
    method: r.method === 'plain' || r.method === 'loglog' ? r.method : DEFAULT_SURVIVAL.method,
    atRisk: typeof r.atRisk === 'boolean' ? r.atRisk : DEFAULT_SURVIVAL.atRisk,
  };
}

const TABLE_KINDS: readonly TableKind[] = ['column', 'xy', 'grouped', 'contingency', 'survival'];

function parseTable(raw: unknown, path: string): DataTable {
  const t = obj(raw, path);
  const rowCount = num(t.rowCount, `${path}.rowCount`);
  if (!Number.isInteger(rowCount) || rowCount < 0) fail(`${path}.rowCount`, 'must be a non-negative integer');
  const ids = new Set<string>();
  const groups: Group[] = arr(t.groups, `${path}.groups`).map((rg, gi) => {
    const gp = `${path}.groups[${gi}]`;
    const g = obj(rg, gp);
    const id = str(g.id, `${gp}.id`);
    if (ids.has(id)) fail(`${gp}.id`, 'is duplicated');
    ids.add(id);
    const observations: Observation[] = arr(g.observations, `${gp}.observations`).map((ro, oi) => {
      const o = obj(ro, `${gp}.observations[${oi}]`);
      const value = o.value === null ? null : num(o.value, `${gp}.observations[${oi}].value`);
      return { id: str(o.id, `${gp}.observations[${oi}].id`), value };
    });
    if (observations.length !== rowCount) fail(`${gp}.observations`, `must have ${rowCount} entries`);
    return {
      id,
      name: str(g.name, `${gp}.name`),
      title: typeof g.title === 'string' ? g.title : '',
      paletteIndex: typeof g.paletteIndex === 'number' ? g.paletteIndex : gi,
      observations,
    };
  });
  const kind: TableKind = TABLE_KINDS.find((k) => k === t.kind) ?? 'column';
  const lead = leadingColumns(kind);
  if (groups.length < lead) fail(`${path}.groups`, `a ${kind} table needs its first column (${kind === 'survival' ? 'time' : 'X'})`);
  const layout = kind === 'xy' || kind === 'grouped' ? parseLayout(t.layout) : undefined;
  if (layout && (groups.length - lead) % seriesWidth(layout) !== 0) fail(`${path}.groups`, `do not fit the table layout: the columns must come in blocks of ${seriesWidth(layout)}`);
  return { id: str(t.id, `${path}.id`), name: str(t.name, `${path}.name`), kind, ...(layout ? { layout } : {}), rowCount, rows: parseRows(t.rows, `${path}.rows`, rowCount), groups };
}

/** Enum-valued style keys; an invalid stored value is dropped (the default applies) and noted. */
const STYLE_ENUMS: Record<string, readonly string[]> = {
  symbolShape: ['circle', 'square', 'triangle', 'diamond', 'plus', 'cross'],
  errorDirection: ['both', 'positive', 'negative'],
  errorCap: ['bar', 'none'],
  axisBinding: ['primary', 'secondary'],
  pointLabelSource: ['rowTitle', 'value'],
  pointLabelPlacement: ['above-right', 'above', 'below', 'left', 'right', 'centre', 'custom'],
  pointLabelCollision: ['keep', 'hide', 'repel'],
};

const LABEL_BOOLEANS = ['showPointLabels', 'pointLabelLeader', 'pointLabelBold', 'pointLabelItalic'] as const;
const LABEL_RANGES: Record<string, { min: number; max: number }> = {
  pointLabelFontSizePt: LABEL_FONT_LIMITS,
  pointLabelOffsetXPt: LABEL_OFFSET_LIMITS,
  pointLabelOffsetYPt: LABEL_OFFSET_LIMITS,
};

/** Label keys: wrong types are dropped (the default applies), out-of-range numbers are clamped. */
function cleanLabelKeys(out: Obj, path: string, notes: string[]): void {
  const reset = (key: string) => {
    delete out[key];
    notes.push(`${path}.${key} had an invalid value and was reset to the default.`);
  };
  const has = (key: string) => Object.prototype.hasOwnProperty.call(out, key);
  for (const key of LABEL_BOOLEANS) if (has(key) && typeof out[key] !== 'boolean') reset(key);
  for (const [key, r] of Object.entries(LABEL_RANGES)) {
    if (!has(key)) continue;
    const v = out[key];
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = Math.min(r.max, Math.max(r.min, v));
    else reset(key);
  }
  if (has('pointLabelColor') && out.pointLabelColor !== null) {
    const c = out.pointLabelColor;
    if (!(typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c))) reset('pointLabelColor');
  }
  if (has('pointLabelDecimals') && out.pointLabelDecimals !== null) {
    const d = out.pointLabelDecimals;
    if (typeof d === 'number' && Number.isFinite(d)) {
      out.pointLabelDecimals = Math.min(LABEL_DECIMALS_LIMITS.max, Math.max(LABEL_DECIMALS_LIMITS.min, Math.round(d)));
    } else reset('pointLabelDecimals');
  }
}

/** The one pipeline every raw defaults/style/override object passes through. */
function cleanStyle(raw: unknown, path: string, notes: string[]): Obj {
  const out: Obj = isObj(raw) ? { ...raw } : {};
  // Earlier builds stored the placeholder yAxis: 'primary' in styles; it is now axisBinding.
  delete out.yAxis;
  // errorType was replaced by summary.spread; parseLayer reads the legacy value from the raw objects.
  delete out.errorType;
  for (const [key, allowed] of Object.entries(STYLE_ENUMS)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) continue;
    const v = out[key];
    if (typeof v === 'string' && allowed.includes(v)) continue;
    delete out[key];
    notes.push(`${path}.${key} had an invalid value and was reset to the default.`);
  }
  cleanLabelKeys(out, path, notes);
  const { style, dropped } = sanitizeFillKeys(out);
  for (const key of dropped) notes.push(`${path}.${key} had an invalid value and was reset to the default.`);
  return style;
}

/** Override maps keyed by group or object ID; non-object entries and __proto__ are skipped. */
function cleanOverrideMap(raw: unknown, path: string, notes: string[]): Record<Id, Obj> {
  const out: Record<Id, Obj> = {};
  if (!isObj(raw)) return out;
  for (const key of Object.keys(raw)) {
    if (key === '__proto__' || !isObj(raw[key])) continue;
    const cleaned = cleanStyle(raw[key], `${path}.${key}`, notes);
    // An entry that held only the legacy errorType is dropped; any other empty entry is kept as stored.
    if (Object.keys(cleaned).length === 0 && Object.prototype.hasOwnProperty.call(raw[key], 'errorType')) continue;
    out[key] = cleaned;
  }
  return out;
}

const isLegacySpread = (v: unknown): v is SpreadKind => v === 'none' || v === 'sd' || v === 'sem';

function parseLayer(l: Obj, lp: string, rawDefaults: unknown, notes: string[]): ChartLayer {
  const style = cleanStyle(l.style, `${lp}.style`, notes);
  const groupOverrides = cleanOverrideMap(l.groupOverrides, `${lp}.groupOverrides`, notes);
  const objectOverrides = cleanOverrideMap(l.objectOverrides, `${lp}.objectOverrides`, notes);
  let summary: SummarySpec;
  const groupSummary: Record<Id, Partial<SummarySpec>> = {};
  if (isObj(l.summary)) {
    summary = sanitizeSummary(l.summary);
    if (Object.keys(sanitizeSummaryPatch(l.summary)).length < Object.keys(l.summary).length) {
      notes.push(`${lp}.summary had invalid entries that were reset to the defaults.`);
    }
    if (isObj(l.groupSummary)) {
      for (const gid of Object.keys(l.groupSummary)) {
        if (gid === '__proto__' || !isObj(l.groupSummary[gid])) continue;
        const patch = sanitizeSummaryPatch(l.groupSummary[gid]);
        if (Object.keys(patch).length < Object.keys(l.groupSummary[gid] as Obj).length) {
          notes.push(`${lp}.groupSummary.${gid} had invalid entries that were dropped.`);
        }
        if (Object.keys(patch).length > 0) groupSummary[gid] = patch;
      }
    }
  } else {
    summary = sanitizeSummary(undefined);
  }
  // Legacy errorType (version 1 files, and builds that still used it as the live source): layer style, then
  // chart defaults, sets the layer spread and wins over a stored summary; group overrides become data set
  // overrides and object overrides are dropped.
  const rawStyle = isObj(l.style) ? l.style : {};
  const rawDefs = isObj(rawDefaults) ? rawDefaults : {};
  const layerSpread = [rawStyle.errorType, rawDefs.errorType].find(isLegacySpread);
  if (layerSpread !== undefined) summary = { ...summary, spread: layerSpread };
  if (isObj(l.groupOverrides)) {
    for (const gid of Object.keys(l.groupOverrides)) {
      const o = l.groupOverrides[gid];
      if (gid === '__proto__' || !isObj(o) || !isLegacySpread(o.errorType)) continue;
      groupSummary[gid] = { ...groupSummary[gid], spread: o.errorType };
    }
  }
  return {
    id: str(l.id, `${lp}.id`),
    name: typeof l.name === 'string' ? l.name : 'Data',
    style,
    groupOverrides,
    objectOverrides,
    summary,
    groupSummary,
  } as ChartLayer;
}

function parseChart(raw: unknown, path: string, tableIds: Set<string>, notes: string[]): Chart {
  const c = obj(raw, path);
  const dataTableId = str(c.dataTableId, `${path}.dataTableId`);
  if (!tableIds.has(dataTableId)) fail(`${path}.dataTableId`, 'refers to a missing data table');
  if (typeof c.type !== 'string' || !CHART_TYPES.some((t) => t.type === c.type)) fail(`${path}.type`, `must be one of ${CHART_TYPES.map((t) => t.type).join(', ')}`);
  const base = createChart(dataTableId, undefined, c.type as ChartType);
  // Merge over defaults so files from earlier prototype versions keep working.
  const defaults = cleanStyle(c.defaults, `${path}.defaults`, notes);
  const layers = arr(c.layers, `${path}.layers`).map((rl, i) =>
    parseLayer(obj(rl, `${path}.layers[${i}]`), `${path}.layers[${i}]`, c.defaults, notes),
  );
  if (layers.length === 0) fail(`${path}.layers`, 'must contain at least one layer');
  // Files from before the switch to pixels stored millimetres (1 mm = 96 / 25.4 px).
  const { widthMm, heightMm, ...rest } = c;
  const mmToPx = (mm: unknown): number | undefined => (typeof mm === 'number' && mm > 0 ? Math.round((mm * 96) / 25.4) : undefined);
  const legendIn = isObj(c.legend) ? c.legend : {};
  const chart: Chart = {
    ...base,
    ...(rest as Partial<Chart>),
    widthPx: typeof c.widthPx === 'number' ? c.widthPx : (mmToPx(widthMm) ?? base.widthPx),
    heightPx: typeof c.heightPx === 'number' ? c.heightPx : (mmToPx(heightMm) ?? base.heightPx),
    groupOrder: sanitizeOrder(c.groupOrder),
    groupGaps: sanitizeGaps(c.groupGaps),
    hiddenGroupIds: Array.isArray(c.hiddenGroupIds) ? c.hiddenGroupIds.filter((id): id is string => typeof id === 'string') : [],
    survival: parseSurvival(c.survival),
    extraGroups: Array.isArray(c.extraGroups)
      ? c.extraGroups.flatMap((e) => (isObj(e) && typeof e.tableId === 'string' && typeof e.groupId === 'string' ? [{ tableId: e.tableId, groupId: e.groupId }] : []))
      : [],
    aspect: c.aspect === '4:3' || c.aspect === '1:1' ? c.aspect : 'free',
    paletteId: typeof c.paletteId === 'string' ? c.paletteId : null,
    ...sanitizeLook(c, base),
    xAxis: sanitizeAxis({ ...base.xAxis, ...(isObj(c.xAxis) ? c.xAxis : {}) }, base.xAxis),
    yAxis: sanitizeAxis({ ...base.yAxis, ...(isObj(c.yAxis) ? c.yAxis : {}) }, base.yAxis),
    y2Axis: sanitizeAxis({ ...base.y2Axis, ...(isObj(c.y2Axis) ? c.y2Axis : {}) }, base.y2Axis),
    legend: {
      ...base.legend,
      ...legendIn,
      keyShape: legendIn.keyShape === 'square' ? 'square' : 'rectangle',
      hiddenGroupIds: Array.isArray(legendIn.hiddenGroupIds) ? legendIn.hiddenGroupIds.filter((id): id is string => typeof id === 'string') : [],
    },
    jitter: { ...base.jitter, ...(isObj(c.jitter) ? c.jitter : {}) },
    defaults: { ...DEFAULT_STYLE, ...defaults },
    displayNames: isObj(c.displayNames) ? (c.displayNames as Record<string, string>) : {},
    annotations: Array.isArray(c.annotations) ? (c.annotations as Chart['annotations']) : [],
    layers,
  };
  if (!(chart.widthPx > 0) || !(chart.heightPx > 0)) fail(`${path}`, 'must have positive widthPx and heightPx');
  return chart;
}

/** Parses a project file; notes lists values that were sanitised on load. */
export function parseProjectWithNotes(text: string): { project: Project; notes: string[] } {
  const notes: string[] = [];
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error('Invalid project file: not valid JSON.');
  }
  const env = obj(json, 'file');
  if (env.format !== FORMAT && env.format !== LEGACY_FORMAT) fail('format', `must be "${FORMAT}"`);
  if (typeof env.version !== 'number' || env.version < 1 || env.version > VERSION) fail('version', `is not supported (this app reads up to ${VERSION})`);
  const p = obj(env.project, 'project');
  const dataTables = arr(p.dataTables, 'project.dataTables').map((t, i) => parseTable(t, `project.dataTables[${i}]`));
  const tableIds = new Set(dataTables.map((t) => t.id));
  const charts = arr(p.charts, 'project.charts').map((c, i) => parseChart(c, `project.charts[${i}]`, tableIds, notes));
  if (dataTables.length === 0) fail('project.dataTables', 'must contain at least one table');
  // Analyses refer to tables by ID: one whose table is gone, or that is not recognised, is dropped.
  const analyses: Analysis[] = (Array.isArray(p.analyses) ? p.analyses : []).flatMap((a): Analysis[] => {
    if (!isObj(a) || typeof a.id !== 'string' || a.kind !== 'descriptive' || typeof a.dataTableId !== 'string' || !tableIds.has(a.dataTableId)) return [];
    return [{ id: a.id, name: typeof a.name === 'string' && a.name !== '' ? a.name : 'Descriptive statistics', kind: 'descriptive', dataTableId: a.dataTableId, level: typeof a.level === 'number' && a.level > 0 && a.level < 1 ? a.level : 0.95 }];
  });
  // A chart type that does not suit its table's type (a hand-edited file) is switched to the table's default chart
  // type, so a graph is never drawn with the wrong reading of the columns.
  for (const c of charts) {
    const kind = dataTables.find((t) => t.id === c.dataTableId)?.kind ?? 'column';
    if (chartTypeInfo(c.type)?.tableKind !== kind) {
      const fixed = defaultChartTypeFor(kind);
      notes.push(`Graph "${c.name}" was a ${c.type} chart of a ${kind} table; it was changed to ${fixed}.`);
      c.type = fixed;
      c.layers = c.layers.map((l) => ({ ...l, style: { ...l.style, ...TYPE_PRESETS[fixed] } }));
    }
  }
  const project: Project = {
    id: str(p.id, 'project.id'),
    name: typeof p.name === 'string' ? p.name : 'Untitled project',
    dataTables,
    charts,
    ...(analyses.length > 0 ? { analyses } : {}),
  };
  return { project, notes };
}

export const parseProject = (text: string): Project => parseProjectWithNotes(text).project;

export function loadAutosave(): Project | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY) ?? localStorage.getItem(LEGACY_AUTOSAVE_KEY);
    return text ? parseProject(text) : null;
  } catch {
    return null;
  }
}

/** Returns false when storage is unavailable (private mode, quota, ...). */
export function saveAutosave(project: Project): boolean {
  try {
    localStorage.setItem(AUTOSAVE_KEY, stringifyProject(project));
    // The copy under the new key is now the live one; drop the stale pre-rename entry.
    localStorage.removeItem(LEGACY_AUTOSAVE_KEY);
    return true;
  } catch {
    return false;
  }
}
