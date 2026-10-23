import type { Chart, ChartOrientation, FitSettings, HeatPalette } from './types';
import { supportsHorizontal } from './chartTypes';

/** How a gallery entry sets up the chart it creates, beyond its type. */
export interface ChartVariant {
  /** Made with its columns running across: a horizontal chart. */
  orientation?: ChartOrientation;
  /** A heat map made with this colour scale. */
  heatPalette?: HeatPalette;
  /** An XY chart made with a fitted curve. */
  fit?: Partial<FitSettings>;
}

/** The chart with the variant applied; what does not suit the chart's type is left out. */
export function applyVariant(chart: Chart, variant: ChartVariant | undefined): Chart {
  if (!variant) return chart;
  const next = { ...chart };
  if (variant.orientation === 'horizontal' && supportsHorizontal(chart.type)) next.orientation = 'horizontal';
  if (variant.heatPalette && chart.type === 'heatmap') next.heatmap = { ...chart.heatmap, palette: variant.heatPalette };
  if (variant.fit && (chart.type === 'xyScatter' || chart.type === 'xyLine' || chart.type === 'xyLineSymbols')) next.fit = { ...chart.fit, ...variant.fit };
  return next;
}
