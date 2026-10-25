import { CHART_TYPES, chartFamily, isSeriesColourType, supportsHorizontal } from './chartTypes';
import type { ChartType } from '../types';

/**
 * What each chart type can do, in one place. The controls of the inspector, the validation of a project and the capability
 * table of the README all read this, so a setting that a drawing does not honour is not offered (and a test says which are
 * offered and which are absent for every type). Where a capability was already a predicate (supportsHorizontal,
 * chartFamily) the registry is built from it, so the two cannot disagree.
 */
export interface Capabilities {
  type: ChartType;
  /** The value axis can run across (Layout → Direction). */
  horizontal: boolean;
  /** Reference lines: at Y values only, at X and Y values, or none (the chart has no axes to put them on). */
  referenceLines: 'none' | 'y' | 'xy';
  /** A curve can be fitted to the series (XY charts). */
  curveFit: boolean;
  /** Each data set can be plotted against the left or the right Y axis. */
  secondaryAxis: boolean;
  /** The colour of a series is that of its symbols and lines, not of a filled bar. */
  seriesColour: boolean;
  /** Survival options: confidence band, at-risk table, event symbols. */
  survivalOptions: boolean;
  /** The chart has numeric axes that can be broken, reversed or put on a log scale. */
  numericAxes: boolean;
}

/** Types whose data sets can be bound to the right axis (see bindingUi in chart/shared/axes/axes.ts). */
const SECONDARY_AXIS: ReadonlySet<ChartType> = new Set<ChartType>(['bar', 'scatter', 'mean']);

function referenceLinesOf(type: ChartType): Capabilities['referenceLines'] {
  switch (chartFamily(type)) {
    case 'xy':
    case 'survival':
    case 'histogram':
      return 'xy';
    case 'column':
    case 'grouped':
      return 'y';
    default:
      return 'none';
  }
}

export function capabilitiesOf(type: ChartType): Capabilities {
  const family = chartFamily(type);
  return {
    type,
    horizontal: supportsHorizontal(type),
    referenceLines: referenceLinesOf(type),
    curveFit: family === 'xy',
    secondaryAxis: SECONDARY_AXIS.has(type),
    seriesColour: isSeriesColourType(type),
    survivalOptions: family === 'survival',
    numericAxes: family !== 'pie' && family !== 'heatmap',
  };
}

/** The registry: one entry for every chart type, in the order of the catalogue. */
export const CAPABILITIES: readonly Capabilities[] = CHART_TYPES.map((c) => capabilitiesOf(c.type));

const yes = (v: boolean) => (v ? 'yes' : '–');

/**
 * The capability table of the README, as Markdown. The README holds it between two marker comments and a test compares the two,
 * so the document cannot say something the code does not.
 */
export function capabilityTable(): string {
  const rows = CHART_TYPES.map((c) => {
    const k = capabilitiesOf(c.type);
    const lines = k.referenceLines === 'xy' ? 'X and Y' : k.referenceLines === 'y' ? 'Y' : '–';
    return `| ${c.label} | ${yes(k.horizontal)} | ${lines} | ${yes(k.secondaryAxis)} | ${yes(k.curveFit)} | ${yes(k.survivalOptions)} |`;
  });
  return ['| Chart type | Horizontal | Reference lines | Right Y axis | Curve fit | Survival options |', '|---|---|---|---|---|---|', ...rows].join('\n');
}
