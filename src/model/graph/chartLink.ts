import { dataSetMap } from './chartFormat';
import { dataLayer } from './style';
import type { Chart, DataTable, Id, Project } from '../types';

/**
 * Linked graphs. A graph made like another (see chartFormat.ts) stays linked to it: when the source's format changes, the
 * linked graph follows, in every detail it has not changed itself. This is a three-way merge of each format setting:
 *   the source's setting before the edit, after it, and the linked graph's own;
 *   if the source did not change it, nothing happens;
 *   if the linked graph still has the source's old value, it takes the new one;
 *   if the linked graph has a value of its own, it keeps it.
 * So nothing has to be recorded about what the user changed: a detail that was set on the linked graph is its own from then on,
 * until the user sets it back to what the source has, when it follows again. Data, titles, axis ranges, breaks and scales,
 * reference lines, annotations, hidden data sets and the fitted curve are never inherited.
 */

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function equal(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((x, i) => equal(x, b[i]));
  if (isObj(a)) {
    if (!isObj(b)) return false;
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of keys) if (!equal(a[k], b[k])) return false;
    return true;
  }
  return false;
}

/** The merge of one setting (see above); the same value (not a copy) when nothing changes. undefined = the setting is absent. */
function merge3(own: unknown, before: unknown, after: unknown): unknown {
  if (equal(before, after)) return own;
  if (equal(own, before)) return structuredClone(after);
  if (isObj(own) && isObj(before) && isObj(after)) {
    const out: Obj = { ...own };
    let changed = false;
    for (const k of new Set([...Object.keys(before), ...Object.keys(after)])) {
      const v = merge3(own[k], before[k], after[k]);
      if (v === own[k]) continue;
      changed = true;
      if (v === undefined) delete out[k];
      else out[k] = v;
    }
    return changed ? out : own;
  }
  return own;
}

/** Settings of any linked graph: how it looks, whatever its table. */
const GENERAL: ReadonlyArray<keyof Chart> = ['widthPx', 'heightPx', 'printWidthMm', 'aspect', 'showTitle', 'titleFontSizePt', 'titleBold', 'titleOffsetPt', 'fontFamily', 'textColor', 'axisColor', 'axisOpacity', 'plotColor', 'pageColor', 'frame', 'grid', 'jitter'];
/** Also followed when the two graphs show tables of the same type. */
const SAME_TYPE: ReadonlyArray<keyof Chart> = ['paletteId', 'orientation', 'lineOrder', 'lineConnect', 'bars', 'barLabels', 'distribution', 'pairs', 'heatmap', 'histogram', 'pie', 'survival', 'defaults'];
/** Parts of an axis, the legend and the fit that belong to the data and are never inherited. */
const AXIS_OWN = ['title', 'min', 'max', 'majorInterval', 'breaks', 'scale', 'reverse'] as const;
const LEGEND_OWN = ['hiddenGroupIds', 'order'] as const;
const FIT_OWN = ['analysisId'] as const;

const omit = (o: unknown, keys: readonly string[]): unknown => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => !keys.includes(k))) : o);
const pick = (o: unknown, keys: readonly string[]): Obj => (isObj(o) ? Object.fromEntries(Object.entries(o).filter(([k]) => keys.includes(k))) : {});

/** A setting of which some parts are the graph's own: the rest is merged, those parts stay as they are. */
function mergeApart(own: unknown, before: unknown, after: unknown, apart: readonly string[]): unknown {
  const merged = merge3(omit(own, apart), omit(before, apart), omit(after, apart));
  if (equal(merged, omit(own, apart))) return own;
  return { ...(merged as Obj), ...pick(own, apart) };
}

/** `child` after its source went from `before` to `after`. The same chart when there is nothing for it to follow. */
function followSource(child: Chart, before: Chart, after: Chart, sourceTable: DataTable, table: DataTable): Chart {
  const out: Obj = { ...child };
  const c = child as unknown as Obj;
  const [b, a] = [before as unknown as Obj, after as unknown as Obj];
  const set = (k: string, v: unknown) => {
    if (v !== c[k]) out[k] = v;
  };
  for (const k of GENERAL) set(k, merge3(c[k], b[k], a[k]));
  for (const k of ['xAxis', 'yAxis', 'y2Axis'] as const) set(k, mergeApart(c[k], b[k], a[k], AXIS_OWN));
  set('legend', mergeApart(c.legend, b.legend, a.legend, LEGEND_OWN));
  if (sourceTable.kind === table.kind) {
    for (const k of SAME_TYPE) set(k, merge3(c[k], b[k], a[k]));
    set('fit', mergeApart(c.fit, b.fit, a.fit, FIT_OWN));
    // The style of each data set follows the data set in the same position of the source's table.
    const to = dataSetMap(sourceTable, table);
    const translate = (rec: Record<Id, unknown>): Record<Id, unknown> => Object.fromEntries(Object.entries(rec).flatMap(([k, v]) => (to.has(k) ? [[to.get(k)!, v] as const] : [])));
    const [own0, before0, after0] = [dataLayer(child), dataLayer(before), dataLayer(after)];
    if (own0 && before0 && after0) {
      const style = merge3(own0.style, before0.style, after0.style);
      const groupOverrides = merge3(own0.groupOverrides, translate(before0.groupOverrides), translate(after0.groupOverrides));
      if (style !== own0.style || groupOverrides !== own0.groupOverrides) {
        out.layers = [{ ...own0, style, groupOverrides }];
      }
    }
  }
  return Object.keys(out).some((k) => out[k] !== c[k]) ? (out as unknown as Chart) : child;
}

/**
 * The project after a command: every graph linked to one that the command changed follows it (and graphs linked to those in
 * turn). A link to a graph that no longer exists is dropped. The same project when there is nothing to do.
 */
export function syncLinks(before: Project, after: Project): Project {
  let p = after;
  const was = new Map(before.charts.map((c) => [c.id, c]));
  const queue: Array<{ before: Chart; after: Chart }> = [];
  for (const c of after.charts) {
    const old = was.get(c.id);
    if (old && old !== c) queue.push({ before: old, after: c });
  }
  // A link cannot lead round to its start (a graph is only ever linked to one that exists), but a damaged file might: bounded anyway.
  for (let steps = 0; queue.length > 0 && steps < 500; steps++) {
    const { before: old, after: now } = queue.shift()!;
    for (const child of p.charts.filter((c) => c.linkedTo === now.id)) {
      const [sourceTable, table] = [p.dataTables.find((t) => t.id === now.dataTableId), p.dataTables.find((t) => t.id === child.dataTableId)];
      if (!sourceTable || !table) continue;
      const next = followSource(child, old, now, sourceTable, table);
      if (next === child) continue;
      p = { ...p, charts: p.charts.map((c) => (c === child ? next : c)) };
      queue.push({ before: child, after: next });
    }
  }
  const ids = new Set(p.charts.map((c) => c.id));
  if (p.charts.some((c) => c.linkedTo !== undefined && !ids.has(c.linkedTo))) {
    p = { ...p, charts: p.charts.map((c) => (c.linkedTo !== undefined && !ids.has(c.linkedTo) ? { ...c, linkedTo: undefined } : c)) };
  }
  return p;
}
