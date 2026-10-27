import { chartFamily, leadingColumns } from './chartTypes';
import { centreLower } from '../../stats/summary';
import { resolveStyle, dataLayer } from './style';
import { resolveSummary } from './summary';
import { layoutOf, xySeries } from '../table/tableLayout';
import type { Chart, ChartStyle, DataTable, Id, LayerStyle, LineStyle, SymbolShape } from '../types';

/**
 * The graphical layers of a chart (roadmap P1). The layers are derived from the chart and its table, not stored; what the user
 * decides about them (hidden, kept out of the axis range, their own look, their order) is kept on the chart by layer ID. XY,
 * survival, column and grouped charts are drawn from them; histogram, pie and heat map follow.
 */
export type LayerKind = 'atRisk' | 'band' | 'area' | 'bars' | 'distribution' | 'meanLine' | 'pairLines' | 'labels' | 'titles' | 'colourBar' | 'rawPoints' | 'points' | 'line' | 'errorBars' | 'fitCurve' | 'fitBand' | 'referenceLine' | 'annotation';

/** What a layer's numbers come from; a calculation is keyed by what it is computed from, never by how the layer is styled. */
type CalcRef = { kind: 'summary'; seriesId: Id } | { kind: 'survival'; seriesId: Id } | { kind: 'curvefit'; analysisId: Id };

export interface LayerSpec {
  /** Stable: made from the series or object it belongs to and the kind, so it survives renaming, restyling and reordering. */
  id: Id;
  kind: LayerKind;
  /** The table series the layer is bound to; null for a layer of the chart as a whole (reference lines, annotations). */
  binding: { tableId: Id; seriesId: Id } | null;
  calc: CalcRef | null;
  /** Switched off, the layer takes no part in the calculation (n, denominators, correction families). */
  enabled: boolean;
  /** Hidden, the layer is not drawn but everything it calculates stays as it was. */
  visible: boolean;
  /** Whether the layer's values are part of what the axis range is fitted to (XY charts read it for the points, the individual values, the error bars and the fit curve). */
  rangeContribution: boolean;
  /** Drawing order, lowest first. */
  z: number;
}

/** Whether a layer can be given a look of its own (XY and survival charts; the others draw in the look of the data set). */
export const layerStylesAvailable = (chart: Chart): boolean => ['xy', 'survival'].includes(chartFamily(chart.type));

/**
 * The layers of an XY or survival chart, lowest first: reference lines, then kind by kind over all series the line, the fit band, the fit
 * curve, the error bars, the individual values and the points (the individual values and points first when the chart puts lines on top), then annotations. This is the
 * order the XY drawing (xy/xyScene.ts) is made in. A survival chart has the confidence band, the curve, the error bars (standard errors), the
 * censor marks and, when asked for, the at-risk table. A layer whose ID is in `chart.hiddenLayerIds` is not visible.
 */
export function layersOf(chart: Chart, table: DataTable): LayerSpec[] {
  if (chartFamily(chart.type) === 'column') return finishLayers(chart, columnLayers(chart, table));
  if (chartFamily(chart.type) === 'grouped') return finishLayers(chart, groupedLayers(chart, table));
  if (chartFamily(chart.type) === 'histogram') return finishLayers(chart, histogramLayers(chart, table));
  if (chartFamily(chart.type) === 'pie') return finishLayers(chart, pieLayers(chart, table));
  if (chartFamily(chart.type) === 'heatmap') return finishLayers(chart, heatLayers(chart, table));
  const out: Array<Omit<LayerSpec, 'z'>> = [];
  const bound = (seriesId: Id) => ({ tableId: table.id, seriesId });
  const calc = layoutOf(table).kind !== 'single';
  const analysisId = chart.fit.analysisId;

  for (const r of chart.referenceLines) {
    out.push({ id: `${r.id}:referenceLine`, kind: 'referenceLine', binding: null, calc: null, enabled: true, visible: true, rangeContribution: false });
  }
  const series = xySeries(table).map((s, i) => ({ s, style: resolveStyle(chart, dataLayer(chart), { id: s.id, paletteIndex: s.columns[0].seriesSlot ?? i }) }));
  /** One layer of each series, in series order: the drawing goes kind by kind, as the XY scene does. */
  const ofKind = (kind: LayerKind, visible: (st: ChartStyle) => boolean, rangeContribution: (st: ChartStyle) => boolean, ref: (id: Id) => CalcRef | null = () => null) =>
    series.map(({ s, style }) => ({ id: `${s.id}:${kind}`, kind, binding: bound(s.id), calc: ref(s.id), enabled: true, visible: visible(style), rangeContribution: rangeContribution(style) }));
  const yes = () => true;
  const fitRef = (): CalcRef | null => (analysisId === null ? null : { kind: 'curvefit', analysisId });
  // With replicates the points are the centres (mean or median) of each row: their layer is bound to the summary calculation.
  const summaryRef = (id: Id): CalcRef | null => (calc ? { kind: 'summary', seriesId: id } : null);
  const survival = chartFamily(chart.type) === 'survival';
  const kmRef = (id: Id): CalcRef => ({ kind: 'survival', seriesId: id });
  const no = () => false;
  const points = ofKind('points', (st) => st.showSymbols, yes, survival ? kmRef : summaryRef);
  // Every replicate of a row, behind the centres; only a table of replicates has them, and they are off until asked for.
  const raw = !survival && layoutOf(table).kind === 'replicates' ? ofKind('rawPoints', (st) => st.showRawPoints, (st) => st.showRawPoints) : [];
  const parts = survival ? [
    // The survival axes are fixed (time from 0, fraction 0 to 1), so the band and the error bars never feed them.
    ...ofKind('band', () => chart.survival.band, no, kmRef),
    ...ofKind('line', (st) => st.showLines, yes, kmRef),
    ...ofKind('errorBars', () => chart.survival.errorBars, no, kmRef),
  ] : [
    // The area under the curve is behind its outline; it has no switch in Style, only the layer's own visibility.
    ...(chart.type === 'xyArea' ? ofKind('area', yes, yes) : []),
    ...ofKind('line', (st) => st.showLines, yes),
    // The band is not part of the range: a wide band is cut off by the plot.
    ...(analysisId !== null && chart.fit.band !== 'none' ? ofKind('fitBand', yes, () => false, fitRef) : []),
    ...(analysisId !== null ? ofKind('fitCurve', yes, yes, fitRef) : []),
    // A single Y per row has no spread to draw.
    ...(calc ? ofKind('errorBars', (st) => st.showErrorBars, (st) => st.showErrorBars, (id) => ({ kind: 'summary', seriesId: id })) : []),
  ];
  out.push(...(chart.lineOrder === 'onTop' ? [...raw, ...points, ...parts] : [...parts, ...raw, ...points]));
  // The table of subjects at risk under the plot: its room is kept when it is hidden, so hiding it moves nothing.
  if (survival) out.push({ id: `${chart.id}:atRisk`, kind: 'atRisk', binding: null, calc: null, enabled: true, visible: chart.survival.atRisk, rangeContribution: false });
  for (const a of chart.annotations) {
    out.push({ id: `${a.id}:annotation`, kind: 'annotation', binding: null, calc: null, enabled: true, visible: true, rangeContribution: false });
  }
  return finishLayers(chart, out);
}

/** What every family does with its list of layers: the order the user chose, what is hidden or kept out of the axis range, and the drawing order. */
function finishLayers(chart: Chart, out: Array<Omit<LayerSpec, 'z'>>): LayerSpec[] {
  // The data layers can be put in another order; the others (reference lines, annotations, the at-risk table) stay where they are.
  const placed = applyLayerOrder(out, chart.layerOrder);
  // Any layer can be hidden by its ID; hiding only ever takes a layer out of the drawing.
  const hidden = new Set(chart.hiddenLayerIds);
  // A layer can also be kept out of the axis range by ID; unlike hiding, that changes the axis and nothing else.
  const outOfRange = new Set(chart.rangeExcludedLayerIds);
  return placed.map((l, z) => ({ ...l, visible: l.visible && !hidden.has(l.id), rangeContribution: l.rangeContribution && !outOfRange.has(l.id), z }));
}

/**
 * The layers of a pie or doughnut chart, lowest first: for each part (outcome) its slices in all the pies, then for each part the
 * text beside its slices, then the titles and totals of the pies, then annotations. The parts that are hidden from the chart have
 * none. There are no reference lines: a pie has no axes to put them on.
 */
function pieLayers(chart: Chart, table: DataTable): Array<Omit<LayerSpec, 'z'>> {
  const hiddenParts = new Set(chart.hiddenGroupIds);
  const layer = dataLayer(chart);
  const parts = table.groups.slice(leadingColumns(table.kind)).filter((g) => !hiddenParts.has(g.id));
  void layer;
  const perPart = (kind: LayerKind, visible: boolean) => parts.map((g) => ({ id: `${g.id}:${kind}`, kind, binding: { tableId: table.id, seriesId: g.id }, calc: null, enabled: true, visible, rangeContribution: false }));
  return [
    ...perPart('bars', true),
    ...perPart('labels', chart.pie.labels !== 'none'),
    { id: `${chart.id}:titles`, kind: 'titles' as LayerKind, binding: null, calc: null, enabled: true, visible: true, rangeContribution: false },
    ...chart.annotations.map((a) => ({ id: `${a.id}:annotation`, kind: 'annotation' as LayerKind, binding: null, calc: null, enabled: true, visible: true, rangeContribution: false })),
  ];
}

/**
 * The layers of a heat map, lowest first: the cells, the numbers in them, the colour bar, then annotations. They belong to the
 * chart as a whole: a cell is a cell of the grid, not of one series. There are no reference lines.
 */
function heatLayers(chart: Chart, table: DataTable): Array<Omit<LayerSpec, 'z'>> {
  const whole = (kind: LayerKind, visible: boolean) => ({ id: `${chart.id}:${kind}`, kind, binding: null, calc: null, enabled: true, visible, rangeContribution: false });
  void table;
  return [
    whole('bars', true),
    whole('labels', chart.heatmap.showValues),
    whole('colourBar', chart.heatmap.colourbar),
    ...chart.annotations.map((a) => ({ id: `${a.id}:annotation`, kind: 'annotation' as LayerKind, binding: null, calc: null, enabled: true, visible: true, rangeContribution: false })),
  ];
}

/**
 * The layers of a histogram or a cumulative distribution, lowest first: reference lines, then kind by kind over all data sets the bars
 * of a histogram, or the steps of a distribution and the symbols on them (the symbols first when the chart puts lines on top), then
 * annotations.
 */
function histogramLayers(chart: Chart, table: DataTable): Array<Omit<LayerSpec, 'z'>> {
  const histogram = chart.type === 'histogram';
  const layer = dataLayer(chart);
  const sets = table.groups.map((group, i) => ({ group, style: resolveStyle(chart, layer, { id: group.id, paletteIndex: group.paletteIndex ?? i }) }));
  const perSet = (kind: LayerKind, on: boolean, visible: (st: ChartStyle) => boolean) =>
    on ? sets.map(({ group, style }) => ({ id: `${group.id}:${kind}`, kind, binding: { tableId: table.id, seriesId: group.id }, calc: null, enabled: true, visible: visible(style), rangeContribution: true })) : [];
  const bars = perSet('bars', histogram, (st) => st.showBars);
  const steps = perSet('line', !histogram, (st) => st.showLines);
  // The symbols of a cumulative distribution are asked for by its own setting as well as by the style of the data set.
  const symbols = perSet('points', !histogram, (st) => st.showSymbols || chart.histogram.ecdfSymbols);
  return [
    ...chart.referenceLines.map((r) => ({ id: `${r.id}:referenceLine`, kind: 'referenceLine' as LayerKind, binding: null, calc: null, enabled: true, visible: true, rangeContribution: false })),
    ...bars,
    ...(chart.lineOrder === 'onTop' ? [...symbols, ...steps] : [...steps, ...symbols]),
    ...chart.annotations.map((a) => ({ id: `${a.id}:annotation`, kind: 'annotation' as LayerKind, binding: null, calc: null, enabled: true, visible: true, rangeContribution: false })),
  ];
}

/** Whether the chart asks for labels on its bars, beyond or inside them. */
const hasBarLabels = (chart: Chart): boolean => chart.barLabels.show !== 'none' || !!chart.barLabels.inside;

/**
 * The layers of a grouped or contingency chart, lowest first: reference lines, then kind by kind over all series the bars (the box or
 * violin of a box plot or violin chart is part of them), the lines across the bars (the centre of each bar), the line of a chart of
 * lines, the error bars, the means of a chart of lines and the individual values over bars, in the order the chart puts lines over or
 * under the symbols, then annotations. The layers of a kind that the chart type cannot draw are not there.
 */
function groupedLayers(chart: Chart, table: DataTable): Array<Omit<LayerSpec, 'z'>> {
  const type = chart.type;
  const layer = dataLayer(chart);
  const series = xySeries(table).map((s, i) => ({ s, style: resolveStyle(chart, layer, { id: s.id, paletteIndex: s.columns[0].seriesSlot ?? i }) }));
  const perSeries = (kind: LayerKind, on: boolean, visible: (st: ChartStyle) => boolean, calc = false) =>
    on ? series.map(({ s, style }) => ({ id: `${s.id}:${kind}`, kind, binding: { tableId: table.id, seriesId: s.id }, calc: calc ? ({ kind: 'summary', seriesId: s.id } as CalcRef) : null, enabled: true, visible: visible(style), rangeContribution: true })) : [];
  const dist = type === 'groupedBox' || type === 'groupedViolin';
  const bars = perSeries('bars', type !== 'groupedLine', (st) => st.showBars, true);
  const centres = perSeries('meanLine', type === 'groupedBar' || type === 'groupedFloating', (st) => st.showMeanLine, true);
  const line = perSeries('line', type === 'groupedLine', (st) => st.showLines, true);
  const errors = perSeries('errorBars', type === 'groupedBar' || type === 'groupedLine', (st) => st.showErrorBars, true);
  const means = perSeries('points', type === 'groupedLine', (st) => st.showSymbols);
  const values = perSeries('rawPoints', type === 'groupedBar' || type === 'groupedFloating' || dist, (st) => st.showSymbols);
  const body = [...bars, ...centres];
  const lines = [...line, ...errors];
  const symbols = [...means, ...values];
  const parts = chart.lineOrder === 'onTop' ? [...body, ...symbols, ...lines] : chart.lineOrder === 'underneath' ? [...lines, ...body, ...symbols] : [...body, ...lines, ...symbols];
  // The labels of the bars (side by side bars only): above everything else the chart draws from its series.
  const labels = series.length > 0 && hasBarLabels(chart) && type !== 'groupedLine' ? series.map(({ s }) => ({ id: `${s.id}:labels`, kind: 'labels' as LayerKind, binding: { tableId: table.id, seriesId: s.id }, calc: null, enabled: true, visible: true, rangeContribution: false })) : [];
  return [
    ...chart.referenceLines.map((r) => ({ id: `${r.id}:referenceLine`, kind: 'referenceLine' as LayerKind, binding: null, calc: null, enabled: true, visible: true, rangeContribution: false })),
    ...parts,
    ...labels,
    ...chart.annotations.map((a) => ({ id: `${a.id}:annotation`, kind: 'annotation' as LayerKind, binding: null, calc: null, enabled: true, visible: true, rangeContribution: false })),
  ];
}

/**
 * The layers of a chart over the columns of a table (bars, dots, means, boxes, violins, floating bars, paired plots), lowest first:
 * reference lines, then kind by kind over all data sets the body (bars, then the box or violin), the lines, the error bars, the mean
 * lines and the points, in the order the chart puts lines over or under the symbols, then annotations. The layers of a kind that the
 * chart type cannot draw are not there. The drawing of a column chart goes in this order (see chart/column/columnMarks.ts).
 */
function columnLayers(chart: Chart, table: DataTable): Array<Omit<LayerSpec, 'z'>> {
  const type = chart.type;
  const dist = type === 'box' || type === 'violin' || type === 'floating';
  const style = dataLayer(chart);
  const groups = table.groups.map((group) => ({ group, style: resolveStyle(chart, style, group) }));
  const perGroup = (kind: LayerKind, on: boolean, visible: (st: ChartStyle) => boolean, calc = false, ends = 0) =>
    on
      ? groups.slice(0, groups.length - ends).map(({ group, style: st }) => ({ id: `${group.id}:${kind}`, kind, binding: { tableId: table.id, seriesId: group.id }, calc: calc ? ({ kind: 'summary', seriesId: group.id } as CalcRef) : null, enabled: true, visible: visible(st), rangeContribution: true }))
      : [];
  const bars = perGroup('bars', type !== 'violin', (st) => st.showBars, true);
  const body = perGroup('distribution', dist, () => true, true);
  const pairLines =
    type === 'paired' && groups.length > 0
      ? [{ id: `${chart.id}:pairLines`, kind: 'pairLines' as LayerKind, binding: null, calc: null, enabled: true, visible: groups[0].style.showLines, rangeContribution: true }]
      : [];
  const joins = perGroup('line', type === 'mean', (st) => st.showLines, true, 1);
  const errors = perGroup('errorBars', !dist, (st) => st.showErrorBars, true);
  const means = perGroup('meanLine', type === 'scatter' || type === 'paired', (st) => st.showMeanLine, true);
  const points = perGroup('points', true, (st) => st.showSymbols);
  const lines = [...pairLines, ...joins, ...errors, ...means];
  // The labels of the bars: above everything else the chart draws from its data sets.
  const labels = hasBarLabels(chart) ? groups.map(({ group }) => ({ id: `${group.id}:labels`, kind: 'labels' as LayerKind, binding: { tableId: table.id, seriesId: group.id }, calc: null, enabled: true, visible: true, rangeContribution: false })) : [];
  const parts = chart.lineOrder === 'onTop' ? [...bars, ...body, ...points, ...lines] : chart.lineOrder === 'underneath' ? [...lines, ...bars, ...body, ...points] : [...bars, ...body, ...lines, ...points];
  return [
    ...chart.referenceLines.map((r) => ({ id: `${r.id}:referenceLine`, kind: 'referenceLine' as LayerKind, binding: null, calc: null, enabled: true, visible: true, rangeContribution: false })),
    ...parts,
    ...labels,
    ...chart.annotations.map((a) => ({ id: `${a.id}:annotation`, kind: 'annotation' as LayerKind, binding: null, calc: null, enabled: true, visible: true, rangeContribution: false })),
  ];
}

/** The kinds of layer that are drawn from the data of a series: the ones that can be put in another order. */
export const ORDERABLE_LAYER_KINDS: ReadonlyArray<LayerKind> = ['band', 'area', 'bars', 'distribution', 'pairLines', 'line', 'fitBand', 'fitCurve', 'errorBars', 'meanLine', 'rawPoints', 'points', 'labels', 'titles', 'colourBar'];

/**
 * The order of the chart's own kinds of layer, with the order the user chose over it. `stored` lists IDs, lowest first: those that
 * are still layers keep that order, and a layer that is not listed (a series or a fit that was added since) goes right above the
 * layer below it in the order of the chart type. IDs that are no longer layers are ignored.
 */
export function mergeLayerOrder(defaults: ReadonlyArray<Id>, stored: ReadonlyArray<Id>): Id[] {
  const known = new Set(defaults);
  const result = [...new Set(stored)].filter((id) => known.has(id));
  const present = new Set(result);
  defaults.forEach((id, i) => {
    if (present.has(id)) return;
    let below = i - 1;
    while (below >= 0 && !present.has(defaults[below])) below--;
    result.splice(below < 0 ? 0 : result.indexOf(defaults[below]) + 1, 0, id);
    present.add(id);
  });
  return result;
}

/** The layers with the orderable ones in the stored order, each in the place one of them had; the others stay put. */
function applyLayerOrder<T extends { id: Id; kind: LayerKind }>(layers: T[], stored: ReadonlyArray<Id>): T[] {
  if (stored.length === 0) return layers;
  const orderable = layers.filter((l) => ORDERABLE_LAYER_KINDS.includes(l.kind));
  const byId = new Map(orderable.map((l) => [l.id, l]));
  const next = mergeLayerOrder(orderable.map((l) => l.id), stored).map((id) => byId.get(id)!);
  let at = 0;
  return layers.map((l) => (ORDERABLE_LAYER_KINDS.includes(l.kind) ? next[at++] : l));
}

/** What a kind of layer is called on screen. */
const LAYER_NAMES: Record<LayerKind, string> = {
  atRisk: 'At-risk table',
  band: 'Confidence band',
  area: 'Area',
  labels: 'Labels',
  titles: 'Titles',
  colourBar: 'Colour bar',
  bars: 'Bars',
  distribution: 'Box and whiskers',
  meanLine: 'Mean line',
  pairLines: 'Lines joining the rows',
  rawPoints: 'Individual values',
  points: 'Points',
  line: 'Line',
  errorBars: 'Error bars',
  fitCurve: 'Fit curve',
  fitBand: 'Fit band',
  referenceLine: 'Reference line',
  annotation: 'Annotation',
};

/** The kinds of layer whose values the axis range reads, and so can be left out of it. */
const RANGE_KINDS: ReadonlyArray<LayerKind> = ['points', 'rawPoints', 'errorBars', 'fitCurve'];

export interface LayerRow {
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

/** The layers of an XY or survival chart as the inspector lists them, topmost first. */
export function layerRows(chart: Chart, table: DataTable, seriesName: (id: Id, fallback: string) => string = (_, f) => f): LayerRow[] {
  const names = new Map(xySeries(table).map((s) => [s.id, s.name]));
  // The visibility the style gives, before anything is hidden by ID, tells a layer that is off by its style from one that is hidden.
  const byStyle = new Map(layersOf({ ...chart, hiddenLayerIds: [] }, table).map((l) => [l.id, l.visible]));
  const byRange = new Map(layersOf({ ...chart, rangeExcludedLayerIds: [] }, table).map((l) => [l.id, l.rangeContribution]));
  const family = chartFamily(chart.type);
  const lineOf = new Map(chart.referenceLines.map((r) => [`${r.id}:referenceLine`, r]));
  const noteOf = new Map(chart.annotations.map((a) => [`${a.id}:annotation`, a]));
  const labelOf = (layer: LayerSpec): string => {
    const r = lineOf.get(layer.id);
    if (r) return `${LAYER_NAMES.referenceLine}: ${r.axis.toUpperCase()} = ${r.value}`;
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
        inRange: family === 'xy' && RANGE_KINDS.includes(layer.kind) && rangeByStyle ? layer.rangeContribution : null,
        label: labelOf(layer),
        shown: layer.visible,
        takes: layerStylesAvailable(chart) ? STYLABLE_LAYERS[layer.kind] ?? null : null,
        canMoveUp: at >= 0 && at < orderable.length - 1,
        canMoveDown: at > 0,
        canToggle: styleOn,
        reason: styleOn ? null : 'Switched off in Style',
      };
    });
}

/** Which layers take a look of their own, and which settings of it. */
const STYLABLE_LAYERS: Partial<Record<LayerKind, ReadonlyArray<keyof LayerStyle>>> = {
  band: ['color', 'opacity'],
  area: ['color', 'opacity'],
  line: ['color', 'widthPt', 'lineStyle', 'opacity'],
  errorBars: ['color', 'widthPt', 'opacity'],
  points: ['color', 'widthPt', 'opacity', 'shape'],
  rawPoints: ['color', 'widthPt', 'opacity', 'shape'],
  fitCurve: ['color', 'widthPt', 'lineStyle', 'opacity'],
  fitBand: ['color', 'opacity'],
};

/**
 * The settings of a series that a setting of its layer stands for. A layer's own setting wins over the series' (the most specific
 * wins); a later edit of the series' setting for the whole series or for all series takes the layer's own back (clearPartStyles).
 */
const PART_KEYS: Partial<Record<LayerKind, Partial<Record<keyof LayerStyle, ReadonlyArray<keyof ChartStyle>>>>> = {
  line: { color: ['lineColor'], widthPt: ['lineWidthPt'], lineStyle: ['lineStyle'], opacity: ['lineOpacity'] },
  errorBars: { color: ['errorColor'], widthPt: ['errorLineWidthPt'], opacity: ['errorOpacity'] },
  points: { color: ['symbolColor', 'symbolBorderColor'], widthPt: ['symbolBorderWidthPt'], opacity: ['symbolFillOpacity'], shape: ['symbolShape'] },
  rawPoints: { color: ['symbolColor', 'symbolBorderColor'], widthPt: ['symbolBorderWidthPt'], opacity: ['symbolFillOpacity'], shape: ['symbolShape'] },
  fitCurve: { color: ['lineColor'], widthPt: ['lineWidthPt'], lineStyle: ['lineStyle'] },
  fitBand: { color: ['lineColor'] },
  band: { color: ['lineColor'] },
  area: { color: ['lineColor'] },
};

/** The layers drawn in the look of their series with the layer's own settings over it (the others have a look of their own, see layerLook). */
const SERIES_LOOK_KINDS: ReadonlyArray<LayerKind> = ['line', 'errorBars', 'points', 'rawPoints'];

const SYMBOL_SHAPES: ReadonlyArray<SymbolShape> = ['circle', 'square', 'triangle', 'triangleDown', 'diamond', 'hexagon', 'star', 'target', 'plus', 'cross', 'asterisk'];

/** The look of a series with the layer's own settings over it: what a line, error bar, point or individual value is drawn in. */
export function partStyle(chart: Chart, layerId: Id, style: ChartStyle): ChartStyle {
  const own = chart.layerStyles[layerId];
  const kind = layerKindOf(layerId);
  const keys = own && kind && SERIES_LOOK_KINDS.includes(kind) ? PART_KEYS[kind] : undefined;
  if (!own || !keys) return style;
  const out: Record<string, unknown> = { ...style };
  for (const [setting, value] of Object.entries(own)) for (const key of keys[setting as keyof LayerStyle] ?? []) out[key] = value;
  return out as unknown as ChartStyle;
}

/** The look the Layers section shows for a layer that takes one: its own settings, else those of its series. */
export function layerEditLook(chart: Chart, layerId: Id, style: ChartStyle): LayerStyle {
  const kind = layerKindOf(layerId);
  if (!kind || !SERIES_LOOK_KINDS.includes(kind)) return layerLook(chart, layerId, style);
  const ps = partStyle(chart, layerId, style);
  const keys = PART_KEYS[kind] ?? {};
  const at = <T,>(setting: keyof LayerStyle, fallback: T): T => {
    const key = keys[setting]?.[0];
    return key ? ((ps as unknown as Record<string, T>)[key] ?? fallback) : fallback;
  };
  return { color: at('color', ps.lineColor), widthPt: at('widthPt', ps.lineWidthPt), lineStyle: at('lineStyle', ps.lineStyle), opacity: at('opacity', 1), shape: at('shape', ps.symbolShape) };
}

/**
 * The layer styles with the settings taken back that a later edit of the series' own look has replaced: the latest edit wins.
 * `scope` is 'all' or one series ID; `changed` the settings of the series that were edited ('every' when its look is reset). The same object when nothing is taken.
 */
export function clearPartStyles(styles: Record<Id, Partial<LayerStyle>>, scope: 'all' | Id, changed: ReadonlyArray<keyof ChartStyle> | 'every'): Record<Id, Partial<LayerStyle>> {
  let next = styles;
  for (const [id, own] of Object.entries(styles)) {
    if (scope !== 'all' && !id.startsWith(`${scope}:`)) continue;
    const kind = layerKindOf(id);
    const keys = kind ? PART_KEYS[kind] : undefined;
    if (!keys) continue;
    const drop = (Object.keys(own) as Array<keyof LayerStyle>).filter((setting) => changed === 'every' || (keys[setting] ?? []).some((key) => changed.includes(key)));
    if (drop.length === 0) continue;
    if (next === styles) next = { ...styles };
    const rest = { ...own };
    for (const setting of drop) delete rest[setting];
    if (Object.keys(rest).length > 0) next[id] = rest;
    else delete next[id];
  }
  return next;
}

const LAYER_STYLE_LIMITS = { widthPt: { min: 0.2, max: 40 }, opacity: { min: 0, max: 1 } } as const;
export const DEFAULT_BAND_OPACITY = 0.2;
const LINE_STYLE_VALUES: readonly LineStyle[] = ['solid', 'longDash', 'dashed', 'dotted', 'dashDot', 'dashDotDot'];

/** The layer kind of a layer ID (`${object id}:${kind}`), or null. */
const layerKindOf = (layerId: Id): LayerKind | null => {
  const kind = layerId.slice(layerId.lastIndexOf(':') + 1);
  return kind in LAYER_NAMES ? (kind as LayerKind) : null;
};

/** Layer styles from a file or a patch: only the settings the layer's kind takes, each valid; the number of settings dropped. */
export function sanitizeLayerStyles(raw: unknown): { styles: Record<Id, Partial<LayerStyle>>; dropped: number } {
  const styles: Record<Id, Partial<LayerStyle>> = {};
  let dropped = 0;
  if (raw === undefined || raw === null) return { styles, dropped };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { styles, dropped: 1 };
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    const kind = layerKindOf(id);
    const allowed = kind ? STYLABLE_LAYERS[kind] ?? [] : [];
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      dropped++;
      continue;
    }
    const out: Partial<LayerStyle> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      const k = key as keyof LayerStyle;
      const ok =
        allowed.includes(k) &&
        ((k === 'color' && typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v)) ||
          (k === 'widthPt' && typeof v === 'number' && Number.isFinite(v) && v >= (kind === 'points' || kind === 'rawPoints' ? 0 : LAYER_STYLE_LIMITS.widthPt.min) && v <= LAYER_STYLE_LIMITS.widthPt.max) ||
          (k === 'lineStyle' && LINE_STYLE_VALUES.includes(v as LineStyle)) ||
          (k === 'shape' && SYMBOL_SHAPES.includes(v as SymbolShape)) ||
          (k === 'opacity' && typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1));
      if (!ok) {
        dropped++;
        continue;
      }
      (out as Record<string, unknown>)[k] = k === 'color' ? (v as string).toLowerCase() : v;
    }
    if (Object.keys(out).length > 0) styles[id] = out;
  }
  return { styles, dropped };
}

/** The look of one layer of a series: its own settings over the series' line style, and over the default band opacity. */
export function layerLook(chart: Chart, layerId: Id, series: Pick<ChartStyle, 'lineColor' | 'lineWidthPt' | 'lineStyle'>): LayerStyle {
  const own = chart.layerStyles[layerId] ?? {};
  return {
    color: own.color ?? series.lineColor,
    widthPt: own.widthPt ?? series.lineWidthPt,
    lineStyle: own.lineStyle ?? series.lineStyle,
    // A band is see-through unless asked otherwise; the fit curve is a line and starts opaque.
    opacity: own.opacity ?? (layerKindOf(layerId) === 'fitCurve' ? 1 : DEFAULT_BAND_OPACITY),
  };
}
