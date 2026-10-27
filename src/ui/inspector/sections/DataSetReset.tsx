import type { Chart, DataTable, Id } from '../../../model/types';
import type { Command } from '../../../state/commands';
import { clearSummaryOverrides, composeCommands, resetStyle } from '../../../state/commands';

/**
 * Puts one data set back to the graph's settings: its own style, its summary settings, the looks of its parts and the settings of
 * its points and point labels. What the graph holds for all data sets is not touched. One step in the history.
 */
export function DataSetReset({ chart, table, scope, run }: { chart: Chart; table: DataTable; scope: 'all' | Id; run: (label: string, command: Command) => void }) {
  if (scope === 'all') return null;
  return (
    <button
      aria-label="Reset this data set to the graph's settings"
      title="Reset this data set: its own style, summary settings, part looks and point settings go back to the graph's settings for all data sets. Undo restores them."
      onClick={() => run('Reset data set', composeCommands(resetStyle(chart.id, scope, table), clearSummaryOverrides(chart.id, scope)))}
    >
      Reset
    </button>
  );
}
