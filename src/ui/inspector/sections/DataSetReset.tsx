import { scopeGroupIds, type StyleScope } from '../../../model/graph/selection/scope';
import type { Chart, DataTable } from '../../../model/types';
import type { Command } from '../../../state/commands';
import { clearSummaryOverrides, composeCommands, resetStyle } from '../../../state/commands';

/**
 * Puts the selected data set (or data sets) back to the graph's settings: its own style, its summary settings, the looks of its
 * parts and the settings of its points and point labels. What the graph holds for all data sets is not touched. One step in the history.
 */
export function DataSetReset({ chart, table, scope, run }: { chart: Chart; table: DataTable; scope: StyleScope; run: (label: string, command: Command) => void }) {
  if (scope === 'all') return null;
  const many = scopeGroupIds(scope, table.groups.map((g) => g.id)).length > 1;
  return (
    <button
      aria-label={many ? "Reset these data sets to the graph's settings" : "Reset this data set to the graph's settings"}
      title={`Reset ${many ? 'these data sets' : 'this data set'}: own style, summary settings, part looks and point settings go back to the graph's settings for all data sets. Undo restores them.`}
      onClick={() => run(many ? 'Reset data sets' : 'Reset data set', composeCommands(resetStyle(chart.id, scope, table), clearSummaryOverrides(chart.id, scope)))}
    >
      Reset
    </button>
  );
}
