import type { ChartVariant } from './chartVariant';
import type { ChartType, TableKind } from './types';

/**
 * The gallery of graphs offered for each table type, grouped into tabs. A graph with a `type` can be made now; one
 * without is a planned preset from the specification (section 3), shown locked so the whole catalogue is visible.
 */
export interface GalleryItem {
  /** Unique key; also selects the thumbnail. */
  id: string;
  label: string;
  description: string;
  /** The chart type to create, or null while the graph is planned. */
  type: ChartType | null;
  /** The specification's preset ID, for planned graphs. */
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
        item('xy.area', 'Area under the curve', 'A filled area below, above or between curves.', null, 'xy.area'),
        item('xy.spikes', 'Spikes', 'Thin lines from the baseline up to each point.', null, 'xy.spikes'),
        item('xy.vector', 'Vectors', 'Arrows from the origin or between two points.', null, 'xy.vector'),
        item('xy.bubble', 'Bubbles', 'Symbols sized or coloured by another column.', null, 'xy.bubble'),
        item('xy.trajectory', 'Repeated measures', 'One line per subject, for example before and after.', null, 'xy.trajectory'),
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
        item('cat.aligned', 'Aligned dots', 'Dots in a column without spreading them sideways.', null, 'category.aligned'),
        item('paired', 'Before and after', 'The values of each subject joined by a line.', 'paired', 'category.paired'),
        item('cat.nested', 'Nested dots', 'Technical repeats inside each independent unit.', null, 'category.nested'),
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
        item('range', 'Floating range bars', 'A bar between a lower and an upper value.', null, 'category.range'),
      ],
    },
  ],
  grouped: [
    {
      id: 'individual',
      label: 'Individual values',
      items: [
        item('grp.scatterI', 'Interleaved scatter', 'Dots of every series side by side within each category.', null, 'category.grouped'),
        item('grp.scatterS', 'Separated scatter', 'Dots of each series in its own group of columns.', null, 'category.grouped'),
        item('grp.paired', 'Before and after, grouped', 'Subject lines inside each category.', null, 'category.paired'),
      ],
    },
    {
      id: 'summary',
      label: 'Summary data',
      items: [
        item('groupedBar', 'Interleaved bars', 'Bars side by side within each category, with error bars.', 'groupedBar'),
        item('groupedLine', 'Lines over categories', 'One line per series joining its means across the categories.', 'groupedLine'),
        item('groupedStacked', 'Stacked bars', 'The series stacked in one bar per category.', 'groupedStacked', 'category.stacked'),
        item('grp.barsH', 'Horizontal interleaved bars', 'Interleaved bars turned on their side.', null, 'category.grouped'),
        item('grp.stackedH', 'Horizontal stacked bars', 'Stacked bars turned on their side.', null, 'category.stacked'),
        item('grp.floating', 'Floating bars', 'Bars between a lower and an upper value.', null, 'category.range'),
      ],
    },
    {
      id: 'heat',
      label: 'Heat map',
      items: [
        item('heat.viridis', 'Viridis heat map', 'Each cell coloured by its value, dark purple to yellow.', 'heatmap', 'matrix.heatmap', { heatPalette: 'viridis' }),
        item('heat.magma', 'Magma heat map', 'Each cell coloured by its value, black to pale yellow.', 'heatmap', 'matrix.heatmap', { heatPalette: 'magma' }),
        item('heat.blue', 'Blue-white heat map', 'A single-hue scale for values that are all positive.', 'heatmap', 'matrix.heatmap', { heatPalette: 'blue' }),
        item('heat.greenred', 'Green-black-red heat map', 'A diverging scale around a middle value.', 'heatmap', 'matrix.heatmap', { heatPalette: 'greenred' }),
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
        item('grp.box', 'Grouped box and whiskers', 'A box plot for every series in each category.', null, 'distribution.box'),
        item('grp.violin', 'Grouped violin', 'A violin for every series in each category.', null, 'distribution.violin'),
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
        item('cont.sideH', 'Horizontal side-by-side bars', 'Side-by-side bars turned on their side.', null, 'category.counts'),
        item('cont.stackH', 'Horizontal stacked bars', 'Stacked bars turned on their side.', null, 'category.stacked'),
        item('cont.pctH', 'Horizontal 100% bars', '100% stacked bars turned on their side.', null, 'category.normalised_stack'),
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
        item('surv.symbols', 'Staircase with symbols at every event', 'Symbols at all points, not only the censored ones.', null, 'curve.survival'),
        item('surv.se', 'Survival with SE error bars', 'The standard error of the estimate at each event time.', null, 'curve.survival'),
        item('cum.se', 'Cumulative events with error bars', 'Error bars on the cumulative curve.', null, 'curve.cumulative_event'),
      ],
    },
  ],
};

/** Every gallery item of a table type, in order. */
export const galleryItems = (kind: TableKind): GalleryItem[] => GALLERY[kind].flatMap((t) => t.items);
export const availableItems = (kind: TableKind): GalleryItem[] => galleryItems(kind).filter((i) => i.type !== null);
