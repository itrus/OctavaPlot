import { useEffect, useRef, useState } from 'react';
import { Modal } from './NewItemDialogs';

/** Asks for the subject (the independent unit) of the selected cells; an empty name clears it. */
export function SubjectDialog({ cells, current, onSet, onClose }: { cells: number; current: string; onSet: (subject: string) => void; onClose: () => void }) {
  const [text, setText] = useState(current);
  const field = useRef<HTMLInputElement>(null);
  // The modal takes focus when it opens, before this effect runs; the field then takes it from the modal.
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const clearing = text.trim() === '';
  return (
    <Modal title="Subject" confirmLabel={clearing ? 'Clear subject' : 'Set subject'} onClose={onClose} onConfirm={() => onSet(text)}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Subject of the {cells.toLocaleString('en-US')} selected cell{cells === 1 ? '' : 's'}</span>
          <input type="text" ref={field} value={text} onChange={(e) => setText(e.target.value)} aria-label="Subject" placeholder="for example Mouse 3" />
        </label>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 6 }}>
        The subject names the independent unit (a mouse, a plate, a patient code). Cells of one column with the same subject are repeats of that unit; the same subject in several columns is one unit measured again. It changes no value. Do not enter patient identifiers: the table is stored unencrypted in this browser and in saved files. One Undo step restores the previous subjects.
      </div>
    </Modal>
  );
}
