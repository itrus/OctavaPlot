import { useState } from 'react';
import { clockTime } from '../../state/recovery/recovery';
import { listBrowserCopies, type BrowserCopy } from '../../state/recovery/copies';
import { downloadBlob } from '../../util/download';
import { DialogWindow } from './DialogShell';

const size = (bytes: number): string => (bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`);

/** The project copies this browser keeps, each with its own download: for work that did not come back at start-up. */
export function RecoveryDialog({ onClose }: { onClose: () => void }) {
  const [copies, setCopies] = useState<BrowserCopy[]>(listBrowserCopies);

  return (
    <DialogWindow title="Recovery copies" onClose={onClose} className="recovery-modal">
      <div className="modal-body modal-pad">
        {copies.length === 0 ? (
          <p className="muted">This browser keeps no copy of a project.</p>
        ) : (
          <ul className="recovery-list">
            {copies.map((c) => (
              <li key={c.id} className="recovery-card">
                <div className="recovery-text">
                  <strong>{c.label}</strong>
                  <span className="muted small">{c.detail}</span>
                  <span className="small">
                    {size(c.bytes)}
                    {c.savedAt !== null ? ` · written at ${clockTime(c.savedAt)}` : ''}
                    {c.readable ? '' : ' · not readable by this version'}
                  </span>
                </div>
                <button onClick={() => downloadBlob(new Blob([c.text], { type: 'application/json' }), c.filename)} aria-label={`Download ${c.label}`}>Download</button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="modal-foot">
        <button className="recovery-refresh" onClick={() => setCopies(listBrowserCopies())}>Refresh</button>
        <button className="primary" onClick={onClose}>Close</button>
      </div>
    </DialogWindow>
  );
}
