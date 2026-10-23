import { GROUP_GAP_LIMITS, moveGroup, type MoveOp } from '../../model/groupOrder';
import type { Chart, Id } from '../../model/types';
import { useApp } from '../../state/AppContext';
import { setGroupGap, setGroupOrder } from '../../state/commands';
import { NumField, SubHeading } from './controls';

/**
 * The order of the data sets on a column chart (left to right) and the space before each of them. Colours stay with
 * the data set when it moves.
 */
export function DataSetOrder({ chart, groups, gaps = true, heading = 'Order, left to right' }: { chart: Chart; groups: Array<{ id: Id; label: string }>; gaps?: boolean; heading?: string }) {
  const { run } = useApp();
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
      {gaps && groups.length > 1 && (
        <>
          <SubHeading>Space before a data set (% of normal)</SubHeading>
          {groups.slice(1).map((g) => (
            <NumField
              key={g.id}
              label={g.label}
              unit="%"
              value={chart.groupGaps[g.id] ?? GROUP_GAP_LIMITS.normal}
              min={GROUP_GAP_LIMITS.min}
              max={GROUP_GAP_LIMITS.max}
              slider={false}
              onCommit={(v) => run('Space before data set', setGroupGap(chart.id, g.id, v), `gap:${g.id}`)}
            />
          ))}
        </>
      )}
    </div>
  );
}
