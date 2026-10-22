import { createChart, createGroup, DEFAULT_JITTER, DEFAULT_STYLE, DEFAULT_SUMMARY, INITIAL_ROWS, nextGroupName, PRESET_KEYS, TYPE_PRESETS } from '../model/defaults';
import { effectiveTable } from '../model/chartTable';
import { newId } from '../model/ids';
import { DEFAULT_PALETTE_ID, paletteColor, type Palette } from '../model/palettes';
import { createRows, sanitizeRowTitle } from '../model/rows';
import { clearGroupSummary, patchAllSummary, patchGroupSummary, validateSummaryPatch } from '../model/summary';
import { LABEL_STYLE_KEYS, clearObjectKeys, groupObjectIds, patchAllGroups, patchGroup, patchObject, resetGroupStyle } from '../model/style';
import type {
  Annotation,
  AxisConfig,
  Chart,
  ChartLayer,
  ChartStyle,
  ChartType,
  DataRow,
  DataTable,
  Group,
  Id,
  JitterConfig,
  LegendConfig,
  Project,
  SummarySpec,
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

export interface RowTitleEdit {
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
      let nextPalette = Math.max(-1, ...groups.map((g) => g.paletteIndex)) + 1;
      while (groups.length < col0 + width) {
        groups.push(createGroup(nextGroupName(groups.map((g) => g.name)), nextPalette++, t.rowCount));
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

export const addGroup = (tableId: Id): Command => (p) =>
  mapTable(p, tableId, (t) => {
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

export const setGroupTitle = (tableId: Id, groupId: Id, title: string): Command => (p) =>
  mapTable(p, tableId, (t) => mapGroup(t, groupId, (g) => ({ ...g, title })));

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
  mapChart(p, chartId, (c) => ({ ...c, [which]: { ...c[which], ...patch } }));

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
        : table.groups.reduce((layer, g, gi) => {
            const color = paletteColor(palette, gi);
            return patchGroup(layer, g.id, { barFill: color, symbolColor: color });
          }, l),
    ),
  }));
};

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
        : { ...l, style: { ...TYPE_PRESETS[c.type] }, groupOverrides: {}, objectOverrides: {}, summary: { ...DEFAULT_SUMMARY }, groupSummary: {} },
    ),
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

// ---------------------------------------------------------------- project items

const nextName = (prefix: string, existing: string[]): string => {
  for (let i = existing.length + 1; i < existing.length + 1000; i++) {
    if (!existing.includes(`${prefix} ${i}`)) return `${prefix} ${i}`;
  }
  return `${prefix} ${existing.length + 1}`;
};

/** New empty data table with the same column count as the first table (min 4). */
export const addDataTable = (id: Id): Command => (p) => {
  const cols = Math.max(4, p.dataTables[0]?.groups.length ?? 4);
  const name = nextName('Data', p.dataTables.map((t) => t.name));
  const groups: Group[] = [];
  for (let i = 0; i < cols; i++) groups.push(createGroup(nextGroupName(groups.map((g) => g.name)), i, INITIAL_ROWS));
  return { ...p, dataTables: [...p.dataTables, { id, name, rowCount: INITIAL_ROWS, rows: createRows(INITIAL_ROWS), groups }] };
};

/**
 * Replace a table's rows and group values (CSV import) as one command. Groups keep their IDs, and so their chart
 * styling, by position; extra groups are added and missing ones dropped. Row titles are kept when the file has none.
 */
export const replaceTableData = (tableId: Id, data: { names: string[]; titles: string[] | null; values: Array<Array<number | null>> }): Command => (p) =>
  mapTable(p, tableId, (t) => {
    const rowCount = Math.max(1, data.values.length);
    const groups: Group[] = data.names.map((name, i) => {
      const fresh = createGroup(name, i, rowCount);
      const old = t.groups[i];
      return {
        ...fresh,
        id: old?.id ?? fresh.id,
        paletteIndex: old?.paletteIndex ?? i,
        observations: fresh.observations.map((o, r) => ({ ...o, value: data.values[r]?.[i] ?? null })),
      };
    });
    const rows = createRows(rowCount).map((row, r) => ({ ...row, title: data.titles ? (data.titles[r] ?? '') : (t.rows[r]?.title ?? '') }));
    return { ...t, rowCount, rows, groups };
  });

export const setProjectName = (name: string): Command => (p) => (p.name === name ? p : { ...p, name });

/** New graph of a data table; named after the table, like the original's linked graph. */
export const addChart = (chartId: Id, tableId: Id, size?: { widthPx: number; heightPx: number }): Command => (p) => {
  const table = p.dataTables.find((t) => t.id === tableId);
  if (!table) return p;
  const chart = { ...createChart(tableId, size), id: chartId, name: table.name, title: table.name };
  return { ...p, charts: [...p.charts, chart] };
};
