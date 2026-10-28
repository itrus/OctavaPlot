import { createChart, DEFAULT_STYLE, DEFAULT_SURVIVAL, TYPE_PRESETS } from '../model/defaults';
import { LABEL_DECIMALS_LIMITS, LABEL_FONT_LIMITS, LABEL_OFFSET_LIMITS } from '../chart/shared/parts/labels';
import { CHART_TYPES, chartTypeInfo, defaultChartTypeFor } from '../model/graph/chartTypes';
import { leadingColumns } from '../model/graph/chartTypes';
import { MAX_REPLICATES, MIN_REPLICATES, seriesWidth, SUMMARY_FORMATS } from '../model/table/tableLayout';
import { sanitizeFillKeys } from '../model/graph/fill';
import { sanitizeAxis } from '../model/graph/axis';
import { analysisTypeInfo } from '../model/project/analysis';
import { FIT_MODEL_IDS, sanitizeDegree } from '../model/options/fitOptions';
import { sanitizeLayerStyles } from '../model/graph/layers';
import { sanitizeLegendLayout, withoutLegendLayout } from '../model/graph/legendEntries';
import { sanitizeLook, sanitizePrintWidthMm } from '../model/graph/look';
import { applyOrder, sanitizeOrder } from '../model/table/groupOrder';
import { foldGroupGaps } from '../model/options/columnOptions';
import { createRows, MAX_TABLE_CELLS, MAX_TABLE_ROWS, sanitizeRowTitle } from '../model/table/rows';
import { sanitizeSummary, sanitizeSummaryPatch } from '../model/graph/summary';
import { defaultLayout, sanitizeLayout } from '../model/project/layout';
import type { Analysis, Chart, ChartLayer, Layout, ChartType, ReplicateLayout, SummaryFormat, SurvivalOptions, TableKind, DataRow, DataTable, Group, Id, Observation, Project, SummarySpec } from '../model/types';

/** The envelope of a project file (.oplot): this format and its one version. */
const FORMAT = 'octavaplot-project';
const VERSION = 1;
/** Autosave in the browser's storage; the same text as a file. */
export const AUTOSAVE_KEY = 'octavaplot:project:autosave';
export const AUTOSAVE_BACKUP_KEY = 'octavaplot:project:autosave:backup';

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

/**
 * A stored layout. Absent or {"kind":"single"} means a single Y value. Anything else that is not a valid replicate or
 * summary layout is refused: reading it as single values would change what the columns mean.
 */
function parseLayout(raw: unknown, path: string): ReplicateLayout | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (!isObj(raw)) fail(path, 'must be an object');
  if (raw.kind === 'single') return undefined;
  if (raw.kind === 'replicates') {
    if (typeof raw.n === 'number' && Number.isInteger(raw.n) && raw.n >= MIN_REPLICATES && raw.n <= MAX_REPLICATES) return { kind: 'replicates', n: raw.n };
    fail(`${path}.n`, `must be a whole number from ${MIN_REPLICATES} to ${MAX_REPLICATES}`);
  }
  if (raw.kind === 'sized') return { kind: 'sized' };
  if (raw.kind === 'vector') return { kind: 'vector' };
  if (raw.kind === 'summary') {
    if (SUMMARY_FORMATS.some((f) => f.id === raw.format)) return { kind: 'summary', format: raw.format as SummaryFormat };
    fail(`${path}.format`, `must be one of ${SUMMARY_FORMATS.map((f) => f.id).join(', ')}`);
  }
  fail(`${path}.kind`, 'must be single, replicates, summary, sized or vector');
}

/** Stored survival options merged over the defaults; a level outside 0 to 1 or an unknown method falls back. */
function parseSurvival(raw: unknown): SurvivalOptions {
  const r = isObj(raw) ? raw : {};
  return {
    band: typeof r.band === 'boolean' ? r.band : DEFAULT_SURVIVAL.band,
    level: typeof r.level === 'number' && r.level > 0 && r.level < 1 ? r.level : DEFAULT_SURVIVAL.level,
    method: r.method === 'plain' || r.method === 'loglog' ? r.method : DEFAULT_SURVIVAL.method,
    atRisk: typeof r.atRisk === 'boolean' ? r.atRisk : DEFAULT_SURVIVAL.atRisk,
    eventSymbols: typeof r.eventSymbols === 'boolean' ? r.eventSymbols : DEFAULT_SURVIVAL.eventSymbols,
    errorBars: typeof r.errorBars === 'boolean' ? r.errorBars : DEFAULT_SURVIVAL.errorBars,
  };
}

const TABLE_KINDS: readonly TableKind[] = ['column', 'xy', 'grouped', 'contingency', 'survival'];

function parseTable(raw: unknown, path: string): DataTable {
  const t = obj(raw, path);
  const rowCount = num(t.rowCount, `${path}.rowCount`);
  if (!Number.isInteger(rowCount) || rowCount < 0) fail(`${path}.rowCount`, 'must be a non-negative integer');
  // Declared sizes are checked before anything is allocated for them.
  if (rowCount > MAX_TABLE_ROWS) fail(`${path}.rowCount`, `is ${rowCount.toLocaleString('en-US')}; a table holds at most ${MAX_TABLE_ROWS.toLocaleString('en-US')} rows`);
  const columns = arr(t.groups, `${path}.groups`).length;
  if (rowCount * columns > MAX_TABLE_CELLS) fail(path, `declares ${rowCount.toLocaleString('en-US')} rows in ${columns} columns; a table holds at most ${MAX_TABLE_CELLS.toLocaleString('en-US')} cells`);
  const ids = new Set<string>();
  const obsIds = new Set<string>();
  const groups: Group[] = arr(t.groups, `${path}.groups`).map((rg, gi) => {
    const gp = `${path}.groups[${gi}]`;
    const g = obj(rg, gp);
    const id = str(g.id, `${gp}.id`);
    if (ids.has(id)) fail(`${gp}.id`, 'is duplicated');
    ids.add(id);
    const observations: Observation[] = arr(g.observations, `${gp}.observations`).map((ro, oi) => {
      const o = obj(ro, `${gp}.observations[${oi}]`);
      const value = o.value === null ? null : num(o.value, `${gp}.observations[${oi}].value`);
      const oid = str(o.id, `${gp}.observations[${oi}].id`);
      if (obsIds.has(oid)) fail(`${gp}.observations[${oi}].id`, 'is duplicated');
      obsIds.add(oid);
      // An excluded value is kept, with its reason, but not used (model/table/exclusion.ts).
      const subject = typeof o.subject === 'string' ? o.subject.trim() : '';
      return { id: oid, value, ...(subject !== '' ? { subject } : {}), ...(o.excluded === true ? { excluded: true as const, ...(typeof o.excludedReason === 'string' && o.excludedReason !== '' ? { excludedReason: o.excludedReason } : {}) } : {}) };
    });
    if (observations.length !== rowCount) fail(`${gp}.observations`, `must have ${rowCount} entries`);
    return {
      id,
      name: str(g.name, `${gp}.name`),
      title: typeof g.title === 'string' ? g.title : '',
      paletteIndex: typeof g.paletteIndex === 'number' ? g.paletteIndex : gi,
      ...(typeof g.factor === 'string' && g.factor.trim() !== '' ? { factor: g.factor.trim() } : {}),
      observations,
    };
  });
  const kind: TableKind = TABLE_KINDS.find((k) => k === t.kind) ?? 'column';
  const lead = leadingColumns(kind);
  if (groups.length < lead) fail(`${path}.groups`, `a ${kind} table needs its first column (${kind === 'survival' ? 'time' : 'X'})`);
  const layout = kind === 'xy' || kind === 'grouped' ? parseLayout(t.layout, `${path}.layout`) : undefined;
  if (layout && (groups.length - lead) % seriesWidth(layout) !== 0) fail(`${path}.groups`, `do not fit the table layout: the columns must come in blocks of ${seriesWidth(layout)}`);
  return { id: str(t.id, `${path}.id`), name: str(t.name, `${path}.name`), kind, ...(layout ? { layout } : {}), rowCount, rows: parseRows(t.rows, `${path}.rows`, rowCount), groups };
}

/** Enum-valued style keys; an invalid stored value is dropped (the default applies) and noted. */
const STYLE_ENUMS: Record<string, readonly string[]> = {
  symbolShape: ['circle', 'square', 'triangle', 'triangleDown', 'diamond', 'hexagon', 'star', 'target', 'plus', 'cross', 'asterisk'],
  lineStyle: ['solid', 'longDash', 'dashed', 'dotted', 'dashDot', 'dashDotDot'],
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

/** Values that are text or a number by default but may also be null: "no colour" and "transparent". */
const NULL_OK = new Set(['barPatternBackground', 'plotColor', 'pageColor']);
const isHexColour = (v: unknown): boolean => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/**
 * Checks the keys of `raw` that `base` (the defaults) also has against the type of the default: a number must be
 * a finite number, text text, a flag true or false, a list a list, an object an object (checked in turn). A key whose
 * default is null holds a number or null; or, if its name ends in "colour" (or is "mid", the middle colour of a heat map scale), a #rrggbb colour or null; or, if it ends in "Id", an ID or null. A key that
 * fails is taken out, so the default applies, and noted. Keys `base` does not have, and the keys in `skip`, stay as they are.
 */
function conform(raw: Obj, base: Obj, path: string, notes: string[], skip: ReadonlySet<string> = new Set()): Obj {
  const out: Obj = {};
  for (const key of Object.keys(raw)) if (key !== '__proto__') out[key] = raw[key];
  for (const key of Object.keys(base)) {
    if (skip.has(key) || !Object.prototype.hasOwnProperty.call(raw, key)) continue;
    const want = base[key];
    const got = raw[key];
    let ok: boolean;
    if (got === null) ok = want === null || NULL_OK.has(key);
    else if (isObj(want)) {
      ok = isObj(got);
      if (ok) out[key] = conform(got as Obj, want, `${path}.${key}`, notes);
    } else if (Array.isArray(want)) ok = Array.isArray(got);
    else if (want === null) ok = /colou?r$|^mid$/i.test(key) ? isHexColour(got) : /Id$/.test(key) ? typeof got === 'string' : typeof got === 'number' && Number.isFinite(got);
    else if (typeof want === 'number') ok = typeof got === 'number' && Number.isFinite(got);
    else ok = typeof got === typeof want;
    if (!ok) {
      delete out[key];
      notes.push(`${path}.${key} had an invalid value and was reset to the default.`);
    }
  }
  return out;
}

/** The one pipeline every raw defaults/style/override object passes through. */
function cleanStyle(raw: unknown, path: string, notes: string[]): Obj {
  const out: Obj = isObj(raw) ? conform(raw, DEFAULT_STYLE as unknown as Obj, path, notes) : {};
  for (const [key, allowed] of Object.entries(STYLE_ENUMS)) {
    if (!Object.prototype.hasOwnProperty.call(out, key)) continue;
    const v = out[key];
    if (typeof v === 'string' && allowed.includes(v)) continue;
    delete out[key];
    notes.push(`${path}.${key} had an invalid value and was reset to the default.`);
  }
  for (const key of OPACITY_KEYS) if (typeof out[key] === 'number') out[key] = Math.min(1, Math.max(0, out[key] as number));
  cleanLabelKeys(out, path, notes);
  const { style, dropped } = sanitizeFillKeys(out);
  for (const key of dropped) notes.push(`${path}.${key} had an invalid value and was reset to the default.`);
  return style;
}

/** Style keys that hold an opacity: a number outside 0 to 1 is pulled to the nearest end. */
const OPACITY_KEYS = ['barOpacity', 'barBorderOpacity', 'symbolFillOpacity', 'symbolBorderOpacity', 'errorOpacity', 'lineOpacity'] as const;

/** Override maps keyed by group or object ID; non-object entries and __proto__ are skipped. */
function cleanOverrideMap(raw: unknown, path: string, notes: string[]): Record<Id, Obj> {
  const out: Record<Id, Obj> = {};
  if (!isObj(raw)) return out;
  for (const key of Object.keys(raw)) {
    if (key === '__proto__' || !isObj(raw[key])) continue;
    out[key] = cleanStyle(raw[key], `${path}.${key}`, notes);
  }
  return out;
}

function parseLayer(l: Obj, lp: string, notes: string[]): ChartLayer {
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

/** Display names are strings keyed by object ID; anything else is dropped and noted. */
function cleanDisplayNames(raw: unknown, path: string, notes: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  if (raw === undefined) return out;
  if (!isObj(raw)) {
    notes.push(`${path} was not a list of names and was reset.`);
    return out;
  }
  for (const key of Object.keys(raw)) {
    if (key === '__proto__') continue;
    if (typeof raw[key] === 'string') out[key] = raw[key] as string;
    else notes.push(`${path}.${key} was not text and was dropped.`);
  }
  return out;
}

const finiteOr = (v: unknown, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);

/** Annotations: every field checked; an entry that cannot be read, or repeats an ID, is dropped and noted. */
function cleanAnnotations(raw: unknown, path: string, notes: string[]): Chart['annotations'] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    notes.push(`${path} was not a list and was reset.`);
    return [];
  }
  const out: Chart['annotations'] = [];
  const seen = new Set<string>();
  raw.forEach((a, i) => {
    if (!isObj(a) || typeof a.id !== 'string' || a.id === '' || seen.has(a.id)) {
      notes.push(`${path}[${i}] could not be read and was dropped.`);
      return;
    }
    seen.add(a.id);
    const text = typeof a.text === 'string' ? a.text : typeof a.text === 'number' && Number.isFinite(a.text) ? String(a.text) : '';
    const color = typeof a.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(a.color) ? a.color : '#000000';
    const size = finiteOr(a.fontSizePt, 24);
    // A data anchor needs at least one value on the axes; without one the text stays where the page puts it.
    const hasX = typeof a.x === 'number' && Number.isFinite(a.x);
    const hasY = typeof a.y === 'number' && Number.isFinite(a.y);
    if (a.anchor === 'data' && !hasX && !hasY) notes.push(`${path}[${i}] was anchored to data without a value and was placed on the page.`);
    out.push({
      id: a.id,
      text,
      xFrac: Math.min(1, Math.max(0, finiteOr(a.xFrac, 0.5))),
      yFrac: Math.min(1, Math.max(0, finiteOr(a.yFrac, 0.5))),
      fontSizePt: size > 0 ? size : 24,
      color,
      opacity: Math.min(1, Math.max(0, finiteOr(a.opacity, 1))),
      ...(a.anchor === 'data' && (hasX || hasY) ? { anchor: 'data' as const, ...(hasX ? { x: a.x as number } : {}), ...(hasY ? { y: a.y as number } : {}) } : {}),
    });
  });
  return out;
}

const LINE_STYLES = ['solid', 'longDash', 'dashed', 'dotted', 'dashDot', 'dashDotDot'] as const;

/** Reference lines: every field checked; an entry that cannot be read (or repeats an ID) is dropped and noted. */
function cleanReferenceLines(raw: unknown, path: string, notes: string[]): Chart['referenceLines'] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    notes.push(`${path} was not a list and was reset.`);
    return [];
  }
  const out: Chart['referenceLines'] = [];
  const seen = new Set<string>();
  raw.forEach((l, i) => {
    if (!isObj(l) || typeof l.id !== 'string' || l.id === '' || seen.has(l.id) || (l.axis !== 'x' && l.axis !== 'y') || typeof l.value !== 'number' || !Number.isFinite(l.value)) {
      notes.push(`${path}[${i}] could not be read and was dropped.`);
      return;
    }
    seen.add(l.id);
    const width = finiteOr(l.widthPt, 2);
    out.push({
      id: l.id,
      axis: l.axis,
      value: l.value,
      color: typeof l.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(l.color) ? l.color : '#000000',
      widthPt: width > 0 && width <= 40 ? width : 2,
      style: LINE_STYLES.find((v) => v === l.style) ?? 'dashed',
      opacity: typeof l.opacity === 'number' && Number.isFinite(l.opacity) ? Math.min(1, Math.max(0, l.opacity)) : 1,
      label: typeof l.label === 'string' ? l.label : '',
      showLabel: l.showLabel === true,
    });
  });
  return out;
}

/** Comparison brackets: every field checked; an entry that cannot be read (or repeats an ID) is dropped and noted. */
function cleanBrackets(raw: unknown, path: string, notes: string[]): Chart['brackets'] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    notes.push(`${path} was not a list and was reset.`);
    return [];
  }
  const out: Chart['brackets'] = [];
  const seen = new Set<string>();
  raw.forEach((b, i) => {
    if (!isObj(b) || typeof b.id !== 'string' || b.id === '' || seen.has(b.id) || typeof b.from !== 'string' || b.from === '' || typeof b.to !== 'string' || b.to === '') {
      notes.push(`${path}[${i}] could not be read and was dropped.`);
      return;
    }
    seen.add(b.id);
    const width = finiteOr(b.widthPt, 2);
    const font = finiteOr(b.fontSizePt, 24);
    out.push({
      id: b.id,
      from: b.from,
      to: b.to,
      label: typeof b.label === 'string' ? b.label : '',
      color: typeof b.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.color) ? b.color : '#000000',
      widthPt: width > 0 && width <= 40 ? width : 2,
      fontSizePt: font >= 4 && font <= 200 ? font : 24,
    });
  });
  return out;
}

/**
 * Data sets taken from other tables. An entry that cannot be read, or a data set listed twice, refuses the file (which
 * of two copies is meant would be a guess). An entry whose table or data set no longer exists is dropped, with a note: the
 * data set is gone, so the graph never showed it.
 */
function parseExtraGroups(raw: unknown, path: string, tables: DataTable[], notes: string[]): Chart['extraGroups'] {
  if (raw === undefined) return [];
  const seen = new Set<string>();
  const out: Chart['extraGroups'] = [];
  arr(raw, path).forEach((e, i) => {
    const ep = `${path}[${i}]`;
    const o = obj(e, ep);
    const tableId = str(o.tableId, `${ep}.tableId`);
    const groupId = str(o.groupId, `${ep}.groupId`);
    const table = tables.find((t) => t.id === tableId);
    const key = JSON.stringify([tableId, groupId]);
    if (seen.has(key)) fail(ep, 'lists the same data set twice');
    seen.add(key);
    if (!table || !table.groups.some((g) => g.id === groupId)) {
      notes.push(`${ep} named a data set that does not exist (${table ? 'missing data set' : 'missing data table'}) and was dropped.`);
      return;
    }
    out.push({ tableId, groupId, ...(Number.isInteger(o.slot) && (o.slot as number) >= 0 ? { slot: o.slot as number } : {}) });
  });
  return out;
}

function parseChart(raw: unknown, path: string, tables: DataTable[], notes: string[]): Chart {
  const c0 = obj(raw, path);
  const dataTableId = str(c0.dataTableId, `${path}.dataTableId`);
  if (!tables.some((t) => t.id === dataTableId)) fail(`${path}.dataTableId`, 'refers to a missing data table');
  if (typeof c0.type !== 'string' || !CHART_TYPES.some((t) => t.type === c0.type)) fail(`${path}.type`, `must be one of ${CHART_TYPES.map((t) => t.type).join(', ')}`);
  const base = createChart(dataTableId, undefined, c0.type as ChartType);
  // Styles and layers have their own checks below.
  const c = conform(c0, base as unknown as Obj, path, notes, new Set(['defaults', 'layers']));
  // Merged over the defaults: a value that is missing or not valid takes the default.
  const defaults = cleanStyle(c.defaults, `${path}.defaults`, notes);
  // A graph has one data layer (see dataLayer in model/graph/style.ts). A file with more says so; only the first is read.
  const rawLayers = arr(c.layers, `${path}.layers`);
  if (rawLayers.length === 0) fail(`${path}.layers`, 'must contain at least one layer');
  const layers = [parseLayer(obj(rawLayers[0], `${path}.layers[0]`), `${path}.layers[0]`, notes)];
  if (rawLayers.length > 1) notes.push(`${path}.layers: a graph has one layer in this version; the other ${rawLayers.length - 1} ${rawLayers.length === 2 ? 'was' : 'were'} not read.`);
  const legendIn = isObj(c.legend) ? c.legend : {};
  const chart: Chart = {
    ...base,
    ...(c as Partial<Chart>),
    widthPx: typeof c.widthPx === 'number' ? c.widthPx : base.widthPx,
    heightPx: typeof c.heightPx === 'number' ? c.heightPx : base.heightPx,
    printWidthMm: sanitizePrintWidthMm(c.printWidthMm),
    groupOrder: sanitizeOrder(c.groupOrder),
    hiddenGroupIds: Array.isArray(c.hiddenGroupIds) ? c.hiddenGroupIds.filter((id): id is string => typeof id === 'string') : [],
    survival: parseSurvival(c.survival),
    extraGroups: parseExtraGroups(c.extraGroups, `${path}.extraGroups`, tables, notes),
    aspect: c.aspect === '4:3' || c.aspect === '3:4' || c.aspect === '1:1' ? c.aspect : 'free',
    paletteId: typeof c.paletteId === 'string' ? c.paletteId : null,
    ...sanitizeLook(c, base),
    xAxis: sanitizeAxis({ ...base.xAxis, ...(isObj(c.xAxis) ? c.xAxis : {}) }, base.xAxis),
    yAxis: sanitizeAxis({ ...base.yAxis, ...(isObj(c.yAxis) ? c.yAxis : {}) }, base.yAxis),
    y2Axis: sanitizeAxis({ ...base.y2Axis, ...(isObj(c.y2Axis) ? c.y2Axis : {}) }, base.y2Axis),
    legend: {
      ...base.legend,
      ...withoutLegendLayout(legendIn),
      keyShape: legendIn.keyShape === 'square' ? 'square' : 'rectangle',
      hiddenGroupIds: Array.isArray(legendIn.hiddenGroupIds) ? legendIn.hiddenGroupIds.filter((id): id is string => typeof id === 'string') : [],
      ...sanitizeLegendLayout(legendIn),
    },
    jitter: { ...base.jitter, ...(isObj(c.jitter) ? c.jitter : {}) },
    defaults: { ...DEFAULT_STYLE, ...defaults },
    displayNames: cleanDisplayNames(c.displayNames, `${path}.displayNames`, notes),
    annotations: cleanAnnotations(c.annotations, `${path}.annotations`, notes),
    referenceLines: cleanReferenceLines(c.referenceLines, `${path}.referenceLines`, notes),
    brackets: cleanBrackets(c.brackets, `${path}.brackets`, notes),
    layerStyles: (() => {
      const r = sanitizeLayerStyles(c.layerStyles);
      if (r.dropped > 0) notes.push(`${path}.layerStyles: ${r.dropped} setting${r.dropped === 1 ? '' : 's'} could not be read and ${r.dropped === 1 ? 'was' : 'were'} dropped.`);
      return r.styles;
    })(),
    hiddenLayerIds: Array.isArray(c.hiddenLayerIds) ? c.hiddenLayerIds.filter((id): id is string => typeof id === 'string') : [],
    rangeExcludedLayerIds: Array.isArray(c.rangeExcludedLayerIds) ? c.rangeExcludedLayerIds.filter((id): id is string => typeof id === 'string') : [],
    layerOrder: Array.isArray(c.layerOrder) ? [...new Set(c.layerOrder.filter((id): id is string => typeof id === 'string'))] : [],
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
  if (env.format !== FORMAT) fail('format', `must be "${FORMAT}"`);
  if (env.version !== VERSION) fail('version', `must be ${VERSION} (this app reads version ${VERSION} only)`);
  const p = obj(env.project, 'project');
  const dataTables = arr(p.dataTables, 'project.dataTables').map((t, i) => parseTable(t, `project.dataTables[${i}]`));
  const tableIds = new Set(dataTables.map((t) => t.id));
  if (tableIds.size !== dataTables.length) fail('project.dataTables', 'has two tables with the same ID');
  const charts = arr(p.charts, 'project.charts').map((c, i) => parseChart(c, `project.charts[${i}]`, dataTables, notes));
  if (new Set(charts.map((c) => c.id)).size !== charts.length) fail('project.charts', 'has two graphs with the same ID');
  if (dataTables.length === 0) fail('project.dataTables', 'must contain at least one table');
  // Analyses refer to tables by ID. Each must be readable and have an ID of its own, or the file is refused. One whose table no
  // longer exists is dropped, with a note (its results were of that table). A confidence level that cannot be read is reset, with a note.
  const analyses: Analysis[] = [];
  const analysisIds = new Set<string>();
  arr(p.analyses === undefined ? [] : p.analyses, 'project.analyses').forEach((a, i) => {
    const ap = `project.analyses[${i}]`;
    const o = obj(a, ap);
    const id = str(o.id, `${ap}.id`);
    if (id === '') fail(`${ap}.id`, 'must not be empty');
    if (analysisIds.has(id)) fail(`${ap}.id`, 'is duplicated');
    analysisIds.add(id);
    if (o.kind !== 'descriptive' && o.kind !== 'curvefit' && o.kind !== 'survival') fail(`${ap}.kind`, 'must be descriptive, curvefit or survival');
    const kind = o.kind;
    const dataTableId = str(o.dataTableId, `${ap}.dataTableId`);
    const table = dataTables.find((t) => t.id === dataTableId);
    if (!table) {
      notes.push(`${ap} ("${typeof o.name === 'string' ? o.name : kind}") was of a data table that does not exist and was dropped.`);
      return;
    }
    let level = 0.95;
    if (o.level !== undefined) {
      if (typeof o.level === 'number' && o.level > 0 && o.level < 1) level = o.level;
      else notes.push(`${ap}.level had an invalid value and was reset to 0.95.`);
    }
    const name = typeof o.name === 'string' && o.name !== '' ? o.name : analysisTypeInfo(kind).label;
    if (kind === 'descriptive' || kind === 'survival') {
      analyses.push({ id, name, kind, dataTableId, level });
      return;
    }
    // A curve fit applies to an XY table and names one of the models.
    const model = FIT_MODEL_IDS.find((m) => m === o.model);
    if (!model) fail(`${ap}.model`, `must be one of ${FIT_MODEL_IDS.join(', ')}`);
    if (table.kind !== 'xy') fail(`${ap}.dataTableId`, 'must be an XY table for a curve fit');
    analyses.push({ id, name, kind, dataTableId, level, model, degree: sanitizeDegree(o.degree, 2) });
  });  // Older files held a space before each data set: it is now part of Space between columns (and never kept as it was).
  for (const [ci, c] of charts.entries()) {
    const legacy = (c as unknown as Record<string, unknown>).groupGaps;
    delete (c as unknown as Record<string, unknown>).groupGaps;
    const table = dataTables.find((t) => t.id === c.dataTableId);
    if (!table || legacy === undefined) continue;
    const folded = foldGroupGaps(legacy, applyOrder(table.groups, c.groupOrder).map((g) => g.id), c.bars);
    c.bars = folded.bars;
    if (folded.note) notes.push(`project.charts[${ci}] ("${c.name}"): ${folded.note}`);
  }
  // A link refers to another graph: one to a graph that is missing, to itself, or round in a circle is dropped.
  const linkOf = new Map(charts.map((c) => [c.id, typeof c.linkedTo === 'string' ? c.linkedTo : undefined]));
  for (const [ci, c] of charts.entries()) {
    let at: string | undefined = c.linkedTo;
    const seen = new Set<string>([c.id]);
    while (at !== undefined && charts.some((x) => x.id === at) && !seen.has(at)) {
      seen.add(at);
      at = linkOf.get(at);
    }
    if (c.linkedTo !== undefined && (typeof c.linkedTo !== 'string' || at !== undefined)) {
      notes.push(`project.charts[${ci}].linkedTo ("${c.name}") referred to a graph that is missing or to itself; the link was removed.`);
      delete c.linkedTo;
    }
  }
  // Layouts refer to graphs by ID: a panel whose graph is gone is emptied, with a note. A layout must be an object with an ID.
  const chartIds = new Set(charts.map((c) => c.id));
  const layouts: Layout[] = arr(p.layouts === undefined ? [] : p.layouts, 'project.layouts').map((l, li) => {
    const lp = `project.layouts[${li}]`;
    const o = obj(l, lp);
    const id = str(o.id, `${lp}.id`);
    const made = sanitizeLayout(o, defaultLayout(id, typeof o.name === 'string' && o.name.trim() !== '' ? o.name.trim() : 'Layout'));
    const panels = made.panels.map((pid, pi) => {
      if (pid === null || chartIds.has(pid)) return pid;
      notes.push(`${lp}.panels[${pi}] referred to a graph that is missing and was emptied.`);
      return null;
    });
    return { ...made, panels };
  });
  if (new Set(layouts.map((l) => l.id)).size !== layouts.length) fail('project.layouts', 'has two layouts with the same ID');
  // A chart type that does not suit its table's type (a hand-edited file) is switched to the table's default chart
  // type, so a graph is never drawn with the wrong reading of the columns.
  for (const [ci, c] of charts.entries()) {
    const kind = dataTables.find((t) => t.id === c.dataTableId)?.kind ?? 'column';
    if (chartTypeInfo(c.type)?.tableKind !== kind) {
      const fixed = defaultChartTypeFor(kind);
      notes.push(`project.charts[${ci}].type ("${c.name}") was a ${c.type} chart of a ${kind} table; it was changed to ${fixed}.`);
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
    ...(layouts.length > 0 ? { layouts } : {}),
  };
  return { project, notes };
}

export const parseProject = (text: string): Project => parseProjectWithNotes(text).project;

export function loadAutosave(): Project | null {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    return text ? parseProject(text) : null;
  } catch {
    return null;
  }
}

/** Returns false when storage is unavailable (private mode, quota, ...). */
export function saveAutosave(project: Project): boolean {
  try {
    localStorage.setItem(AUTOSAVE_KEY, stringifyProject(project));
    return true;
  } catch {
    return false;
  }
}

/** Keeps a copy of the autosave as it was when the app started, apart from the one that the next edits will overwrite. */
export function backupAutosave(): void {
  try {
    const text = localStorage.getItem(AUTOSAVE_KEY);
    if (text) localStorage.setItem(AUTOSAVE_BACKUP_KEY, text);
  } catch {
    /* storage is unavailable: nothing to protect */
  }
}
