import { leadingColumns, usesSeriesBlocks } from '../graph/chartTypes';
import { withoutExcluded } from './exclusion';
import { applyOrder } from './groupOrder';
import { tableSeriesWidth, xySeries } from './tableLayout';
import { factorLayout } from './factors';
import type { Chart, DataTable, Group, Id, Project } from '../types';

/** One data set a graph can plot, from its own table or from another one. */
export interface GraphSource {
  tableId: Id;
  tableName: string;
  group: Group;
  /** Whether it is on the graph now. */
  onGraph: boolean;
  /** Part of the graph's own table (switched off by hiding) rather than added from another table. */
  own: boolean;
}

const tableById = (p: Project, id: Id): DataTable | undefined => p.dataTables.find((t) => t.id === id);

/** Every data set that could be on the graph: all of its own table's, then those of the other tables. */
export function graphSources(p: Project, chart: Chart): GraphSource[] {
  const hidden = new Set(chart.hiddenGroupIds);
  const added = new Set(chart.extraGroups.map((e) => e.groupId));
  const own = tableById(p, chart.dataTableId);
  // An XY table's first column is X, not a data set; XY charts plot only the series of their own table. A series
  // is one column or a block of sub-columns, listed under its own name.
  const blocks = own !== undefined && usesSeriesBlocks(own.kind);
  const ownGroups = blocks ? xySeries(own).map((s) => ({ ...s.columns[0], name: s.name })) : (own?.groups ?? []);
  const out: GraphSource[] = ownGroups.map((g) => ({ tableId: chart.dataTableId, tableName: own!.name, group: g, onGraph: !hidden.has(g.id), own: true }));
  if (blocks) return out;
  for (const t of p.dataTables) {
    if (t.id === chart.dataTableId || t.kind !== 'column') continue;
    for (const g of t.groups) out.push({ tableId: t.id, tableName: t.name, group: g, onGraph: added.has(g.id), own: false });
  }
  return out;
}

/**
 * The table the chart is drawn from: the data sets that are on the graph, in order (its own table's first, then the
 * ones added from other tables). Rows are the longest of them; shorter data sets are padded with missing values.
 * Without hidden or added data sets this is the chart's own table itself.
 */
export function effectiveTable(p: Project, chart: Chart): DataTable | undefined {
  // The result depends only on these parts of the chart and on the tables they point to, so a title or a colour edit (a new chart object that
  // shares these) finds it again. Stored under the list of hidden data sets, which an edit of the rest of the chart leaves as it is.
  const tables = [tableById(p, chart.dataTableId), ...chart.extraGroups.map((e) => tableById(p, e.tableId))];
  const known = effectiveTables.get(chart.hiddenGroupIds);
  if (
    known &&
    known.dataTableId === chart.dataTableId &&
    known.extraGroups === chart.extraGroups &&
    known.groupOrder === chart.groupOrder &&
    known.tables.length === tables.length &&
    known.tables.every((t, i) => t === tables[i])
  ) {
    return known.table;
  }
  const own = effectiveTableWithExcluded(p, chart);
  const table = own && withoutExcluded(own);
  effectiveTables.set(chart.hiddenGroupIds, { dataTableId: chart.dataTableId, extraGroups: chart.extraGroups, groupOrder: chart.groupOrder, tables, table });
  return table;
}

const effectiveTables = new WeakMap<object, { dataTableId: Id; extraGroups: Chart['extraGroups']; groupOrder: Chart['groupOrder']; tables: ReadonlyArray<DataTable | undefined>; table: DataTable | undefined }>();

function effectiveTableWithExcluded(p: Project, chart: Chart): DataTable | undefined {
  const own = tableById(p, chart.dataTableId);
  if (!own) return undefined;
  if (chart.hiddenGroupIds.length === 0 && chart.extraGroups.length === 0 && chart.groupOrder.length === 0) return own;
  const hidden = new Set(chart.hiddenGroupIds);
  // An XY table's first column is its X: it is never switched off; a hidden series takes all of its columns with it.
  const hiddenColumns = new Set<string>();
  const blocks = usesSeriesBlocks(own.kind);
  if (blocks) for (const s of xySeries(own)) if (hidden.has(s.id)) s.columns.forEach((c) => hiddenColumns.add(c.id));
  const picked: Group[] = blocks ? own.groups.filter((g) => !hiddenColumns.has(g.id)) : own.groups.filter((g) => !hidden.has(g.id));
  const ownCount = picked.length;
  const extraSlots: number[] = [];
  for (const e of chart.extraGroups) {
    const source = tableById(p, e.tableId);
    const g = source?.groups.find((x) => x.id === e.groupId);
    // Only a column table lends its data sets (the same rule as graphSources lists them by): after its type changed they are not drawn, and they come back if it is changed back.
    if (g && source?.kind === 'column' && e.tableId !== chart.dataTableId && !blocks) {
      extraSlots.push(e.slot ?? extraSlots.length);
      // Named with its table, so it cannot be mistaken for a data set of the same name in the graph's own table.
      picked.push({ ...g, name: `${tableById(p, e.tableId)!.name}: ${g.name}`, sourceRowTitles: tableById(p, e.tableId)!.rows.map((r) => r.title) });
    }
  }
  const ownPaletteEnd = Math.max(-1, ...own.groups.map((g) => g.paletteIndex)) + 1;
  const rowCount = Math.max(own.rowCount, ...picked.map((g) => g.observations.length));
  const unordered = picked.map((g, i) => ({
    ...g,
    // A data set of the graph's own table keeps its colour whatever is hidden or reordered; data sets added from other
    // tables take fresh colours after the table's own (each its stored slot, so removing another added data set does
    // not shift it), so they do not share a colour by accident.
    paletteIndex: i < ownCount ? g.paletteIndex : ownPaletteEnd + extraSlots[i - ownCount],
    observations:
      g.observations.length === rowCount
        ? g.observations
        : [...g.observations, ...Array.from({ length: rowCount - g.observations.length }, (_, k) => ({ id: `${g.id}:pad${k}`, value: null }))],
  }));
  // Column charts can put the data sets in another order; colours stay with their data set (paletteIndex above).
  const groups = blocks ? orderSeries(own, unordered, chart.groupOrder) : applyOrder(unordered, chart.groupOrder);
  const rows =
    own.rows.length === rowCount
      ? own.rows
      : [...own.rows, ...Array.from({ length: rowCount - own.rows.length }, (_, k) => ({ id: `${own.id}:pad${k}`, title: '' }))];
  return { ...own, rowCount, rows, groups };
}

/**
 * The columns of a table of series (XY, grouped, contingency, survival) with the series in the order asked for: the
 * leading column (X, time or the row titles' partner) stays first, then the blocks of columns of each series. Each
 * series' first column notes where its series sat in the table, so its colour stays with it.
 */
function orderSeries(own: DataTable, columns: Group[], order: readonly Id[]): Group[] {
  const lead = leadingColumns(own.kind);
  const width = tableSeriesWidth(own);
  const slotOf = new Map(xySeries(own).map((s) => [s.id, s.columns[0].slot ?? s.index]));
  // The place of each series in its factor cluster, worked out over all the series of the table in the asked-for order, hidden ones included.
  const everyone = applyOrder(
    xySeries(own).map((s) => ({ id: s.id, first: s.columns[0] })),
    order,
  );
  const layout = factorLayout(everyone.map((s) => ({ columns: [s.first] })));
  const clusterSlotOf = new Map(layout ? everyone.map((s, i) => [s.id, layout.position[i]] as const) : []);
  const blocks: Array<{ id: Id; columns: Group[] }> = [];
  const rest = columns.slice(lead);
  for (let i = 0; i < rest.length; i += width) {
    const block = rest.slice(i, i + width);
    const first = block[0];
    const clusterSlot = clusterSlotOf.get(first.id);
    blocks.push({ id: first.id, columns: [{ ...first, seriesSlot: slotOf.get(first.id), ...(clusterSlot === undefined ? {} : { clusterSlot }) }, ...block.slice(1)] });
  }
  return [...columns.slice(0, lead), ...applyOrder(blocks, order).flatMap((b) => b.columns)];
}
