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
    <DialogWindow title="Recovery copies" onClose={onClose} className="">
          <div className="modal-body">
            {copies.length === 0 ? (
              <p>This browser keeps no copy of a project.</p>
            ) : (
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 12 }}>
                {copies.map((c) => (
                  <li key={c.id} style={{ display: 'grid', gap: 4 }}>
                    <strong>{c.label}</strong>
                    <span>{c.detail}</span>
                    <span>
                      {size(c.bytes)}
                      {c.savedAt !== null ? `, written at ${clockTime(c.savedAt)}` : ''}
                      {c.readable ? '' : ', not readable by this version'}
                    </span>
                    <span>
                      <button onClick={() => downloadBlob(new Blob([c.text], { type: 'application/json' }), c.filename)}>Download</button>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p><button onClick={() => setCopies(listBrowserCopies())}>Refresh</button></p>
          </div>
    </DialogWindow>
  );
}
