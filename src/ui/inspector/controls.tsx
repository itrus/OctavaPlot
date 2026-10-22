import { useEffect, useId, useState, type ReactNode } from 'react';

export function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="insp-section">
      <button className="insp-section-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="chev">{open ? '▾' : '▸'}</span>
        {title}
      </button>
      {open && <div className="insp-section-body">{children}</div>}
    </section>
  );
}

export function Field({
  label,
  children,
  overridden,
  hint,
  error,
  note,
}: {
  label: string;
  children: ReactNode;
  overridden?: boolean;
  hint?: string;
  error?: string | null;
  /** Muted explanation under the control, e.g. why it is disabled. */
  note?: string | null;
}) {
  return (
    <div className="field">
      <div className="field-row">
        <span className="field-label" title={hint}>
          {label}
          {overridden && <span className="override-dot" title="Overridden for this group" />}
        </span>
        <span className="field-control">{children}</span>
      </div>
      {error && <div className="field-error" role="alert">{error}</div>}
      {note && <div className="field-note">{note}</div>}
    </div>
  );
}

export function SubHeading({ children }: { children: ReactNode }) {
  return <div className="sub-heading">{children}</div>;
}

export function Check({
  checked,
  onChange,
  disabled,
  ariaLabel,
  title,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  return <input type="checkbox" checked={checked} disabled={disabled} aria-label={ariaLabel} title={title} onChange={(e) => onChange(e.target.checked)} />;
}

export function ColorInput({
  value,
  onChange,
  disabled,
  ariaLabel,
  title,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  ariaLabel?: string;
  title?: string;
}) {
  return <input type="color" value={value} disabled={disabled} aria-label={ariaLabel} title={title} onChange={(e) => onChange(e.target.value)} />;
}

export function SelectInput<T extends string>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextInput({ value, onChange, placeholder, disabled }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean }) {
  return <input type="text" value={value} placeholder={placeholder} disabled={disabled} onChange={(e) => onChange(e.target.value)} />;
}

interface NumProps {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  unit?: string;
  /** Extra validation; return a message to reject. */
  validate?: (v: number) => string | null;
  label: string;
  hint?: string;
  overridden?: boolean;
  note?: string | null;
}

/** Numeric field: edits stay local until valid; invalid input shows a message and never reaches the chart. */
export function NumField({ value, onCommit, min, max, disabled, unit, validate, label, hint, overridden, note }: NumProps) {
  const [text, setText] = useState(String(value));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(String(value));
      setError(null);
    }
  }, [value, focused]);

  const commit = (raw: string) => {
    const v = Number(raw);
    let err: string | null = null;
    if (raw.trim() === '' || !Number.isFinite(v)) err = 'Enter a number.';
    else if (min !== undefined && v < min) err = `Must be at least ${min}.`;
    else if (max !== undefined && v > max) err = `Must be at most ${max}.`;
    else if (validate) err = validate(v);
    setError(err);
    if (!err && v !== value) onCommit(v);
  };

  return (
    <Field label={label} hint={hint} overridden={overridden} error={error} note={note}>
      <span className="num-wrap">
        <input
          type="text"
          inputMode="decimal"
          className={error ? 'invalid' : ''}
          value={text}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        {unit && <span className="unit">{unit}</span>}
      </span>
    </Field>
  );
}

interface OptNumProps {
  label: string;
  value: number | null;
  onCommit: (v: number | null) => void;
  validate?: (v: number) => string | null;
  hint?: string;
  /** Currently resolved automatic value, used as the starting point when Auto is switched off. */
  autoValue?: number;
}

/** "Auto" checkbox + number. */
export function OptionalNumField({ label, value, onCommit, validate, hint, autoValue }: OptNumProps) {
  const id = useId();
  const [text, setText] = useState(value === null ? '' : String(value));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(value === null ? '' : String(value));
      setError(null);
    }
  }, [value, focused]);

  const commit = (raw: string) => {
    const v = Number(raw);
    let err: string | null = null;
    if (raw.trim() === '' || !Number.isFinite(v)) err = 'Enter a number, or tick Auto.';
    else if (validate) err = validate(v);
    setError(err);
    if (!err) onCommit(v);
  };

  return (
    <Field label={label} hint={hint} error={error}>
      <span className="num-wrap">
        <input
          type="text"
          inputMode="decimal"
          className={error ? 'invalid' : ''}
          value={value === null && !focused ? '' : text}
          placeholder="auto"
          disabled={value === null}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
        />
        <label className="auto-check" htmlFor={id}>
          <input
            id={id}
            type="checkbox"
            checked={value === null}
            onChange={(e) => {
              if (e.target.checked) {
                setError(null);
                onCommit(null);
                return;
              }
              const start = Number(Number(autoValue ?? 0).toPrecision(6));
              const err = validate ? validate(start) : null;
              setError(err);
              if (!err) {
                setText(String(start));
                onCommit(start);
              }
            }}
          />
          Auto
        </label>
      </span>
    </Field>
  );
}

/** Titled group box; with `checked`/`onCheckedChange` the title carries an enable checkbox. */
export function GroupBox({
  title,
  checked,
  onCheckedChange,
  overridden,
  children,
}: {
  title: string;
  checked?: boolean;
  onCheckedChange?: (v: boolean) => void;
  overridden?: boolean;
  children: ReactNode;
}) {
  return (
    <fieldset className="group-box">
      <legend>
        {onCheckedChange && checked !== undefined ? (
          <label className="group-box-title">
            <input type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
            {title}
          </label>
        ) : (
          <span className="group-box-title">{title}</span>
        )}
        {overridden && <span className="override-dot" title="Overridden for this data set" />}
      </legend>
      {children}
    </fieldset>
  );
}

export function TabBar<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string }>; value: T; onChange: (t: T) => void }) {
  return (
    <div className="tab-bar" role="tablist">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} className={`tab${value === t.id ? ' active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
