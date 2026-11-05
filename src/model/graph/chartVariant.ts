import type { FitModelId } from '../../stats/fit';
import { newId } from '../ids';
import { supportsHorizontal } from './chartTypes';
import { NO_FIT_SETTINGS } from '../options/fitOptions';
import type { Chart, ChartFit, ChartOrientation, DataTable, FitSettings, HeatPalette, SurvivalOptions } from '../types';

/** How a gallery entry sets up the chart it creates, beyond its type. */
export interface ChartVariant {
  /** Made with its columns running across: a horizontal chart. */
  orientation?: ChartOrientation;
  /** A heat map made with this colour scale. */
  heatPalette?: HeatPalette;
  /** An XY chart made with a curve fit of this model (the fit is added to the Results) and a band around the curve. */
  /** A survival chart made with these options (symbols at every event, error bars). */
  survival?: Partial<SurvivalOptions>;
  /** A dot plot made with (true) or without (false) sideways spreading of the dots. */
  jitter?: boolean;
  /** Dots placed as a beeswarm instead of by chance. */
  swarm?: boolean;
  /** Grouped bars made with the columns grouped by series (separated: each series has its own group of columns). */
  separated?: boolean;
  /** Grouped bars made with the values of each subject joined across the series inside each category. */
  subjectLines?: boolean;
  /** An XY chart made with its points joined as this says (for example one line for each subject). */
  lineConnect?: Chart['lineConnect'];
  /** Bubbles made as bubble charts usually are: a large largest bubble, a little see-through so that overlaps can be read. */
  bubbles?: boolean;
  /** Offset traces made as figures usually are: the Y axis hidden and a scale bar in its place. */
  offsetTraces?: boolean;
  /** A dot plot made with its dots grouped by subject (nested dots). */
  bySubject?: boolean;
  /** Grouped bars made as dots only: the bars are off, the replicate values are dots and a line marks the mean of each cell. */
  dotsOnly?: boolean;
  /**
   * A forest plot: lines over categories turned on their side, with square markers and no joining line, and a dashed line at the null value
   * (0 for differences; 1 for ratios, on a log axis), and no legend. The estimates and limits are the owner's: nothing is pooled or calculated.
   */
  forest?: 'difference' | 'ratio';
  fit?: { model: FitModelId; degree?: number; band?: ChartFit['band'] };
}

const isXy = (chart: Chart) => chart.type === 'xyScatter' || chart.type === 'xyLine' || chart.type === 'xyLineSymbols';

/** The chart with the variant applied; what does not suit the chart's type is left out. The curve fit itself is made by addChart. */
export function applyVariant(chart: Chart, variant: ChartVariant | undefined): Chart {
  if (!variant) return chart;
  const next = { ...chart };
  if (variant.orientation === 'horizontal' && supportsHorizontal(chart.type)) next.orientation = 'horizontal';
  if (variant.heatPalette && chart.type === 'heatmap') next.heatmap = { ...chart.heatmap, palette: variant.heatPalette };
  if (variant.survival && (chart.type === 'survival' || chart.type === 'cumulativeEvent')) next.survival = { ...chart.survival, ...variant.survival };
  // Individual values are shown, so no error bars to begin with.
  if (variant.dotsOnly && chart.type === 'groupedBar') next.layers = chart.layers.map((l, i) => (i === 0 ? { ...l, summary: { ...l.summary, spread: 'none' as const }, style: { ...l.style, showBars: false, showSymbols: true, showMeanLine: true } } : l));
  if (variant.forest && chart.type === 'groupedLine') {
    next.orientation = 'horizontal';
    next.layers = chart.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, showLines: false, symbolShape: 'square' as const } } : l));
    next.referenceLines = [...chart.referenceLines, { id: newId('ref'), axis: 'y', value: variant.forest === 'ratio' ? 1 : 0, color: '#000000', widthPt: 1, style: 'dashed', opacity: 1, label: '', showLabel: false }];
    // One series, so no legend; the value axis is named for what it holds.
    next.legend = { ...chart.legend, visible: false };
    next.yAxis = { ...chart.yAxis, title: variant.forest === 'ratio' ? 'Ratio (log scale)' : 'Effect and interval', ...(variant.forest === 'ratio' ? { scale: 'log10' as const } : {}) };
  }
  if (variant.jitter !== undefined && chart.type === 'scatter') next.jitter = { ...chart.jitter, enabled: variant.jitter };
  if (variant.swarm !== undefined && chart.type === 'scatter') next.jitter = { ...next.jitter, enabled: true, swarm: variant.swarm };
  if (variant.bySubject !== undefined && chart.type === 'scatter') next.jitter = { ...next.jitter, bySubject: variant.bySubject };
  if (variant.separated && chart.type === 'groupedBar') next.groupedBy = 'series';
  if (variant.subjectLines !== undefined && chart.type === 'groupedBar') next.pairs = { ...next.pairs, bySubject: variant.subjectLines };
  if (variant.bubbles && chart.type === 'xyBubble') {
    next.defaults = { ...chart.defaults, symbolSizePt: 36, symbolFillOpacity: 0.6 };
    // The sizes are not on the axes, so a bubble chart made from the gallery says what they mean.
    next.sizeLegend = { values: [] };
  }
  if (variant.offsetTraces && chart.type === 'xyOffset') next.yAxis = { ...next.yAxis, visible: false, scaleBar: true };
  if (variant.lineConnect !== undefined && isXy(chart)) next.lineConnect = variant.lineConnect;
  if (variant.fit?.band && isXy(chart)) next.fit = { ...chart.fit, band: variant.fit.band };
  return next;
}

/**
 * A graph of a table that holds the individual values (replicates) starts by showing them, and without error bars: grouped bars show their
 * values as dots, and the XY graphs of means show every replicate behind the mean. (A column bar chart starts that way whatever its table, see createChart.)
 */
export function showIndividualValues(chart: Chart, table: DataTable): Chart {
  if (table.layout?.kind !== 'replicates') return chart;
  const grouped = chart.type === 'groupedBar';
  const xy = chart.type === 'xyScatter' || chart.type === 'xyLine' || chart.type === 'xyLineSymbols' || chart.type === 'xyBars';
  if (!grouped && !xy) return chart;
  return { ...chart, layers: chart.layers.map((l, i) => (i === 0 ? { ...l, summary: { ...l.summary, spread: 'none' as const }, style: { ...l.style, ...(grouped ? { showSymbols: true } : { showRawPoints: true }) } } : l)) };
}

/** Whether the variant asks for a curve fit that suits the chart. */
export const variantFits = (chart: Chart, variant: ChartVariant | undefined): boolean => !!variant?.fit && isXy(chart);

/** The curve a preview of the variant draws (there is no analysis yet to take it from). */
export function previewFit(chart: Chart, variant: ChartVariant | undefined): FitSettings {
  if (!variant?.fit || !isXy(chart)) return NO_FIT_SETTINGS;
  return { ...NO_FIT_SETTINGS, model: variant.fit.model, degree: variant.fit.degree ?? 2, band: variant.fit.band ?? 'none' };
}
