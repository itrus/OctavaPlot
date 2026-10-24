import { chartFamily } from './chartTypes';
import { centreLower } from '../stats/summary';
import { resolveStyle } from './style';
import { resolveSummary } from './summary';
import { layoutOf, xySeries } from './tableLayout';
import type { Chart, ChartStyle, DataTable, Id, LayerStyle, LineStyle } from './types';

/**
 * The graphical layers of a chart (roadmap P1). Step 1: the layers are derived from the chart and its table, not stored, and
 * nothing draws from them yet. The XY family comes first; the others follow once XY is drawn from layers.
 */
export type LayerKind = 'atRisk' | 'band' | 'rawPoints' | 'points' | 'line' | 'errorBars' | 'fitCurve' | 'fitBand' | 'referenceLine' | 'annotation';

/** What a layer's numbers come from; a calculation is keyed by what it is computed from, never by how the layer is styled. */
export type CalcRef = { kind: 'summary'; seriesId: Id } | { kind: 'survival'; seriesId: Id } | { kind: 'curvefit'; analysisId: Id };

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
export const layersAvailable = (chart: Chart): boolean => ['xy', 'survival'].includes(chartFamily(chart.type));

/**
 * The layers of an XY or survival chart, lowest first: reference lines, then kind by kind over all series the line, the fit band, the fit
 * curve, the error bars, the individual values and the points (the individual values and points first when the chart puts lines on top), then annotations. This is the
 * order XyChartSvg draws in. A survival chart has the confidence band, the curve, the error bars (standard errors), the
 * censor marks and, when asked for, the at-risk table. A layer whose ID is in `chart.hiddenLayerIds` is not visible.
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
  // Any layer can be hidden by its ID; hiding only ever takes a layer out of the drawing.
  const hidden = new Set(chart.hiddenLayerIds);
  return out.map((l, z) => ({ ...l, visible: l.visible && !hidden.has(l.id), z }));
}

/** What a kind of layer is called on screen. */
export const LAYER_NAMES: Record<LayerKind, string> = {
  atRisk: 'At-risk table',
  band: 'Confidence band',
  rawPoints: 'Individual values',
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

/** What the plotted point of a series with replicates is: the mean, the median, a geometric mean. */
function centreName(chart: Chart, seriesId: Id): string {
  const centre = resolveSummary(chart.layers[0], seriesId).centre;
  return centreLower(centre).replace(/^./, (c) => c.toUpperCase());
}

const SURVIVAL_NAMES: Partial<Record<LayerKind, string>> = { line: 'Curve', points: 'Censor marks', errorBars: 'Error bars (SE)' };

/** The layers of an XY or survival chart as the inspector lists them, topmost first. */
export function layerRows(chart: Chart, table: DataTable, seriesName: (id: Id, fallback: string) => string = (_, f) => f): LayerRow[] {
  const names = new Map(xySeries(table).map((s) => [s.id, s.name]));
  // The visibility the style gives, before anything is hidden by ID, tells a layer that is off by its style from one that is hidden.
  const byStyle = new Map(layersOf({ ...chart, hiddenLayerIds: [] }, table).map((l) => [l.id, l.visible]));
  const family = chartFamily(chart.type);
  const lineOf = new Map(chart.referenceLines.map((r) => [`${r.id}:referenceLine`, r]));
  const noteOf = new Map(chart.annotations.map((a) => [`${a.id}:annotation`, a]));
  const labelOf = (layer: LayerSpec): string => {
    const r = lineOf.get(layer.id);
    if (r) return `${LAYER_NAMES.referenceLine}: ${r.axis.toUpperCase()} = ${r.value}`;
    const a = noteOf.get(layer.id);
    if (a) {
      const text = a.text.replace(/s+/g, ' ').trim();
      return `${LAYER_NAMES.annotation}: ${text.length > 24 ? `${text.slice(0, 24)}…` : text || '(empty)'}`;
    }
    if (layer.kind === 'atRisk') return LAYER_NAMES.atRisk;
    const sid = layer.binding?.seriesId ?? '';
    const kind = family === 'survival' ? SURVIVAL_NAMES[layer.kind] ?? LAYER_NAMES[layer.kind] : layer.kind === 'points' && layer.calc ? centreName(chart, sid) : LAYER_NAMES[layer.kind];
    return `${kind}: ${seriesName(sid, names.get(sid) ?? '')}`;
  };
  return layersOf(chart, table)
    .reverse()
    .map((layer) => {
      const styleOn = byStyle.get(layer.id) ?? false;
      return {
        layer,
        label: labelOf(layer),
        shown: layer.visible,
        canToggle: styleOn,
        reason: styleOn ? null : 'Switched off in Style',
      };
    });
}

/** Which layers take a look of their own, and which settings of it. */
export const STYLABLE_LAYERS: Partial<Record<LayerKind, ReadonlyArray<keyof LayerStyle>>> = {
  band: ['color', 'opacity'],
  fitCurve: ['color', 'widthPt', 'lineStyle', 'opacity'],
  fitBand: ['color', 'opacity'],
};

export const LAYER_STYLE_LIMITS = { widthPt: { min: 0.2, max: 40 }, opacity: { min: 0, max: 1 } } as const;
export const DEFAULT_BAND_OPACITY = 0.2;
const LINE_STYLE_VALUES: readonly LineStyle[] = ['solid', 'longDash', 'dashed', 'dotted', 'dashDot', 'dashDotDot'];

/** The layer kind of a layer ID (`${object id}:${kind}`), or null. */
export const layerKindOf = (layerId: Id): LayerKind | null => {
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
          (k === 'widthPt' && typeof v === 'number' && Number.isFinite(v) && v >= LAYER_STYLE_LIMITS.widthPt.min && v <= LAYER_STYLE_LIMITS.widthPt.max) ||
          (k === 'lineStyle' && LINE_STYLE_VALUES.includes(v as LineStyle)) ||
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
