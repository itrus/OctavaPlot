import type { FitModelId } from '../stats/fit';

/** Typed project model. Everything here is plain JSON-serialisable data. */

export type Id = string;

export interface Observation {
  id: Id;
  /** null = missing observation (never zero). */
  value: number | null;
  /** The value is kept but not used by any chart or calculation (see model/exclusion.ts). */
  excluded?: boolean;
  /** Why it is excluded, for the record. */
  excludedReason?: string;
}

export interface Group {
  id: Id;
  name: string;
  /** Optional column title shown under the group name in the table. */
  title: string;
  /** Stable index into the theme palette, assigned at creation. */
  paletteIndex: number;
  /** Set only on the columns a graph is drawn from: where the series of this column sat in its table, so its colour stays with it when the series are reordered or hidden. */
  seriesSlot?: number;
  /** Always exactly `DataTable.rowCount` long. */
  observations: Observation[];
}

/**
 * One table row; rows[i] pairs with observations[i] of every group.
 * Compliance: the title is free text stored unencrypted in localStorage and in saved
 * project files; those stores are not covered by the Google Workspace or Microsoft 365
 * BAAs, so it must not hold patient identifiers (policy not verified).
 */
export interface DataRow {
  id: Id;
  title: string;
}

/**
 * What the columns of a table mean. Column: each column is a group of replicate values. XY: the first column is the
 * numeric X coordinate and every other column is a Y series measured at those X values. Grouped: each row is a
 * category and each block of columns a series. Contingency: rows are groups of subjects, columns are outcomes, cells
 * are counts. Survival: the first column is the time and every other column a group (1 = event, 0 = censored).
 */
export type TableKind = 'column' | 'xy' | 'grouped' | 'contingency' | 'survival';

/** How the values of each Y series of an XY table are entered. */
export type SummaryFormat = 'mean-sd-n' | 'mean-sem-n' | 'mean-cv-n' | 'mean-sd' | 'mean-sem' | 'mean-cv' | 'mean-pm' | 'mean-limits';
export type ReplicateLayout =
  /** One Y value for each point. */
  | { kind: 'single' }
  /** `n` replicate values in side-by-side sub-columns; the chart shows their centre and spread. */
  | { kind: 'replicates'; n: number }
  /** Centre and error already calculated elsewhere (spec 2.3, supplied summary). */
  | { kind: 'summary'; format: SummaryFormat };

export interface DataTable {
  id: Id;
  name: string;
  kind: TableKind;
  /** XY tables: how each Y series is entered. Absent = a single Y value. */
  layout?: ReplicateLayout;
  rowCount: number;
  /** Always exactly `rowCount` long. */
  rows: DataRow[];
  groups: Group[];
}

export type ChartAspect = 'free' | '4:3' | '3:4' | '1:1';
export type ChartType =
  | 'bar'
  | 'scatter'
  | 'mean'
  | 'box'
  | 'violin'
  | 'floating'
  | 'paired'
  | 'histogram'
  | 'ecdf'
  | 'xyScatter'
  | 'xyLine'
  | 'xyLineSymbols'
  | 'groupedBar'
  | 'groupedLine'
  | 'heatmap'
  | 'groupedStacked'
  | 'groupedFloating'
  | 'contingencyBars'
  | 'pie'
  | 'doughnut'
  | 'contingencyStacked'
  | 'contingencyPercent'
  | 'survival'
  | 'cumulativeEvent';
export type SymbolShape = 'circle' | 'square' | 'triangle' | 'triangleDown' | 'diamond' | 'hexagon' | 'star' | 'target' | 'plus' | 'cross' | 'asterisk';
export type ErrorDirection = 'both' | 'positive' | 'negative';
type ErrorCap = 'bar' | 'none';
type LegendPosition = 'right' | 'bottom' | 'top';
/** Data set to Y axis binding (spec 5.3 L322); Cartesian chart types only. */
export type AxisBinding = 'primary' | 'secondary';

/** Point labels (spec 7.1 L479-487); names and defaults are P. labelField/expression are not implemented. */
export type PointLabelSource = 'rowTitle' | 'value';
export type PointLabelPlacement = 'above-right' | 'above' | 'below' | 'left' | 'right' | 'centre' | 'custom';
export type PointLabelCollision = 'keep' | 'hide' | 'repel';

/** Bar fill (spec 5.2 L288-295); names and defaults are P (spec 1.2 L57). */
export type FillMode = 'none' | 'solid' | 'pattern';
export type FillPattern =
  | 'horizontal'
  | 'vertical'
  | 'diagonalUp'
  | 'diagonalDown'
  | 'crosshatch'
  | 'diagonalCrosshatch'
  | 'dots';

/** Summary calculation choices (spec 9.1); defaults are P. Not presentation. */
export type CentreKind = 'mean' | 'geometricMean' | 'median';
export type SpreadKind = 'none' | 'sd' | 'sem' | 'ci' | 'range' | 'iqr' | 'gsd';
export type SmallSamplePolicy = 'drawCentre' | 'reject';
export type InvalidPolicy = 'omit' | 'rejectGroup';

export interface SummarySpec {
  centre: CentreKind;
  spread: SpreadKind;
  /** Confidence level C, 0 < C < 1; used by the CI spreads only. */
  confidenceLevel: number;
  smallSamplePolicy: SmallSamplePolicy;
  invalidPolicy: InvalidPolicy;
}

/** Per-group visual style. Colours are CSS hex strings; sizes are in pt. */
export interface ChartStyle {
  showBars: boolean;
  barFill: string;
  barOpacity: number;
  barBorderColor: string;
  barBorderWidthPt: number;
  /** How opaque the border of a bar (or box, violin) is, 0 to 1. */
  barBorderOpacity: number;
  /** Fill block (P). Pattern mode ignores barFill and uses barPatternBackground. */
  barFillMode: FillMode;
  barPattern: FillPattern;
  /** Lattice spacing, pt. */
  barPatternSpacingPt: number;
  /** Stroke width or dot diameter, pt. */
  barPatternWidthPt: number;
  /** null = the bar border colour. */
  barPatternColor: string | null;
  /** null = transparent. */
  barPatternBackground: string | null;

  showSymbols: boolean;
  /** XY charts of replicates: every replicate as a small symbol behind the mean (or median). */
  showRawPoints: boolean;
  symbolColor: string;
  symbolShape: SymbolShape;
  symbolSizePt: number;
  /** How opaque the inside of a symbol is, 0 (hollow: only the border shows) to 1. */
  symbolFillOpacity: number;
  symbolBorderColor: string;
  symbolBorderWidthPt: number;
  /** How opaque the border of a symbol is, 0 to 1. */
  symbolBorderOpacity: number;

  showErrorBars: boolean;
  errorDirection: ErrorDirection;
  errorCap: ErrorCap;
  errorCapWidthPt: number;
  errorLineWidthPt: number;
  errorColor: string;
  /** How opaque the error bars are, 0 to 1. */
  errorOpacity: number;

  /** Connecting line between group means (mean/error chart only). */
  showLines: boolean;
  /** Short horizontal mean line over raw points (scatter chart only). */
  showMeanLine: boolean;
  lineColor: string;
  lineWidthPt: number;
  /** How opaque the connecting and mean lines are, 0 to 1. */
  lineOpacity: number;
  /** Pattern of the line: solid, dashes, dots, or both. */
  lineStyle: LineStyle;

  /** Which Y axis the data set is plotted on (group level; P left/right mapping, spec 5.3 L322). */
  axisBinding: AxisBinding;

  /** Point labels (P, spec 7.1 L479-487): the last 12 keys. */
  showPointLabels: boolean;
  pointLabelSource: PointLabelSource;
  pointLabelPlacement: PointLabelPlacement;
  pointLabelOffsetXPt: number;
  pointLabelOffsetYPt: number;
  pointLabelCollision: PointLabelCollision;
  /** Boolean simplification (P) of the spec leader style; drawn only for displaced labels. */
  pointLabelLeader: boolean;
  pointLabelFontSizePt: number;
  pointLabelBold: boolean;
  pointLabelItalic: boolean;
  /** null = Auto (black). */
  pointLabelColor: string | null;
  /** null = auto (6 significant digits). */
  pointLabelDecimals: number | null;
}

export interface ChartLayer {
  id: Id;
  name: string;
  /** Layer overrides on top of chart defaults. */
  style: Partial<ChartStyle>;
  /** Keyed by group ID. */
  groupOverrides: Record<Id, Partial<ChartStyle>>;
  /** Keyed by object ID (observation ID, or `${groupId}:bar` etc.). */
  objectOverrides: Record<Id, Partial<ChartStyle>>;
  /** Calculation choices (spec 9.1) for all data sets of the layer; kept apart from style. */
  summary: SummarySpec;
  /** Per data set (group ID) overrides of the layer summary; no object level. */
  groupSummary: Record<Id, Partial<SummarySpec>>;
}

/** How an axis maps values to positions (spec 6.1). The log scales need positive values. */
export type AxisScaleKind = 'linear' | 'log10' | 'log2' | 'ln';
/** Which side of the axis line the tick marks point to (spec 6.3). */
export type TickDirection = 'out' | 'in' | 'both' | 'none';
/** How numbers on the axis are written (spec 6.4). */
export type NumberFormatKind = 'auto' | 'fixed' | 'scientific';

/** What the slices of a pie or doughnut say: nothing, the part's name, its count, its share, or two of these. */
export type PieLabelMode = 'none' | 'name' | 'value' | 'percent' | 'name-percent' | 'value-percent';

/** Settings of pies and doughnuts (spec 14), one set for the whole chart. */
export interface PieOptions {
  /** Where the first part starts, in degrees from the top, clockwise. */
  startAngle: number;
  direction: 'clockwise' | 'counterclockwise';
  /** Doughnut: the hole as a fraction of the radius. */
  hole: number;
  labels: PieLabelMode;
  percentDigits: number;
  /** The total of each pie, written under it (and in the hole of a doughnut). */
  showTotal: boolean;
  totalPrefix: string;
}

/** Which way the columns of a column chart run: up from the category axis, or across from it. */
export type ChartOrientation = 'vertical' | 'horizontal';

/** How a box plot ends its whiskers (spec 10.1), and how smooth a violin is (spec 10.2). */
export type WhiskerRuleKind = 'minmax' | 'tukey' | 'p10_90' | 'p5_95' | 'p2_5_97_5' | 'p1_99';
export type SmoothingLevel = 'light' | 'medium' | 'heavy';
export type ViolinNormalisationKind = 'width' | 'area' | 'count';
/** Which observations are drawn as dots over a box or a violin. */
export type DistributionPoints = 'none' | 'outside' | 'all';

/** Settings of box plots and violins, one set for the whole chart; the colours come from each data set's style. */
export interface DistributionOptions {
  whisker: WhiskerRuleKind;
  /** Multiplier of the interquartile range of the Tukey rule. */
  tukeyK: number;
  /** Width of a box and of a violin, as a fraction of the column's slot. */
  boxWidth: number;
  violinWidth: number;
  showMedian: boolean;
  showMean: boolean;
  /** Box: none, outside the whiskers or all; violin: none or all. */
  points: DistributionPoints;
  smoothing: SmoothingLevel;
  /** Violin bandwidth in data units; null = the automatic one of the smoothing level. */
  bandwidth: number | null;
  /** Violin ends: at the smallest and largest value, or following the tails of the kernel. */
  trim: 'sample' | 'tails';
  normalisation: ViolinNormalisationKind;
  showQuartiles: boolean;
}

/** Paired plots: the rows of a column table are subjects, joined by a line across the columns (spec 7.2, 8.3). */
interface PairOptions {
  /** A subject with a missing value: join the values either side of it (never invent one), or break the line there. */
  bridge: boolean;
}

/** Colour scales of a heat map (spec 13.1). */
export type HeatPalette = 'viridis' | 'magma' | 'blue' | 'greenred' | 'grayscale';

/** Settings of heat maps, one set for the whole chart: colours, normalising, labels (spec 13). */
export interface HeatmapOptions {
  palette: HeatPalette;
  reverse: boolean;
  /** The range the colours cover; null = the smallest and largest value. */
  min: number | null;
  max: number | null;
  /** Diverging scale (green, black, red): the value that is black; null = the middle of the range. */
  centre: number | null;
  normalise: 'none' | 'row' | 'column';
  method: 'zscore' | 'minmax' | 'centre';
  /** A cell of replicates shows their mean or their median. */
  summary: 'mean' | 'median';
  showValues: boolean;
  /** Digits after the decimal point of the numbers in the cells; null = automatic. */
  decimals: number | null;
  /** Space between cells, pt. */
  cellGapPt: number;
  /** Swap rows and columns. */
  transpose: boolean;
  colourbar: boolean;
  missingColour: string;
}

/** How an XY chart shows a curve fit of the Results: which one, and how it is drawn. The model itself belongs to the analysis. */
export interface ChartFit {
  /** The curve fit analysis the curves come from; null = no curve. */
  analysisId: Id | null;
  band: 'none' | 'confidence' | 'prediction';
  /** Carry the curve over the whole X axis rather than over the data. */
  extend: boolean;
  /** Write the fitted parameters on the chart. */
  showParameters: boolean;
}

/** A curve fit as the chart is drawn from it: the chart's choices together with the model and level of the analysis. */
export interface FitSettings {
  /** 'none' draws no curve. */
  model: FitModelId | 'none';
  /** Polynomial only. */
  degree: number;
  band: ChartFit['band'];
  /** Confidence level of the band and of the parameter intervals, as a fraction. */
  level: number;
  extend: boolean;
  showParameters: boolean;
}

/** Settings of histograms and cumulative distributions (spec 11), one set for the whole chart. */
export interface HistogramOptions {
  /** Automatic bins, or equal bins of `binWidth`. */
  binning: 'auto' | 'width';
  binWidth: number | null;
  /** An edge the bins line up with; null = multiples of the width. */
  firstEdge: number | null;
  frequency: 'count' | 'fraction' | 'percent' | 'density';
  cumulative: 'off' | 'ascending' | 'descending';
  /** Several data sets: bars over each other, or side by side in each bin. */
  arrangement: 'overlay' | 'side';
  /** Space between bars as a percentage of a bin's width. */
  gapPct: number;
  ecdfDirection: 'atOrBelow' | 'above';
  ecdfUnits: 'fraction' | 'percent' | 'count';
  /** A symbol at each step of the cumulative distribution. */
  ecdfSymbols: boolean;
  /** Carry the curve to both ends of the axis. */
  ecdfExtend: boolean;
}

/** What a label on a bar says: nothing, the plotted value (mean, median...) or the sample size. */
export type BarLabelMode = 'none' | 'value' | 'n';

/** Labels above the bars (spec 19.2 bound values); one setting for the whole chart. */
export interface BarLabels {
  show: BarLabelMode;
  /** Digits after the decimal point of a value; null = automatic (6 significant digits). */
  decimals: number | null;
  thousands: boolean;
  prefix: string;
  suffix: string;
  sizePt: number;
  /** null = the text colour of the chart. */
  color: string | null;
}

/** Pattern of a line: solid, dashed or dotted. */
export type LineOrder = 'auto' | 'onTop' | 'underneath';
export type LineStyle = 'solid' | 'longDash' | 'dashed' | 'dotted' | 'dashDot' | 'dashDotDot';
/** The frame round the plotting region: none, or a box (spec 6.2 frame.mode). */
export type FrameStyle = 'none' | 'box';

/** Colour, thickness and pattern of the major and the minor gridlines (spec 6.5); shared by the axes. */
export interface GridStyle {
  color: string;
  widthPt: number;
  style: LineStyle;
  minorColor: string;
  minorWidthPt: number;
  minorStyle: LineStyle;
  /** Opacity of the major and of the minor gridlines, 0 to 1. */
  opacity: number;
  minorOpacity: number;
}

/** A range of values left out of a numeric axis: the axis shows what is below and above it, with a gap between. */
export interface AxisBreak {
  from: number;
  to: number;
}

/** The mark on the axis line at a break (spec 6.6). */
export type BreakMark = 'none' | 'slash' | 'doubleSlash';

export interface AxisConfig {
  title: string;
  /** Show the title text; switching it off keeps the text. */
  titleVisible: boolean;
  titleBold: boolean;
  tickBold: boolean;
  /** Extra distance of the title, and of the tick numbers, from the axis, pt. */
  titleOffsetPt: number;
  tickLabelOffsetPt: number;
  visible: boolean;
  lineWidthPt: number;
  tickFontSizePt: number;
  titleFontSizePt: number;
  /** null = automatic. */
  min: number | null;
  max: number | null;
  /** Linear axes: the step between major ticks. Log axes: the step in powers of the base (whole numbers). */
  majorInterval: number | null;
  showGrid: boolean;
  /** Minor gridlines, at the minor ticks (which have to be switched on). */
  showMinorGrid: boolean;
  /** At most two ranges left out of a linear, not reversed axis; ignored on a log axis and on a reversed one. */
  breaks: AxisBreak[];
  breakMark: BreakMark;
  /** While the axis is hidden: a short bar the length of one major tick interval takes its place (spec 6.6). */
  scaleBar: boolean;
  /** Numeric axes only; the category axis has no scale. */
  scale: AxisScaleKind;
  /** Draw the axis the other way round: the largest value where the smallest was (spec 6.1 axis.reverse). */
  reverse: boolean;
  /** Minor ticks between two major ticks: 0 = none. On a log10 axis any number above 0 means 2 to 9 times the power. */
  minorTicks: number;
  tickDirection: TickDirection;
  /** Length of a major tick, pt; minor ticks are half of it. */
  tickLengthPt: number;
  numberFormat: NumberFormatKind;
  /** Digits after the decimal point; null = automatic. */
  decimals: number | null;
  /** Group the digits of large numbers by thousands. */
  thousands: boolean;
  prefix: string;
  suffix: string;
}

/** Shape of the colour key in the legend: a wide rectangle or a square. */
export type LegendKeyShape = 'rectangle' | 'square';

export interface LegendConfig {
  visible: boolean;
  keyShape: LegendKeyShape;
  position: LegendPosition;
  fontSizePt: number;
  /** Data sets left out of the legend; the others stay listed. */
  hiddenGroupIds: Id[];
}

/**
 * Where the columns of a column chart sit (percent of a column's width): the space between two columns, before the
 * first and after the last; null = automatic (the layout the charts always had). The baseline is where the bars begin.
 */
export interface BarLayout {
  gapPct: number | null;
  beforePct: number | null;
  afterPct: number | null;
  /** Bars begin at this value instead of 0 (null = automatic: 0, or the nearest edge of the axis). */
  baseline: number | null;
}

export interface JitterConfig {
  enabled: boolean;
  /** Fraction of the category slot width, 0..1. */
  widthFraction: number;
}

/** A line across the plotting region at a value of an axis (a threshold, a target, a control level). */
export interface ReferenceLine {
  id: Id;
  /** Which axis the value is on: X (a vertical line) or Y (a horizontal one). */
  axis: 'x' | 'y';
  value: number;
  color: string;
  widthPt: number;
  style: LineStyle;
  /** How opaque the line and its label are, 0 (invisible) to 1. */
  opacity: number;
  /** Text written at the end of the line. */
  label: string;
  showLabel: boolean;
}

export interface Annotation {
  id: Id;
  text: string;
  /** Position of the text's top-left corner as a fraction of chart width/height. */
  xFrac: number;
  yFrac: number;
  fontSizePt: number;
  color: string;
  /** 0 (invisible) to 1. */
  opacity: number;
}

/** How the pointwise interval of a survival estimate is built. Log-log keeps it inside 0 to 1; plain is S +/- z SE. */
export type SurvivalBandMethod = 'loglog' | 'plain';

export interface SurvivalOptions {
  /** Draw the confidence band around each curve. */
  band: boolean;
  /** Confidence level, 0 < level < 1. */
  level: number;
  method: SurvivalBandMethod;
  /** Show the number of subjects still at risk under the plot, at the ticks of the time axis. */
  atRisk: boolean;
  /** A symbol at every event time too, not only at the censored subjects. */
  eventSymbols: boolean;
  /** Error bars of one standard error (Greenwood) at every event time. */
  errorBars: boolean;
}

export interface Chart {
  id: Id;
  name: string;
  dataTableId: Id;
  type: ChartType;
  /** Chart size in CSS pixels (1 px = 0.75 pt). */
  widthPx: number;
  heightPx: number;
  /** Data sets of the chart's own table that are switched off on this graph. */
  hiddenGroupIds: Id[];
  /** Order of the data sets on the graph (column charts): those listed come first, in this order. */
  groupOrder: Id[];
  /** Space before a data set as a percentage of the normal space between columns; absent = 100. */
  groupGaps: Record<Id, number>;
  /** Data sets from other tables that are plotted on this graph too. */
  extraGroups: Array<{ tableId: Id; groupId: Id }>;
  /** Survival and cumulative-event charts: confidence band and at-risk table. */
  survival: SurvivalOptions;
  /** Shape lock: with 4:3 or square, changing the width or the height moves the other one too. */
  aspect: ChartAspect;
  /** Last palette applied to the data sets (see model/palettes.ts); null = colours set by hand. */
  paletteId: string | null;
  title: string;
  showTitle: boolean;
  titleFontSizePt: number;
  /** Font of every text in the chart (one of FONT_FAMILIES) and the colour of the text. */
  fontFamily: string;
  textColor: string;
  titleBold: boolean;
  /** Extra distance of the chart title from the top edge, pt. */
  titleOffsetPt: number;
  /** Colour of the axis lines, ticks and the frame. */
  axisColor: string;
  /** Opacity of the axis lines, their ticks and the frame, 0 to 1. */
  axisOpacity: number;
  /** Fill of the plotting region and of the whole chart; null = none (transparent). */
  plotColor: string | null;
  pageColor: string | null;
  frame: FrameStyle;
  grid: GridStyle;
  /** Column charts only: horizontal puts the categories on the left and the value axis along the bottom. */
  orientation: ChartOrientation;
  /** Where lines and error bars are drawn relative to the symbols and bars: as the chart type usually does (auto), over them, or under them. */
  lineOrder: LineOrder;
  /** Where the axis lines cross, as values on the other axis (null = the low edge): the Y axis at this X, the X axis at this Y. */
  origin: { x: number | null; y: number | null };
  bars: BarLayout;
  barLabels: BarLabels;
  distribution: DistributionOptions;
  pairs: PairOptions;
  heatmap: HeatmapOptions;
  histogram: HistogramOptions;
  fit: ChartFit;
  pie: PieOptions;
  xAxis: AxisConfig;
  yAxis: AxisConfig;
  /** Right Y axis; used only while a data set is bound to it (spec 6.2 L363). */
  y2Axis: AxisConfig;
  legend: LegendConfig;
  /** Legend/axis display names keyed by group ID. Empty/missing = data name. */
  displayNames: Record<Id, string>;
  jitter: JitterConfig;
  /** Chart defaults: the lowest level of the style hierarchy. */
  defaults: ChartStyle;
  layers: ChartLayer[];
  annotations: Annotation[];
  /** Lines at chosen values of the axes. */
  referenceLines: ReferenceLine[];
  /** IDs of layers (see model/layers.ts) that are not drawn. Hiding changes nothing that is calculated. */
  hiddenLayerIds: Id[];
  /** Look of single layers, keyed by layer ID (see model/layers.ts); a value that is absent is the series' own. */
  layerStyles: Record<Id, Partial<LayerStyle>>;
}

/** What a layer can be given of its own: the fit curve its colour, thickness and pattern, the fit band its colour and opacity. */
export interface LayerStyle {
  color: string;
  widthPt: number;
  lineStyle: LineStyle;
  /** Fill opacity, 0 to 1. */
  opacity: number;
}

/** The analyses of the Results section: descriptive statistics of each column, and curve fits of an XY table. */
export type AnalysisKind = 'descriptive' | 'curvefit';

/** An analysis of one data table. Its results are never stored: they are recalculated from the table each time. */
export interface Analysis {
  id: Id;
  name: string;
  kind: AnalysisKind;
  dataTableId: Id;
  /** Confidence level of the intervals, 0 < level < 1. */
  level: number;
  /** Curve fits: the model (a FitModelId) and, for a polynomial, its degree. */
  model?: FitModelId;
  degree?: number;
}

export interface Project {
  id: Id;
  name: string;
  dataTables: DataTable[];
  charts: Chart[];
  /** Absent when there are none. */
  analyses?: Analysis[];
}

export type Selection =
  | { kind: 'chart' }
  | { kind: 'group'; groupId: Id }
  /** One raw observation's symbol (and its label); mean markers are not selectable. */
  | { kind: 'point'; groupId: Id; pointId: Id }
  | { kind: 'annotation'; annotationId: Id };

export type ViewRef = { kind: 'table'; id: Id } | { kind: 'chart'; id: Id } | { kind: 'analysis'; id: Id };
