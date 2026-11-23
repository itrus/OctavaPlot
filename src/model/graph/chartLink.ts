import { chartTypeInfo, usesSeriesBlocks } from './chartTypes';
import { defaultChartTypeFor } from './chartGallery';
import { createChart, PRESET_KEYS } from '../defaults';
import { withoutLegendOrder } from './legendEntries';
import { xySeries } from '../table/tableLayout';
import { followThresholds } from '../options/volcanoOptions';
import type { AxisConfig, Chart, ChartLayer, DataTable, Id, SummarySpec, Project } from '../types';
import { dataLayer } from './style';

/**
 * Which data set of `table` takes the style of which data set of `sourceTable`: matched by position. For an XY or survival
 * table the series have IDs of their own (the IDs of the layers are made from them), which are matched too.
 */
function dataSetMap(sourceTable: DataTable, table: DataTable): Map<Id, Id> {
  const to = new Map<Id, Id>();
  sourceTable.groups.forEach((g, i) => {
    const target = table.groups[i];
    if (target) to.set(g.id, target.id);
  });
  if (usesSeriesBlocks(table.kind)) {
    const [from, into] = [xySeries(sourceTable), xySeries(table)];
    from.forEach((s, i) => {
      if (into[i]) to.set(s.id, into[i].id);
    });
  }
  return to;
}

/**
 * Where a part of one graph (an ID of the form `${series or data set}:${kind}`) is on another graph: the part of the data set that takes its style (`to`),
 * or, for a part that belongs to the whole graph (the lines joining paired rows, the table at risk, titles), the one of the other graph;
 * null for one that belongs to a single value.
 */
function layerIdMap(sourceChartId: Id, chartId: Id, to: ReadonlyMap<Id, Id>): (k: Id) => Id | null {
  return (k) => {
    if (k.startsWith(`${sourceChartId}:`)) return `${chartId}:${k.slice(sourceChartId.length + 1)}`;
    const cut = k.indexOf(':');
    const target = cut > 0 ? to.get(k.slice(0, cut)) : undefined;
    return target ? `${target}${k.slice(cut)}` : null;
  };
}

/**
 * A new graph that takes its format from an existing one. What is carried over is how the graph looks, not what it says:
 *  - always: size and shape, title format, fonts, colours, frame and grid, the look of the axes (ticks, fonts, line width,
 *    number format), the legend, and the jitter;
 *  - when the new table is of the same type as the source's: also the chart type, the settings that belong to it (bars,
 *    labels above bars, box and violin, pairs, histogram, heat map, pie, survival), the styles of the layers, and the style
 *    of each data set, matched by position (the third data set of the source styles the third of the new table).
 * Never carried over: the data, the title text and axis titles, axis ranges, breaks and scales, reference lines,
 * annotations, hidden data sets, the curve fit, and the styles of single points (they belong to the source's values).
 */
export function inheritChart(source: Chart, sourceTable: DataTable, table: DataTable, id: Id): Chart {
  const sameKind = sourceTable.kind === table.kind;
  const type = sameKind && chartTypeInfo(source.type)?.tableKind === table.kind ? source.type : defaultChartTypeFor(table.kind);
  const fresh = { ...createChart(table.id, { widthPx: source.widthPx, heightPx: source.heightPx }, type), id, name: table.name, title: table.name };
  // Extra ticks are values on this graph's axis (a threshold, a cut-off): like the range and the breaks they belong to the data.
  const axis = (from: AxisConfig, to: AxisConfig): AxisConfig => {
    const { extraTicks: _ticks, ...kept } = from;
    return { ...kept, title: to.title, min: null, max: null, majorInterval: null, breaks: [], scale: to.scale, reverse: to.reverse };
  };
  // The threshold lines the new graph made for itself stay its own and are moved to the copied thresholds.
  const volcano = { ...source.volcano, lineIds: fresh.volcano.lineIds };
  const portable: Chart = {
    ...fresh,
    aspect: source.aspect,
    showTitle: source.showTitle,
    titleFontSizePt: source.titleFontSizePt,
    titleBold: source.titleBold,
    titleOffsetPt: source.titleOffsetPt,
    fontFamily: source.fontFamily,
    textColor: source.textColor,
    axisColor: source.axisColor,
    axisOpacity: source.axisOpacity,
    plotColor: source.plotColor,
    pageColor: source.pageColor,
    frame: source.frame,
    grid: { ...source.grid },
    xAxis: axis(source.xAxis, fresh.xAxis),
    yAxis: axis(source.yAxis, fresh.yAxis),
    y2Axis: axis(source.y2Axis, fresh.y2Axis),
    // The order of the entries names the series of the source's table, so it is not carried over; the number of columns is.
    legend: { ...withoutLegendOrder(source.legend), hiddenGroupIds: [] },
    jitter: { ...source.jitter },
  };
  if (!sameKind) return portable;

  const to = dataSetMap(sourceTable, table);
  /** An ID of the form `${series or data set}:${kind}` follows its series; one that belongs to a single value does not. */
  const mapId = layerIdMap(source.id, id, to);
  const mapKeys = <T,>(rec: Record<Id, T>): Record<Id, T> => Object.fromEntries(Object.entries(rec).flatMap(([k, v]) => (to.has(k) ? [[to.get(k)!, structuredClone(v)] as const] : [])));
  // Keys of single objects: `${groupId}:bar`, `:mean`, `:box` ... follow their data set; the ID of a single value does not.
  const mapObjects = <T,>(rec: Record<Id, T>): Record<Id, T> => Object.fromEntries(Object.entries(rec).flatMap(([k, v]) => {
    const id = mapId(k);
    return id ? [[id, structuredClone(v)] as const] : [];
  }));
  const layers: ChartLayer[] = source.layers.map((l) => {
    return {
      ...structuredClone(l),
      groupOverrides: mapKeys(l.groupOverrides),
      objectOverrides: mapObjects(l.objectOverrides),
      groupSummary: mapKeys<Partial<SummarySpec>>(l.groupSummary),
    };
  });
  return {
    ...portable,
    type,
    paletteId: source.paletteId,
    orientation: source.orientation,
    lineOrder: source.lineOrder,
    lineConnect: source.lineConnect,
    traceOffset: source.traceOffset,
    volcano,
    referenceLines: followThresholds(fresh.referenceLines, volcano),
    ...(source.sizeLegend ? { sizeLegend: { values: [...source.sizeLegend.values] } } : {}),
    groupedBy: source.groupedBy,
    bars: { ...source.bars },
    barLabels: { ...source.barLabels, ...(source.barLabels.inside ? { inside: { ...source.barLabels.inside } } : {}) },
    distribution: { ...source.distribution },
    pairs: { ...source.pairs },
    heatmap: { ...source.heatmap },
    histogram: { ...source.histogram },
    pie: { ...source.pie },
    survival: { ...source.survival },
    // The curve itself belongs to an analysis of the source's table: the new graph draws none until one is chosen.
    fit: { ...source.fit, analysisId: null },
    groupOrder: source.groupOrder.flatMap((g) => (to.has(g) ? [to.get(g)!] : [])),
    legend: { ...portable.legend, hiddenGroupIds: source.legend.hiddenGroupIds.flatMap((g) => (to.has(g) ? [to.get(g)!] : [])) },
    defaults: structuredClone(source.defaults),
    layers,
    hiddenLayerIds: source.hiddenLayerIds.flatMap((l) => mapId(l) ?? []),
    rangeExcludedLayerIds: source.rangeExcludedLayerIds.flatMap((l) => mapId(l) ?? []),
    layerOrder: source.layerOrder.flatMap((l) => mapId(l) ?? []),
    layerStyles: mapObjects(source.layerStyles),
  };
}

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
const GENERAL: ReadonlyArray<keyof Chart> = ['widthPx', 'heightPx', 'aspect', 'showTitle', 'titleFontSizePt', 'titleBold', 'titleOffsetPt', 'fontFamily', 'textColor', 'axisColor', 'axisOpacity', 'plotColor', 'pageColor', 'frame', 'grid', 'jitter'];
/** Also followed when the two graphs show tables of the same type. */
const SAME_TYPE: ReadonlyArray<keyof Chart> = ['paletteId', 'orientation', 'lineOrder', 'lineConnect', 'traceOffset', 'sizeLegend', 'groupedBy', 'bars', 'barLabels', 'distribution', 'pairs', 'heatmap', 'histogram', 'pie', 'survival', 'defaults'];
/** Parts of an axis, the legend and the fit that belong to the data and are never inherited. */
const AXIS_OWN = ['title', 'min', 'max', 'majorInterval', 'breaks', 'scale', 'reverse', 'extraTicks'] as const;
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
    // The thresholds of a volcano plot are followed; the ids of the lines that belong to each graph are not, and the lines move with the thresholds.
    set('volcano', mergeApart(c.volcano, b.volcano, a.volcano, ['lineIds']));
    if (out.volcano !== undefined && out.volcano !== c.volcano) out.referenceLines = followThresholds(child.referenceLines, out.volcano as Chart['volcano']);
    set('fit', mergeApart(c.fit, b.fit, a.fit, FIT_OWN));
    // The style of each data set follows the data set in the same position of the source's table.
    const to = dataSetMap(sourceTable, table);
    const translate = (rec: Record<Id, unknown>): Record<Id, unknown> => Object.fromEntries(Object.entries(rec).flatMap(([k, v]) => (to.has(k) ? [[to.get(k)!, v] as const] : [])));
    // The parts the source hid, and the looks it gave to parts, follow too, on the parts of the same data sets (and the whole-graph parts) of this graph.
    const mapPart = layerIdMap(before.id, child.id, to);
    const parts = (ids: readonly Id[]): Id[] => ids.flatMap((l) => mapPart(l) ?? []);
    const looks = (rec: Record<Id, unknown>): Record<Id, unknown> => Object.fromEntries(Object.entries(rec).flatMap(([k, v]) => { const m = mapPart(k); return m ? [[m, v] as const] : []; }));
    set('hiddenLayerIds', merge3(c.hiddenLayerIds, parts(before.hiddenLayerIds), parts(after.hiddenLayerIds)));
    set('rangeExcludedLayerIds', merge3(c.rangeExcludedLayerIds, parts(before.rangeExcludedLayerIds), parts(after.rangeExcludedLayerIds)));
    set('layerStyles', merge3(c.layerStyles, looks(before.layerStyles), looks(after.layerStyles)));
    const [own0, before0, after0] = [dataLayer(child), dataLayer(before), dataLayer(after)];
    if (own0 && before0 && after0) {
      let style = merge3(own0.style, before0.style, after0.style);
      // The type is the graph's own and is not followed, so neither are the switches that a type sets (a bar chart with no bars).
      if (before.type !== after.type) {
        const restored: Record<string, unknown> = { ...(style as object) };
        for (const k of [...PRESET_KEYS, 'showRawPoints'] as const) {
          if (own0.style[k] === undefined) delete restored[k];
          else restored[k] = own0.style[k];
        }
        style = equal(restored, own0.style) ? own0.style : (restored as typeof style);
      }
      const groupOverrides = merge3(own0.groupOverrides, translate(before0.groupOverrides), translate(after0.groupOverrides));
      // What the summary of the data (the kind of error bar, the centre) is set to follows too, for the whole graph and for the data sets.
      const summary = merge3(own0.summary, before0.summary, after0.summary);
      const groupSummary = merge3(own0.groupSummary, translate(before0.groupSummary), translate(after0.groupSummary));
      if (style !== own0.style || groupOverrides !== own0.groupOverrides || summary !== own0.summary || groupSummary !== own0.groupSummary) {
        out.layers = [{ ...own0, style, groupOverrides, summary, groupSummary }];
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
