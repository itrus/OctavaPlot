import { sanitizeAxis } from '../model/graph/axis';
import { sanitizeBarLabels, sanitizeBars } from '../model/options/columnOptions';
import { sanitizeDistribution } from '../model/options/distributionOptions';
import { sanitizeLayerStyles } from '../model/graph/layers';
import { sanitizeLook } from '../model/graph/look';
import { sanitizeLegendLayout, withoutLegendColumns, withoutLegendOffset, withoutLegendOrder } from '../model/graph/legendEntries';
import { sanitizeOrder } from '../model/table/groupOrder';
import { createChart, createColumnTable, createContingencyTable, createGroupedTable, createSurvivalTable, createGroup, createXyTable, nextGroupName, PRESET_KEYS, TYPE_PRESETS } from '../model/defaults';
import { analysisKindApplies, analysisTypeInfo } from '../model/project/analysis';
import { sanitizeDegree } from '../model/options/fitOptions';
import { inheritChart } from '../model/graph/chartFormat';
import { clampFrame, defaultLayout, FREE_MAX, framesOf, newFrame, resizePanels, sanitizeLayout, turnFrames } from '../model/project/layout';
import type { FitModelId } from '../stats/fit';
import { effectiveTable } from '../model/table/chartTable';
import { defaultSeriesName, layoutOf, seriesWidth, subLabels, tableSeriesWidth, xySeries } from '../model/table/tableLayout';

/** Chart types whose series colour is the colour of symbols, lines and error bars (not of filled bars). */
import { applyVariant, type ChartVariant, variantFits } from '../model/graph/chartVariant';
import { chartTypeInfo, defaultChartTypeFor, isSeriesColourType, leadingColumns, usesSeriesBlocks } from '../model/graph/chartTypes';
import { newId } from '../model/ids';
import { paletteColor, type Palette } from '../model/graph/palettes';
import { createRows, MAX_TABLE_ROWS, sanitizeRowTitle } from '../model/table/rows';
import { clearGroupSummary, clearGroupSummaryKeys, patchAllSummary, patchGroupSummary, validateSummaryPatch } from '../model/graph/summary';
import { folderItems, nudge, reorder, sortedByName } from '../model/project/folderItems';
import { clearPartStyles, layerKindOf, layersOf, layerStylesAvailable, lookKeysOf, ORDERABLE_LAYER_KINDS } from '../model/graph/layers';
import type { StyleScope } from '../model/graph/selection/scope';
import { LABEL_STYLE_KEYS, clearGroupKeys, clearObjectKeys, groupObjectIds, patchAllGroups, patchGroup, patchObject, resetGroupStyle, dataLayer } from '../model/graph/style';
import type {
  LayerStyle,
  Analysis,
  AnalysisKind,
  Annotation,
  AxisConfig,
  BarLabels,
  BarLayout,
  DistributionOptions,
  GridStyle,
  Chart,
  ChartLayer,
  ChartStyle,
  ChartType,
  DataRow,
  DataTable,
  Group,
  Id,
  Observation,
  JitterConfig,
  Layout,
  LegendConfig,
  FolderKey,
  Project,
  ReferenceLine,
  ReplicateLayout,
  SummarySpec,
  SurvivalOptions,
  TableKind,
} from '../model/types';

/** A command is a pure project -> project function; the history reducer applies it. */
export type Command = (p: Project) => Project;

/** Apply fn to one table; the same project when fn returns the same table. */
const mapTable = (p: Project, tableId: Id, fn: (t: DataTable) => DataTable): Project => {
  const table = p.dataTables.find((t) => t.id === tableId);
  if (!table) return p;
  const next = fn(table);
  if (next === table) return p;
  return { ...p, dataTables: p.dataTables.map((t) => (t === table ? next : t)) };
};

/** Run several commands in order as one command, so they form one undo step. */
export const composeCommands = (...commands: Command[]): Command => (p) => commands.reduce((acc, c) => c(acc), p);

const mapChart = (p: Project, chartId: Id, fn: (c: Chart) => Chart): Project => ({
  ...p,
  charts: p.charts.map((c) => (c.id === chartId ? fn(c) : c)),
});

/** Apply fn to the first layer only; the same project when nothing changed. */
const mapLayer0 = (p: Project, chartId: Id, fn: (l: ChartLayer) => ChartLayer): Project => {
  const found = p.charts.find((c) => c.id === chartId);
  const layer = found ? dataLayer(found) : undefined;
  if (!layer) return p;
  const next = fn(layer);
  if (next === layer) return p;
  return mapChart(p, chartId, (c) => ({ ...c, layers: c.layers.map((l, i) => (i === 0 ? next : l)) }));
};

// ---------------------------------------------------------------- data

export interface CellEdit {
  row: number;
  col: number;
  value: number | null;
}

function growRows(table: DataTable, rowCount: number): DataTable {
  if (rowCount <= table.rowCount) return table;
  return {
    ...table,
    rowCount,
    rows: [...table.rows, ...createRows(rowCount - table.rowCount)],
    groups: table.groups.map((g) => ({
      ...g,
      observations: [
        ...g.observations,
        ...Array.from({ length: rowCount - table.rowCount }, () => ({ id: newId('obs'), value: null })),
      ],
    })),
  };
}

function applyEdits(table: DataTable, edits: CellEdit[]): DataTable {
  const byCol = new Map<number, CellEdit[]>();
  for (const e of edits) {
    if (e.row < 0 || e.row >= table.rowCount || e.col < 0 || e.col >= table.groups.length) continue;
    const list = byCol.get(e.col);
    if (list) list.push(e);
    else byCol.set(e.col, [e]);
  }
  if (byCol.size === 0) return table;
  let changed = false;
  const groups = table.groups.map((g, col) => {
    const list = byCol.get(col);
    if (!list) return g;
    const observations = g.observations.slice();
    let colChanged = false;
    for (const e of list) {
      if (observations[e.row].value !== e.value) {
        observations[e.row] = { ...observations[e.row], value: e.value };
        colChanged = true;
      }
    }
    if (!colChanged) return g;
    changed = true;
    return { ...g, observations };
  });
  return changed ? { ...table, groups } : table;
}

export const setCells = (tableId: Id, edits: CellEdit[]): Command => (p) =>
  mapTable(p, tableId, (t) => applyEdits(t, edits));

interface RowTitleEdit {
  row: number;
  title: string;
}

/** Sanitised title edits; rows outside the table are ignored; the same table when nothing changed. */
function applyRowTitles(t: DataTable, edits: RowTitleEdit[]): DataTable {
  let rows: DataRow[] | null = null;
  for (const e of edits) {
    if (!Number.isInteger(e.row) || e.row < 0 || e.row >= t.rowCount) continue;
    const title = sanitizeRowTitle(e.title);
    if ((rows ?? t.rows)[e.row].title === title) continue;
    rows = rows ?? t.rows.slice();
    rows[e.row] = { ...rows[e.row], title };
  }
  return rows ? { ...t, rows } : t;
}

export const setRowTitles = (tableId: Id, edits: RowTitleEdit[]): Command => (p) =>
  mapTable(p, tableId, (t) => applyRowTitles(t, edits));

/**
 * Paste a rectangular block at (row0, col0); grows rows and adds groups as needed.
 * titles (optional) are row titles for rows row0, row0 + 1, ...; a titles-only paste adds no group.
 */
export const pasteMatrix = (
  tableId: Id,
  row0: number,
  col0: number,
  matrix: Array<Array<number | null>>,
  titles?: string[],
): Command => (p) =>
  mapTable(p, tableId, (t0) => {
    const height = Math.max(matrix.length, titles?.length ?? 0);
    const width = matrix.reduce((m, r) => Math.max(m, r.length), 0);
    let t = growRows(t0, Math.max(t0.rowCount, row0 + height));
    if (width > 0 && col0 + width > t.groups.length) {
      const groups = t.groups.slice();
      if (usesSeriesBlocks(t.kind)) {
        // Whole series at a time, so a paste past the last column never leaves half a block.
        while (groups.length < col0 + width) groups.push(...newSeriesColumns(t, groups));
      } else {
        let nextPalette = Math.max(-1, ...groups.map((g) => g.paletteIndex)) + 1;
        while (groups.length < col0 + width) {
          groups.push(createGroup(nextGroupName(groups.map((g) => g.name)), nextPalette++, t.rowCount));
        }
      }
      t = { ...t, groups };
    }
    const edits: CellEdit[] = [];
    matrix.forEach((r, i) => r.forEach((value, j) => edits.push({ row: row0 + i, col: col0 + j, value })));
    t = applyEdits(t, edits);
    return titles ? applyRowTitles(t, titles.map((title, i) => ({ row: row0 + i, title }))) : t;
  });

export const addRows = (tableId: Id, count: number): Command => (p) =>
  mapTable(p, tableId, (t) => growRows(t, t.rowCount + count));

export { MAX_TABLE_ROWS };

/** How many more rows the table can take. */
export const rowRoom = (t: Pick<DataTable, 'rowCount'>): number => Math.max(0, MAX_TABLE_ROWS - t.rowCount);

/** Where a row of a rebuilt table comes from: an old row (kept as it is), a copy of an old row, or nothing (blank). */
type RowSource = number | { copy: number } | null;

/**
 * Rebuild a table from a list of row sources. Kept rows keep their row and observation objects, so their ids, titles and
 * exclusions travel with them; copies get new ids and keep title, value and exclusion; blank rows are empty. A row
 * the table never stored (ragged rows or observations) comes out blank, so the result always has aligned rows.
 */
function reshapeRows(t: DataTable, plan: RowSource[]): DataTable {
  const blankRow = (): DataRow => ({ id: newId('row'), title: '' });
  const blankObs = (): Observation => ({ id: newId('obs'), value: null });
  const row = (s: RowSource): DataRow =>
    s === null ? blankRow() : typeof s === 'number' ? (t.rows[s] ?? blankRow()) : { ...(t.rows[s.copy] ?? blankRow()), id: newId('row') };
  const obs = (g: Group, s: RowSource): Observation => {
    if (s === null) return blankObs();
    const o = g.observations[typeof s === 'number' ? s : s.copy];
    if (!o) return blankObs();
    return typeof s === 'number' ? o : { ...o, id: newId('obs') };
  };
  return { ...t, rowCount: plan.length, rows: plan.map(row), groups: t.groups.map((g) => ({ ...g, observations: plan.map((s) => obs(g, s)) })) };
}

/** The valid, distinct rows of a table among `rows`, in table order. */
const validRows = (t: DataTable, rows: readonly number[]): number[] =>
  [...new Set(rows.filter((r) => Number.isInteger(r) && r >= 0 && r < t.rowCount))].sort((a, b) => a - b);

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/** Insert `count` blank rows so the first of them is row `at` (clamped to the table). Refused when the table would pass MAX_TABLE_ROWS. */
export const insertRows = (tableId: Id, at: number, count = 1): Command => (p) =>
  mapTable(p, tableId, (t) => {
    if (!Number.isInteger(count) || count < 1 || count > rowRoom(t)) return t;
    const i = Math.max(0, Math.min(t.rowCount, Math.floor(at)));
    return reshapeRows(t, [...range(0, i), ...Array.from({ length: count }, () => null), ...range(i, t.rowCount)]);
  });

/** Remove rows with everything in them. The last remaining row is never removed: that would leave a table with no rows. */
export const deleteRows = (tableId: Id, rows: readonly number[]): Command => (p) =>
  mapTable(p, tableId, (t) => {
    const gone = new Set(validRows(t, rows));
    if (gone.size === 0 || gone.size >= t.rowCount) return t;
    return reshapeRows(t, range(0, t.rowCount).filter((r) => !gone.has(r)));
  });

/** Copy rows (title, values, exclusions) as one block placed right after the last of them. Refused past MAX_TABLE_ROWS. */
export const duplicateRows = (tableId: Id, rows: readonly number[]): Command => (p) =>
  mapTable(p, tableId, (t) => {
    const copied = validRows(t, rows);
    if (copied.length === 0 || copied.length > rowRoom(t)) return t;
    const last = copied[copied.length - 1];
    return reshapeRows(t, [...range(0, last + 1), ...copied.map((copy) => ({ copy })), ...range(last + 1, t.rowCount)]);
  });

/** Add `count` blank rows at the end: as many as fit under MAX_TABLE_ROWS. */
export const appendRows = (tableId: Id, count: number): Command => (p) =>
  mapTable(p, tableId, (t) => {
    const n = Math.min(count, rowRoom(t));
    return Number.isInteger(count) && n >= 1 ? reshapeRows(t, [...range(0, t.rowCount), ...Array.from({ length: n }, () => null)]) : t;
  });

/**
 * The columns of one new series of a block table (XY, grouped, contingency, survival): a single column, or a whole
 * block of replicate / summary sub-columns whose first column carries the series name. `existing` are the columns
 * already in the table; the name is one no series has yet.
 */
function newSeriesColumns(t: DataTable, existing: Group[]): Group[] {
  const width = tableSeriesWidth(t);
  const labels = subLabels(layoutOf(t)).slice(0, width);
  const current = { ...t, groups: existing };
  const used = new Set(xySeries(current).map((s) => s.name));
  existing.forEach((g) => used.add(g.name));
  let i = xySeries(current).length;
  while (used.has(defaultSeriesName(i, t.kind)) && i < 1000) i++;
  const name = defaultSeriesName(i, t.kind);
  const paletteIndex = Math.max(-1, ...existing.map((x) => x.paletteIndex)) + 1;
  return labels.map((label, k) => {
    const g = createGroup(width === 1 ? name : label, paletteIndex + k, t.rowCount);
    if (width > 1 && k === 0) g.title = name;
    return g;
  });
}

export const addGroup = (tableId: Id): Command => (p) =>
  mapTable(p, tableId, (t) => {
    // A new series: one column, or a whole block of sub-columns.
    if (usesSeriesBlocks(t.kind)) return { ...t, groups: [...t.groups, ...newSeriesColumns(t, t.groups)] };
    const paletteIndex = Math.max(-1, ...t.groups.map((g) => g.paletteIndex)) + 1;
    return {
      ...t,
      groups: [...t.groups, createGroup(nextGroupName(t.groups.map((g) => g.name)), paletteIndex, t.rowCount)],
    };
  });

const mapGroup = (t: DataTable, groupId: Id, fn: (g: Group) => Group): DataTable => ({
  ...t,
  groups: t.groups.map((g) => (g.id === groupId ? fn(g) : g)),
});

export const renameGroup = (tableId: Id, groupId: Id, name: string): Command => (p) =>
  mapTable(p, tableId, (t) => mapGroup(t, groupId, (g) => ({ ...g, name })));

/** Remove a Y series of an XY table: all of its columns. The X column and the last series stay. */
export const removeSeries = (tableId: Id, seriesId: Id): Command => (p) => {
  const t = p.dataTables.find((x) => x.id === tableId);
  const series = t && xySeries(t);
  const target = series?.find((s) => s.id === seriesId);
  if (!t || !series || !target || series.length <= 1) return p;
  return target.columns.reduce((acc, g) => removeGroup(tableId, g.id)(acc), p);
};

/** Rename a Y series: its column when a series is one column, otherwise the title of its first column. */
export const renameSeries = (tableId: Id, seriesId: Id, name: string): Command => (p) =>
  mapTable(p, tableId, (t) => {
    const single = seriesWidth(layoutOf(t)) === 1;
    return mapGroup(t, seriesId, (g) => (single ? { ...g, name } : { ...g, title: name }));
  });

export const removeGroup = (tableId: Id, groupId: Id): Command => (p) => {
  const removed = p.dataTables.find((t) => t.id === tableId)?.groups.find((g) => g.id === groupId);
  const next = mapTable(p, tableId, (t) => ({ ...t, groups: t.groups.filter((g) => g.id !== groupId) }));
  // Drop style overrides and display names that referenced the group.
  return {
    ...next,
    charts: next.charts.map((c) => {
      if (c.dataTableId !== tableId) return c;
      const displayNames = { ...c.displayNames };
      delete displayNames[groupId];
      return {
        ...c,
        displayNames,
        layers: c.layers.map((l) => {
          const groupOverrides = { ...l.groupOverrides };
          delete groupOverrides[groupId];
          const objectOverrides = { ...l.objectOverrides };
          for (const id of removed ? groupObjectIds(removed) : []) delete objectOverrides[id];
          return { ...clearGroupSummary(l, groupId), groupOverrides, objectOverrides };
        }),
      };
    }),
  };
};

// ---------------------------------------------------------------- chart

export const patchChart = (chartId: Id, patch: Partial<Chart>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, ...patch }));

/** Axes a patch can target; y2Axis is the secondary (right) Y axis. */
export type AxisKey = 'xAxis' | 'yAxis' | 'y2Axis';

export const patchAxis = (chartId: Id, which: AxisKey, patch: Partial<AxisConfig>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, [which]: sanitizeAxis({ ...c[which], ...patch }, c[which]) }));

/** Apply to all axes (shared line width and font size controls). */
export const patchBothAxes = (chartId: Id, patch: Partial<AxisConfig>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, xAxis: { ...c.xAxis, ...patch }, yAxis: { ...c.yAxis, ...patch }, y2Axis: { ...c.y2Axis, ...patch } }));

export const patchLegend = (chartId: Id, patch: Partial<LegendConfig>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, legend: { ...c.legend, ...patch } }));

/** The order of the legend entries (series ids); an empty list puts them back in series order. The marks stay where they are. */
export const setLegendOrder = (chartId: Id, order: readonly Id[]): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, legend: { ...withoutLegendOrder(c.legend), ...sanitizeLegendLayout({ order }) } }));

/** The number of columns of the legend (1 to 6; 1 is the usual layout). */
export const setLegendColumns = (chartId: Id, columns: number): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, legend: { ...withoutLegendColumns(c.legend), ...sanitizeLegendLayout({ columns }) } }));

/** Move the legend from its place by this many pt (right and down are positive); 0 and 0 puts it back. */
export const setLegendOffset = (chartId: Id, x: number, y: number): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, legend: { ...withoutLegendOffset(c.legend), ...sanitizeLegendLayout({ offsetXPt: x, offsetYPt: y }) } }));

/** Show or hide one data set in the legend, leaving the others as they are. */
export const setLegendItemVisible = (chartId: Id, groupId: Id, visible: boolean): Command => (p) =>
  mapChart(p, chartId, (c) => {
    const hidden = c.legend.hiddenGroupIds.filter((id) => id !== groupId);
    if (!visible) hidden.push(groupId);
    return { ...c, legend: { ...c.legend, hiddenGroupIds: hidden } };
  });

/**
 * Put a data set on the graph or take it off. A data set of the chart's own table is hidden or shown again;
 * one from another table is added to or removed from the graph.
 */
export const setGroupOnGraph = (chartId: Id, tableId: Id, groupId: Id, on: boolean): Command => (p) =>
  mapChart(p, chartId, (c) => {
    if (tableId === c.dataTableId) {
      const hidden = c.hiddenGroupIds.filter((id) => id !== groupId);
      if (!on) hidden.push(groupId);
      return { ...c, hiddenGroupIds: hidden };
    }
    const extra = c.extraGroups.filter((e) => e.groupId !== groupId);
    if (on) {
      // The lowest colour slot no other added data set holds: it stays with this one while the others come and go.
      const taken = new Set(extra.map((e, i) => e.slot ?? i));
      let slot = 0;
      while (taken.has(slot)) slot++;
      extra.push({ tableId, groupId, slot });
    }
    return { ...c, extraGroups: extra };
  });

/** Give the data sets the palette's colours in order (bar fill and symbol colour); manual colours are replaced. */
export const applyPalette = (chartId: Id, palette: Palette): Command => (p) => {
  const chart = p.charts.find((c) => c.id === chartId);
  const table = chart && effectiveTable(p, chart);
  if (!chart || !table) return p;
  return mapChart(p, chartId, (c) => ({
    ...c,
    paletteId: palette.id,
    // The palette sets the colour of every series, so a colour that a part was given of its own is replaced like a manual one.
    layerStyles: clearPartStyles(c.layerStyles, 'all', ['barFill', 'symbolColor', 'symbolBorderColor', 'lineColor', 'errorColor']),
    layers: c.layers.map((l, i) =>
      i !== 0
        ? l
        : // An XY table's first column is X, not a data set: the colours go to the Y series (keyed by their first column), in order.
          (usesSeriesBlocks(table.kind) ? xySeries(table).map((x) => x.columns[0]) : table.groups).reduce((layer, g, gi) => {
            const color = paletteColor(palette, gi);
            // Charts of lines and symbols take the series colour everywhere; bar charts colour the bars.
            return patchGroup(layer, g.id, isSeriesColourType(chart.type) ? { barFill: color, symbolColor: color, symbolBorderColor: color, lineColor: color, errorColor: color } : { barFill: color, symbolColor: color });
          }, l),
    ),
  }));
};

/** Edit the survival options (confidence band, at-risk table) of a survival chart. */
export const patchSurvival = (chartId: Id, patch: Partial<SurvivalOptions>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, survival: { ...c.survival, ...patch } }));

export const patchJitter = (chartId: Id, patch: Partial<JitterConfig>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, jitter: { ...c.jitter, ...patch } }));

export const setDisplayName = (chartId: Id, groupId: Id, name: string): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, displayNames: { ...c.displayNames, [groupId]: name } }));

/**
 * Switch chart type. Only the visibility flags owned by the preset change;
 * colours, sizes, error settings, axes and data are preserved. Per-group
 * overrides of those flags are cleared so the preset takes effect everywhere.
 */
export const setChartType = (chartId: Id, type: ChartType): Command => (p) =>
  mapChart(p, chartId, (c) => {
    // Only a chart type that suits the chart's table type can be chosen.
    const tableKind = p.dataTables.find((t) => t.id === c.dataTableId)?.kind;
    if (tableKind !== undefined && chartTypeInfo(type)?.tableKind !== tableKind) return c;
    const strip = (o: Record<Id, Partial<ChartStyle>>) => {
      const out: Record<Id, Partial<ChartStyle>> = {};
      for (const [id, v] of Object.entries(o)) {
        const copy = { ...v };
        for (const k of PRESET_KEYS) delete copy[k];
        if (Object.keys(copy).length > 0) out[id] = copy;
      }
      return out;
    };
    return {
      ...c,
      type,
      distribution: (type === 'violin' || type === 'groupedViolin') && c.distribution.points === 'none' ? { ...c.distribution, points: 'all' } : c.distribution,
      layers: c.layers.map((l) => ({
        ...l,
        style: { ...l.style, ...TYPE_PRESETS[type] },
        groupOverrides: strip(l.groupOverrides),
        objectOverrides: strip(l.objectOverrides),
      })),
    };
  });

/** Style edit for all groups ('all') or one group. */
/** The data sets of a scope that is not 'all': one, or several. */
const idsOf = (scope: Exclude<StyleScope, 'all'>): readonly Id[] => (typeof scope === 'string' ? [scope] : scope);

/** Part styles taken back for every data set of the scope (see clearPartStyles). */
const clearParts = (styles: Record<Id, Partial<LayerStyle>>, scope: StyleScope, changed: ReadonlyArray<keyof ChartStyle> | 'every'): Record<Id, Partial<LayerStyle>> =>
  scope === 'all' ? clearPartStyles(styles, 'all', changed) : idsOf(scope).reduce((acc, id) => clearPartStyles(acc, id, changed), styles);

/** Style edit for all data sets ('all'), one, or several together (one history step either way). */
export const patchStyle = (chartId: Id, scope: StyleScope, patch: Partial<ChartStyle>): Command => (p) =>
  mapChart(p, chartId, (c) => ({
    ...c,
    // The latest edit wins: a part (line, error bars, points ...) that was given its own setting takes the series' again.
    layerStyles: clearParts(c.layerStyles, scope, Object.keys(patch) as Array<keyof ChartStyle>),
    layers: c.layers.map((l, i) =>
      i !== 0 ? l : scope === 'all' ? patchAllGroups(l, patch) : idsOf(scope).reduce((layer, id) => patchGroup(layer, id, patch), l),
    ),
  }));

/** Style edit for one point (an observation ID); the same project when nothing changes. */
export const patchPointStyle = (chartId: Id, pointId: Id, patch: Partial<ChartStyle>): Command => (p) =>
  mapLayer0(p, chartId, (l) => patchObject(l, pointId, patch));

/** Drop a point's overrides of the given keys (default: the 12 label keys); the same project when none is set. */
export const clearPointStyle = (
  chartId: Id,
  pointId: Id,
  keys: ReadonlyArray<keyof ChartStyle> = LABEL_STYLE_KEYS,
): Command => (p) => mapLayer0(p, chartId, (l) => clearObjectKeys(l, pointId, keys));

/**
 * Put the graph back to the settings a new graph of its type starts with: data set styles at every level, palette, axes, grid,
 * legend, fonts, colours, size and shape, and the options of the chart type. What the graph shows is kept: its name, table, type,
 * the title and axis titles, which data sets are on it and in what order, annotations, reference lines and the chosen curve fit.
 */
export const resetAllDataSets = (chartId: Id): Command => (p) =>
  mapChart(p, chartId, (c) => {
    const fresh = createChart(c.dataTableId, undefined, c.type);
    const axis = (key: 'xAxis' | 'yAxis' | 'y2Axis') => ({ ...fresh[key], title: c[key].title });
    return {
      ...fresh,
      id: c.id,
      name: c.name,
      title: c.title,
      hiddenGroupIds: c.hiddenGroupIds,
      groupOrder: c.groupOrder,
      extraGroups: c.extraGroups,
      displayNames: c.displayNames,
      annotations: c.annotations,
      referenceLines: c.referenceLines,
      fit: { ...fresh.fit, analysisId: c.fit.analysisId },
      xAxis: axis('xAxis'),
      yAxis: axis('yAxis'),
      y2Axis: axis('y2Axis'),
      layers: c.layers.map((l, i) => (i !== 0 ? l : { ...dataLayer(fresh), id: l.id, name: l.name })),
    };
  });

export const resetStyle = (chartId: Id, scope: StyleScope, table: DataTable): Command => (p) =>
  mapChart(p, chartId, (c) => ({
    ...c,
    // Back to the look of the series: what its parts were given of their own goes too.
    layerStyles: clearParts(c.layerStyles, scope, 'every'),
    layers: c.layers.map((l, i) => {
      if (i !== 0) return l;
      const groups = scope === 'all' ? table.groups : table.groups.filter((g) => idsOf(scope).includes(g.id));
      return groups.reduce((layer, g) => resetGroupStyle(layer, g), l);
    }),
  }));

/**
 * Summary calculation edit for all data sets ('all') or one. An invalid patch
 * returns the same project. A centre change never rewrites the stored spread.
 */
export const patchSummary = (chartId: Id, scope: StyleScope, patch: Partial<SummarySpec>): Command => (p) =>
  validateSummaryPatch(patch)
    ? mapLayer0(p, chartId, (l) => (scope === 'all' ? patchAllSummary(l, patch) : idsOf(scope).reduce((layer, id) => patchGroupSummary(layer, id, patch), l)))
    : p;

/** Reset single settings of one data set (the dot beside an overridden field): its own value goes and the graph's shows again. Nothing else of the data set changes. */
export const clearGroupStyleSettings = (chartId: Id, groupIds: Id | readonly Id[], keys: ReadonlyArray<keyof ChartStyle>): Command => (p) =>
  mapLayer0(p, chartId, (l) => idsOf(groupIds).reduce((layer, id) => clearGroupKeys(layer, id, keys), l));

/** Reset single summary settings of one data set; the graph's value shows again. */
export const clearGroupSummarySettings = (chartId: Id, groupIds: Id | readonly Id[], keys: ReadonlyArray<keyof SummarySpec>): Command => (p) =>
  mapLayer0(p, chartId, (l) => idsOf(groupIds).reduce((layer, id) => clearGroupSummaryKeys(layer, id, keys), l));

/** Drop the data set summary overrides ('all' or one data set); layer values stay. */
export const clearSummaryOverrides = (chartId: Id, scope: StyleScope): Command => (p) =>
  mapLayer0(p, chartId, (l) => {
    if (scope !== 'all') return idsOf(scope).reduce((layer, id) => clearGroupSummary(layer, id), l);
    return Object.keys(l.groupSummary).length === 0 ? l : { ...l, groupSummary: {} };
  });

// ---------------------------------------------------------------- annotations

export const addAnnotation = (chartId: Id, annotation: Annotation): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, annotations: [...c.annotations, annotation] }));

export const patchAnnotation = (chartId: Id, annotationId: Id, patch: Partial<Annotation>): Command => (p) =>
  mapChart(p, chartId, (c) => ({
    ...c,
    annotations: c.annotations.map((a) => (a.id === annotationId ? { ...a, ...patch } : a)),
  }));

export const removeAnnotation = (chartId: Id, annotationId: Id): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, annotations: c.annotations.filter((a) => a.id !== annotationId) }));

// ---------------------------------------------------------------- reference lines

export const addReferenceLine = (chartId: Id, line: ReferenceLine): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, referenceLines: [...c.referenceLines, line] }));

export const patchReferenceLine = (chartId: Id, lineId: Id, patch: Partial<Omit<ReferenceLine, 'id'>>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, referenceLines: c.referenceLines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)) }));

export const removeReferenceLine = (chartId: Id, lineId: Id): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, referenceLines: c.referenceLines.filter((l) => l.id !== lineId) }));

// ---------------------------------------------------------------- project items

/** "Data 1", "Data 2", ... (or "XY 1", ...): the lowest number not yet used with this prefix. */
const nextName = (prefix: string, existing: string[]): string => {
  const used = new Set(existing);
  let i = 1;
  while (used.has(`${prefix} ${i}`)) i++;
  return `${prefix} ${i}`;
};

/** New empty data table with the same column count as the first table (min 4). */
export interface NewTableOptions {
  /** Start with sample data instead of an empty table. */
  sample?: boolean;
  /** XY tables: how each Y series is entered. */
  layout?: ReplicateLayout;
}

/** Prefix of the names of new tables of each kind: "Data 1", "XY 1", "Grouped 1", ... */
const TABLE_NAME_PREFIX: Record<TableKind, string> = { column: 'Data', xy: 'XY', grouped: 'Grouped', contingency: 'Contingency', survival: 'Survival' };

export const addDataTable = (id: Id, kind: TableKind = 'column', options: NewTableOptions = {}): Command => (p) => {
  const sample = options.sample === true;
  const name = nextName(TABLE_NAME_PREFIX[kind], p.dataTables.map((t) => t.name));
  const table =
    kind === 'xy' ? createXyTable(name, sample, options.layout)
    : kind === 'grouped' ? createGroupedTable(name, sample, options.layout)
    : kind === 'contingency' ? createContingencyTable(name, sample)
    : kind === 'survival' ? createSurvivalTable(name, sample)
    : createColumnTable(name, sample, Math.max(4, p.dataTables.find((t) => t.kind === 'column')?.groups.length ?? 4));
  return { ...p, dataTables: [...p.dataTables, { ...table, id }] };
};

/**
 * Replace a table's rows and group values (CSV import) as one command. Groups keep their IDs, and so their chart
 * styling, by position; extra groups are added and missing ones dropped. Row titles are kept when the file has none.
 */
export const replaceTableData = (tableId: Id, data: { names: string[]; titles: string[] | null; values: Array<Array<number | null>>; excluded?: Array<Array<{ reason: string } | null>> }): Command => (p) =>
  mapTable(p, tableId, (t) => {
    const rowCount = Math.max(1, data.values.length);
    const width = usesSeriesBlocks(t.kind) ? tableSeriesWidth(t) : 1;
    const lead = leadingColumns(t.kind);
    const subs = subLabels(layoutOf(t));
    const groups: Group[] = data.names.map((name, i) => {
      const old = t.groups[i];
      // In a table of sub-columns the headings (Y1, Mean, SD, ...) and the series names belong to the table, not to the file.
      const sub = width > 1 && i >= lead;
      const k = (i - lead) % width;
      const fresh = createGroup(sub ? subs[k] : name, i, rowCount);
      return {
        ...fresh,
        id: old?.id ?? fresh.id,
        name: sub ? (old?.name ?? subs[k]) : name,
        title: sub ? (old?.title ?? (k === 0 ? defaultSeriesName((i - lead) / width, t.kind) : '')) : (old?.title ?? ''),
        paletteIndex: old?.paletteIndex ?? i,
        observations: fresh.observations.map((o, r) => {
          const ex = data.excluded?.[r]?.[i];
          return { ...o, value: data.values[r]?.[i] ?? null, ...(ex ? { excluded: true as const, ...(ex.reason !== '' ? { excludedReason: ex.reason } : {}) } : {}) };
        }),
      };
    });
    const rows = createRows(rowCount).map((row, r) => ({ ...row, title: data.titles ? (data.titles[r] ?? '') : (t.rows[r]?.title ?? '') }));
    return { ...t, rowCount, rows, groups };
  });

/** Add an analysis of a table to the Results section. */
export const addAnalysis = (id: Id, tableId: Id, kind: AnalysisKind = 'descriptive', fit?: { model: FitModelId; degree?: number }): Command => (p) => {
  const table = p.dataTables.find((t) => t.id === tableId);
  if (!table || !analysisKindApplies(kind, table.kind)) return p;
  const existing = p.analyses ?? [];
  const base = `${analysisTypeInfo(kind).label} of ${table.name}`;
  let name = base;
  for (let i = 2; existing.some((a) => a.name === name); i++) name = `${base} (${i})`;
  return { ...p, analyses: [...existing, { id, name, kind, dataTableId: tableId, level: 0.95, ...(kind === 'curvefit' ? { model: fit?.model ?? 'linear', degree: sanitizeDegree(fit?.degree, 2) } : {}) }] };
};

export const patchAnalysis = (id: Id, patch: Partial<Pick<Analysis, 'name' | 'level' | 'model' | 'degree'>>): Command => (p) => ({
  ...p,
  analyses: (p.analyses ?? []).map((a) => (a.id === id ? { ...a, ...patch, ...(patch.degree !== undefined ? { degree: sanitizeDegree(patch.degree, a.degree ?? 2) } : {}) } : a)),
});

export const removeAnalysis = (id: Id): Command => (p) => ({
  ...p,
  analyses: (p.analyses ?? []).filter((a) => a.id !== id),
  // A graph that drew this curve fit draws none now.
  charts: p.charts.map((c) => (c.fit.analysisId === id ? { ...c, fit: { ...c.fit, analysisId: null } } : c)),
});

export const setProjectName = (name: string): Command => (p) => (p.name === name ? p : { ...p, name });

/** New graph of a data table; named after the table, like the original's linked graph. */
export const addChart = (chartId: Id, tableId: Id, size?: { widthPx: number; heightPx: number }, type?: ChartType, variant?: ChartVariant): Command => (p) => {
  const table = p.dataTables.find((t) => t.id === tableId);
  if (!table) return p;
  // A type that does not suit the table's type is ignored: the table's default chart type is used.
  const suited = type !== undefined && chartTypeInfo(type)?.tableKind === table.kind ? type : defaultChartTypeFor(table.kind);
  const chart = { ...createChart(tableId, size, suited), id: chartId, name: table.name, title: table.name };
  const made = applyVariant(chart, variant);
  if (!variant?.fit || !variantFits(made, variant)) return { ...p, charts: [...p.charts, made] };
  // A chart with a curve fit has its fit in the Results: made here, and the chart points to it.
  const analysisId = `fit-of-${chartId}`;
  const withFit = addAnalysis(analysisId, tableId, 'curvefit', variant.fit)(p);
  return { ...withFit, charts: [...withFit.charts, { ...made, fit: { ...made.fit, analysisId } }] };
};

/** New graph of a data table that takes its format from an existing graph (see model/graph/chartFormat.ts). */
export const addChartLike = (chartId: Id, tableId: Id, sourceChartId: Id, linked = true): Command => (p) => {
  const table = p.dataTables.find((t) => t.id === tableId);
  const source = p.charts.find((c) => c.id === sourceChartId);
  const sourceTable = source && p.dataTables.find((t) => t.id === source.dataTableId);
  if (!table || !source || !sourceTable) return p;
  const made = inheritChart(source, sourceTable, table, chartId);
  return { ...p, charts: [...p.charts, linked ? { ...made, linkedTo: source.id } : made] };
};

/** Stop a graph following the graph it is linked to; it keeps all its settings as they are. */
export const unlinkChart = (chartId: Id): Command => (p) => (p.charts.some((c) => c.id === chartId && c.linkedTo !== undefined) ? mapChart(p, chartId, ({ linkedTo: _gone, ...c }) => c) : p);

/** Colours, frame and gridline style of the chart (see model/graph/axis.ts: sanitizeLook). */
export const patchLook = (chartId: Id, patch: Partial<Pick<Chart, 'origin' | 'lineOrder' | 'lineConnect' | 'heatmap' | 'pairs' | 'histogram' | 'fit' | 'pie' | 'orientation' | 'bars' | 'axisColor' | 'axisOpacity' | 'plotColor' | 'pageColor' | 'frame' | 'fontFamily' | 'textColor' | 'titleBold' | 'titleOffsetPt'>> & { grid?: Partial<GridStyle> }): Command => (p) =>
  mapChart(p, chartId, (c) => {
    const { grid, ...rest } = patch;
    return { ...c, ...sanitizeLook({ ...c, ...rest, grid: { ...c.grid, ...grid } }, c) };
  });

/** Column spacing and baseline of a column chart. */
export const patchBars = (chartId: Id, patch: Partial<BarLayout>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, bars: sanitizeBars({ ...c.bars, ...patch }, c.bars) }));

/** Put the data sets of a column chart in this order (ids not listed follow in their own order). */
export const setGroupOrder = (chartId: Id, order: Id[]): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, groupOrder: sanitizeOrder(order) }));

/** Labels above the bars of a column chart. */
export const patchBarLabels = (chartId: Id, patch: Partial<BarLabels>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, barLabels: sanitizeBarLabels({ ...c.barLabels, ...patch }, c.barLabels) }));

/** Settings of box plots and violins. */
export const patchDistribution = (chartId: Id, patch: Partial<DistributionOptions>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, distribution: sanitizeDistribution({ ...c.distribution, ...patch }, c.distribution) }));

/** The project with the items of a folder replaced by `change` of them (the lists of results and layouts are absent when empty). */
function withFolder(p: Project, folder: FolderKey, change: <T extends { id: Id; name: string }>(list: T[]) => T[]): Project {
  switch (folder) {
    case 'tables':
      return { ...p, dataTables: change(p.dataTables) };
    case 'graphs':
      return { ...p, charts: change(p.charts) };
    case 'results': {
      const list = change(p.analyses ?? []);
      return { ...p, analyses: list.length > 0 ? list : undefined };
    }
    case 'layouts': {
      const list = change(p.layouts ?? []);
      return { ...p, layouts: list.length > 0 ? list : undefined };
    }
  }
}

/** Put the items of a folder that are in `ids` together before the item `before` (the end when null): the order of the navigator. */
export const moveItems = (folder: FolderKey, ids: ReadonlyArray<Id>, before: Id | null): Command => (p) => {
  const next = withFolder(p, folder, (list) => reorder(list, ids, before));
  return folderItems(next, folder).every((x, i) => x.id === folderItems(p, folder)[i]?.id) ? p : next;
};

/** Move the items of a folder that are in `ids` one place earlier or later. */
export const nudgeItems = (folder: FolderKey, ids: ReadonlyArray<Id>, step: 1 | -1): Command => (p) => {
  const next = withFolder(p, folder, (list) => nudge(list, ids, step));
  return folderItems(next, folder).every((x, i) => x.id === folderItems(p, folder)[i]?.id) ? p : next;
};

/** Put the items of a folder in the order of their names, A to Z. */
export const sortItemsByName = (folder: FolderKey): Command => (p) => {
  const next = withFolder(p, folder, (list) => sortedByName(list));
  return folderItems(next, folder).every((x, i) => x.id === folderItems(p, folder)[i]?.id) ? p : next;
};

/** Delete several items of a folder in one step (one undo). A table takes its graphs and results with it; the last table stays. */
export const removeItems = (folder: FolderKey, ids: ReadonlyArray<Id>): Command =>
  composeCommands(...ids.map((id) => (folder === 'tables' ? removeTable(id) : folder === 'graphs' ? removeChart(id) : folder === 'results' ? removeAnalysis(id) : removeLayout(id))));

/** Copy several items of a folder in one step; `copies` pairs each item with the ID its copy gets. */
export const duplicateItems = (folder: FolderKey, copies: ReadonlyArray<readonly [Id, Id]>): Command =>
  composeCommands(...copies.map(([id, copyId]) => (folder === 'tables' ? duplicateTable(id, copyId) : folder === 'graphs' ? duplicateChart(id, copyId) : folder === 'results' ? duplicateAnalysis(id, copyId) : duplicateLayout(id, copyId))));

/** Rename a data table, a graph or an analysis from the navigator; a blank name is ignored. */
export const renameItem = (kind: 'table' | 'chart' | 'analysis' | 'layout', id: Id, name: string): Command => (p) => {
  const next = name.trim();
  if (next === '') return p;
  if (kind === 'table') return mapTable(p, id, (t) => (t.name === next ? t : { ...t, name: next }));
  if (kind === 'chart') return mapChart(p, id, (c) => (c.name === next ? c : { ...c, name: next }));
  if (kind === 'layout') return { ...p, layouts: (p.layouts ?? []).map((l) => (l.id === id && l.name !== next ? { ...l, name: next } : l)) };
  return { ...p, analyses: (p.analyses ?? []).map((a) => (a.id === id && a.name !== next ? { ...a, name: next } : a)) };
};

// ---------------------------------------------------------------------------------------------------------------
// Duplicating and deleting the items of the project. Every one is a command, so it can be undone.

/** A name for a copy: "Name (copy)", then "Name (copy 2)" ... that no other item of the list has. */
const copyName = (name: string, existing: string[]): string => {
  const used = new Set(existing);
  let candidate = `${name} (copy)`;
  for (let i = 2; used.has(candidate); i++) candidate = `${name} (copy ${i})`;
  return candidate;
};

/** A copy of a data table with new IDs throughout (so its graphs and styling are not shared with the original). */
export const duplicateTable = (tableId: Id, copyId: Id): Command => (p) => {
  const t = p.dataTables.find((x) => x.id === tableId);
  if (!t) return p;
  const copy: DataTable = {
    ...t,
    id: copyId,
    name: copyName(t.name, p.dataTables.map((x) => x.name)),
    rows: t.rows.map((r) => ({ ...r, id: newId('row') })),
    groups: t.groups.map((g) => ({ ...g, id: newId('group'), observations: g.observations.map((o) => ({ ...o, id: newId('obs') })) })),
  };
  return { ...p, dataTables: [...p.dataTables, copy] };
};

/**
 * Delete a data table together with what depends on it: its graphs and results, and the data sets other graphs took from it.
 * The last table of a project cannot be deleted.
 */
export const removeTable = (tableId: Id): Command => (p) => {
  if (p.dataTables.length <= 1 || !p.dataTables.some((t) => t.id === tableId)) return p;
  const goneAnalyses = new Set((p.analyses ?? []).filter((a) => a.dataTableId === tableId).map((a) => a.id));
  const analyses = (p.analyses ?? []).filter((a) => !goneAnalyses.has(a.id));
  const goneCharts = new Set(p.charts.filter((c) => c.dataTableId === tableId).map((c) => c.id));
  return clearPanels(
    {
      ...p,
      dataTables: p.dataTables.filter((t) => t.id !== tableId),
      charts: p.charts
        .filter((c) => c.dataTableId !== tableId)
        .map((c) => ({
          ...c,
          extraGroups: c.extraGroups.filter((e) => e.tableId !== tableId),
          fit: c.fit.analysisId !== null && goneAnalyses.has(c.fit.analysisId) ? { ...c.fit, analysisId: null } : c.fit,
        })),
      ...(analyses.length > 0 ? { analyses } : { analyses: undefined }),
    },
    goneCharts,
  );
};

/** Empties the layout panels that held a graph that is gone (they stay as placeholders). */
const clearPanels = (p: Project, gone: ReadonlySet<Id>): Project =>
  gone.size === 0 || !(p.layouts ?? []).some((l) => l.panels.some((id) => id !== null && gone.has(id)))
    ? p
    : { ...p, layouts: (p.layouts ?? []).map((l) => ({ ...l, panels: l.panels.map((id) => (id !== null && gone.has(id) ? null : id)) })) };

/**
 * The layers of a graph that belong to the graph as a whole (the at-risk table, the titles, the pair lines, the cells of a heat map)
 * have IDs that begin with the graph's own ID (see model/graph/layers.ts). In a copy those keys must name the copy's layers: this
 * is the one place that owns the old-to-new map, for everything the chart keeps by layer ID.
 */
const withChartIdOf = (c: Chart, copyId: Id): Pick<Chart, 'hiddenLayerIds' | 'rangeExcludedLayerIds' | 'layerOrder' | 'layerStyles'> => {
  const prefix = `${c.id}:`;
  const map = (id: Id): Id => (id.startsWith(prefix) ? `${copyId}:${id.slice(prefix.length)}` : id);
  return {
    hiddenLayerIds: c.hiddenLayerIds.map(map),
    rangeExcludedLayerIds: c.rangeExcludedLayerIds.map(map),
    layerOrder: c.layerOrder.map(map),
    layerStyles: Object.fromEntries(Object.entries(c.layerStyles).map(([id, style]) => [map(id), style])),
  };
};

/** A copy of a graph (same data table, same settings) with new IDs for it and its layers. */
export const duplicateChart = (chartId: Id, copyId: Id): Command => (p) => {
  const c = p.charts.find((x) => x.id === chartId);
  if (!c) return p;
  const copy: Chart = { ...c, ...withChartIdOf(c, copyId), id: copyId, name: copyName(c.name, p.charts.map((x) => x.name)), layers: c.layers.map((l) => ({ ...l, id: newId('layer') })) };
  return { ...p, charts: [...p.charts, copy] };
};

export const removeChart = (chartId: Id): Command => (p) => (p.charts.some((c) => c.id === chartId) ? clearPanels({ ...p, charts: p.charts.filter((c) => c.id !== chartId) }, new Set([chartId])) : p);

// ---------------------------------------------------------------------------------------------------------------
// Layouts: A4 pages of graphs.

/** Add a layout. `fillFrom` puts the graphs of the project in the panels, in order, starting with that graph. */
export const addLayout = (id: Id, over: Parameters<typeof defaultLayout>[2] = {}, fillFrom?: Id): Command => (p) => {
  const existing = p.layouts ?? [];
  let name = 'Layout';
  for (let i = 2; existing.some((l) => l.name === name); i++) name = `Layout ${i}`;
  const layout = defaultLayout(id, name, over);
  if (fillFrom !== undefined) {
    const start = Math.max(0, p.charts.findIndex((c) => c.id === fillFrom));
    layout.panels = layout.panels.map((_, i) => p.charts[start + i]?.id ?? null);
  }
  return { ...p, layouts: [...existing, layout] };
};

const mapLayout = (p: Project, id: Id, fn: (l: Layout) => Layout): Project => ({ ...p, layouts: (p.layouts ?? []).map((l) => (l.id === id ? fn(l) : l)) });

/** Change the settings of a layout (page, arrangement, scaling, labels). A new arrangement keeps the graphs of the slots that remain. */
export const patchLayout = (id: Id, patch: Partial<Omit<Layout, 'id' | 'panels'>>): Command => (p) =>
  mapLayout(p, id, (l) => {
    // Turning the page carries the boxes of a free layout with it.
    const a = l.arrangement;
    const turned = patch.orientation !== undefined && patch.orientation !== l.orientation && a.kind === 'free' && patch.arrangement === undefined;
    return sanitizeLayout({ ...l, ...patch, ...(turned && a.kind === 'free' ? { arrangement: { kind: 'free' as const, frames: turnFrames(a.frames, l.orientation, patch.orientation!) } } : {}) }, l);
  });

/** Make the panels free boxes, starting where the arrangement put them. */
export const freeLayout = (id: Id): Command => (p) =>
  mapLayout(p, id, (l) => (l.arrangement.kind === 'free' ? l : { ...l, arrangement: { kind: 'free', frames: framesOf(l) } }));

/** Move or resize the box of a panel of a free layout. */
export const setFrame = (id: Id, slot: number, frame: { x: number; y: number; w: number; h: number }): Command => (p) =>
  mapLayout(p, id, (l) => {
    const a = l.arrangement;
    if (a.kind !== 'free' || slot < 0 || slot >= a.frames.length) return l;
    return { ...l, arrangement: { kind: 'free', frames: a.frames.map((f, i) => (i === slot ? clampFrame(frame, l.orientation) : f)) } };
  });

/** Add an empty panel to a free layout. */
export const addFreePanel = (id: Id): Command => (p) =>
  mapLayout(p, id, (l) => {
    const a = l.arrangement;
    if (a.kind !== 'free' || a.frames.length >= FREE_MAX) return l;
    return { ...l, arrangement: { kind: 'free', frames: [...a.frames, newFrame(a.frames, l.orientation)] }, panels: [...l.panels, null] };
  });

/** Remove a panel of a free layout (the last one cannot be removed); later panels move up. */
export const removeFreePanel = (id: Id, slot: number): Command => (p) =>
  mapLayout(p, id, (l) => {
    const a = l.arrangement;
    if (a.kind !== 'free' || a.frames.length <= 1 || slot < 0 || slot >= a.frames.length) return l;
    return { ...l, arrangement: { kind: 'free', frames: a.frames.filter((_, i) => i !== slot) }, panels: l.panels.filter((_, i) => i !== slot) };
  });

/** Put a graph in a panel (null empties it). A graph already in another panel of the layout swaps places with it. */
export const setLayoutPanel = (id: Id, slot: number, chartId: Id | null): Command => (p) =>
  mapLayout(p, id, (l) => {
    if (slot < 0 || slot >= l.panels.length || (chartId !== null && !p.charts.some((c) => c.id === chartId))) return l;
    const panels = [...l.panels];
    const from = chartId === null ? -1 : panels.indexOf(chartId);
    if (from >= 0) panels[from] = panels[slot];
    panels[slot] = chartId;
    return { ...l, panels: resizePanels(panels, l.arrangement) };
  });

export const removeLayout = (id: Id): Command => (p) => {
  const layouts = (p.layouts ?? []).filter((l) => l.id !== id);
  return { ...p, layouts: layouts.length > 0 ? layouts : undefined };
};

/** A copy of a layout (same graphs and settings). */
export const duplicateLayout = (layoutId: Id, copyId: Id): Command => (p) => {
  const l = (p.layouts ?? []).find((x) => x.id === layoutId);
  if (!l) return p;
  return { ...p, layouts: [...(p.layouts ?? []), { ...l, id: copyId, name: copyName(l.name, (p.layouts ?? []).map((x) => x.name)), panels: [...l.panels], arrangement: l.arrangement.kind === 'free' ? { kind: 'free', frames: l.arrangement.frames.map((f) => ({ ...f })) } : l.arrangement }] };
};

/** A copy of an analysis (same table and settings). */
export const duplicateAnalysis = (analysisId: Id, copyId: Id): Command => (p) => {
  const a = (p.analyses ?? []).find((x) => x.id === analysisId);
  if (!a) return p;
  return { ...p, analyses: [...(p.analyses ?? []), { ...a, id: copyId, name: copyName(a.name, (p.analyses ?? []).map((x) => x.name)) }] };
};

/** A cell of a table by its column (index into the groups) and row. */
interface CellRef {
  row: number;
  col: number;
}

/**
 * Exclude cells from every chart and calculation (with a reason), or include them again. The values stay in the table.
 * A cell that is empty, or already as asked, is left alone; the same table when nothing changes.
 */
export const setExcluded = (tableId: Id, cells: CellRef[], excluded: boolean, reason = ''): Command => (p) =>
  mapTable(p, tableId, (t) => {
    let changed = false;
    const groups = t.groups.map((g, ci) => {
      const rows = cells.filter((c) => c.col === ci && c.row >= 0 && c.row < t.rowCount).map((c) => c.row);
      if (rows.length === 0) return g;
      let observations: Observation[] | null = null;
      for (const r of rows) {
        const o = (observations ?? g.observations)[r];
        if (excluded ? o.value === null || (o.excluded === true && (o.excludedReason ?? '') === reason) : o.excluded !== true) continue;
        observations = observations ?? g.observations.slice();
        const { excluded: _e, excludedReason: _r, ...rest } = o;
        observations[r] = excluded ? { ...rest, excluded: true, ...(reason !== '' ? { excludedReason: reason } : {}) } : rest;
      }
      if (!observations) return g;
      changed = true;
      return { ...g, observations };
    });
    return changed ? { ...t, groups } : t;
  });

// ---------------------------------------------------------------- layers

/** Give a layer its own look, or take a setting back to the series' (null). A setting the layer's kind does not take is ignored. */
export const patchLayerStyle = (chartId: Id, layerId: Id, patch: { [K in keyof LayerStyle]?: LayerStyle[K] | null }): Command => (p) =>
  mapChart(p, chartId, (c) => {
    // Only the families that draw their parts in a look of their own take one.
    if (!layerStylesAvailable(c)) return c;
    const merged: Record<string, unknown> = { ...(c.layerStyles[layerId] ?? {}) };
    const kind = layerKindOf(layerId);
    const takes = kind ? lookKeysOf(c.type, kind) ?? [] : [];
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete merged[k];
      // A setting the drawing of this chart type does not honour is not stored.
      else if (v !== undefined && takes.includes(k as keyof LayerStyle)) merged[k] = v;
    }
    const { styles } = sanitizeLayerStyles({ [layerId]: merged });
    const next = { ...c.layerStyles };
    if (styles[layerId]) next[layerId] = styles[layerId];
    else delete next[layerId];
    return { ...c, layerStyles: next };
  });

/**
 * Put a data layer one place higher (+1: it is drawn over the layer above it) or lower (-1) among the data layers of the chart.
 * Nothing that is calculated changes. The same project when the layer cannot go that way.
 */
export const moveLayer = (chartId: Id, layerId: Id, step: 1 | -1): Command => (p) => {
  const chart = p.charts.find((c) => c.id === chartId);
  const table = chart && effectiveTable(p, chart);
  if (!chart || !table) return p;
  const ids = layersOf(chart, table).filter((l) => ORDERABLE_LAYER_KINDS.includes(l.kind)).map((l) => l.id);
  const at = ids.indexOf(layerId);
  const to = at + step;
  if (at < 0 || to < 0 || to >= ids.length) return p;
  [ids[at], ids[to]] = [ids[to], ids[at]];
  return mapChart(p, chartId, (c) => ({ ...c, layerOrder: ids }));
};

/** Go back to the order of the data layers that the chart type gives. */
export const resetLayerOrder = (chartId: Id): Command => (p) => mapChart(p, chartId, (c) => (c.layerOrder.length === 0 ? c : { ...c, layerOrder: [] }));

/** Take a layer's values out of what the axis range is fitted to (it is still drawn, and nothing that is calculated changes) or put them back. */
export const setLayerRange = (chartId: Id, layerId: Id, included: boolean): Command => (p) =>
  mapChart(p, chartId, (c) => {
    const out = c.rangeExcludedLayerIds.includes(layerId);
    if (included !== out) return c;
    return { ...c, rangeExcludedLayerIds: included ? c.rangeExcludedLayerIds.filter((id) => id !== layerId) : [...c.rangeExcludedLayerIds, layerId] };
  });

/** Hide a layer of the chart (take it out of the drawing; nothing that is calculated changes) or show it again. */
export const setLayerHidden = (chartId: Id, layerId: Id, hidden: boolean): Command => (p) =>
  mapChart(p, chartId, (c) => {
    const has = c.hiddenLayerIds.includes(layerId);
    if (hidden === has) return c;
    return { ...c, hiddenLayerIds: hidden ? [...c.hiddenLayerIds, layerId] : c.hiddenLayerIds.filter((id) => id !== layerId) };
  });
