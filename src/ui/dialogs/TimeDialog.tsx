import { useState } from 'react';
import { DURATION_UNITS, TIME_KINDS, timeColumn, type TimeColumn, type TimeKind, type TimeUnit } from '../../util/timeColumn';
import { Field, SelectInput } from '../inspector/common/controls';
import { Modal } from './NewItemDialogs';

type Choice = TimeKind | 'number';

/**
 * Says what the numbers of the X column of an XY table are: plain numbers, dates, dates and times, or durations (and the unit of a duration).
 * It changes no number, only how they are read, shown and drawn.
 */
export function TimeDialog({ current, onSet, onClose }: { current: TimeColumn | undefined; onSet: (time: TimeColumn | null) => void; onClose: () => void }) {
  const [choice, setChoice] = useState<Choice>(current?.kind ?? 'number');
  const [unit, setUnit] = useState<TimeUnit>(current?.kind === 'duration' ? current.unit : 'h');
  const options: Array<{ value: Choice; label: string }> = [{ value: 'number', label: 'Numbers' }, ...TIME_KINDS];
  const stored =
    choice === 'date' ? 'Whole days since 1970-01-01 (2025-03-04 is stored as 20151).'
    : choice === 'datetime' ? 'Seconds since 1970-01-01T00:00:00 (2025-03-04T10:30:00 is stored as 1741084200).'
    : choice === 'duration' ? `A length of time, stored in ${DURATION_UNITS.find((u) => u.value === unit)?.label ?? unit} (1:30:00 is stored as ${{ s: 5400, min: 90, h: 1.5, d: 0.0625 }[unit]}).`
    : 'The values are plain numbers.';
  return (
    <Modal title="Type of the X column" confirmLabel="Set type" onClose={onClose} onConfirm={() => onSet(choice === 'number' ? null : timeColumn(choice, unit))}>
      <div style={{ display: 'grid', gap: 10 }}>
        <Field label="The X values are" hint="Dates and times are written as ISO 8601 (year-month-day, then T and the time). Nothing else is guessed: 03/04/2025 could be two different days.">
          <SelectInput<Choice> value={choice} options={options} onChange={setChoice} />
        </Field>
        {choice === 'duration' && (
          <Field label="Stored in" hint="The unit of the numbers in the column. A cell written 1:30:00 is converted to it; a bare number is already in it.">
            <SelectInput<TimeUnit> value={unit} options={DURATION_UNITS.map((u) => ({ value: u.value, label: u.label }))} onChange={setUnit} />
          </Field>
        )}
      </div>
      <div style={{ color: 'var(--muted)', fontSize: 11.5, marginTop: 6 }}>
        {stored} Setting the type changes no number: the numbers already in the column are read as the type says (a plain 5 in a date column is 1970-01-06). Times are shown in UTC; a time written with an offset (+02:00) is converted to UTC when it is typed, pasted or imported, and a notice says so; one written without is kept as it is. The axis has ticks on calendar boundaries, is linear, and takes no curve fit. One Undo step restores the previous type.
      </div>
    </Modal>
  );
}
