import { chartFamily } from '../chartTypes';
import { centreLower } from '../../../stats/summary';
import { dataLayer } from '../style';
import { resolveSummary } from '../summary';
import { xySeries } from '../../table/tableLayout';
import type { Chart, ChartType, DataTable, Id, LayerStyle } from '../../types';
import { layerStylesAvailable, LAYER_NAMES, layersOf, ORDERABLE_LAYER_KINDS, type LayerKind, type LayerSpec } from './layerList';
import { lookKeysOf } from './layerLooks';
import { RESULT_STATS, resultValue } from '../resultTokens';

/**
 * The kinds of layer whose values the axis range reads, and so can be left out of it, by chart type. A centre (the top of a bar, a mean)
 * is the chart's data and always counts, so what can be left out is what is added around it: error bars, the individual values, the body of
 * a box plot, violin or floating bar, the bars of a histogram, the steps of a cumulative distribution. Survival axes are fixed, a pie and a
 * heat map have no axis, and stacked bars are ranged by their totals.
 */
export function rangeKindsOf(type: ChartType): ReadonlyArray<LayerKind> {
  const data = dataRangeKindsOf(type);
  return data;
}

function dataRangeKindsOf(type: ChartType): ReadonlyArray<LayerKind> {
  switch (type) {
    case 'xyScatter':
    case 'xyLine':
    case 'xyLineSymbols':
    case 'xySpikes':
    case 'xyArea':
    case 'xyBars':
    case 'xyBubble':
    case 'xyVolcano':
    case 'xyOffset':
      return ['points', 'rawPoints', 'errorBars', 'xErrorBars', 'fitCurve'];
    case 'bar':
    case 'scatter':
    case 'paired':
      return ['errorBars', 'points'];
    case 'mean':
      return ['errorBars'];
    case 'box':
    case 'violin':
      return ['distribution', 'points'];
    case 'floating':
      return ['bars'];
    case 'groupedBar':
      return ['errorBars', 'rawPoints'];
    case 'groupedLine':
      return ['errorBars'];
    case 'groupedFloating':
      return ['bars'];
    case 'groupedBox':
    case 'groupedViolin':
      return ['bars', 'rawPoints'];
    case 'histogram':
      return ['bars'];
    case 'ecdf':
      return ['line'];
    default:
      return [];
  }
}

interface LayerRow {
  layer: LayerSpec;
  /** Whether the layer's values are in the axis range now; null when the layer has no say in it (or the chart's family does not read it). */
  inRange: boolean | null;
  /** "Fit band: Series A". */
  label: string;
  /** Whether the layer is drawn now. */
  shown: boolean;
  /** Which settings of its own the layer can be given; null when the chart's family does not take any. */
  takes: ReadonlyArray<keyof LayerStyle> | null;
  /** Whether the layer can go one place up or down in the order of the data layers (the others stay where they are). */
  canMoveUp: boolean;
  canMoveDown: boolean;
  /** Hiding is offered only for a data layer that the chart's style has not already switched off. */
  canToggle: boolean;
  /** Why it cannot be toggled; null when it can. */
  reason: string | null;
}

/** What the plotted point of a series with replicates is: the mean, the median, a geometric mean. */
function centreName(chart: Chart, seriesId: Id): string {
  const centre = resolveSummary(dataLayer(chart), seriesId).centre;
  return centreLower(centre).replace(/^./, (c) => c.toUpperCase());
}

const SURVIVAL_NAMES: Partial<Record<LayerKind, string>> = { line: 'Curve', points: 'Censor marks', errorBars: 'Error bars (SE)' };

/** What the parts of a pie or doughnut chart are called. */
function pieName(kind: LayerKind): string {
  return kind === 'bars' ? 'Slices' : kind === 'labels' ? 'Slice labels' : kind === 'titles' ? 'Pie titles and totals' : LAYER_NAMES[kind];
}

/** What the parts of a heat map are called. */
function heatName(kind: LayerKind): string {
  return kind === 'bars' ? 'Cells' : kind === 'labels' ? 'Values in the cells' : kind === 'colourBar' ? 'Colour bar' : LAYER_NAMES[kind];
}

/** What the parts of a histogram or a cumulative distribution are called. */
function histogramName(kind: LayerKind): string {
  return kind === 'bars' ? 'Bars' : kind === 'line' ? 'Steps' : kind === 'points' ? 'Symbols' : LAYER_NAMES[kind];
}

/** What the parts of a grouped or contingency chart are called, by chart type. */
function groupedName(chart: Chart, kind: LayerKind): string {
  const type = chart.type;
  switch (kind) {
    case 'bars':
      return type === 'groupedBox' ? 'Box and whiskers' : type === 'groupedViolin' ? 'Violin' : type === 'groupedFloating' ? 'Floating bars' : 'Bars';
    case 'meanLine':
      return type === 'groupedFloating' ? 'Centre line' : 'Mean line';
    case 'labels':
      return 'Bar labels';
    case 'line':
      return 'Line';
    case 'points':
      return 'Means';
    case 'rawPoints':
      return type === 'groupedBox' || type === 'groupedViolin' ? 'Points' : 'Individual values';
    default:
      return LAYER_NAMES[kind];
  }
}

/** What the parts of a chart over columns are called, by chart type. */
function columnName(chart: Chart, kind: LayerKind): string {
  const type = chart.type;
  switch (kind) {
    case 'bars':
      return type === 'box' ? 'Box' : type === 'floating' ? 'Floating bars' : 'Bars';
    case 'distribution':
      return type === 'violin' ? 'Violin' : type === 'floating' ? 'Centre line' : 'Whiskers and median';
    case 'labels':
      return 'Bar labels';
    case 'line':
      return 'Line joining the means';
    case 'points':
      return type === 'bar' ? 'Individual values' : type === 'mean' ? 'Means' : type === 'scatter' || type === 'paired' ? 'Dots' : 'Points';
    default:
      return LAYER_NAMES[kind];
  }
}

/** What an oblique reference line is called: "identity (Y = X)", or "Y = a + b X" with its numbers. */
function obliqueName(slope: number, intercept: number): string {
  if (slope === 1 && intercept === 0) return 'identity (Y = X)';
  return `Y = ${intercept} ${slope < 0 ? '-' : '+'} ${Math.abs(slope)} X`;
}

/** The layers of an XY or survival chart as the inspector lists them, topmost first. */
export function layerRows(chart: Chart, table: DataTable, seriesName: (id: Id, fallback: string) => string = (_, f) => f): LayerRow[] {
  const names = new Map(xySeries(table).map((s) => [s.id, s.name]));
  // The visibility the style gives, before anything is hidden by ID, tells a layer that is off by its style from one that is hidden.
  const byStyle = new Map(layersOf({ ...chart, hiddenLayerIds: [] }, table).map((l) => [l.id, l.visible]));
  const byRange = new Map(layersOf({ ...chart, rangeExcludedLayerIds: [] }, table).map((l) => [l.id, l.rangeContribution]));
  const family = chartFamily(chart.type);
  const lineOf = new Map(chart.referenceLines.map((r) => [`${r.id}:referenceLine`, r]));
  const regionOf = new Map(chart.regions.map((r) => [`${r.id}:region`, r]));
  // A line bound to a result is at that result now, not at the value stored with it (the value the line had when it was bound).
  const referenceName = (r: Chart['referenceLines'][number]): string => {
    if (!r.valueFrom) return `${r.axis.toUpperCase()} = ${r.value}`;
    const at = resultValue(table, r.valueFrom.groupId, r.valueFrom.stat);
    const what = `${RESULT_STATS.find((x) => x.id === r.valueFrom?.stat)?.label ?? r.valueFrom.stat} of ${table.groups.find((g) => g.id === r.valueFrom?.groupId)?.name ?? 'a data set that is not in the table'}`;
    return at === null ? `${r.axis.toUpperCase()} at the ${what} (not available)` : `${r.axis.toUpperCase()} = ${at} (the ${what})`;
  };
  const noteOf = new Map(chart.annotations.map((a) => [`${a.id}:annotation`, a]));
  const labelOf = (layer: LayerSpec): string => {
    const r = lineOf.get(layer.id);
    if (r) return `${LAYER_NAMES.referenceLine}: ${r.slope !== undefined ? obliqueName(r.slope, r.intercept ?? 0) : referenceName(r)}`;
    const region = regionOf.get(layer.id);
    if (region) return `${LAYER_NAMES.region}: ${region.axis.toUpperCase()} from ${Math.min(region.from, region.to)} to ${Math.max(region.from, region.to)}`;
    const a = noteOf.get(layer.id);
    if (a) {
      const text = a.text.replace(/\s+/g, ' ').trim();
      return `${LAYER_NAMES.annotation}: ${text.length > 24 ? `${text.slice(0, 24)}…` : text || '(empty)'}`;
    }
    if (layer.kind === 'atRisk') return LAYER_NAMES.atRisk;
    const sid = layer.binding?.seriesId ?? '';
    if (layer.kind === 'pairLines') return LAYER_NAMES.pairLines;
    // A layer of the chart as a whole (the titles of the pies, the cells of a heat map) has no series to name.
    if (!layer.binding) return family === 'pie' ? pieName(layer.kind) : family === 'heatmap' ? heatName(layer.kind) : LAYER_NAMES[layer.kind];
    const kind = family === 'survival' ? SURVIVAL_NAMES[layer.kind] ?? LAYER_NAMES[layer.kind] : family === 'column' ? columnName(chart, layer.kind) : family === 'grouped' ? groupedName(chart, layer.kind) : family === 'histogram' ? histogramName(layer.kind) : family === 'pie' ? pieName(layer.kind) : layer.kind === 'points' && layer.calc ? centreName(chart, sid) : LAYER_NAMES[layer.kind];
    return `${kind}: ${seriesName(sid, names.get(sid) ?? '')}`;
  };
  const all = layersOf(chart, table);
  const orderable = all.filter((l) => ORDERABLE_LAYER_KINDS.includes(l.kind)).map((l) => l.id);
  return all
    .reverse()
    .map((layer) => {
      const at = orderable.indexOf(layer.id);
      const styleOn = byStyle.get(layer.id) ?? false;
      const rangeByStyle = byRange.get(layer.id) ?? false;
      return {
        layer,
        inRange: rangeKindsOf(chart.type).includes(layer.kind) && rangeByStyle ? layer.rangeContribution : null,
        label: labelOf(layer),
        shown: layer.visible,
        takes: layerStylesAvailable(chart) ? lookKeysOf(chart.type, layer.kind) : null,
        canMoveUp: at >= 0 && at < orderable.length - 1,
        canMoveDown: at > 0,
        canToggle: styleOn,
        reason: styleOn ? null : 'Switched off in Style',
      };
    });
}
