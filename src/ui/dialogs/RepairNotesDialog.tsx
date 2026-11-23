import { DialogWindow } from './DialogShell';

/** Every stored value that was reset to its default when a project file was opened, each with its path in the file. */
export function RepairNotesDialog({ fileName, notes, onClose }: { fileName: string; notes: string[]; onClose: () => void }) {
  return (
    <DialogWindow title="Values reset on opening" heading={`${notes.length} value${notes.length === 1 ? '' : 's'} reset on opening ${fileName}`} onClose={onClose}>
          <div className="modal-body modal-pad">
            <p className="muted">Only the look of the project was reset to defaults. No data value or calculation setting was changed.</p>
            <ul className="warnings">
              {notes.map((n, i) => (
                <li key={i}>{n}</li>
              ))}
            </ul>
          </div>
          <div className="modal-foot">
            <button onClick={onClose}>Close</button>
          </div>
    </DialogWindow>
  );
}
