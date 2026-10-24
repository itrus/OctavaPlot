import { sanitizeAxis } from '../model/axis';
import { sanitizeBarLabels, sanitizeBars } from '../model/columnOptions';
import { sanitizeDistribution } from '../model/distributionOptions';
import { sanitizeLook } from '../model/look';
import { GROUP_GAP_LIMITS, sanitizeGaps, sanitizeOrder } from '../model/groupOrder';
import { createChart, createColumnTable, DEFAULT_SURVIVAL, initialLayerStyle, createContingencyTable, createGroupedTable, createSurvivalTable, defaultSummaryFor, createGroup, createXyTable, DEFAULT_JITTER, DEFAULT_STYLE, nextGroupName, PRESET_KEYS, TYPE_PRESETS } from '../model/defaults';
import { analysisKindApplies, analysisTypeInfo } from '../model/analysis';
import { sanitizeDegree } from '../model/fitOptions';
import type { FitModelId } from '../stats/fit';
import { effectiveTable } from '../model/chartTable';
import { defaultSeriesName, layoutOf, seriesWidth, subLabels, tableSeriesWidth, xySeries } from '../model/tableLayout';

/** Chart types whose series colour is the colour of symbols, lines and error bars (not of filled bars). */
import { applyVariant, type ChartVariant, variantFits } from '../model/chartVariant';
import { chartTypeInfo, defaultChartTypeFor, isSeriesColourType, leadingColumns, usesSeriesBlocks } from '../model/chartTypes';
import { newId } from '../model/ids';
import { DEFAULT_PALETTE_ID, paletteColor, type Palette } from '../model/palettes';
import { createRows, sanitizeRowTitle } from '../model/rows';
import { clearGroupSummary, patchAllSummary, patchGroupSummary, validateSummaryPatch } from '../model/summary';
import { LABEL_STYLE_KEYS, clearObjectKeys, groupObjectIds, patchAllGroups, patchGroup, patchObject, resetGroupStyle } from '../model/style';
import type {
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
  LegendConfig,
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
  const layer = p.charts.find((c) => c.id === chartId)?.layers[0];
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
    const width = Math.max(0, ...matrix.map((r) => r.length));
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
    if (on) extra.push({ tableId, groupId });
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
      layers: c.layers.map((l) => ({
        ...l,
        style: { ...l.style, ...TYPE_PRESETS[type] },
        groupOverrides: strip(l.groupOverrides),
        objectOverrides: strip(l.objectOverrides),
      })),
    };
  });

/** Style edit for all groups ('all') or one group. */
export const patchStyle = (chartId: Id, scope: 'all' | Id, patch: Partial<ChartStyle>): Command => (p) =>
  mapChart(p, chartId, (c) => ({
    ...c,
    layers: c.layers.map((l, i) =>
      i !== 0 ? l : scope === 'all' ? patchAllGroups(l, patch) : patchGroup(l, scope, patch),
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
 * Put every data set of the graph back to the defaults: the chart-type preset, the default palette, and no
 * overrides at any level (global, data set or point). Titles, axes, legend and size are not touched.
 */
export const resetAllDataSets = (chartId: Id): Command => (p) =>
  mapChart(p, chartId, (c) => ({
    ...c,
    defaults: { ...DEFAULT_STYLE },
    paletteId: DEFAULT_PALETTE_ID,
    jitter: { ...DEFAULT_JITTER },
    layers: c.layers.map((l, i) =>
      i !== 0
        ? l
        : { ...l, style: initialLayerStyle(c.type), groupOverrides: {}, objectOverrides: {}, summary: { ...defaultSummaryFor(c.type) }, groupSummary: {} },
    ),
    survival: { ...DEFAULT_SURVIVAL },
  }));

export const resetStyle = (chartId: Id, scope: 'all' | Id, table: DataTable): Command => (p) =>
  mapChart(p, chartId, (c) => ({
    ...c,
    layers: c.layers.map((l, i) => {
      if (i !== 0) return l;
      const groups = scope === 'all' ? table.groups : table.groups.filter((g) => g.id === scope);
      return groups.reduce((layer, g) => resetGroupStyle(layer, g), l);
    }),
  }));

/**
 * Summary calculation edit for all data sets ('all') or one. An invalid patch
 * returns the same project. A centre change never rewrites the stored spread.
 */
export const patchSummary = (chartId: Id, scope: 'all' | Id, patch: Partial<SummarySpec>): Command => (p) =>
  validateSummaryPatch(patch)
    ? mapLayer0(p, chartId, (l) => (scope === 'all' ? patchAllSummary(l, patch) : patchGroupSummary(l, scope, patch)))
    : p;

/** Drop the data set summary overrides ('all' or one data set); layer values stay. */
export const clearSummaryOverrides = (chartId: Id, scope: 'all' | Id): Command => (p) =>
  mapLayer0(p, chartId, (l) => {
    if (scope !== 'all') return clearGroupSummary(l, scope);
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
export const replaceTableData = (tableId: Id, data: { names: string[]; titles: string[] | null; values: Array<Array<number | null>> }): Command => (p) =>
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
        observations: fresh.observations.map((o, r) => ({ ...o, value: data.values[r]?.[i] ?? null })),
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

/** Colours, frame and gridline style of the chart (see model/axis.ts: sanitizeLook). */
export const patchLook = (chartId: Id, patch: Partial<Pick<Chart, 'origin' | 'lineOrder' | 'heatmap' | 'pairs' | 'histogram' | 'fit' | 'pie' | 'orientation' | 'bars' | 'axisColor' | 'plotColor' | 'pageColor' | 'frame' | 'fontFamily' | 'textColor' | 'titleBold' | 'titleOffsetPt'>> & { grid?: Partial<GridStyle> }): Command => (p) =>
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

/** Space before a data set as a percentage of the normal space between columns (100 or null = normal). */
export const setGroupGap = (chartId: Id, groupId: Id, pct: number | null): Command => (p) =>
  mapChart(p, chartId, (c) => {
    const next = sanitizeGaps({ ...c.groupGaps, [groupId]: pct ?? GROUP_GAP_LIMITS.normal });
    return { ...c, groupGaps: next };
  });

/** Labels above the bars of a column chart. */
export const patchBarLabels = (chartId: Id, patch: Partial<BarLabels>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, barLabels: sanitizeBarLabels({ ...c.barLabels, ...patch }, c.barLabels) }));

/** Settings of box plots and violins. */
export const patchDistribution = (chartId: Id, patch: Partial<DistributionOptions>): Command => (p) =>
  mapChart(p, chartId, (c) => ({ ...c, distribution: sanitizeDistribution({ ...c.distribution, ...patch }, c.distribution) }));

/** Rename a data table, a graph or an analysis from the navigator; a blank name is ignored. */
export const renameItem = (kind: 'table' | 'chart' | 'analysis', id: Id, name: string): Command => (p) => {
  const next = name.trim();
  if (next === '') return p;
  if (kind === 'table') return mapTable(p, id, (t) => (t.name === next ? t : { ...t, name: next }));
  if (kind === 'chart') return mapChart(p, id, (c) => (c.name === next ? c : { ...c, name: next }));
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
  return {
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
  };
};

/** A copy of a graph (same data table, same settings) with new IDs for it and its layers. */
export const duplicateChart = (chartId: Id, copyId: Id): Command => (p) => {
  const c = p.charts.find((x) => x.id === chartId);
  if (!c) return p;
  const copy: Chart = { ...c, id: copyId, name: copyName(c.name, p.charts.map((x) => x.name)), layers: c.layers.map((l) => ({ ...l, id: newId('layer') })) };
  return { ...p, charts: [...p.charts, copy] };
};

export const removeChart = (chartId: Id): Command => (p) => (p.charts.some((c) => c.id === chartId) ? { ...p, charts: p.charts.filter((c) => c.id !== chartId) } : p);

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
