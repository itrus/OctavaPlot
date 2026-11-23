import { moveGroup, type MoveOp, applyOrder } from '../../../model/table/groupOrder';
import type { Chart, Id, DataTable, Group } from '../../../model/types';
import { useCommands } from '../../../state/AppContext';
import { setGroupOrder, clearSummaryOverrides, composeCommands, resetStyle, setLegendOrder, type Command } from '../../../state/commands';
import { SubHeading } from '../common/controls';
import { type Selection, toggleGroupSelection, scopeGroupIds, type StyleScope } from '../../../model/selection';
import { displayName } from '../../../chart/shared/parts/names';

/**
 * The order of the data sets on a column chart (left to right). Colours stay with
 * the data set when it moves.
 */
export function DataSetOrder({ chart, groups, heading = 'Order, left to right' }: { chart: Chart; groups: Array<{ id: Id; label: string }>; heading?: string }) {
  const { run } = useCommands();
  const ids = groups.map((g) => g.id);
  const move = (id: Id, op: MoveOp) => run(op === 'reverse' ? 'Reverse data sets' : 'Move data set', setGroupOrder(chart.id, moveGroup(ids, id, op)));
  return (
    <div>
      <SubHeading>{heading}</SubHeading>
      <div className="order-actions">
        <button className="small-btn" onClick={() => move(ids[0] ?? '', 'reverse')} disabled={ids.length < 2}>
          Reverse
        </button>
        <button className="small-btn" onClick={() => run('Original order', setGroupOrder(chart.id, []))} disabled={chart.groupOrder.length === 0}>
          Original order
        </button>
      </div>
      <ol className="order-list">
        {groups.map((g, i) => (
          <li key={g.id}>
            <span className="ds-name">{g.label}</span>
            <span className="order-buttons">
              <button className="icon-btn" title="To the left end" aria-label={`Move ${g.label} to the start`} onClick={() => move(g.id, 'top')} disabled={i === 0}>
                ⇤
              </button>
              <button className="icon-btn" title="One place left" aria-label={`Move ${g.label} one place left`} onClick={() => move(g.id, 'up')} disabled={i === 0}>
                ←
              </button>
              <button className="icon-btn" title="One place right" aria-label={`Move ${g.label} one place right`} onClick={() => move(g.id, 'down')} disabled={i === groups.length - 1}>
                →
              </button>
              <button className="icon-btn" title="To the right end" aria-label={`Move ${g.label} to the end`} onClick={() => move(g.id, 'bottom')} disabled={i === groups.length - 1}>
                ⇥
              </button>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Choose several data sets to edit together: one box for each. Ticking a box adds the data set to the selection and clearing it
 * takes it out; with none ticked the whole chart is selected (Global). Ctrl or Shift on a data set of the chart does the same.
 */
export function DataSetPicker({ sets, selection, setSelection, noun = 'data sets' }: { sets: ReadonlyArray<{ id: Id; label: string }>; selection: Selection; setSelection: (s: Selection) => void; noun?: string }) {
  const order = sets.map((s) => s.id);
  const chosen = selection.kind === 'groups' ? selection.groupIds : selection.kind === 'group' ? [selection.groupId] : [];
  if (sets.length < 2) return null;
  return (
    <details open={selection.kind === 'groups' || undefined}>
      <summary title={`Choose several ${noun} to change together. Ctrl or Shift on the chart does the same.`}>Edit several {noun} together…</summary>
      <div role="group" aria-label={`${noun} edited together`}>
        {sets.map((s) => (
          <label key={s.id}>
            <input type="checkbox" checked={chosen.includes(s.id)} onChange={() => setSelection(toggleGroupSelection(selection, s.id, order))} />
            {s.label}
          </label>
        ))}
      </div>
    </details>
  );
}

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

/**
 * The order of the entries of the legend, top to bottom (or left to right in a row). It is the legend's own: the
 * marks of the graph keep the order the data sets are drawn in.
 */
export function LegendOrder({ chart, groups }: { chart: Chart; groups: ReadonlyArray<Pick<Group, 'id' | 'name'>> }) {
  const { run } = useCommands();
  const entries = applyOrder(groups, chart.legend.order ?? []);
  const ids = entries.map((g) => g.id);
  const off = !chart.legend.visible;
  const move = (id: string, op: MoveOp) => run(op === 'reverse' ? 'Reverse legend order' : 'Move legend entry', setLegendOrder(chart.id, moveGroup(ids, id, op)));
  return (
    <div>
      <SubHeading>Order of the entries</SubHeading>
      <div className="order-actions">
        <button className="small-btn" onClick={() => move(ids[0] ?? '', 'reverse')} disabled={off || ids.length < 2}>
          Reverse
        </button>
        <button className="small-btn" onClick={() => run('Reset legend order', setLegendOrder(chart.id, []))} disabled={off || (chart.legend.order ?? []).length === 0}>
          Reset order
        </button>
      </div>
      <ol className="order-list">
        {entries.map((g, i) => {
          const label = displayName(chart, g.id, g.name);
          return (
            <li key={g.id}>
              <span className="ds-name">{label}</span>
              <span className="order-buttons">
                <button className="icon-btn" title="To the top" aria-label={`Move ${label} to the top of the legend`} onClick={() => move(g.id, 'top')} disabled={off || i === 0}>
                  ⇤
                </button>
                <button className="icon-btn" title="Up one place" aria-label={`Move ${label} up in the legend`} onClick={() => move(g.id, 'up')} disabled={off || i === 0}>
                  ↑
                </button>
                <button className="icon-btn" title="Down one place" aria-label={`Move ${label} down in the legend`} onClick={() => move(g.id, 'down')} disabled={off || i === entries.length - 1}>
                  ↓
                </button>
                <button className="icon-btn" title="To the bottom" aria-label={`Move ${label} to the bottom of the legend`} onClick={() => move(g.id, 'bottom')} disabled={off || i === entries.length - 1}>
                  ⇥
                </button>
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
