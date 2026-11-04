import { useState } from 'react';
import { tableTypeInfo } from '../../model/graph/chartTypes';
import { layoutOf } from '../../model/table/tableLayout';
import { kindChangeEffects } from '../../model/table/tableKind';
import type { DataTable, Project, ReplicateLayout, TableKind } from '../../model/types';
import { Modal } from './NewItemDialogs';
import { choiceOfLayout, isValidReplicates, layoutOfChoice, TableLayoutOptions, type LayoutChoice } from './TableLayoutOptions';

const KINDS: readonly TableKind[] = ['column', 'grouped', 'xy', 'contingency', 'survival'];

/**
 * Change the type of a table that exists, or its subtype (how the series of an XY or a grouped table are entered). The data stay; the
 * dialog says which graphs and calculations the change touches.
 */
export function ChangeTableTypeDialog({ table, project, onChange, onClose }: { table: DataTable; project: Project; onChange: (kind: TableKind, layout: ReplicateLayout) => void; onClose: () => void }) {
  const [kind, setKind] = useState<TableKind>(table.kind);
  const [choice, setChoice] = useState<LayoutChoice>(() => choiceOfLayout(table.layout));
  const hasLayout = kind === 'xy' || kind === 'grouped';
  // A choice the new type does not have (bubbles, errors of X) goes back to replicates.
  const shown: LayoutChoice = kind !== 'xy' && (choice.mode === 'sized' || choice.mode === 'xerror') ? { ...choice, mode: 'replicates' } : choice;
  const layout = layoutOfChoice(shown, hasLayout);
  const sameKind = kind === table.kind;
  const sameLayout = JSON.stringify(layout) === JSON.stringify(hasLayout ? layoutOf(table) : { kind: 'single' });
  const invalid = hasLayout && shown.mode === 'replicates' && !isValidReplicates(shown.n);
  const { charts, analyses } = kindChangeEffects(project, table.id, kind);
  const unchanged = sameKind && sameLayout;
  return (
    <Modal title={`Change the type of ${table.name}`} confirmLabel="Change" confirmDisabled={unchanged || invalid} onConfirm={() => onChange(kind, layout)} onClose={onClose}>
      <fieldset className="dlg-group">
        <legend>Table type</legend>
        {KINDS.map((k) => {
          const info = tableTypeInfo(k);
          return (
            <label key={k} className="dlg-radio dlg-radio-block">
              <input type="radio" name="table-type" checked={kind === k} onChange={() => setKind(k)} />
              <span>
                <strong>{info.label}</strong>
                {k === table.kind ? ' (now)' : ''}
                <span className="muted small"> {info.layout}</span>
              </span>
            </label>
          );
        })}
      </fieldset>
      {hasLayout && (
        <fieldset className="dlg-group">
          <legend>Options</legend>
          <TableLayoutOptions xy={kind === 'xy'} choice={shown} onChoice={setChoice} />
        </fieldset>
      )}
      <div className="muted small">
        The rows, columns and values stay as they are, in the same order; what the columns mean changes. Columns that were subcolumns of a series become columns of their own, named after their series, when the new choice has none; a series that the columns do not fill is completed with empty columns.
        {!sameKind && charts.length > 0 && ` ${charts.length === 1 ? 'The graph' : `${charts.length} graphs`} of this table (${charts.map((c) => c.name).join(', ')}) will change to graphs of the ${tableTypeInfo(kind).label}.`}
        {!sameKind && analyses.length > 0 && ` ${analyses.length === 1 ? 'A calculation' : `${analyses.length} calculations`} that do not apply to this type will be removed.`}
        {' '}Undo restores everything.
      </div>
    </Modal>
  );
}
