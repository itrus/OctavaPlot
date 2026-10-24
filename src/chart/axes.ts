import { capabilitiesOf } from '../model/capabilities';
import type { AxisBinding, AxisConfig, Chart, ChartStyle, ChartType } from '../model/types';
import type { GroupStats } from '../stats/summary';
import { rangeValuesFor } from './errorGeometry';

/**
 * Value-axis helpers (pure). Binding is group level and Cartesian only (spec 5.3 L322); the left/right
 * mapping and the axis wording are P (spec 1.2 L57).
 */

export const AXIS_BINDINGS: readonly AxisBinding[] = ['primary', 'secondary'];

/** Only the exact stored value 'secondary' rebinds; anything else (missing, legacy, corrupt) is primary. */
export function bindingOf(style: { axisBinding?: unknown }): AxisBinding {
  return style.axisBinding === 'secondary' ? 'secondary' : 'primary';
}

export function axisConfigFor(chart: Pick<Chart, 'yAxis' | 'y2Axis'>, binding: AxisBinding): AxisConfig {
  return binding === 'secondary' ? chart.y2Axis : chart.yAxis;
}

export const AXIS_NAME: Record<AxisBinding, string> = { primary: 'Left Y axis', secondary: 'Right Y axis' };
export const AXIS_SHORT: Record<AxisBinding, string> = { primary: 'Left', secondary: 'Right' };
/** Legend label suffix; the left axis is the unmarked default. */
export const AXIS_TAG: Record<AxisBinding, string> = { primary: '', secondary: ' (right axis)' };

/** Error bars are shown exactly when switched on; the calculation (spread) decides whether there is an interval. */
export const errorShown = (style: Pick<ChartStyle, 'showErrorBars'>): boolean => style.showErrorBars;

type RangeStyle = Pick<ChartStyle, 'showBars' | 'showSymbols' | 'showErrorBars' | 'errorDirection'>;

/** One data set as the axis range sees it. */
export interface RangeRow {
  binding: AxisBinding;
  stats: GroupStats;
  style: RangeStyle;
  /** Raw observation values, aligned with the table rows. */
  values: ReadonlyArray<number | null | undefined>;
  /** Box plots and violins: the values the axis has to show (whisker ends, outliers, the ends of the density). */
  override?: number[];
}

interface RangeContribution {
  values: number[];
  hasBars: boolean;
}

/**
 * Values one data set asks its axis to show: centre and drawn interval endpoints, plus raw points when
 * symbols are on and the chart is not a mean chart. Hidden error bars add nothing beyond the centre
 * (known deviation from spec 6.1 L355, recorded in the README).
 */
export function groupRangeContribution(row: RangeRow, type: ChartType): RangeContribution {
  if (row.override) return { values: row.override.filter((v) => Number.isFinite(v)), hasBars: false };
  const values = rangeValuesFor(row.stats, errorShown(row.style), row.style.errorDirection);
  if (row.style.showSymbols && type !== 'mean') {
    for (const v of row.values) if (v !== null && v !== undefined && Number.isFinite(v)) values.push(v);
  }
  return { values, hasBars: row.style.showBars && row.stats.centre !== null };
}

interface AxisPool {
  values: number[];
  /** True when any data set on the axis draws a bar (the baseline then needs zero in range). */
  hasBars: boolean;
  /** Data sets bound to the axis, whether or not they have values. */
  count: number;
}

interface AxisPools {
  primary: AxisPool;
  secondary: AxisPool;
  /** The right axis exists only while a data set is bound to it (spec 6.2 L363). */
  secondaryInUse: boolean;
}

/** Splits every data set's contribution by binding; with no data set on the right this is the old single pool. */
export function populateAxes(rows: ReadonlyArray<RangeRow>, type: ChartType): AxisPools {
  const pools: Record<AxisBinding, AxisPool> = {
    primary: { values: [], hasBars: false, count: 0 },
    secondary: { values: [], hasBars: false, count: 0 },
  };
  for (const row of rows) {
    const pool = pools[row.binding];
    const c = groupRangeContribution(row, type);
    for (const v of c.values) pool.values.push(v);
    pool.hasBars = pool.hasBars || c.hasBars;
    pool.count++;
  }
  return { ...pools, secondaryInUse: pools.secondary.count > 0 };
}

interface BindingSelectState {
  /** "Plot data on" is offered for Cartesian chart types only. */
  offered: boolean;
  value: AxisBinding;
  options: ReadonlyArray<{ value: AxisBinding; label: string }>;
}

export function bindingSelectState(type: ChartType, style: { axisBinding?: unknown }): BindingSelectState {
  return {
    offered: capabilitiesOf(type).secondaryAxis,
    value: bindingOf(style),
    options: AXIS_BINDINGS.map((value) => ({ value, label: AXIS_SHORT[value] })),
  };
}

export interface AxisNoticeInput {
  y: Pick<AxisConfig, 'title' | 'visible' | 'min' | 'max'>;
  y2: Pick<AxisConfig, 'title' | 'visible' | 'min' | 'max'>;
  legendVisible: boolean;
  pools: AxisPools;
  /** Connector segments skipped because the neighbours sit on different axes. */
  skippedConnectors: number;
}

/**
 * Notices about the two-axis setup. Counts only, never names (spec 21.5). Silent unless the right axis
 * is in use. Classes (spec 21.5): hidden axis, titles and legend are Informational (L1463);
 * no left data sets, empty axis and skipped connectors are Visual warnings (L1462).
 */
export function axisNotices(input: AxisNoticeInput): string[] {
  const { y, y2, pools, legendVisible, skippedConnectors } = input;
  if (!pools.secondaryInUse) return [];
  const out: string[] = [];

  if (!y2.visible) out.push('The right Y axis is hidden, so data sets bound to it have no visible scale.');
  if (pools.primary.count === 0) out.push('No data sets use the left Y axis; it shows an empty scale.');

  const leftTitle = y.title.trim();
  const rightTitle = y2.title.trim();
  if (leftTitle === '' || rightTitle === '') {
    out.push('Two Y axes are in use; give each a title so they can be told apart.');
  } else if (leftTitle === rightTitle) {
    out.push('Both Y axes have the same title.');
  }
  if (!legendVisible) out.push('The legend is hidden, so data sets on the right axis are not marked.');

  const empty = (pool: AxisPool, axis: Pick<AxisConfig, 'min' | 'max'>) =>
    pool.count > 0 && pool.values.length === 0 && (axis.min === null || axis.max === null);
  if (empty(pools.primary, y)) out.push('The left Y axis has no values and no manual limits; its scale is a placeholder.');
  if (empty(pools.secondary, y2)) out.push('The right Y axis has no values and no manual limits; its scale is a placeholder.');

  if (skippedConnectors > 0) {
    out.push(
      skippedConnectors === 1
        ? '1 connector segment between data sets on different Y axes was not drawn.'
        : `${skippedConnectors} connector segments between data sets on different Y axes were not drawn.`,
    );
  }
  return out;
}
