import type { ChartVariant } from './chartVariant';
import type { ChartType, TableKind } from '../types';

/**
 * The gallery of graphs offered for each table type, grouped into tabs. A graph with a `type` can be made now; one
 * without is a planned preset from the preset catalogue (docs/calculation-contracts.md), shown locked so the whole catalogue is visible.
 */
export interface GalleryItem {
  /** Unique key; also selects the thumbnail. */
  id: string;
  label: string;
  description: string;
  /** The chart type to create, or null while the graph is planned. */
  type: ChartType | null;
  /** The preset ID, for planned graphs. */
  spec?: string;
  /** How the chart is set up beyond its type. */
  variant?: ChartVariant;
}

interface GalleryTab {
  id: string;
  label: string;
  items: GalleryItem[];
}

const item = (id: string, label: string, description: string, type: ChartType | null, spec?: string, variant?: ChartVariant): GalleryItem => ({ id, label, description, type, spec, ...(variant ? { variant } : {}) });

export const GALLERY: Record<TableKind, GalleryTab[]> = {
  xy: [
    {
      id: 'xy',
      label: 'XY',
      items: [
        item('xyScatter', 'Points only', 'Symbols at (X, Y); no connecting line.', 'xyScatter'),
        item('xyLineSymbols', 'Points and connecting line', 'Points joined in the order of the table, each marked.', 'xyLineSymbols'),
        item('xyLine', 'Connecting line', 'Points joined in the order of the table; no symbols.', 'xyLine'),
        item('xy.bars', 'Bars at numeric X', 'Bars placed at X values, with a baseline.', null, 'xy.bars'),
        item('xy.area', 'Area under the curve', 'A filled area below, above or between curves.', 'xyArea', 'xy.area'),
        item('xy.spikes', 'Spikes', 'Thin lines from the baseline up to each point.', 'xySpikes', 'xy.spikes'),
        item('xy.vector', 'Vectors', 'Arrows from the origin or between two points.', null, 'xy.vector'),
        item('xy.bubble', 'Bubbles', 'Symbols sized or coloured by another column.', null, 'xy.bubble'),
        item('xy.trajectory', 'Repeated measures', 'One line per subject, for example before and after: name the subjects in the table (Subject…).', 'xyLineSymbols', 'xy.trajectory', { lineConnect: 'subject' }),
        item('xy.offset', 'Offset traces', 'Several series stacked with a fixed offset and a scale bar.', null, 'xy.offset_traces'),
        item('curve.fit', 'Points with a fitted curve', 'A fitted line with its confidence band; choose another model in the panel.', 'xyScatter', 'curve.fit', { fit: { model: 'linear', band: 'confidence' } }),
        item('curve.smooth', 'Smooth curve', 'A spline or LOWESS curve through the points.', null, 'curve.smooth'),
      ],
    },
  ],
  column: [
    {
      id: 'individual',
      label: 'Individual values',
      items: [
        item('scatter', 'Scatter dot plot', 'Every value as a dot, grouped by column, with an optional line at the mean.', 'scatter'),
        item('cat.aligned', 'Aligned dots', 'Dots in a column without spreading them sideways.', 'scatter', 'category.aligned', { jitter: false }),
        item('paired', 'Before and after', 'The values of each subject joined by a line.', 'paired', 'category.paired'),
        item('cat.nested', 'Nested dots', 'Technical repeats inside each independent unit: name the subjects in the table (Subject…); the mean and error bar are of the subjects.', 'scatter', 'category.nested', { bySubject: true }),
      ],
    },
    {
      id: 'frequency',
      label: 'Histogram and distribution',
      items: [
        item('histogram', 'Histogram', 'How many values fall in each bin of the value axis.', 'histogram'),
        item('ecdf', 'Cumulative distribution', 'The share of the values at or below each value, as steps.', 'ecdf'),
      ],
    },
    {
      id: 'box',
      label: 'Box and violin',
      items: [
        item('box', 'Box and whiskers', 'Quartiles, median and whiskers of each column.', 'box', 'distribution.box'),
        item('floating', 'Floating bars (min to max)', 'A bar from the smallest to the largest value, with a line at the mean or median.', 'floating', 'category.range'),
        item('violin', 'Violin plot', 'The distribution of each column as a smoothed density.', 'violin', 'distribution.violin'),
        item('boxH', 'Horizontal box', 'The box plot turned on its side.', 'box', 'distribution.box', { orientation: 'horizontal' }),
        item('violinH', 'Horizontal violin', 'The violin plot turned on its side.', 'violin', 'distribution.violin', { orientation: 'horizontal' }),
      ],
    },
    {
      id: 'summary',
      label: 'Mean/median & error',
      items: [
        item('bar', 'Bar chart', 'One bar per column, with optional points and error bars.', 'bar'),
        item('mean', 'Mean with error bars', 'A mean marker per column with its spread.', 'mean'),
        item('barsH', 'Horizontal bars', 'The bar chart turned on its side.', 'bar', 'category.bar', { orientation: 'horizontal' }),
      ],
    },
  ],
  grouped: [
    {
      id: 'individual',
      label: 'Individual values',
      items: [
        item('grp.scatterI', 'Interleaved scatter', 'Dots of every series side by side within each category.', 'groupedBar', 'category.grouped', { dotsOnly: true }),
        item('grp.scatterS', 'Separated scatter', 'Dots of each series in its own group of columns.', null, 'category.grouped'),
        item('grp.paired', 'Before and after, grouped', 'Subject lines inside each category: enter the values as replicates and name the subjects in the table (Subject…).', 'groupedBar', 'category.paired', { dotsOnly: true, subjectLines: true }),
      ],
    },
    {
      id: 'summary',
      label: 'Summary data',
      items: [
        item('groupedBar', 'Interleaved bars', 'Bars side by side within each category, with error bars.', 'groupedBar'),
        item('groupedLine', 'Lines over categories', 'One line per series joining its means across the categories.', 'groupedLine'),
        item('groupedStacked', 'Stacked bars', 'The series stacked in one bar per category.', 'groupedStacked', 'category.stacked'),
        item('grp.barsH', 'Horizontal interleaved bars', 'Interleaved bars turned on their side.', 'groupedBar', 'category.grouped', { orientation: 'horizontal' }),
        item('grp.stackedH', 'Horizontal stacked bars', 'Stacked bars turned on their side.', 'groupedStacked', 'category.stacked', { orientation: 'horizontal' }),
        item('grp.floating', 'Floating bars', 'A bar from the smallest to the largest value of each series, with a line at the mean or median.', 'groupedFloating', 'category.range'),
      ],
    },
    {
      id: 'heat',
      label: 'Heat map',
      items: [
        item('heat.blue', 'Blue heat map', 'A single-hue scale, pale to dark blue, for values that are all positive. Fifteen more gradients are in the Inspector.', 'heatmap', 'matrix.heatmap', { heatPalette: 'bs-blue' }),
        item('heat.purple', 'Purple heat map', 'A single-hue scale, pale to dark purple.', 'heatmap', 'matrix.heatmap', { heatPalette: 'bs-purple' }),
        item('heat.red', 'Red heat map', 'A single-hue scale, pale to dark red.', 'heatmap', 'matrix.heatmap', { heatPalette: 'md-red' }),
        item('heat.gsea', 'GSEA heat map', 'A diverging scale, blue through pale to red, around a middle value.', 'heatmap', 'matrix.heatmap', { heatPalette: 'gsea' }),
      ],
    },
    {
      id: 'three',
      label: 'Three-way',
      items: [
        item('three.bars', 'Three-way bars', 'Two grouping levels inside each category.', null, 'category.nested'),
        item('three.dots', 'Three-way dots', 'Individual values for two grouping levels.', null, 'category.nested'),
      ],
    },
    {
      id: 'box',
      label: 'Box and violin',
      items: [
        item('grp.box', 'Grouped box and whiskers', 'A box plot for every series in each category.', 'groupedBox', 'distribution.box'),
        item('grp.violin', 'Grouped violin', 'A violin for every series in each category.', 'groupedViolin', 'distribution.violin'),
      ],
    },
  ],
  contingency: [
    {
      id: 'contingency',
      label: 'Contingency',
      items: [
        item('contingencyBars', 'Side-by-side bars', 'Counts: one bar per outcome within each row.', 'contingencyBars'),
        item('contingencyStacked', 'Stacked bars', 'Counts: the outcomes stacked in one bar per row.', 'contingencyStacked'),
        item('contingencyPercent', '100% stacked bars', 'Each row\'s outcomes as a share of its own total.', 'contingencyPercent'),
        item('cont.sideH', 'Horizontal side-by-side bars', 'Side-by-side bars turned on their side.', 'contingencyBars', 'category.counts', { orientation: 'horizontal' }),
        item('cont.stackH', 'Horizontal stacked bars', 'Stacked bars turned on their side.', 'contingencyStacked', 'category.stacked', { orientation: 'horizontal' }),
        item('cont.pctH', 'Horizontal 100% bars', '100% stacked bars turned on their side.', 'contingencyPercent', 'category.normalised_stack', { orientation: 'horizontal' }),
        item('pie', 'Pie charts', 'The outcomes of each row as parts of a circle.', 'pie', 'whole.pie'),
        item('doughnut', 'Doughnut charts', 'Pie charts with a hole and a total in the middle.', 'doughnut', 'whole.doughnut'),
      ],
    },
  ],
  survival: [
    {
      id: 'survival',
      label: 'Survival',
      items: [
        item('survival', 'Survival curve', 'The Kaplan-Meier estimate as a staircase, with a mark at each censored subject.', 'survival'),
        item('cumulativeEvent', 'Cumulative events', 'One minus the survival estimate: the fraction that has had the event.', 'cumulativeEvent'),
        item('surv.symbols', 'Staircase with symbols at every event', 'Symbols at all points, not only the censored ones.', 'survival', 'curve.survival', { survival: { eventSymbols: true } }),
        item('surv.se', 'Survival with SE error bars', 'The standard error of the estimate at each event time.', 'survival', 'curve.survival', { survival: { errorBars: true } }),
        item('cum.se', 'Cumulative events with error bars', 'Error bars on the cumulative curve.', 'cumulativeEvent', 'curve.cumulative_event', { survival: { errorBars: true } }),
      ],
    },
  ],
};

/** Every gallery item of a table type, in order. */
export const galleryItems = (kind: TableKind): GalleryItem[] => GALLERY[kind].flatMap((t) => t.items);
export const availableItems = (kind: TableKind): GalleryItem[] => galleryItems(kind).filter((i) => i.type !== null);

const KINDS = Object.keys(GALLERY) as TableKind[];

/** How many graphs the gallery holds over all table types: those that can be made and those still planned. */
export function galleryCounts(): { available: number; planned: number; total: number } {
  const all = KINDS.flatMap(galleryItems);
  const available = all.filter((i) => i.type !== null).length;
  return { available, planned: all.length - available, total: all.length };
}

/** The tabs of a table type with only the graphs to show: the creatable ones, plus the planned ones when asked. Every tab is kept. */
export const visibleTabs = (kind: TableKind, showPlanned: boolean): GalleryTab[] =>
  GALLERY[kind].map((t) => ({ ...t, items: showPlanned ? t.items : t.items.filter((i) => i.type !== null) }));

export const visibleItems = (kind: TableKind, showPlanned: boolean): GalleryItem[] => visibleTabs(kind, showPlanned).flatMap((t) => t.items);
