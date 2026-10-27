import { useEffect, useRef, useState } from 'react';
import { Modal } from './NewItemDialogs';

/** The count typed in the dialog as a whole number from 1 to `room`, or why it is not one. */
export function parseRowCount(text: string, room: number): { ok: true; count: number } | { ok: false; message: string } {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return { ok: false, message: 'Enter a whole number of rows.' };
  const count = Number(t);
  if (count < 1) return { ok: false, message: 'Enter at least 1 row.' };
  if (count > room) return { ok: false, message: room === 0 ? 'The table is full.' : `At most ${room.toLocaleString('en-US')} more rows fit in this table.` };
  return { ok: true, count };
}

/** Asks how many empty rows to add at the end of the table. `room` is how many the table can still take. */
export function AppendRowsDialog({ room, limit, onAppend, onClose }: { room: number; limit: number; onAppend: (count: number) => void; onClose: () => void }) {
  const [text, setText] = useState('100');
  const parsed = parseRowCount(text, room);
  const input = useRef<HTMLInputElement>(null);
  // The modal takes focus when it opens, before this effect runs; the field then takes it from the modal.
  useEffect(() => {
    input.current?.focus();
    input.current?.select();
  }, []);
  return (
    <Modal title="Append rows" confirmLabel="Append" confirmDisabled={!parsed.ok} onClose={onClose} onConfirm={() => parsed.ok && onAppend(parsed.count)}>
      <label style={{ display: 'grid', gap: 6 }}>
        <span>Number of empty rows to add at the end</span>
        <input type="text" inputMode="numeric" ref={input} value={text} onChange={(e) => setText(e.target.value)} aria-invalid={!parsed.ok} aria-label="Number of rows" />
      </label>
      <div style={{ color: parsed.ok ? 'var(--muted)' : 'var(--danger)', fontSize: 11.5, marginTop: 6 }} role={parsed.ok ? undefined : 'alert'}>
        {parsed.ok ? `A table holds at most ${limit.toLocaleString('en-US')} rows; ${room.toLocaleString('en-US')} more fit.` : parsed.message}
      </div>
    </Modal>
  );
}
