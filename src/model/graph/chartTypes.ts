import type { ChartType, TableKind } from '../types';

/**
 * What the user picks from when starting work. A data table has a TYPE, chosen when it is created, and a graph
 * has a CHART TYPE chosen from those that suit its table (spec section 2.3: input modes and the charts built from
 * them).
 */
interface TableTypeInfo {
  kind: TableKind;
  label: string;
  /** What the columns mean. */
  layout: string;
  /** What it is for. */
  useFor: string;
}

const TABLE_TYPES: readonly TableTypeInfo[] = [
  {
    kind: 'column',
    label: 'Column table',
    layout: 'Each column is a group; the rows are its replicate values.',
    useFor: 'Bar charts, dot plots and means with error bars: comparing groups.',
  },
  {
    kind: 'xy',
    label: 'XY table',
    layout: 'The first column is X (numbers); every other column is a Y series measured at those X values.',
    useFor: 'Scatter and line charts: how Y changes with X.',
  },
  {
    kind: 'grouped',
    label: 'Grouped table',
    layout: 'Each row is a category (for example Male, Female); each group of columns is a series (Control, Treated), with replicates in subcolumns.',
    useFor: 'Grouped bar charts and lines: comparing series across categories.',
  },
  {
    kind: 'contingency',
    label: 'Contingency table',
    layout: 'Each row is a group of subjects (Treated, Control); each column is an outcome (Cured, Not cured); the cells are counts.',
    useFor: 'Counts or proportions of subjects in each outcome.',
  },
  {
    kind: 'survival',
    label: 'Survival table',
    layout: 'The first column is the time; each other column is a group, holding 1 for an event and 0 for a censored subject on that subject\'s row.',
    useFor: 'Survival (Kaplan-Meier) and cumulative-event curves.',
  },
];

interface ChartTypeInfo {
  type: ChartType;
  /** The table type it is drawn from. */
  tableKind: TableKind;
  label: string;
  description: string;
}

export const CHART_TYPES: readonly ChartTypeInfo[] = [
  { type: 'bar', tableKind: 'column', label: 'Bar chart', description: 'One bar per group, with optional points and error bars.' },
  { type: 'scatter', tableKind: 'column', label: 'Scatter dot plot', description: 'Every value as a dot, grouped by column.' },
  { type: 'mean', tableKind: 'column', label: 'Mean with error bars', description: 'A mean marker per group with its spread.' },
  { type: 'box', tableKind: 'column', label: 'Box and whiskers', description: 'Quartiles, median and whiskers of each column.' },
  { type: 'floating', tableKind: 'column', label: 'Floating bars (min to max)', description: 'A bar from the smallest to the largest value of each column, with a line at the mean or median.' },
  { type: 'paired', tableKind: 'column', label: 'Before and after', description: 'The values of each row joined by a line across the columns.' },
  { type: 'histogram', tableKind: 'column', label: 'Histogram', description: 'How many values fall in each bin of the value axis.' },
  { type: 'ecdf', tableKind: 'column', label: 'Cumulative distribution', description: 'The share of the values at or below each value, as steps.' },
  { type: 'violin', tableKind: 'column', label: 'Violin plot', description: 'The distribution of each column as a smoothed density.' },
  { type: 'xyScatter', tableKind: 'xy', label: 'XY scatter', description: 'Symbols at (X, Y); no connecting line.' },
  { type: 'xyLine', tableKind: 'xy', label: 'Line', description: 'Points joined in table order; no symbols.' },
  { type: 'xyLineSymbols', tableKind: 'xy', label: 'Line with symbols', description: 'Points joined in table order, each marked.' },
  { type: 'xyBars', tableKind: 'xy', label: 'Bars at numeric X', description: 'Bars placed at X values, from a baseline up to Y; several series stand side by side.' },
  { type: 'xySpikes', tableKind: 'xy', label: 'Spikes', description: 'Thin lines from the baseline up to each point.' },
  { type: 'xyArea', tableKind: 'xy', label: 'Area under the curve', description: 'The area between the baseline and the line through the points.' },
  { type: 'groupedBar', tableKind: 'grouped', label: 'Grouped bars', description: 'Bars side by side within each category, with error bars.' },
  { type: 'groupedStacked', tableKind: 'grouped', label: 'Stacked bars', description: 'The series stacked in one bar per category: the value of each is its own height.' },
  { type: 'groupedFloating', tableKind: 'grouped', label: 'Floating bars (min to max)', description: 'A bar from the smallest to the largest value of each series in each category, with a line at the mean or median.' },
  { type: 'groupedBox', tableKind: 'grouped', label: 'Grouped box and whiskers', description: 'A box plot for every series in each category.' },
  { type: 'groupedViolin', tableKind: 'grouped', label: 'Grouped violin', description: 'A violin for every series in each category.' },
  { type: 'heatmap', tableKind: 'grouped', label: 'Heat map', description: 'Each cell coloured by its value: rows are the categories, columns the series.' },
  { type: 'groupedLine', tableKind: 'grouped', label: 'Lines over categories', description: 'One line per series joining its means across the categories.' },
  { type: 'pie', tableKind: 'contingency', label: 'Pie charts', description: 'The outcomes of each row as parts of a circle.' },
  { type: 'doughnut', tableKind: 'contingency', label: 'Doughnut charts', description: 'Pie charts with a hole, and the total of each row in it.' },
  { type: 'contingencyBars', tableKind: 'contingency', label: 'Side-by-side bars', description: 'Counts: one bar per outcome within each row.' },
  { type: 'contingencyStacked', tableKind: 'contingency', label: 'Stacked bars', description: 'Counts: the outcomes stacked in one bar per row.' },
  { type: 'contingencyPercent', tableKind: 'contingency', label: '100% stacked bars', description: 'Each row\'s outcomes as a share of its own total.' },
  { type: 'survival', tableKind: 'survival', label: 'Survival curve', description: 'Kaplan-Meier estimate of the fraction surviving, with censor marks.' },
  { type: 'cumulativeEvent', tableKind: 'survival', label: 'Cumulative events', description: '1 minus the survival estimate: the fraction that has had the event.' },
];

export const chartTypeInfo = (type: ChartType): ChartTypeInfo | undefined => CHART_TYPES.find((c) => c.type === type);
export const chartTypesFor = (kind: TableKind): ChartTypeInfo[] => CHART_TYPES.filter((c) => c.tableKind === kind);
export const defaultChartTypeFor = (kind: TableKind): ChartType => chartTypesFor(kind)[0].type;
export const tableTypeInfo = (kind: TableKind): TableTypeInfo => TABLE_TYPES.find((t) => t.kind === kind) ?? TABLE_TYPES[0];

/** How a chart type is drawn: which model and drawing it uses, and so which inspector. */
/** Chart types that can run horizontally: the column charts (bars, dots, means, boxes and violins) and the bars of grouped and contingency tables. */
export const supportsHorizontal = (type: ChartType): boolean => type === 'bar' || type === 'scatter' || type === 'mean' || type === 'box' || type === 'violin' || type === 'floating' || type === 'paired' || type === 'groupedBar' || type === 'groupedStacked' || type === 'groupedFloating' || type === 'groupedBox' || type === 'groupedViolin' || type === 'contingencyBars' || type === 'contingencyStacked' || type === 'contingencyPercent';

type ChartFamily = 'column' | 'xy' | 'grouped' | 'survival' | 'pie' | 'histogram' | 'heatmap';

export function chartFamily(type: ChartType): ChartFamily {
  switch (type) {
    case 'xyScatter':
    case 'xyLine':
    case 'xyLineSymbols':
    case 'xySpikes':
    case 'xyArea':
    case 'xyBars':
      return 'xy';
    case 'groupedBar':
    case 'groupedStacked':
    case 'groupedFloating':
    case 'groupedBox':
    case 'groupedViolin':
    case 'groupedLine':
    case 'contingencyBars':
    case 'contingencyStacked':
    case 'contingencyPercent':
      return 'grouped';
    case 'survival':
    case 'cumulativeEvent':
      return 'survival';
    case 'pie':
    case 'doughnut':
      return 'pie';
    case 'histogram':
    case 'ecdf':
      return 'histogram';
    case 'heatmap':
      return 'heatmap';
    default:
      return 'column';
  }
}

/** Whether a chart type is drawn on a numeric X axis from an XY table. */
export const isXyChartType = (type: ChartType): boolean => chartFamily(type) === 'xy';
/** Bars (or lines) over categories that are the rows of a grouped or contingency table. */
export const isGroupedChartType = (type: ChartType): boolean => chartFamily(type) === 'grouped';
/** Charts whose series colour is the colour of its symbols, lines and error bars (not of a filled bar). */
export const isSeriesColourType = (type: ChartType): boolean => chartFamily(type) === 'xy' || chartFamily(type) === 'survival' || type === 'groupedLine' || type === 'ecdf';
export const isSurvivalChartType = (type: ChartType): boolean => chartFamily(type) === 'survival';
/** Number of leading table columns that are not data sets: the X (or time) column of XY and survival tables. */
export const leadingColumns = (kind: TableKind): number => (kind === 'xy' || kind === 'survival' ? 1 : 0);
/** Tables whose columns are grouped into series (blocks); the column table's columns are data sets one by one. */
export const usesSeriesBlocks = (kind: TableKind): boolean => kind !== 'column';
