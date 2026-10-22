/** Typed project model. Everything here is plain JSON-serialisable data. */

export type Id = string;

export interface Observation {
  id: Id;
  /** null = missing observation (never zero). */
  value: number | null;
}

export interface Group {
  id: Id;
  name: string;
  /** Optional column title shown under the group name in the table. */
  title: string;
  /** Stable index into the theme palette, assigned at creation. */
  paletteIndex: number;
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

export interface DataTable {
  id: Id;
  name: string;
  rowCount: number;
  /** Always exactly `rowCount` long. */
  rows: DataRow[];
  groups: Group[];
}

export type ChartType = 'bar' | 'scatter' | 'mean';
export type SymbolShape = 'circle' | 'square' | 'triangle' | 'diamond';
export type ErrorDirection = 'both' | 'positive' | 'negative';
export type ErrorCap = 'bar' | 'none';
export type LegendPosition = 'right' | 'bottom' | 'top';
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
  symbolColor: string;
  symbolShape: SymbolShape;
  symbolSizePt: number;
  symbolBorderColor: string;
  symbolBorderWidthPt: number;

  showErrorBars: boolean;
  errorDirection: ErrorDirection;
  errorCap: ErrorCap;
  errorCapWidthPt: number;
  errorLineWidthPt: number;
  errorColor: string;

  /** Connecting line between group means (mean/error chart only). */
  showLines: boolean;
  /** Short horizontal mean line over raw points (scatter chart only). */
  showMeanLine: boolean;
  lineColor: string;
  lineWidthPt: number;

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

export interface AxisConfig {
  title: string;
  visible: boolean;
  lineWidthPt: number;
  tickFontSizePt: number;
  titleFontSizePt: number;
  /** null = automatic. */
  min: number | null;
  max: number | null;
  majorInterval: number | null;
  showGrid: boolean;
}

export interface LegendConfig {
  visible: boolean;
  position: LegendPosition;
  fontSizePt: number;
}

export interface JitterConfig {
  enabled: boolean;
  /** Fraction of the category slot width, 0..1. */
  widthFraction: number;
}

export interface Annotation {
  id: Id;
  text: string;
  /** Position of the text's top-left corner as a fraction of chart width/height. */
  xFrac: number;
  yFrac: number;
  fontSizePt: number;
  color: string;
}

export interface Chart {
  id: Id;
  name: string;
  dataTableId: Id;
  type: ChartType;
  widthMm: number;
  heightMm: number;
  title: string;
  showTitle: boolean;
  titleFontSizePt: number;
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
}

export interface Project {
  id: Id;
  name: string;
  dataTables: DataTable[];
  charts: Chart[];
}

export type Selection =
  | { kind: 'chart' }
  | { kind: 'group'; groupId: Id }
  /** One raw observation's symbol (and its label); mean markers are not selectable. */
  | { kind: 'point'; groupId: Id; pointId: Id }
  | { kind: 'annotation'; annotationId: Id };

export type ViewRef = { kind: 'table'; id: Id } | { kind: 'chart'; id: Id };
