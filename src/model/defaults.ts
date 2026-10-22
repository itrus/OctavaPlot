import { newId } from './ids';
import { createRows } from './rows';
import type {
  AxisConfig,
  Chart,
  ChartLayer,
  ChartStyle,
  ChartType,
  DataTable,
  Group,
  Project,
  SummarySpec,
} from './types';

export const FONT_FAMILY = 'Arial, Helvetica, sans-serif';
export const INITIAL_ROWS = 20;

/** Grayscale bar-fill palette, assigned by Group.paletteIndex. */
export const BAR_PALETTE = ['#d9d9d9', '#a6a6a6', '#737373', '#f2f2f2', '#595959', '#bfbfbf'];

export const DEFAULT_STYLE: ChartStyle = {
  showBars: true,
  barFill: BAR_PALETTE[0],
  barOpacity: 1,
  barBorderColor: '#000000',
  barBorderWidthPt: 1,
  barFillMode: 'solid',
  barPattern: 'horizontal',
  barPatternSpacingPt: 4,
  barPatternWidthPt: 0.5,
  barPatternColor: null,
  barPatternBackground: '#ffffff',
  showSymbols: false,
  symbolColor: '#000000',
  symbolShape: 'circle',
  symbolSizePt: 6,
  symbolBorderColor: '#000000',
  symbolBorderWidthPt: 0.75,
  showErrorBars: true,
  errorDirection: 'both',
  errorCap: 'bar',
  errorCapWidthPt: 5,
  errorLineWidthPt: 1,
  errorColor: '#000000',
  showLines: false,
  showMeanLine: false,
  lineColor: '#000000',
  lineWidthPt: 1.5,
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
  bar: { showBars: true, showSymbols: false, showLines: false, showMeanLine: false },
  scatter: { showBars: false, showSymbols: true, showLines: false, showMeanLine: true },
  mean: { showBars: false, showSymbols: true, showLines: false, showMeanLine: false },
};

const defaultAxis = (title: string): AxisConfig => ({
  title,
  visible: true,
  lineWidthPt: 2.1,
  tickFontSizePt: 13.3,
  titleFontSizePt: 14,
  min: null,
  max: null,
  majorInterval: null,
  showGrid: false,
});

export function createChart(dataTableId: string): Chart {
  const layer: ChartLayer = {
    id: newId('layer'),
    name: 'Data',
    style: { ...TYPE_PRESETS.bar },
    groupOverrides: {},
    objectOverrides: {},
    summary: { ...DEFAULT_SUMMARY },
    groupSummary: {},
  };
  return {
    id: newId('chart'),
    name: 'Graph 1',
    dataTableId,
    type: 'bar',
    widthMm: 160,
    heightMm: 120,
    title: 'Graph 1',
    showTitle: false,
    titleFontSizePt: 16.8,
    xAxis: defaultAxis(''),
    yAxis: defaultAxis('Value'),
    // Sizes 13.3/14 are inherited from the left axis (P, not D).
    y2Axis: defaultAxis(''),
    legend: { visible: false, position: 'right', fontSizePt: 11.2 },
    displayNames: {},
    jitter: { enabled: true, widthFraction: 0.4 },
    defaults: { ...DEFAULT_STYLE },
    layers: [layer],
    annotations: [],
  };
}

export const EXAMPLE_DATA: Array<[string, number[]]> = [
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

export function createExampleTable(): DataTable {
  return {
    id: newId('table'),
    name: 'Data 1',
    rowCount: INITIAL_ROWS,
    rows: createRows(INITIAL_ROWS),
    groups: EXAMPLE_DATA.map(([name, values], i) => createGroup(name, i, INITIAL_ROWS, values)),
  };
}

export function createExampleProject(): Project {
  const table = createExampleTable();
  return {
    id: newId('project'),
    name: 'Untitled project',
    dataTables: [table],
    charts: [createChart(table.id)],
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
