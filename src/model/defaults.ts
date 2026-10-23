import { newId } from './ids';
import { DEFAULT_PALETTE_ID } from './palettes';
import { chartFamily } from './chartTypes';
import { defaultSeriesName, subLabels, summaryFormatInfo } from './tableLayout';
import { createRows } from './rows';
import type {
  AxisConfig,
  BarLabels,
  BarLayout,
  DistributionOptions,
  HeatmapOptions,
  FitSettings,
  HistogramOptions,
  PieOptions,
  GridStyle,
  Chart,
  ChartLayer,
  ChartStyle,
  ChartType,
  DataTable,
  Group,
  Project,
  ReplicateLayout,
  SummarySpec,
  SurvivalOptions,
} from './types';

export const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
export const INITIAL_ROWS = 20;

/** Size of a new chart when the user has not set another default in Settings. */
export const DEFAULT_CHART_WIDTH_PX = 1024;
export const DEFAULT_CHART_HEIGHT_PX = 768;
/** Limits for any chart dimension, in CSS pixels. */
export const CHART_PX_MIN = 100;
export const CHART_PX_MAX = 3000;

/** Grayscale bar-fill palette, assigned by Group.paletteIndex. */
export const BAR_PALETTE = ['#d9d9d9', '#a6a6a6', '#737373', '#f2f2f2', '#595959', '#bfbfbf'];

/** The layer style a chart of this type starts with: its preset, and for survival curves a plus sign as the censor mark. */
export const initialLayerStyle = (type: ChartType): Partial<ChartStyle> =>
  type === 'survival' || type === 'cumulativeEvent' ? { ...TYPE_PRESETS[type], symbolShape: 'plus', symbolSizePt: 9, symbolBorderWidthPt: 2 } : { ...TYPE_PRESETS[type] };

/** Axis titles a new chart of this type starts with. */
function axisTitlesFor(type: ChartType): { x: string; y: string } {
  switch (type) {
    case 'xyScatter':
    case 'xyLine':
    case 'xyLineSymbols':
      return { x: 'X', y: 'Y' };
    case 'contingencyBars':
    case 'contingencyStacked':
      return { x: '', y: 'Count' };
    case 'contingencyPercent':
      return { x: '', y: 'Percent' };
    case 'histogram':
      return { x: 'Value', y: 'Count' };
    case 'ecdf':
      return { x: 'Value', y: 'Cumulative fraction' };
    case 'heatmap':
      return { x: '', y: '' };
    case 'survival':
      return { x: 'Time', y: 'Fraction surviving' };
    case 'cumulativeEvent':
      return { x: 'Time', y: 'Cumulative events' };
    default:
      return { x: '', y: 'Value' };
  }
}

/** The summary a new chart of this type starts with: XY charts of replicate values show the SD, as the usual convention. */
export const defaultSummaryFor = (type: ChartType): SummarySpec => (chartFamily(type) === 'xy' || type === 'groupedBar' || type === 'groupedLine' ? { ...DEFAULT_SUMMARY, spread: 'sd' } : { ...DEFAULT_SUMMARY });

export const DEFAULT_SURVIVAL: SurvivalOptions = { band: false, level: 0.95, method: 'loglog', atRisk: false };

export const DEFAULT_JITTER = { enabled: true, widthFraction: 0.4 };

/** Line weight shared by the axes, bar borders, error bars and connecting lines, so they read as one family. */
const AXIS_LINE_PT = 2.6;
/** Box plots and violins (spec 10): min-max whiskers, medium smoothing, equal maximum width. */
const DEFAULT_DISTRIBUTION: DistributionOptions = {
  whisker: 'minmax',
  tukeyK: 1.5,
  boxWidth: 0.65,
  violinWidth: 0.8,
  showMedian: true,
  showMean: false,
  points: 'none',
  smoothing: 'medium',
  bandwidth: null,
  trim: 'sample',
  normalisation: 'width',
  showQuartiles: true,
};
/** Heat maps (spec 13.1): a single gradient, the range of the values, nothing normalised, no numbers in the cells. */
const DEFAULT_HEATMAP: HeatmapOptions = { palette: 'viridis', reverse: false, min: null, max: null, centre: null, normalise: 'none', method: 'zscore', summary: 'mean', showValues: false, decimals: null, cellGapPt: 0, transpose: false, colourbar: true, missingColour: '#d9d9d9' };
/** No fitted curve until one is chosen; a band, when asked for, is the 95% interval of the curve. */
const DEFAULT_FIT: FitSettings = { model: 'none', degree: 2, band: 'none', level: 0.95, extend: false, showParameters: false };

/** Histograms (spec 11.1): automatic bins, counts, bars touching; the cumulative distribution steps up at each value. */
const DEFAULT_HISTOGRAM: HistogramOptions = { binning: 'auto', binWidth: null, firstEdge: null, frequency: 'count', cumulative: 'off', arrangement: 'overlay', gapPct: 0, ecdfDirection: 'atOrBelow', ecdfUnits: 'fraction', ecdfSymbols: false, ecdfExtend: true };
/** Pies and doughnuts (spec 14): the first part starts at the top, clockwise, labels with the share to one decimal. */
const DEFAULT_PIE: PieOptions = { startAngle: 0, direction: 'clockwise', hole: 0.5, labels: 'percent', percentDigits: 1, showTotal: false, totalPrefix: 'Total = ' };
/** Labels on bars are off until asked for. */
export const DEFAULT_BAR_LABELS: BarLabels = { show: 'none', decimals: null, thousands: false, prefix: '', suffix: '', sizePt: 11.2, color: null };
/** Automatic column layout: the spacing the column charts always had. */
const DEFAULT_BARS: BarLayout = { gapPct: null, beforePct: null, afterPct: null, baseline: null };
/** Gridlines: thin and light, and lighter still for the minor ones (P). */
const DEFAULT_GRID: GridStyle = { color: '#d0d0d0', widthPt: 0.5, style: 'solid', minorColor: '#e6e6e6', minorWidthPt: 0.25, minorStyle: 'solid' };
/** Major tick length, pt (spec 20.2); the layout constant has the same value. */
export const TICK_LENGTH_PT = 5.6;

export const DEFAULT_STYLE: ChartStyle = {
  showBars: true,
  barFill: BAR_PALETTE[0],
  barOpacity: 1,
  barBorderColor: '#000000',
  barBorderWidthPt: 0,
  barFillMode: 'solid',
  barPattern: 'horizontal',
  barPatternSpacingPt: 4,
  barPatternWidthPt: 1,
  barPatternColor: null,
  barPatternBackground: '#ffffff',
  showSymbols: false,
  symbolColor: '#000000',
  symbolShape: 'circle',
  symbolSizePt: 6,
  symbolBorderColor: '#000000',
  symbolBorderWidthPt: 1.5,
  showErrorBars: true,
  errorDirection: 'both',
  errorCap: 'bar',
  errorCapWidthPt: 5,
  errorLineWidthPt: AXIS_LINE_PT,
  errorColor: '#000000',
  showLines: false,
  showMeanLine: false,
  lineColor: '#000000',
  lineWidthPt: AXIS_LINE_PT,
  axisBinding: 'primary',
  // Point labels: spec 7.1 L479-485, all P.
  showPointLabels: false,
  pointLabelSource: 'rowTitle',
  pointLabelPlacement: 'above-right',
  pointLabelOffsetXPt: 3,
  pointLabelOffsetYPt: 3,
  pointLabelCollision: 'keep',
  pointLabelLeader: false,
  pointLabelFontSizePt: 11.2,
  pointLabelBold: false,
  pointLabelItalic: false,
  pointLabelColor: null,
  pointLabelDecimals: null,
};

/** Default summary (P). Prism "Mean with SD" is not a default (spec 23 L1548). */
export const DEFAULT_SUMMARY: SummarySpec = {
  centre: 'mean',
  spread: 'none',
  confidenceLevel: 0.95,
  smallSamplePolicy: 'drawCentre',
  invalidPolicy: 'omit',
};

/** Visibility flags that a chart-type preset owns. */
export const PRESET_KEYS = ['showBars', 'showSymbols', 'showLines', 'showMeanLine'] as const;

export const TYPE_PRESETS: Record<ChartType, Pick<ChartStyle, (typeof PRESET_KEYS)[number]>> = {
  bar: { showBars: true, showSymbols: true, showLines: false, showMeanLine: false },
  scatter: { showBars: false, showSymbols: true, showLines: false, showMeanLine: true },
  mean: { showBars: false, showSymbols: true, showLines: false, showMeanLine: false },
  // Box plots and violins: showBars is the body (box or violin) and showSymbols the dots over it (which ones: the distribution options).
  box: { showBars: true, showSymbols: true, showLines: false, showMeanLine: false },
  violin: { showBars: true, showSymbols: true, showLines: false, showMeanLine: false },
  floating: { showBars: true, showSymbols: true, showLines: false, showMeanLine: false },
  // Paired plots: the dots are the values, the lines join each subject's, the mean line is optional.
  paired: { showBars: false, showSymbols: true, showLines: true, showMeanLine: false },
  histogram: { showBars: true, showSymbols: false, showLines: false, showMeanLine: false },
  ecdf: { showBars: false, showSymbols: false, showLines: true, showMeanLine: false },
  xyScatter: { showBars: false, showSymbols: true, showLines: false, showMeanLine: false },
  xyLine: { showBars: false, showSymbols: false, showLines: true, showMeanLine: false },
  xyLineSymbols: { showBars: false, showSymbols: true, showLines: true, showMeanLine: false },
  groupedBar: { showBars: true, showSymbols: false, showLines: false, showMeanLine: false },
  groupedStacked: { showBars: true, showSymbols: false, showLines: false, showMeanLine: false },
  heatmap: { showBars: true, showSymbols: false, showLines: false, showMeanLine: false },
  groupedLine: { showBars: false, showSymbols: true, showLines: true, showMeanLine: false },
  pie: { showBars: true, showSymbols: false, showLines: false, showMeanLine: false },
  doughnut: { showBars: true, showSymbols: false, showLines: false, showMeanLine: false },
  contingencyBars: { showBars: true, showSymbols: false, showLines: false, showMeanLine: false },
  contingencyStacked: { showBars: true, showSymbols: false, showLines: false, showMeanLine: false },
  contingencyPercent: { showBars: true, showSymbols: false, showLines: false, showMeanLine: false },
  // Survival curves: the line is the estimate, the symbols are the censor marks.
  survival: { showBars: false, showSymbols: true, showLines: true, showMeanLine: false },
  cumulativeEvent: { showBars: false, showSymbols: true, showLines: true, showMeanLine: false },
};

const defaultAxis = (title: string): AxisConfig => ({
  title,
  titleVisible: true,
  titleBold: true,
  tickBold: true,
  titleOffsetPt: 0,
  tickLabelOffsetPt: 0,
  visible: true,
  lineWidthPt: AXIS_LINE_PT,
  tickFontSizePt: 13.3,
  titleFontSizePt: 14,
  min: null,
  max: null,
  majorInterval: null,
  showGrid: false,
  showMinorGrid: false,
  breaks: [],
  breakMark: 'doubleSlash',
  scaleBar: false,
  scale: 'linear',
  reverse: false,
  minorTicks: 0,
  tickDirection: 'out',
  tickLengthPt: TICK_LENGTH_PT,
  numberFormat: 'auto',
  decimals: null,
  thousands: false,
  prefix: '',
  suffix: '',
});

export function createChart(dataTableId: string, size?: { widthPx: number; heightPx: number }, type: ChartType = 'bar'): Chart {
  const titles = axisTitlesFor(type);
  const layer: ChartLayer = {
    id: newId('layer'),
    name: 'Data',
    style: initialLayerStyle(type),
    groupOverrides: {},
    objectOverrides: {},
    summary: { ...defaultSummaryFor(type) },
    groupSummary: {},
  };
  return {
    id: newId('chart'),
    name: 'Graph 1',
    dataTableId,
    type,
    widthPx: size?.widthPx ?? DEFAULT_CHART_WIDTH_PX,
    heightPx: size?.heightPx ?? DEFAULT_CHART_HEIGHT_PX,
    hiddenGroupIds: [],
    groupOrder: [],
    groupGaps: {},
    extraGroups: [],
    survival: { ...DEFAULT_SURVIVAL },
    aspect: 'free',
    paletteId: DEFAULT_PALETTE_ID,
    title: 'Graph 1',
    showTitle: true,
    titleFontSizePt: 16.8,
    fontFamily: FONT_FAMILY,
    textColor: '#000000',
    titleBold: true,
    titleOffsetPt: 0,
    axisColor: '#000000',
    plotColor: '#ffffff',
    pageColor: '#ffffff',
    frame: 'none',
    grid: { ...DEFAULT_GRID },
    orientation: 'vertical',
    origin: { x: null, y: null },
    bars: { ...DEFAULT_BARS },
    barLabels: { ...DEFAULT_BAR_LABELS },
    distribution: { ...DEFAULT_DISTRIBUTION },
    pairs: { bridge: false },
    heatmap: { ...DEFAULT_HEATMAP },
    histogram: { ...DEFAULT_HISTOGRAM },
    fit: { ...DEFAULT_FIT },
    pie: { ...DEFAULT_PIE },
    xAxis: defaultAxis(titles.x),
    yAxis: defaultAxis(titles.y),
    // Sizes 13.3/14 are inherited from the left axis (P, not D).
    y2Axis: defaultAxis(''),
    legend: { visible: true, keyShape: 'rectangle', position: 'right', fontSizePt: 11.2, hiddenGroupIds: [] },
    displayNames: {},
    jitter: { ...DEFAULT_JITTER },
    defaults: { ...DEFAULT_STYLE },
    layers: [layer],
    annotations: [],
  };
}

const EXAMPLE_DATA: Array<[string, number[]]> = [
  ['Group A', [1.1, 1.2, 1.3, 1.2, 1.4]],
  ['Group B', [1.4, 1.7, 1.6, 1.8, 1.5]],
  ['Group C', [1.8, 2.0, 1.9, 2.1, 2.2]],
  ['Group D', [2.1, 2.4, 2.3, 2.5, 2.2]],
];

export function createGroup(name: string, paletteIndex: number, rowCount: number, values: number[] = []): Group {
  return {
    id: newId('grp'),
    name,
    title: '',
    paletteIndex,
    observations: Array.from({ length: rowCount }, (_, i) => ({
      id: newId('obs'),
      value: i < values.length ? values[i] : null,
    })),
  };
}

/** A new column table of empty groups (as many as the first column table has, at least four), or with the sample data. */
export function createColumnTable(name: string, sample: boolean, columns = 4): DataTable {
  if (sample) return { ...createExampleTable(), name };
  const groups: Group[] = [];
  for (let i = 0; i < columns; i++) groups.push(createGroup(nextGroupName(groups.map((g) => g.name)), i, INITIAL_ROWS));
  return { id: newId('table'), name, kind: 'column', rowCount: INITIAL_ROWS, rows: createRows(INITIAL_ROWS), groups };
}

export function createExampleTable(): DataTable {
  return {
    id: newId('table'),
    name: 'Data 1',
    kind: 'column',
    rowCount: INITIAL_ROWS,
    rows: createRows(INITIAL_ROWS),
    groups: EXAMPLE_DATA.map(([name, values], i) => createGroup(name, i, INITIAL_ROWS, values)),
  };
}


const XY_EXAMPLE_X = [1, 2, 3, 4, 5, 6, 7, 8];
const XY_EXAMPLE_Y: Array<[string, number[]]> = [
  ['Series A', [1.1, 2.3, 2.9, 4.2, 5.1, 5.8, 7.2, 8.1]],
  ['Series B', [0.5, 1.2, 2.2, 3.9, 6.1, 8.8, 12, 15.9]],
];

/**
 * Sample values of one series, one array per sub-column, around the central values `base`. Replicates scatter
 * around the centre in a fixed pattern; supplied-summary tables get an SD / SEM / %CV / +/- error / limits to match.
 */
function sampleSeriesColumns(layout: ReplicateLayout, base: number[]): number[][] {
  if (layout.kind === 'single') return [base];
  if (layout.kind === 'replicates') {
    const offsets = [-0.12, 0.08, 0.15, -0.06, 0.1, -0.14, 0.04, 0.12, -0.09, 0.02];
    return Array.from({ length: layout.n }, (_, k) => base.map((v, i) => Number((v * (1 + offsets[(k * 3 + i) % offsets.length])).toFixed(3))));
  }
  const info = summaryFormatInfo(layout.format);
  const spread = base.map((v) => Number((Math.abs(v) * 0.1 + 0.1).toFixed(3)));
  return info.columns.map((c) => {
    if (c === 'Mean') return base;
    if (c === 'N') return base.map(() => 3);
    if (c === 'SD') return spread;
    if (c === 'SEM') return spread.map((s) => Number((s / Math.sqrt(3)).toFixed(3)));
    if (c === '%CV') return base.map(() => 10);
    if (c === 'Upper') return base.map((v, i) => Number((v + spread[i]).toFixed(3)));
    if (c === 'Lower') return base.map((v, i) => Number((v - spread[i]).toFixed(3)));
    return spread; // +/- error
  });
}

/**
 * A new XY table: the X column first, then Y series of the chosen layout (one column each, replicate sub-columns, or
 * supplied summary columns). With `example` it holds sample data, otherwise it is empty.
 */
export function createXyTable(name: string, example: boolean, layout: ReplicateLayout = { kind: 'single' }): DataTable {
  const x = createGroup('X', 0, INITIAL_ROWS, example ? XY_EXAMPLE_X : []);
  const labels = subLabels(layout);
  const seriesCount = XY_EXAMPLE_Y.length;
  const groups: Group[] = [x];
  for (let s = 0; s < seriesCount; s++) {
    const cols = example ? sampleSeriesColumns(layout, XY_EXAMPLE_Y[s][1]) : labels.map(() => []);
    labels.forEach((label, k) => {
      const g = createGroup(layout.kind === 'single' ? defaultSeriesName(s) : label, groups.length, INITIAL_ROWS, cols[k]);
      // With sub-columns the series name is the title of the block's first column.
      if (layout.kind !== 'single' && k === 0) g.title = defaultSeriesName(s);
      groups.push(g);
    });
  }
  const table: DataTable = { id: newId('table'), name, kind: 'xy', rowCount: INITIAL_ROWS, rows: createRows(INITIAL_ROWS), groups };
  return layout.kind === 'single' ? table : { ...table, layout };
}

/** Rows of a grouped or contingency table: categories are few, so it starts with a handful rather than twenty. */
const CATEGORY_ROWS = 6;

/**
 * A grouped table: each row is a category (Male, Female), each block of columns a series (Control, Treated) laid out as
 * the layout says. With `sample` it holds two categories and two series.
 */
export function createGroupedTable(name: string, sample: boolean, layout: ReplicateLayout = { kind: 'single' }): DataTable {
  const labels = subLabels(layout);
  const sampleBase = [[4.2, 3.1], [6.5, 5.2]];
  const groups: Group[] = [];
  for (let s = 0; s < 2; s++) {
    const cols = sample ? sampleSeriesColumns(layout, sampleBase[s]) : labels.map(() => []);
    labels.forEach((label, k) => {
      const g = createGroup(layout.kind === 'single' ? defaultSeriesName(s, 'grouped') : label, groups.length, CATEGORY_ROWS, cols[k]);
      if (layout.kind !== 'single' && k === 0) g.title = defaultSeriesName(s, 'grouped');
      groups.push(g);
    });
  }
  const rows = createRows(CATEGORY_ROWS).map((r, i) => ({ ...r, title: sample ? ['Male', 'Female'][i] ?? '' : '' }));
  const table: DataTable = { id: newId('table'), name, kind: 'grouped', rowCount: CATEGORY_ROWS, rows, groups };
  return layout.kind === 'single' ? table : { ...table, layout };
}

/** A contingency table: rows are groups of subjects, columns are outcomes, cells are counts. */
export function createContingencyTable(name: string, sample: boolean): DataTable {
  const groups = [createGroup('Cured', 0, CATEGORY_ROWS, sample ? [38, 21] : []), createGroup('Not cured', 1, CATEGORY_ROWS, sample ? [12, 29] : [])];
  const rows = createRows(CATEGORY_ROWS).map((r, i) => ({ ...r, title: sample ? ['Treated', 'Control'][i] ?? '' : '' }));
  return { id: newId('table'), name, kind: 'contingency', rowCount: CATEGORY_ROWS, rows, groups };
}

const SURVIVAL_SAMPLE: Array<[number, 0 | 1, 0 | 1]> = [
  // [time, event (1) or censored (0), group index]
  [3, 1, 0], [5, 1, 0], [6, 1, 0], [8, 0, 0], [9, 1, 0], [11, 1, 0], [14, 1, 0], [16, 0, 0], [20, 1, 0], [24, 1, 0],
  [6, 1, 1], [9, 0, 1], [12, 1, 1], [15, 1, 1], [18, 0, 1], [21, 1, 1], [25, 1, 1], [28, 0, 1], [32, 1, 1], [36, 0, 1],
];

/**
 * A survival table: the time in the first column, one column per group. A subject is one row: its time, and a 1
 * (event) or 0 (censored) in the column of its group; the other group columns stay empty.
 */
export function createSurvivalTable(name: string, sample: boolean): DataTable {
  const x = createGroup('Time', 0, INITIAL_ROWS, sample ? SURVIVAL_SAMPLE.map((r) => r[0]) : []);
  const groups = [0, 1].map((gi) => {
    const g = createGroup(defaultSeriesName(gi, 'survival'), gi + 1, INITIAL_ROWS);
    if (sample) SURVIVAL_SAMPLE.forEach((r, row) => { if (r[2] === gi) g.observations[row].value = r[1]; });
    return g;
  });
  return { id: newId('table'), name, kind: 'survival', rowCount: INITIAL_ROWS, rows: createRows(INITIAL_ROWS), groups: [x, ...groups] };
}

/** A blank project: one data table of empty groups and one graph of it. */
export function createEmptyProject(size?: { widthPx: number; heightPx: number }): Project {
  const groups: Group[] = [];
  for (let i = 0; i < 4; i++) groups.push(createGroup(nextGroupName(groups.map((g) => g.name)), i, INITIAL_ROWS));
  const table: DataTable = { id: newId('table'), name: 'Data 1', kind: 'column', rowCount: INITIAL_ROWS, rows: createRows(INITIAL_ROWS), groups };
  return { id: newId('project'), name: 'Untitled project', dataTables: [table], charts: [createChart(table.id, size)] };
}

export function createExampleProject(size?: { widthPx: number; heightPx: number }): Project {
  const table = createExampleTable();
  return {
    id: newId('project'),
    name: 'Untitled project',
    dataTables: [table],
    charts: [createChart(table.id, size)],
  };
}

/** "Group E", "Group F", ... after the existing ones. */
export function nextGroupName(existing: string[]): string {
  for (let i = existing.length; i < existing.length + 1000; i++) {
    const letter = i < 26 ? String.fromCharCode(65 + i) : String(i + 1);
    const name = `Group ${letter}`;
    if (!existing.includes(name)) return name;
  }
  return `Group ${existing.length + 1}`;
}
