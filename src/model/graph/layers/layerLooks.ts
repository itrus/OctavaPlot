import { SYMBOL_SHAPES } from '../look';
import { chartFamily } from '../chartTypes';
import { paletteById } from '../palettes';
import { resolveStyle, dataLayer } from '../style';
import { xySeries } from '../../table/tableLayout';
import { seriesPaletteIndex } from '../../table/factors';
import type { Chart, ChartStyle, ChartType, DataTable, Id, LayerStyle, LineStyle } from '../../types';
import { LAYER_NAMES, type LayerKind, type LayerSpec } from './layerList';

/** Which layers take a look of their own, and which settings of it. */
const STYLABLE_LAYERS: Partial<Record<LayerKind, ReadonlyArray<keyof LayerStyle>>> = {
  band: ['color', 'opacity'],
  area: ['color', 'opacity'],
  line: ['color', 'widthPt', 'lineStyle', 'opacity'],
  errorBars: ['color', 'widthPt', 'opacity'],
  xErrorBars: ['color', 'widthPt', 'opacity'],
  points: ['color', 'widthPt', 'opacity', 'shape'],
  rawPoints: ['color', 'widthPt', 'opacity', 'shape'],
  meanLine: ['color', 'widthPt', 'opacity'],
  pairLines: ['color', 'widthPt', 'opacity'],
  fitCurve: ['color', 'widthPt', 'lineStyle', 'opacity'],
  fitBand: ['color', 'opacity'],
};

/**
 * The settings a kind of layer takes in a chart of this type: those of STYLABLE_LAYERS that the drawing of the type honours, so that
 * no setting is offered that changes nothing, and none for a part the type does not have. A column chart does not draw its joining lines dashed, the dots
 * of a box plot or a violin have a shape of their own, and the bodies (bars, boxes, violins, slices, cells) are styled with the data set's fill, not here.
 */
export function lookKeysOf(type: ChartType, kind: LayerKind): ReadonlyArray<keyof LayerStyle> | null {
  const keys = STYLABLE_LAYERS[kind];
  if (!keys) return null;
  const family = chartFamily(type);
  if (family === 'xy' || family === 'survival') return keys;
  const without = (...drop: Array<keyof LayerStyle>) => keys.filter((k) => !drop.includes(k));
  /** The kinds each chart type draws that take a look: the others have no such part, so there is nothing to give a look to. */
  const draws = (types: ReadonlyArray<ChartType>) => types.includes(type);
  switch (family) {
    case 'column':
      if (kind === 'errorBars') return draws(['bar', 'scatter', 'mean', 'paired']) ? keys : null;
      // The dots of a column chart are one layer per data set, set in Style: a look here would be a second control for the same setting.
      if (kind === 'points') return null;
      if (kind === 'meanLine') return draws(['scatter', 'paired']) ? keys : null;
      if (kind === 'pairLines') return draws(['paired']) ? keys : null;
      if (kind === 'line') return draws(['mean']) ? without('lineStyle') : null;
      return null;
    case 'grouped':
      if (kind === 'errorBars') return draws(['groupedBar', 'groupedLine']) ? keys : null;
      if (kind === 'points') return draws(['groupedLine']) ? keys : null;
      if (kind === 'line') return draws(['groupedLine']) ? keys : null;
      if (kind === 'pairLines') return draws(['groupedBar']) ? keys : null;
      if (kind === 'meanLine') return draws(['groupedBar', 'groupedFloating']) ? keys : null;
      // The dots of a box plot or a violin have a fixed shape.
      if (kind === 'rawPoints') return draws(['groupedBox', 'groupedViolin']) ? without('shape') : draws(['groupedBar', 'groupedFloating']) ? keys : null;
      return null;
    case 'histogram':
      return type === 'ecdf' && (kind === 'line' || kind === 'points') ? keys : null;
    default:
      return null;
  }
}

/**
 * The settings of a series that a setting of its layer stands for. A layer's own setting wins over the series' (the most specific
 * wins); a later edit of the series' setting for the whole series or for all series takes the layer's own back (clearPartStyles).
 */
const PART_KEYS: Partial<Record<LayerKind, Partial<Record<keyof LayerStyle, ReadonlyArray<keyof ChartStyle>>>>> = {
  line: { color: ['lineColor'], widthPt: ['lineWidthPt'], lineStyle: ['lineStyle'], opacity: ['lineOpacity'] },
  errorBars: { color: ['errorColor'], widthPt: ['errorLineWidthPt'], opacity: ['errorOpacity'] },
  xErrorBars: { color: ['errorColor'], widthPt: ['errorLineWidthPt'], opacity: ['errorOpacity'] },
  points: { color: ['symbolColor', 'symbolBorderColor'], widthPt: ['symbolBorderWidthPt'], opacity: ['symbolFillOpacity'], shape: ['symbolShape'] },
  rawPoints: { color: ['symbolColor', 'symbolBorderColor'], widthPt: ['symbolBorderWidthPt'], opacity: ['symbolFillOpacity'], shape: ['symbolShape'] },
  meanLine: { color: ['lineColor'], widthPt: ['lineWidthPt'], opacity: ['lineOpacity'] },
  pairLines: { color: ['lineColor'], widthPt: ['lineWidthPt'], opacity: ['lineOpacity'] },
  fitCurve: { color: ['lineColor'], widthPt: ['lineWidthPt'], lineStyle: ['lineStyle'] },
  fitBand: { color: ['lineColor'] },
  band: { color: ['lineColor'] },
  area: { color: ['lineColor'] },
};

/** The layers drawn in the look of their series with the layer's own settings over it (the others have a look of their own, see layerLook). */
const SERIES_LOOK_KINDS: ReadonlyArray<LayerKind> = ['line', 'errorBars', 'xErrorBars', 'points', 'rawPoints', 'meanLine', 'pairLines'];

/** The look of a series with the layer's own settings over it: what a line, error bar, point or individual value is drawn in. */
export function partStyle(chart: Chart, layerId: Id, style: ChartStyle): ChartStyle {
  const own = chart.layerStyles[layerId];
  const kind = layerKindOf(layerId);
  // A part the chart type no longer gives a look of its own (an old file's dots of a column chart) is drawn in the series' look.
  const keys = own && kind && SERIES_LOOK_KINDS.includes(kind) && lookKeysOf(chart.type, kind) !== null ? PART_KEYS[kind] : undefined;
  if (!own || !keys) return style;
  const out: Record<string, unknown> = { ...style };
  for (const [setting, value] of Object.entries(own)) for (const key of keys[setting as keyof LayerStyle] ?? []) out[key] = value;
  return out as unknown as ChartStyle;
}

/**
 * Whether the lines of a paired plot have a colour for each subject (a colour of the palette): the chart asks for it, there is a palette
 * (with colours set by hand there is none), and the lines were not given a colour of their own in the layers. Otherwise they have one colour.
 */
export const pairLinesBySubject = (chart: Chart): boolean =>
  chart.pairs.lineColour === 'subject' && paletteById(chart.paletteId) !== undefined && chart.layerStyles[`${chart.id}:pairLines`]?.color === undefined;

/**
 * The look a legend key is drawn in: the look of the series with what its line and its points were given of their own (the layers of
 * individual values and of points both set the symbol; the points win), so that a key shows the marks it stands for.
 */
export function legendKeyStyle(chart: Chart, seriesId: Id, style: ChartStyle): ChartStyle {
  return partStyle(chart, `${seriesId}:points`, partStyle(chart, `${seriesId}:rawPoints`, partStyle(chart, `${seriesId}:line`, style)));
}

/**
 * The look of the data set a layer belongs to, before the layer's own settings: what the inspector shows for a setting the layer has not
 * been given. A layer of the chart as a whole (the lines joining the rows of a paired plot) takes the first data set's.
 */
export function layerBaseStyle(chart: Chart, table: DataTable, layer: Pick<LayerSpec, 'binding' | 'kind'>): ChartStyle | null {
  const id = layer.binding?.seriesId ?? (layer.kind === 'pairLines' ? table.groups[0]?.id : undefined);
  if (id === undefined) return null;
  const family = chartFamily(chart.type);
  if (family === 'column') {
    const group = table.groups.find((g) => g.id === id);
    return group ? resolveStyle(chart, dataLayer(chart), group) : null;
  }
  if (family === 'histogram') {
    const at = table.groups.findIndex((g) => g.id === id);
    return at < 0 ? null : resolveStyle(chart, dataLayer(chart), { id, paletteIndex: table.groups[at].paletteIndex ?? at });
  }
  const series = xySeries(table);
  const at = series.findIndex((s) => s.id === id);
  return at < 0 ? null : resolveStyle(chart, dataLayer(chart), { id, paletteIndex: seriesPaletteIndex(chart, series.map((d) => d.columns[0]), at) });
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
/** Whether some part of a chart of this type takes a look of its own. */
export const hasPartLooks = (type: ChartType): boolean => (Object.keys(STYLABLE_LAYERS) as LayerKind[]).some((kind) => lookKeysOf(type, kind) !== null);

export const layerKindOf = (layerId: Id): LayerKind | null => {
  const kind = layerId.slice(layerId.lastIndexOf(':') + 1);
  return Object.hasOwn(LAYER_NAMES, kind) ? (kind as LayerKind) : null;
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
          (k === 'shape' && SYMBOL_SHAPES.some((o) => o.value === v)) ||
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
