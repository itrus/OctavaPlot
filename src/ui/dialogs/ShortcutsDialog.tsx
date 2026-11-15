import { ModalBackdrop } from './DialogShell';
import { CloseIcon } from '../components/icons';
import { SHORTCUT_GROUPS } from '../components/appShortcuts';

/** Help → Keyboard shortcuts: every key of the app, in groups. (Cmd works for Ctrl on a Mac.) */
export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  return (
    <ModalBackdrop onClose={onClose}>
      <div className="modal modal-wide" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" tabIndex={-1} ref={(el) => el?.focus()}>
        <div className="modal-head">
          <strong>Keyboard shortcuts</strong>
          <button className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>
        </div>
        <div className="modal-body modal-pad">
          {SHORTCUT_GROUPS.map((g) => (
            <section key={g.title}>
              <h3>{g.title}</h3>
              <table className="shortcut-table">
                <tbody>
                  {g.rows.map(([keys, what]) => (
                    <tr key={keys + what}>
                      <th scope="row"><kbd>{keys}</kbd></th>
                      <td>{what}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          ))}
          <p className="muted small">On a Mac, Cmd works for Ctrl. Ctrl+N, Ctrl+T and Ctrl+W stay with the browser (New project is Ctrl+Alt+N). In a text field the field keeps its own keys (Ctrl+B, F2).</p>
        </div>
      </div>
    </ModalBackdrop>
  );
}
