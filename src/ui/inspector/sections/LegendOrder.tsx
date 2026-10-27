import { applyOrder, moveGroup, type MoveOp } from '../../../model/table/groupOrder';
import type { Chart, Group } from '../../../model/types';
import { displayName } from '../../../chart/shared/parts/names';
import { useApp } from '../../../state/AppContext';
import { setLegendOrder } from '../../../state/commands';
import { SubHeading } from '../common/controls';

/**
 * The order of the entries of the legend, top to bottom (or left to right in a row). It is the legend's own: the
 * marks of the graph keep the order the data sets are drawn in.
 */
export function LegendOrder({ chart, groups }: { chart: Chart; groups: Group[] }) {
  const { run } = useApp();
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
