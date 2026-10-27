import { useEffect, useRef, useState } from 'react';
import type { DecimalSeparator } from '../../model/types';
import { formatCell, parseCell } from '../data/cellText';
import { Modal } from './NewItemDialogs';

export type SeriesDirection = 'down' | 'across';

/** The start and the step typed in the dialog as numbers, or why they are not. */
export function parseSeries(startText: string, stepText: string, separator: DecimalSeparator): { ok: true; start: number; step: number } | { ok: false; message: string } {
  const start = parseCell(startText, separator);
  const step = parseCell(stepText, separator);
  if (!start.ok || start.value === null) return { ok: false, message: 'The start must be a number.' };
  if (!step.ok || step.value === null) return { ok: false, message: 'The step must be a number.' };
  return { ok: true, start: start.value, step: step.value };
}

/** Asks for the start and the step of a series to fill the selected cells with, and whether it runs down the rows or across the columns. */
export function FillSeriesDialog({ initial, separator, onFill, onClose }: { initial: { start: number; step: number; direction: SeriesDirection }; separator: DecimalSeparator; onFill: (start: number, step: number, direction: SeriesDirection) => void; onClose: () => void }) {
  const [start, setStart] = useState(formatCell(initial.start, separator));
  const [step, setStep] = useState(formatCell(initial.step, separator));
  const [direction, setDirection] = useState<SeriesDirection>(initial.direction);
  const parsed = parseSeries(start, step, separator);
  const first = useRef<HTMLInputElement>(null);
  // The modal takes focus when it opens, before this effect runs; the field then takes it from the modal.
  useEffect(() => {
    first.current?.focus();
    first.current?.select();
  }, []);
  return (
    <Modal title="Fill series" confirmLabel="Fill" confirmDisabled={!parsed.ok} onClose={onClose} onConfirm={() => parsed.ok && onFill(parsed.start, parsed.step, direction)}>
      <div style={{ display: 'grid', gap: 10 }}>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Start (the first selected cell)</span>
          <input type="text" inputMode="decimal" ref={first} value={start} onChange={(e) => setStart(e.target.value)} aria-label="Start" />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Step (added for each cell)</span>
          <input type="text" inputMode="decimal" value={step} onChange={(e) => setStep(e.target.value)} aria-label="Step" />
        </label>
        <label style={{ display: 'grid', gap: 4 }}>
          <span>Direction</span>
          <select value={direction} onChange={(e) => setDirection(e.target.value as SeriesDirection)} aria-label="Direction">
            <option value="down">Down the rows of each selected column</option>
            <option value="across">Across the columns of each selected row</option>
          </select>
        </label>
      </div>
      <div style={{ color: parsed.ok ? 'var(--muted)' : 'var(--danger)', fontSize: 11.5, marginTop: 6 }} role={parsed.ok ? undefined : 'alert'}>
        {parsed.ok ? 'The selected cells are replaced; one Undo step restores them.' : parsed.message}
      </div>
    </Modal>
  );
}
