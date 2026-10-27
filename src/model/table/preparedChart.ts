import { resolveFit } from '../options/fitOptions';
import { analysesOf } from '../project/analysis';
import type { Chart, DataTable, FitSettings, Project } from '../types';
import { effectiveTable } from './chartTable';

/** What a graph is drawn from. */
export interface PreparedChart {
  chart: Chart;
  /** The data sets that are on the graph, in order, with excluded values missing (see `effectiveTable`). */
  table: DataTable;
  /** The fitted curve the graph asks for, resolved against the project's results. */
  fit: FitSettings;
}

/**
 * The one way to get the data of a graph: the graph view, the thumbnails, a layout panel and every export draw from this, so a
 * graph shows the same observations, series, colours and fit wherever it is drawn. A renderer must not look a table up in
 * `project.dataTables` itself (`src/architecture.test.ts` checks this). Undefined when the graph's table is gone.
 */
export function prepareChartInput(p: Project, chart: Chart): PreparedChart | undefined {
  const table = effectiveTable(p, chart);
  return table && { chart, table, fit: resolveFit(chart.fit, analysesOf(p), table.id) };
}
