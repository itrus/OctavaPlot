import { useHistory } from '../../state/AppContext';
import { RedoIcon, UndoIcon } from './icons';

/** The one Undo/Redo pair of the project (one history for tables, graphs, results and layouts), as icon buttons on the toolbar of each view. */
export function UndoRedo() {
  const { undo, redo, canUndo, canRedo } = useHistory();
  return (
    <span className="undo-redo">
      <button className="icon-only" onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)" aria-label="Undo">
        <UndoIcon />
      </button>
      <button className="icon-only" onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Y)" aria-label="Redo">
        <RedoIcon />
      </button>
    </span>
  );
}
