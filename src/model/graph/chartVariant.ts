import type { FitModelId } from '../../stats/fit';
import { supportsHorizontal } from './chartTypes';
import { NO_FIT_SETTINGS } from '../options/fitOptions';
import type { Chart, ChartFit, ChartOrientation, FitSettings, HeatPalette, SurvivalOptions } from '../types';

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
  /** A dot plot made with its dots grouped by subject (nested dots). */
  bySubject?: boolean;
  /** Grouped bars made as dots only: the bars are off, the replicate values are dots and a line marks the mean of each cell. */
  dotsOnly?: boolean;
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
  if (variant.dotsOnly && chart.type === 'groupedBar') next.layers = chart.layers.map((l, i) => (i === 0 ? { ...l, style: { ...l.style, showBars: false, showSymbols: true, showMeanLine: true } } : l));
  if (variant.jitter !== undefined && chart.type === 'scatter') next.jitter = { ...chart.jitter, enabled: variant.jitter };
  if (variant.bySubject !== undefined && chart.type === 'scatter') next.jitter = { ...next.jitter, bySubject: variant.bySubject };
  if (variant.fit?.band && isXy(chart)) next.fit = { ...chart.fit, band: variant.fit.band };
  return next;
}

/** Whether the variant asks for a curve fit that suits the chart. */
export const variantFits = (chart: Chart, variant: ChartVariant | undefined): boolean => !!variant?.fit && isXy(chart);

/** The curve a preview of the variant draws (there is no analysis yet to take it from). */
export function previewFit(chart: Chart, variant: ChartVariant | undefined): FitSettings {
  if (!variant?.fit || !isXy(chart)) return NO_FIT_SETTINGS;
  return { ...NO_FIT_SETTINGS, model: variant.fit.model, degree: variant.fit.degree ?? 2, band: variant.fit.band ?? 'none' };
}
