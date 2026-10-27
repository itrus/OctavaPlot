import { DialogShell, trapTab } from './DialogShell';

/** Every stored value that was reset to its default when a project file was opened, each with its path in the file. */
export function RepairNotesDialog({ fileName, notes, onClose }: { fileName: string; notes: string[]; onClose: () => void }) {
  return (
    <DialogShell>
      <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => (e.key === 'Escape' ? onClose() : trapTab(e))}>
        <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Values reset on opening" tabIndex={-1} ref={(el) => el?.focus()}>
          <div className="modal-head">
            <strong>{notes.length} value{notes.length === 1 ? '' : 's'} reset on opening {fileName}</strong>
            <button className="icon-btn" onClick={onClose} aria-label="Close">×</button>
          </div>
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
        </div>
      </div>
    </DialogShell>
  );
}
