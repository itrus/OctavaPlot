import { useEffect, useRef, useState } from 'react';
import { Modal } from './NewItemDialogs';

/** Asks for the factor (the second grouping level) of the selected series; an empty name clears it. */
export function FactorDialog({ series, current, onSet, onClose }: { series: number; current: string; onSet: (factor: string) => void; onClose: () => void }) {
  const [text, setText] = useState(current);
  const field = useRef<HTMLInputElement>(null);
  // The modal takes focus when it opens, before this effect runs; the field then takes it from the modal.
  useEffect(() => {
    field.current?.focus();
    field.current?.select();
  }, []);
  const clearing = text.trim() === '';
  return (
    <Modal title="Factor" confirmLabel={clearing ? 'Clear factor' : 'Set factor'} onClose={onClose} onConfirm={() => onSet(text)}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Factor of the {series.toLocaleString('en-US')} selected series</span>
          <input type="text" ref={field} value={text} onChange={(e) => setText(e.target.value)} aria-label="Factor" placeholder="for example Wild type" />
        </label>
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 6 }}>
        The factor is a second grouping level inside each category. Series that name the same factor are drawn together as a cluster of bars, with a wider gap between clusters and the factor written under them; each series keeps the colour of its place in the cluster. It changes no value. One Undo step restores the previous factors.
      </div>
    </Modal>
  );
}
