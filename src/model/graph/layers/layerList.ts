import { chartFamily } from '../chartTypes';
import { pieColumn, pieParts } from '../../table/pieParts';
import { resolveStyle, dataLayer } from '../style';
import { layoutOf, xySeries } from '../../table/tableLayout';
import { seriesPaletteIndex } from '../../table/factors';
import type { Chart, ChartStyle, DataTable, Id } from '../../types';

/**
 * The graphical layers of a chart (roadmap P1). The layers are derived from the chart and its table, not stored; what the user
 * decides about them (hidden, kept out of the axis range, their own look, their order) is kept on the chart by layer ID. Every family is
 * drawn from them. Which parts take a look (lookKeysOf) or a place in the axis range (rangeKindsOf) depends on the chart type.
 */
export type LayerKind = 'atRisk' | 'band' | 'area' | 'bars' | 'distribution' | 'meanLine' | 'pairLines' | 'labels' | 'titles' | 'colourBar' | 'rawPoints' | 'points' | 'line' | 'errorBars' | 'xErrorBars' | 'fitCurve' | 'fitBand' | 'referenceLine' | 'region' | 'annotation';

/** What a layer's numbers come from; a calculation is keyed by what it is computed from, never by how the layer is styled. */
type CalcRef = { kind: 'summary'; seriesId: Id } | { kind: 'survival'; seriesId: Id } | { kind: 'curvefit'; analysisId: Id };

export interface LayerSpec {
  /** Stable: made from the series or object it belongs to and the kind, so it survives renaming, restyling and reordering. */
  id: Id;
  kind: LayerKind;
  /** The table series the layer is bound to; null for a layer of the chart as a whole (reference lines, annotations). */
  binding: { seriesId: Id } | null;
  calc: CalcRef | null;
  /** Hidden, the layer is not drawn but everything it calculates stays as it was. */
  visible: boolean;
  /** Whether the layer's values are part of what the axis range is fitted to (see rangeKindsOf for the parts each chart type reads it for). */
  rangeContribution: boolean;
}

/**
 * Whether the parts of a chart can be given a look of their own: XY, survival, column, grouped and histogram charts. A pie draws its
 * slices in the colours of its parts and a heat map its cells in its colour scale, so neither has parts that take a look.
 */
export const layerStylesAvailable = (chart: Chart): boolean => ['xy', 'survival', 'column', 'grouped', 'histogram'].includes(chartFamily(chart.type));

/**
 * The layers of an XY or survival chart, lowest first: reference lines, then kind by kind over all series the line, the fit band, the fit
 * curve, the error bars, the individual values and the points (the individual values and points first when the chart puts lines on top), then annotations. This is the
 * order the XY drawing (xy/xyScene.ts) is made in. A survival chart has the confidence band, the curve, the error bars (standard errors), the
 * censor marks and, when asked for, the at-risk table. A layer whose ID is in `chart.hiddenLayerIds` is not visible.
 */
/** A layer of the data of one series (or data set, or outcome): its ID is made from the series and the kind. */
const bound = (seriesId: Id, kind: LayerKind, visible: boolean, rangeContribution: boolean, calc: CalcRef | null = null): LayerSpec => ({ id: `${seriesId}:${kind}`, kind, binding: { seriesId }, calc, visible, rangeContribution });

/** A layer of the chart as a whole, not of a series (the titles, the cells of a heat map, the line of a paired plot, the at-risk table). */
const whole = (chart: Chart, kind: LayerKind, visible = true, rangeContribution = false): LayerSpec => ({ id: `${chart.id}:${kind}`, kind, binding: null, calc: null, visible, rangeContribution });

/** The reference lines and the annotations, which every family lists in the same way (the lines under the data, the annotations on top). */
const referenceLineLayers = (chart: Chart): LayerSpec[] => chart.referenceLines.map((r) => ({ id: `${r.id}:referenceLine`, kind: 'referenceLine', binding: null, calc: null, visible: true, rangeContribution: false }));
const annotationLayers = (chart: Chart): LayerSpec[] => chart.annotations.map((a) => ({ id: `${a.id}:annotation`, kind: 'annotation', binding: null, calc: null, visible: true, rangeContribution: false }));

export function layersOf(chart: Chart, table: DataTable): LayerSpec[] {
  if (chartFamily(chart.type) === 'column') return finishLayers(chart, columnLayers(chart, table));
  if (chartFamily(chart.type) === 'grouped') return finishLayers(chart, groupedLayers(chart, table));
  if (chartFamily(chart.type) === 'histogram') return finishLayers(chart, histogramLayers(chart, table));
  if (chartFamily(chart.type) === 'pie') return finishLayers(chart, pieLayers(chart, table));
  if (chartFamily(chart.type) === 'heatmap') return finishLayers(chart, heatLayers(chart, table));
  const out: LayerSpec[] = [];
  // Replicates and entered summaries (and a Y with its errors entered) have a calculation behind each point; a single value, or a value with a size, has none.
  const calc = layoutOf(table).kind === 'replicates' || layoutOf(table).kind === 'summary' || layoutOf(table).kind === 'xerror';
  const analysisId = chart.fit.analysisId;

  // The shaded regions of an XY chart are behind its reference lines.
  if (chartFamily(chart.type) === 'xy') {
    for (const r of chart.regions) out.push({ id: `${r.id}:region`, kind: 'region', binding: null, calc: null, visible: true, rangeContribution: false });
  }
  out.push(...referenceLineLayers(chart));
  const series = xySeries(table).map((s, i) => ({ s, style: resolveStyle(chart, dataLayer(chart), { id: s.id, paletteIndex: s.columns[0].seriesSlot ?? s.columns[0].slot ?? i }) }));
  /** One layer of each series, in series order: the drawing goes kind by kind, as the XY scene does. */
  const ofKind = (kind: LayerKind, visible: (st: ChartStyle) => boolean, rangeContribution: (st: ChartStyle) => boolean, ref: (id: Id) => CalcRef | null = () => null) =>
    series.map(({ s, style }) => bound(s.id, kind, visible(style), rangeContribution(style), ref(s.id)));
  const yes = () => true;
  const fitRef = (): CalcRef | null => (analysisId === null ? null : { kind: 'curvefit', analysisId });
  // With replicates the points are the centres (mean or median) of each row: their layer is bound to the summary calculation.
  const summaryRef = (id: Id): CalcRef | null => (calc ? { kind: 'summary', seriesId: id } : null);
  const survival = chartFamily(chart.type) === 'survival';
  const kmRef = (id: Id): CalcRef => ({ kind: 'survival', seriesId: id });
  const no = () => false;
  const hasRaw = !survival && layoutOf(table).kind === 'replicates';
  // The symbols show the centres or the individual values, never both: while the individual values are shown, the centres have no symbol.
  const points = ofKind('points', (st) => st.showSymbols && !(hasRaw && st.showRawPoints), yes, survival ? kmRef : summaryRef);
  // Every replicate of a row; only a table of replicates has them, and they are off until asked for.
  const raw = hasRaw ? ofKind('rawPoints', (st) => st.showRawPoints, (st) => st.showRawPoints) : [];
  const parts = survival ? [
    // The survival axes are fixed (time from 0, fraction 0 to 1), so the band and the error bars never feed them.
    ...ofKind('band', () => chart.survival.band, no, kmRef),
    ...ofKind('line', (st) => st.showLines, yes, kmRef),
    ...ofKind('errorBars', () => chart.survival.errorBars, no, kmRef),
  ] : [
    // The area under the curve is behind its outline; it has no switch in Style, only the layer's own visibility.
    ...(chart.type === 'xyArea' ? ofKind('area', yes, yes) : []),
    // The bars of a chart of bars at numeric X: their baseline and their width count in the range (the bars are the data).
    ...(chart.type === 'xyBars' ? ofKind('bars', (st) => st.showBars, yes) : []),
    ...ofKind('line', (st) => st.showLines, yes),
    // The band is not part of the range: a wide band is cut off by the plot.
    ...(analysisId !== null && chart.fit.band !== 'none' ? ofKind('fitBand', yes, () => false, fitRef) : []),
    ...(analysisId !== null ? ofKind('fitCurve', yes, yes, fitRef) : []),
    // A single Y per row has no spread to draw.
    ...(calc ? ofKind('errorBars', (st) => st.showErrorBars, (st) => st.showErrorBars, (id) => ({ kind: 'summary', seriesId: id })) : []),
    // A table with an error of X entered has the bars along X as a layer of their own, switched on with the others and counted in the range like them.
    ...(layoutOf(table).kind === 'xerror' ? ofKind('xErrorBars', (st) => st.showErrorBars, (st) => st.showErrorBars) : []),
  ];
  // Underneath: the lines, the bands and the error bars go behind the bars and the area (a chart of bars at numeric X); for the others there is nothing to go under.
  const behind: ReadonlyArray<LayerKind> = ['line', 'band', 'errorBars', 'xErrorBars', 'fitBand', 'fitCurve'];
  const underneath = chart.lineOrder === 'underneath' ? [...parts.filter((l) => behind.includes(l.kind)), ...parts.filter((l) => !behind.includes(l.kind))] : parts;
  out.push(...(chart.lineOrder === 'onTop' ? [...raw, ...points, ...parts] : [...underneath, ...raw, ...points]));
  // The table of subjects at risk under the plot: its room is kept when it is hidden, so hiding it moves nothing.
  if (survival) out.push(whole(chart, 'atRisk', chart.survival.atRisk));
  out.push(...annotationLayers(chart));
  return finishLayers(chart, out);
}

/** What every family does with its list of layers: the order the user chose, what is hidden or kept out of the axis range, and the drawing order. */
function finishLayers(chart: Chart, out: LayerSpec[]): LayerSpec[] {
  // The data layers can be put in another order; the others (reference lines, annotations, the at-risk table) stay where they are.
  const placed = applyLayerOrder(out, chart.layerOrder);
  // Any layer can be hidden by its ID; hiding only ever takes a layer out of the drawing.
  const hidden = new Set(chart.hiddenLayerIds);
  // A layer can also be kept out of the axis range by ID; unlike hiding, that changes the axis and nothing else.
  const outOfRange = new Set(chart.rangeExcludedLayerIds);
  return placed.map((l) => ({ ...l, visible: l.visible && !hidden.has(l.id), rangeContribution: l.rangeContribution && !outOfRange.has(l.id) }));
}

/**
 * The layers of a pie or doughnut chart, lowest first: for each part (a row of the drawn column) its slice, then for each part the
 * text beside its slice, then the title and total of the pie, then annotations. There are no reference lines: a pie has no axes to
 * put them on.
 */
function pieLayers(chart: Chart, table: DataTable): LayerSpec[] {
  // The parts are the rows of the one column that is drawn.
  const parts = pieParts(table, pieColumn(chart, table));
  const perPart = (kind: LayerKind, visible: boolean) => parts.map((p) => bound(p.id, kind, visible, false));
  return [
    ...perPart('bars', true),
    ...perPart('labels', chart.pie.labels !== 'none'),
    whole(chart, 'titles'),
    ...annotationLayers(chart),
  ];
}

/**
 * The layers of a heat map, lowest first: the cells, the numbers in them, the colour bar, then annotations. They belong to the
 * chart as a whole: a cell is a cell of the grid, not of one series. There are no reference lines.
 */
function heatLayers(chart: Chart, table: DataTable): LayerSpec[] {
  void table;
  return [
    whole(chart, 'bars'),
    whole(chart, 'labels', chart.heatmap.showValues),
    whole(chart, 'colourBar', chart.heatmap.colourbar),
    ...annotationLayers(chart),
  ];
}

/**
 * The layers of a histogram or a cumulative distribution, lowest first: reference lines, then kind by kind over all data sets the bars
 * of a histogram, or the steps of a distribution and the symbols on them (the symbols first when the chart puts lines on top), then
 * annotations.
 */
function histogramLayers(chart: Chart, table: DataTable): LayerSpec[] {
  const histogram = chart.type === 'histogram';
  const layer = dataLayer(chart);
  const sets = table.groups.map((group, i) => ({ group, style: resolveStyle(chart, layer, { id: group.id, paletteIndex: group.paletteIndex ?? i }) }));
  const perSet = (kind: LayerKind, on: boolean, visible: (st: ChartStyle) => boolean) =>
    on ? sets.map(({ group, style }) => bound(group.id, kind, visible(style), true)) : [];
  const bars = perSet('bars', histogram, (st) => st.showBars);
  const steps = perSet('line', !histogram, (st) => st.showLines);
  // The symbols of a cumulative distribution are asked for by its own setting as well as by the style of the data set.
  const symbols = perSet('points', !histogram, (st) => st.showSymbols || chart.histogram.ecdfSymbols);
  return [
    ...referenceLineLayers(chart),
    ...bars,
    ...(chart.lineOrder === 'onTop' ? [...symbols, ...steps] : [...steps, ...symbols]),
    ...annotationLayers(chart),
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
function groupedLayers(chart: Chart, table: DataTable): LayerSpec[] {
  const type = chart.type;
  const layer = dataLayer(chart);
  const defs = xySeries(table);
  const series = defs.map((s, i) => ({ s, style: resolveStyle(chart, layer, { id: s.id, paletteIndex: seriesPaletteIndex(chart, defs.map((d) => d.columns[0]), i) }) }));
  // Error bars and individual values are part of the axis range only while they are on.
  const perSeries = (kind: LayerKind, on: boolean, visible: (st: ChartStyle) => boolean, calc = false, range: (st: ChartStyle) => boolean = () => true) =>
    on ? series.map(({ s, style }) => bound(s.id, kind, visible(style), range(style), calc ? { kind: 'summary', seriesId: s.id } : null)) : [];
  const dist = type === 'groupedBox' || type === 'groupedViolin';
  const bars = perSeries('bars', type !== 'groupedLine', (st) => st.showBars, true);
  const centres = perSeries('meanLine', type === 'groupedBar' || type === 'groupedFloating', (st) => st.showMeanLine, true);
  const line = perSeries('line', type === 'groupedLine', (st) => st.showLines, true);
  const errors = perSeries('errorBars', type === 'groupedBar' || type === 'groupedLine', (st) => st.showErrorBars, true, (st) => st.showErrorBars);
  const means = perSeries('points', type === 'groupedLine', (st) => st.showSymbols);
  const values = perSeries('rawPoints', type === 'groupedBar' || type === 'groupedFloating' || dist, (st) => st.showSymbols, false, (st) => st.showSymbols);
  const body = [...bars, ...centres];
  const lines = [...line, ...errors];
  const symbols = [...means, ...values];
  const parts = chart.lineOrder === 'onTop' ? [...body, ...symbols, ...lines] : chart.lineOrder === 'underneath' ? [...lines, ...body, ...symbols] : [...body, ...lines, ...symbols];
  // The labels of the bars (side by side bars only): above everything else the chart draws from its series.
  const labels = series.length > 0 && hasBarLabels(chart) && !['groupedLine', 'groupedFloating', 'groupedStacked', 'contingencyStacked', 'contingencyPercent'].includes(type) ? series.map(({ s }) => bound(s.id, 'labels', true, false)) : [];
  return [
    ...referenceLineLayers(chart),
    ...parts,
    ...labels,
    ...annotationLayers(chart),
  ];
}

/**
 * The layers of a chart over the columns of a table (bars, dots, means, boxes, violins, floating bars, paired plots), lowest first:
 * reference lines, then kind by kind over all data sets the body (bars, then the box or violin), the lines, the error bars, the mean
 * lines and the points, in the order the chart puts lines over or under the symbols, then annotations. The layers of a kind that the
 * chart type cannot draw are not there. The drawing of a column chart goes in this order (see chart/column/columnMarks.ts).
 */
function columnLayers(chart: Chart, table: DataTable): LayerSpec[] {
  const type = chart.type;
  const dist = type === 'box' || type === 'violin' || type === 'floating';
  const style = dataLayer(chart);
  const groups = table.groups.map((group) => ({ group, style: resolveStyle(chart, style, group) }));
  // Error bars and individual values are part of the axis range only while they are on; the rest is as the chart type gives it.
  const perGroup = (kind: LayerKind, on: boolean, visible: (st: ChartStyle) => boolean, calc = false, ends = 0, range: (st: ChartStyle) => boolean = () => true) =>
    on
      ? groups.slice(0, groups.length - ends).map(({ group, style: st }) => bound(group.id, kind, visible(st), range(st), calc ? { kind: 'summary', seriesId: group.id } : null))
      : [];
  const bars = perGroup('bars', type !== 'violin', (st) => st.showBars, true);
  const body = perGroup('distribution', dist, () => true, true);
  const pairLines =
    type === 'paired' && groups.length > 0
      ? [whole(chart, 'pairLines', groups[0].style.showLines, true)]
      : [];
  const joins = perGroup('line', type === 'mean', (st) => st.showLines, true, 1);
  const errors = perGroup('errorBars', !dist, (st) => st.showErrorBars, true, 0, (st) => st.showErrorBars);
  const means = perGroup('meanLine', type === 'scatter' || type === 'paired', (st) => st.showMeanLine, true);
  const points = perGroup('points', true, (st) => st.showSymbols, false, 0, (st) => st.showSymbols);
  const lines = [...pairLines, ...joins, ...errors, ...means];
  // The labels of the bars: above everything else the chart draws from its data sets.
  const labels = hasBarLabels(chart) && !dist ? groups.map(({ group }) => bound(group.id, 'labels', true, false)) : [];
  const parts = chart.lineOrder === 'onTop' ? [...bars, ...body, ...points, ...lines] : chart.lineOrder === 'underneath' ? [...lines, ...bars, ...body, ...points] : [...bars, ...body, ...lines, ...points];
  return [
    ...referenceLineLayers(chart),
    ...parts,
    ...labels,
    ...annotationLayers(chart),
  ];
}

/** The kinds of layer that are drawn from the data of a series: the ones that can be put in another order. */
export const ORDERABLE_LAYER_KINDS: ReadonlyArray<LayerKind> = ['band', 'area', 'bars', 'distribution', 'pairLines', 'line', 'fitBand', 'fitCurve', 'errorBars', 'xErrorBars', 'meanLine', 'rawPoints', 'points', 'labels', 'titles', 'colourBar'];

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
export const LAYER_NAMES: Record<LayerKind, string> = {
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
  xErrorBars: 'X error bars',
  fitCurve: 'Fit curve',
  fitBand: 'Fit band',
  referenceLine: 'Reference line',
  region: 'Shaded region',
  annotation: 'Annotation',
};
