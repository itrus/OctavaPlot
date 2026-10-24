import { chartFamily } from './chartTypes';
import { resolveStyle } from './style';
import { layoutOf, xySeries } from './tableLayout';
import type { Chart, ChartStyle, DataTable, Id } from './types';

/**
 * The graphical layers of a chart (roadmap P1). Step 1: the layers are derived from the chart and its table, not stored, and
 * nothing draws from them yet. The XY family comes first; the others follow once XY is drawn from layers.
 */
export type LayerKind = 'points' | 'line' | 'errorBars' | 'fitCurve' | 'fitBand' | 'referenceLine' | 'annotation';

/** What a layer's numbers come from; a calculation is keyed by what it is computed from, never by how the layer is styled. */
export type CalcRef = { kind: 'summary'; seriesId: Id } | { kind: 'curvefit'; analysisId: Id };

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
  /** Whether the layer's values are part of what the axis range is fitted to. */
  rangeContribution: boolean;
  /** Drawing order, lowest first. */
  z: number;
}

/** Whether the chart's family is drawn from layers yet. */
export const layersAvailable = (chart: Chart): boolean => chartFamily(chart.type) === 'xy';

/**
 * The layers of an XY chart, lowest first: reference lines, then kind by kind over all series the line, the fit band, the fit
 * curve, the error bars and the points (the points first when the chart puts lines on top), then annotations. This is the
 * order XyChartSvg draws in. A layer whose ID is in `chart.hiddenLayerIds` is not visible; the reference lines and the
 * annotations are not hidden this way yet.
 */
export function layersOf(chart: Chart, table: DataTable): LayerSpec[] {
  if (!layersAvailable(chart)) throw new Error('layersOf: this chart family is not drawn from layers yet');
  const out: Array<Omit<LayerSpec, 'z'>> = [];
  const bound = (seriesId: Id) => ({ tableId: table.id, seriesId });
  const calc = layoutOf(table).kind !== 'single';
  const analysisId = chart.fit.analysisId;

  for (const r of chart.referenceLines) {
    out.push({ id: `${r.id}:referenceLine`, kind: 'referenceLine', binding: null, calc: null, enabled: true, visible: true, rangeContribution: false });
  }
  const series = xySeries(table).map((s, i) => ({ s, style: resolveStyle(chart, chart.layers[0], { id: s.id, paletteIndex: s.columns[0].seriesSlot ?? i }) }));
  /** One layer of each series, in series order: the drawing goes kind by kind, as XyChartSvg does. */
  const ofKind = (kind: LayerKind, visible: (st: ChartStyle) => boolean, rangeContribution: (st: ChartStyle) => boolean, ref: (id: Id) => CalcRef | null = () => null) =>
    series.map(({ s, style }) => ({ id: `${s.id}:${kind}`, kind, binding: bound(s.id), calc: ref(s.id), enabled: true, visible: visible(style), rangeContribution: rangeContribution(style) }));
  const yes = () => true;
  const fitRef = (): CalcRef | null => (analysisId === null ? null : { kind: 'curvefit', analysisId });
  const points = ofKind('points', (st) => st.showSymbols, yes);
  const parts = [
    ...ofKind('line', (st) => st.showLines, yes),
    // The band is not part of the range: a wide band is cut off by the plot.
    ...(analysisId !== null && chart.fit.band !== 'none' ? ofKind('fitBand', yes, () => false, fitRef) : []),
    ...(analysisId !== null ? ofKind('fitCurve', yes, yes, fitRef) : []),
    // A single Y per row has no spread to draw.
    ...(calc ? ofKind('errorBars', (st) => st.showErrorBars, (st) => st.showErrorBars, (id) => ({ kind: 'summary', seriesId: id })) : []),
  ];
  out.push(...(chart.lineOrder === 'onTop' ? [...points, ...parts] : [...parts, ...points]));
  for (const a of chart.annotations) {
    out.push({ id: `${a.id}:annotation`, kind: 'annotation', binding: null, calc: null, enabled: true, visible: true, rangeContribution: false });
  }
  // A part of the data can be hidden by its ID; hiding only ever takes a layer out of the drawing.
  const hidden = new Set(chart.hiddenLayerIds);
  const isData = (k: LayerKind) => k !== 'referenceLine' && k !== 'annotation';
  return out.map((l, z) => ({ ...l, visible: l.visible && !(isData(l.kind) && hidden.has(l.id)), z }));
}

/** What a kind of layer is called on screen. */
export const LAYER_NAMES: Record<LayerKind, string> = {
  points: 'Points',
  line: 'Line',
  errorBars: 'Error bars',
  fitCurve: 'Fit curve',
  fitBand: 'Fit band',
  referenceLine: 'Reference line',
  annotation: 'Annotation',
};

export interface LayerRow {
  layer: LayerSpec;
  /** "Fit band: Series A". */
  label: string;
  /** Whether the layer is drawn now. */
  shown: boolean;
  /** Hiding is offered only for a data layer that the chart's style has not already switched off. */
  canToggle: boolean;
  /** Why it cannot be toggled; null when it can. */
  reason: string | null;
}

/** The data layers of an XY chart as the inspector lists them, in drawing order from the top. */
export function layerRows(chart: Chart, table: DataTable, seriesName: (id: Id, fallback: string) => string = (_, f) => f): LayerRow[] {
  const names = new Map(xySeries(table).map((s) => [s.id, s.name]));
  // The visibility the style gives, before anything is hidden by ID, tells a layer that is off by its style from one that is hidden.
  const byStyle = new Map(layersOf({ ...chart, hiddenLayerIds: [] }, table).map((l) => [l.id, l.visible]));
  return layersOf(chart, table)
    .filter((l) => l.kind !== 'referenceLine' && l.kind !== 'annotation')
    .reverse()
    .map((layer) => {
      const styleOn = byStyle.get(layer.id) ?? false;
      const sid = layer.binding?.seriesId ?? '';
      return {
        layer,
        label: `${LAYER_NAMES[layer.kind]}: ${seriesName(sid, names.get(sid) ?? '')}`,
        shown: layer.visible,
        canToggle: styleOn,
        reason: styleOn ? null : 'Switched off in Style',
      };
    });
}
