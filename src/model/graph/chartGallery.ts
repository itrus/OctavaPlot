import { chartTypeInfo } from './chartTypes';
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

/** A graph of a chart type as it is, with the name and the description of the type (chartTypes.ts), so that the gallery and the type list say the same. */
const typed = (id: string, type: ChartType, spec?: string): GalleryItem => {
  const info = chartTypeInfo(type);
  if (!info) throw new Error(`No chart type ${type}`);
  return { id, label: info.label, description: info.description, type, spec };
};

export const GALLERY: Record<TableKind, GalleryTab[]> = {
  xy: [
    {
      id: 'xy',
      label: 'XY',
      items: [
        typed('xyScatter', 'xyScatter'),
        typed('xyLineSymbols', 'xyLineSymbols'),
        typed('xyLine', 'xyLine'),
        typed('xy.bars', 'xyBars', 'xy.bars'),
        typed('xy.area', 'xyArea', 'xy.area'),
        typed('xy.spikes', 'xySpikes', 'xy.spikes'),
        item('xy.bubble', 'Bubbles', 'Symbols whose area follows a second column: make the table with "Y and size".', 'xyBubble', 'xy.bubble', { bubbles: true }),
        typed('xy.volcano', 'xyVolcano', 'xy.volcano'),
        item('xy.offset', 'Offset traces', 'Several series stacked with a fixed offset and a scale bar.', 'xyOffset', 'xy.offset_traces', { offsetTraces: true }),
        item('curve.fit', 'Points with a fitted curve', 'A fitted line with its confidence band; choose another model in the panel.', 'xyScatter', 'curve.fit', { fit: { model: 'linear', band: 'confidence' } }),
      ],
    },
  ],
  column: [
    {
      id: 'summary',
      label: 'Mean/median & error',
      items: [
        typed('bar', 'bar'),
        typed('mean', 'mean'),
        item('barsH', 'Horizontal bars', 'The bar chart turned on its side.', 'bar', 'category.bar', { orientation: 'horizontal' }),
      ],
    },
    {
      id: 'individual',
      label: 'Individual values',
      items: [
        typed('scatter', 'scatter'),
        item('cat.aligned', 'Aligned dots', 'Dots in a column without spreading them sideways.', 'scatter', 'category.aligned', { jitter: false }),
        item('cat.swarm', 'Beeswarm', 'Every value as a dot, placed sideways by its value so that none touches another.', 'scatter', 'category.swarm', { swarm: true }),
        typed('paired', 'paired', 'category.paired'),
      ],
    },
    {
      id: 'box',
      label: 'Box and violin',
      items: [
        typed('box', 'box', 'distribution.box'),
        typed('floating', 'floating', 'category.range'),
        typed('violin', 'violin', 'distribution.violin'),
        item('boxH', 'Horizontal box', 'The box plot turned on its side.', 'box', 'distribution.box', { orientation: 'horizontal' }),
        item('violinH', 'Horizontal violin', 'The violin plot turned on its side.', 'violin', 'distribution.violin', { orientation: 'horizontal' }),
      ],
    },
    {
      id: 'frequency',
      label: 'Histogram and distribution',
      items: [
        typed('histogram', 'histogram'),
        typed('ecdf', 'ecdf'),
      ],
    },
  ],
  grouped: [
    {
      id: 'summary',
      label: 'Summary data',
      items: [
        typed('groupedBar', 'groupedBar'),
        typed('groupedLine', 'groupedLine'),
        typed('groupedStacked', 'groupedStacked', 'category.stacked'),
        item('grp.barsH', 'Horizontal interleaved bars', 'Interleaved bars turned on their side.', 'groupedBar', 'category.grouped', { orientation: 'horizontal' }),
        item('grp.stackedH', 'Horizontal stacked bars', 'Stacked bars turned on their side.', 'groupedStacked', 'category.stacked', { orientation: 'horizontal' }),
        item('grp.forest', 'Forest plot', 'Estimates with their intervals, one row for each study, as typed (nothing is pooled): make the table with "Mean (or median), Upper/Lower limits". A dashed line marks no effect at 0.', 'groupedLine', 'special.forest', { forest: 'difference' }),
        item('grp.forestRatio', 'Forest plot, ratios', 'The same for ratios (odds, risk or hazard ratios): a log axis, and the dashed line marks no effect at 1.', 'groupedLine', 'special.forest', { forest: 'ratio' }),
        typed('grp.floating', 'groupedFloating', 'category.range'),
      ],
    },
    {
      id: 'individual',
      label: 'Individual values',
      items: [
        item('grp.scatterI', 'Interleaved scatter', 'Dots of every series side by side within each category.', 'groupedBar', 'category.grouped', { dotsOnly: true }),
        item('grp.scatterS', 'Separated scatter', 'Dots of each series in its own group of columns, one column for each category.', 'groupedBar', 'category.grouped', { dotsOnly: true, separated: true }),
      ],
    },
    {
      id: 'heat',
      label: 'Heat map',
      items: [
        item('heat.blue', 'Blue heat map', 'A single-hue scale, pale to dark blue, for values that are all positive. Twenty-six more gradients are in the Inspector.', 'heatmap', 'matrix.heatmap', { heatPalette: 'bs-blue' }),
        item('heat.purple', 'Purple heat map', 'A single-hue scale, pale to dark purple.', 'heatmap', 'matrix.heatmap', { heatPalette: 'bs-purple' }),
        item('heat.red', 'Red heat map', 'A single-hue scale, pale to dark red.', 'heatmap', 'matrix.heatmap', { heatPalette: 'md-red' }),
        item('heat.gsea', 'GSEA heat map', 'A diverging scale, blue through pale to red, around a middle value.', 'heatmap', 'matrix.heatmap', { heatPalette: 'gsea' }),
      ],
    },
    {
      id: 'three',
      label: 'Three-way',
      items: [
        typed('three.bars', 'groupedBar', 'category.nested'),
        item('three.dots', 'Three-way dots', 'Individual values for two grouping levels: enter replicates, and name the factor of each series (Factor…).', 'groupedBar', 'category.nested', { dotsOnly: true }),
      ],
    },
    {
      id: 'box',
      label: 'Box and violin',
      items: [
        typed('grp.box', 'groupedBox', 'distribution.box'),
        typed('grp.violin', 'groupedViolin', 'distribution.violin'),
      ],
    },
  ],
  contingency: [
    {
      id: 'contingency',
      label: 'Contingency',
      items: [
        typed('contingencyBars', 'contingencyBars'),
        typed('contingencyStacked', 'contingencyStacked'),
        typed('contingencyPercent', 'contingencyPercent'),
        item('cont.sideH', 'Horizontal side-by-side bars', 'Side-by-side bars turned on their side.', 'contingencyBars', 'category.counts', { orientation: 'horizontal' }),
        item('cont.stackH', 'Horizontal stacked bars', 'Stacked bars turned on their side.', 'contingencyStacked', 'category.stacked', { orientation: 'horizontal' }),
        item('cont.pctH', 'Horizontal 100% bars', '100% stacked bars turned on their side.', 'contingencyPercent', 'category.normalised_stack', { orientation: 'horizontal' }),
        typed('pie', 'pie', 'whole.pie'),
        typed('doughnut', 'doughnut', 'whole.doughnut'),
        typed('slices', 'slices', 'whole.slices'),
        typed('dotGrid', 'dotGrid', 'whole.dots'),
      ],
    },
  ],
  survival: [
    {
      id: 'survival',
      label: 'Survival',
      items: [
        typed('survival', 'survival'),
        typed('cumulativeEvent', 'cumulativeEvent'),
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

/** The graph a new one of a table type starts as: the first of the New Graph gallery, so that the dialog and the program agree on what "the default" is. */
export const defaultChartTypeFor = (kind: TableKind): ChartType => availableItems(kind)[0].type as ChartType;
