import { chartTypeInfo, defaultChartTypeFor } from './chartTypes';
import { createChart } from './defaults';
import { newId } from './ids';
import { xySeries } from './tableLayout';
import type { AxisConfig, Chart, ChartLayer, DataTable, Id, SummarySpec } from './types';

/**
 * Which data set of `table` takes the style of which data set of `sourceTable`: matched by position. For an XY or survival
 * table the series have IDs of their own (the IDs of the layers are made from them), which are matched too.
 */
export function dataSetMap(sourceTable: DataTable, table: DataTable): Map<Id, Id> {
  const to = new Map<Id, Id>();
  sourceTable.groups.forEach((g, i) => {
    const target = table.groups[i];
    if (target) to.set(g.id, target.id);
  });
  if (table.kind === 'xy' || table.kind === 'survival') {
    const [from, into] = [xySeries(sourceTable), xySeries(table)];
    from.forEach((s, i) => {
      if (into[i]) to.set(s.id, into[i].id);
    });
  }
  return to;
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
  const axis = (from: AxisConfig, to: AxisConfig): AxisConfig => ({ ...from, title: to.title, min: null, max: null, majorInterval: null, breaks: [], scale: to.scale, reverse: to.reverse });
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
    legend: { ...source.legend, hiddenGroupIds: [] },
    jitter: { ...source.jitter },
  };
  if (!sameKind) return portable;

  const to = dataSetMap(sourceTable, table);
  /** An ID of the form `${series or data set}:${kind}` follows its series; one that belongs to a single value does not. */
  const mapId = (k: Id): Id | null => {
    const cut = k.indexOf(':');
    const target = cut > 0 ? to.get(k.slice(0, cut)) : undefined;
    return target ? `${target}${k.slice(cut)}` : null;
  };
  const mapKeys = <T,>(rec: Record<Id, T>): Record<Id, T> => Object.fromEntries(Object.entries(rec).flatMap(([k, v]) => (to.has(k) ? [[to.get(k)!, structuredClone(v)] as const] : [])));
  // Keys of single objects: `${groupId}:bar`, `:mean`, `:box` ... follow their data set; the ID of a single value does not.
  const mapObjects = <T,>(rec: Record<Id, T>): Record<Id, T> => Object.fromEntries(Object.entries(rec).flatMap(([k, v]) => {
    const id = mapId(k);
    return id ? [[id, structuredClone(v)] as const] : [];
  }));
  const layers: ChartLayer[] = source.layers.map((l) => {
    return {
      ...structuredClone(l),
      id: newId('layer'),
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
    bars: { ...source.bars },
    barLabels: { ...source.barLabels },
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
    layerStyles: mapObjects(source.layerStyles),
  };
}
