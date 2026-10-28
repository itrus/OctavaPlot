import { chartTypeInfo } from './chartTypes';
import type { ChartType, TableKind } from '../types';

/**
 * The short tags beside the tables and graphs in the navigator and in the folder overviews, so what a page is shows at a glance:
 * COL, XY, GRP ... for a table, BAR, BOX, LINE, PIE ... for a graph. The title is what the tag says in full.
 */
export interface Badge {
  text: string;
  title: string;
}

export const TABLE_BADGE: Record<TableKind, Badge> = {
  column: { text: 'COL', title: 'Column table' },
  xy: { text: 'XY', title: 'XY table' },
  grouped: { text: 'GRP', title: 'Grouped table' },
  contingency: { text: 'CNT', title: 'Contingency table' },
  survival: { text: 'SRV', title: 'Survival table' },
};

/** One tag for every chart type (the record has to name them all). The same word on a column, grouped or contingency table is the same kind of drawing. */
const CHART_TAG: Record<ChartType, string> = {
  bar: 'BAR',
  scatter: 'DOT',
  mean: 'MEAN',
  box: 'BOX',
  floating: 'FLT',
  paired: 'PAIR',
  histogram: 'HIST',
  ecdf: 'CDF',
  violin: 'VIO',
  xyScatter: 'SCAT',
  xyLine: 'LINE',
  xyLineSymbols: 'L+S',
  xySpikes: 'SPK',
  xyBars: 'XBAR',
  xyArea: 'AREA',
  groupedBar: 'BAR',
  groupedStacked: 'STK',
  groupedFloating: 'FLT',
  groupedBox: 'BOX',
  groupedViolin: 'VIO',
  groupedLine: 'LINE',
  heatmap: 'HEAT',
  pie: 'PIE',
  doughnut: 'RING',
  contingencyBars: 'BAR',
  contingencyStacked: 'STK',
  contingencyPercent: '100%',
  survival: 'KM',
  cumulativeEvent: 'CUM',
};

/** The tag of a graph: its type in a few letters, and the name of the type as the title. */
export const chartBadge = (type: ChartType): Badge => ({ text: CHART_TAG[type], title: chartTypeInfo(type)?.label ?? type });
