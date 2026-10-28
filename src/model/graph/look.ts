import { AXIS_LIMITS } from './axis';
import { sanitizeBarLabels, sanitizeBars } from '../options/columnOptions';
import { FONT_FAMILY } from '../defaults';
import { sanitizeDistribution } from '../options/distributionOptions';
import { sanitizeHeatmap } from '../options/heatmapOptions';
import { sanitizeFit } from '../options/fitOptions';
import { sanitizeHistogram } from '../options/histogramOptions';
import { sanitizePie } from '../options/pieOptions';
import { bool, clamp, hex, numberOrNull, oneOf, optionalHex, record, valuesOf } from '../sanitize';
import type { Chart, ChartOrientation, FrameStyle, GridStyle, LegendKeyShape, LineConnect, LineOrder, LineStyle } from '../types';

/** How a chart looks as a whole: fonts, colours, frame, gridlines, direction (and the column and box settings it carries). */

/** Fonts offered for the text of a chart: CSS font stacks that exist on common systems. */
export const FONT_FAMILIES: ReadonlyArray<{ value: string; label: string }> = [
  { value: FONT_FAMILY, label: 'Arial' },
  { value: "'Times New Roman', Times, serif", label: 'Times New Roman' },
  { value: "Georgia, 'Times New Roman', serif", label: 'Georgia' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
  { value: "'Courier New', Courier, monospace", label: 'Courier New' },
];

export const LINE_STYLES: ReadonlyArray<{ value: LineStyle; label: string }> = [
  { value: 'solid', label: 'Solid' },
  { value: 'longDash', label: 'Long dashes' },
  { value: 'dashed', label: 'Dashes' },
  { value: 'dotted', label: 'Dots' },
  { value: 'dashDot', label: 'Dash, dot' },
  { value: 'dashDotDot', label: 'Dash, dot, dot' },
];

export const FRAME_STYLES: ReadonlyArray<{ value: FrameStyle; label: string }> = [
  { value: 'none', label: 'No frame' },
  { value: 'box', label: 'Box' },
];

export const GRID_LIMITS = { widthPt: { min: 0.2, max: 10 } } as const;

/** Print widths a graph is checked against (mm): the usual single column, 1.5 columns and double column; any width from min to max is allowed too. */
export const PRINT_WIDTH_MM = { presets: [90, 140, 180], min: 20, max: 400 } as const;

/** The print width of a graph from a file or a patch: held within the limits; anything that is not a number is none (undefined). */
export const sanitizePrintWidthMm = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? clamp(v, PRINT_WIDTH_MM.min, PRINT_WIDTH_MM.max, PRINT_WIDTH_MM.min) : undefined);

const LINES = valuesOf(LINE_STYLES);
const FRAMES = valuesOf(FRAME_STYLES);
const LINE_ORDERS: ReadonlyArray<LineOrder> = ['auto', 'onTop', 'underneath'];
const LINE_CONNECTS: ReadonlyArray<LineConnect> = ['table', 'x', 'subject'];
const ORIENTATIONS:readonly ChartOrientation[] = ['vertical', 'horizontal'];

/** Lengths of the dashes and gaps of each pattern, in units of the line's width (a line thinner than 2 pt counts as 2 pt). */
const DASHES: Record<LineStyle, readonly number[]> = {
  solid: [],
  longDash: [8, 4],
  dashed: [4, 3],
  dotted: [1, 2],
  dashDot: [6, 3, 1, 3],
  dashDotDot: [6, 3, 1, 3, 1, 3],
};

/** Dash pattern of a line style at a line width (undefined = solid). */
export const dashOf = (style: LineStyle, widthPt = 2): string | undefined => {
  const unit = Math.max(2, widthPt);
  const lengths = DASHES[style];
  return lengths.length === 0 ? undefined : lengths.map((n) => Number((n * unit).toFixed(2))).join(' ');
};

/** The attributes that draw a series line in its pattern: round ends for a solid line, square-cut ones so dashes and dots stay what they are. */
export const linePattern = (s: { lineStyle: LineStyle; lineWidthPt: number }) => ({ strokeDasharray: dashOf(s.lineStyle, s.lineWidthPt), strokeLinecap: s.lineStyle === 'solid' ? ('round' as const) : ('butt' as const) });

/** Width of the colour key in the legend, pt: 36 for a rectangle, 20 for a square (its height is 20). */
export const legendKeyWidthPt = (shape: LegendKeyShape): number => (shape === 'square' ? 20 : 36);

type Look = Pick<Chart, 'origin' | 'orientation' | 'lineOrder' | 'lineConnect' | 'bars' | 'barLabels' | 'distribution' | 'pairs' | 'heatmap' | 'histogram' | 'fit' | 'pie' | 'axisColor' | 'axisOpacity' | 'plotColor' | 'pageColor' | 'frame' | 'grid' | 'fontFamily' | 'textColor' | 'titleBold' | 'titleOffsetPt'>;

/** The look of a chart from a file or a patch: a value that is not valid falls back to the one in `base`. */
export function sanitizeLook(c: Record<string, unknown>, base: Look): Look {
  const g = record(c.grid);
  const width = GRID_LIMITS.widthPt;
  const grid: GridStyle = {
    color: hex(g.color, base.grid.color),
    widthPt: clamp(g.widthPt, width.min, width.max, base.grid.widthPt),
    style: oneOf(LINES, g.style, base.grid.style),
    minorColor: hex(g.minorColor, base.grid.minorColor),
    minorWidthPt: clamp(g.minorWidthPt, width.min, width.max, base.grid.minorWidthPt),
    minorStyle: oneOf(LINES, g.minorStyle, base.grid.minorStyle),
    opacity: clamp(g.opacity, 0, 1, base.grid.opacity),
    minorOpacity: clamp(g.minorOpacity, 0, 1, base.grid.minorOpacity),
  };
  return {
    orientation: oneOf(ORIENTATIONS, c.orientation, base.orientation),
    lineOrder: oneOf(LINE_ORDERS, c.lineOrder, base.lineOrder),
    lineConnect: oneOf(LINE_CONNECTS, c.lineConnect, base.lineConnect),
    origin: { x: numberOrNull(record(c.origin).x, base.origin.x), y: numberOrNull(record(c.origin).y, base.origin.y) },
    bars: sanitizeBars(c.bars, base.bars),
    barLabels: sanitizeBarLabels(c.barLabels, base.barLabels),
    distribution: sanitizeDistribution(c.distribution, base.distribution),
    pairs: { bridge: bool(record(c.pairs).bridge, base.pairs.bridge), bySubject: bool(record(c.pairs).bySubject, base.pairs.bySubject) },
    heatmap: sanitizeHeatmap(c.heatmap, base.heatmap),
    histogram: sanitizeHistogram(c.histogram, base.histogram),
    fit: sanitizeFit(c.fit, base.fit),
    pie: sanitizePie(c.pie, base.pie),
    fontFamily: oneOf(valuesOf(FONT_FAMILIES), c.fontFamily, base.fontFamily),
    textColor: hex(c.textColor, base.textColor),
    titleBold: bool(c.titleBold, base.titleBold),
    titleOffsetPt: clamp(c.titleOffsetPt, AXIS_LIMITS.offsetPt.min, AXIS_LIMITS.offsetPt.max, base.titleOffsetPt),
    axisColor: hex(c.axisColor, base.axisColor),
    axisOpacity: clamp(c.axisOpacity, 0, 1, base.axisOpacity),
    // A missing colour is left as it is: "no colour" is a value of its own, written as null.
    plotColor: 'plotColor' in c ? optionalHex(c.plotColor, base.plotColor) : base.plotColor,
    pageColor: 'pageColor' in c ? optionalHex(c.pageColor, base.pageColor) : base.pageColor,
    frame: oneOf(FRAMES, c.frame, base.frame),
    grid,
  };
}
