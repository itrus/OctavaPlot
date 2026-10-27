import type { Id, Selection } from '../../../model/types';
import { toggleGroupSelection } from '../../../model/graph/selection/scope';

/**
 * Choose several data sets to edit together: one box for each. Ticking a box adds the data set to the selection and clearing it
 * takes it out; with none ticked the whole chart is selected (Global). Ctrl or Shift on a data set of the chart does the same.
 */
export function DataSetPicker({ sets, selection, setSelection, noun = 'data sets' }: { sets: ReadonlyArray<{ id: Id; label: string }>; selection: Selection; setSelection: (s: Selection) => void; noun?: string }) {
  const order = sets.map((s) => s.id);
  const chosen = selection.kind === 'groups' ? selection.groupIds : selection.kind === 'group' ? [selection.groupId] : [];
  if (sets.length < 2) return null;
  return (
    <details className="dataset-multi" open={selection.kind === 'groups' || undefined}>
      <summary title={`Choose several ${noun} to change together. Ctrl or Shift on the chart does the same.`}>Edit several {noun} together…</summary>
      <div className="dataset-multi-list" role="group" aria-label={`${noun} edited together`}>
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
