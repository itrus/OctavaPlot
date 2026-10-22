import type { Chart, DataTable, Group, Id, Project } from './types';

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
  const out: GraphSource[] = (own?.groups ?? []).map((g) => ({ tableId: chart.dataTableId, tableName: own!.name, group: g, onGraph: !hidden.has(g.id), own: true }));
  for (const t of p.dataTables) {
    if (t.id === chart.dataTableId) continue;
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
  const own = tableById(p, chart.dataTableId);
  if (!own) return undefined;
  if (chart.hiddenGroupIds.length === 0 && chart.extraGroups.length === 0) return own;
  const hidden = new Set(chart.hiddenGroupIds);
  const picked: Group[] = own.groups.filter((g) => !hidden.has(g.id));
  for (const e of chart.extraGroups) {
    const g = tableById(p, e.tableId)?.groups.find((x) => x.id === e.groupId);
    if (g && e.tableId !== chart.dataTableId) {
      // Named with its table, so it cannot be mistaken for a data set of the same name in the graph's own table.
      picked.push({ ...g, name: `${tableById(p, e.tableId)!.name}: ${g.name}` });
    }
  }
  const rowCount = Math.max(own.rowCount, ...picked.map((g) => g.observations.length));
  const groups = picked.map((g, i) => ({
    ...g,
    // Colours follow position on this graph, so data sets from different tables do not share a colour by accident.
    paletteIndex: i,
    observations:
      g.observations.length === rowCount
        ? g.observations
        : [...g.observations, ...Array.from({ length: rowCount - g.observations.length }, (_, k) => ({ id: `${g.id}:pad${k}`, value: null }))],
  }));
  const rows =
    own.rows.length === rowCount
      ? own.rows
      : [...own.rows, ...Array.from({ length: rowCount - own.rows.length }, (_, k) => ({ id: `${own.id}:pad${k}`, title: '' }))];
  return { ...own, rowCount, rows, groups };
}
