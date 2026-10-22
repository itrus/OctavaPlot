import { useApp } from '../state/AppContext';

const ICON = { width: 16, height: 16, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

/** Counterclockwise curved arrow. */
const UndoIcon = () => (
  <svg {...ICON}>
    <path d="M3 3v4h4" />
    <path d="M3.4 7A5.2 5.2 0 1 1 4.6 11.6" />
  </svg>
);

/** Clockwise curved arrow (the mirror image of Undo). */
const RedoIcon = () => (
  <svg {...ICON}>
    <path d="M13 3v4H9" />
    <path d="M12.6 7A5.2 5.2 0 1 0 11.4 11.6" />
  </svg>
);

/** The one Undo/Redo pair of the active page, icon-only. */
export function UndoRedo() {
  const { undo, redo, canUndo, canRedo } = useApp();
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
