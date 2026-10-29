import { useEffect, useId, useState } from 'react';
import { formatTimeCell, parseTimeCell, type TimeColumn } from '../../../util/timeColumn';
import { Field, FieldInput } from './controls';

/**
 * A value on a date, time or duration axis, typed as the column writes it (2025-03-04, 2025-03-04T10:30:00, 1:30:00). The stored value is
 * a number in the unit of the column; this only reads and writes it. With `optional` there is an Auto box, as on a numeric limit.
 * A time typed with an offset (+02:00) is converted to UTC, as in the table.
 */
export function TimeField({
  label,
  value,
  time,
  onCommit,
  validate,
  hint,
  autoValue,
  optional = false,
}: {
  label: string;
  value: number | null;
  time: TimeColumn;
  onCommit: (v: number | null) => void;
  validate?: (v: number) => string | null;
  hint?: string;
  /** The resolved automatic value: where a limit starts when Auto is switched off. */
  autoValue?: number;
  optional?: boolean;
}) {
  const id = useId();
  const write = (v: number | null) => (v === null ? '' : formatTimeCell(v, time));
  const [text, setText] = useState(write(value));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(write(value));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused, time.kind, time.unit]);

  const commit = (raw: string) => {
    const read = parseTimeCell(raw, time);
    let err: string | null = null;
    let v = 0;
    if (!read.ok) err = read.message;
    else if (read.value === null) err = optional ? 'Enter a value, or tick Auto.' : 'Enter a value.';
    else {
      v = read.value;
      err = validate ? validate(v) : null;
    }
    setError(err);
    if (!err) onCommit(v);
  };

  return (
    <Field label={label} hint={hint} error={error}>
      <span className="num-wrap">
        <FieldInput
          ariaLabel={label}
          className={error ? 'invalid' : ''}
          value={optional && value === null && !focused ? '' : text}
          placeholder={optional ? 'auto' : undefined}
          disabled={optional && value === null}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {optional && (
          <label className="auto-check" htmlFor={id}>
            <input
              id={id}
              type="checkbox"
              aria-label={`Automatic ${label}`}
              checked={value === null}
              onChange={(e) => {
                if (e.target.checked) {
                  setError(null);
                  onCommit(null);
                  return;
                }
                const start = autoValue ?? 0;
                const err = validate ? validate(start) : null;
                setError(err);
                if (!err) {
                  setText(write(start));
                  onCommit(start);
                }
              }}
            />
            Auto
          </label>
        )}
      </span>
    </Field>
  );
}

/** The checks of the limits of an axis, worded in the dates of the column: the lower limit is before the upper one. */
export function timeLimitChecks(time: TimeColumn, min: number | null, max: number | null, domain: readonly [number, number]): { min: (v: number) => string | null; max: (v: number) => string | null } {
  return {
    min: (v) => {
      const upper = max ?? domain[1];
      return v < upper ? null : `Must be before the ${max === null ? 'automatic ' : ''}maximum (${formatTimeCell(upper, time)}).`;
    },
    max: (v) => {
      const lower = min ?? domain[0];
      return v > lower ? null : `Must be after the ${min === null ? 'automatic ' : ''}minimum (${formatTimeCell(lower, time)}).`;
    },
  };
}
