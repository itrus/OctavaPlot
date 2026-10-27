import { createContext, useContext, useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { formatNum, sliderStep, snapToStep } from '../../data/numberFormat';
import { WheelRange } from '../../components/WheelRange';
import { useRoving } from './roving';

export function Section({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [openState, setOpen] = useState(defaultOpen);
  const open = openState;
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

/** What a control inside a Field needs to be tied to it: the label, and the error and note that describe it. */
interface FieldLink {
  labelId: string;
  describedBy: string | undefined;
  invalid: boolean;
  /** The data sets being edited together do not agree on this setting: the control shows "Mixed" instead of a value. */
  mixed: boolean;
}
const FieldContext = createContext<FieldLink | null>(null);

/** The attributes that make a control part of its Field for assistive technology (an explicit aria-label wins). */
function useFieldAria(ariaLabel?: string): { 'aria-label'?: string; 'aria-labelledby'?: string; 'aria-describedby'?: string; 'aria-invalid'?: true } {
  const link = useContext(FieldContext);
  return {
    ...(ariaLabel ? { 'aria-label': ariaLabel } : link ? { 'aria-labelledby': link.labelId } : {}),
    ...(link?.describedBy ? { 'aria-describedby': link.describedBy } : {}),
    ...(link?.invalid ? { 'aria-invalid': true as const } : {}),
  };
}

/**
 * Whether a setting has a value of its own for the data set being edited. A function is the way back: the dot is then a button
 * that clears the data set's own value, so the graph's shows again. With several data sets edited together the object form says
 * whether the way back exists (`reset`: some of them have a value of their own) and whether they `mixed` (differ), which the
 * control then shows as "Mixed".
 */
export type Overridden = boolean | (() => void) | { reset?: () => void; mixed?: boolean };

/** Whether the data sets being edited together differ in this setting. */
const isMixed = (o: Overridden | undefined): boolean => typeof o === 'object' && o !== null && !!o.mixed;

const resetOf = (o: Overridden | undefined): (() => void) | undefined => (typeof o === 'function' ? o : typeof o === 'object' && o !== null ? o.reset : undefined);

/** The dot that marks an overridden setting; a button that resets it when there is a way. */
function OverrideMark({ overridden, what, where }: { overridden: Overridden | undefined; what: string; where: string }) {
  if (!overridden) return null;
  const reset = resetOf(overridden);
  const mixed = isMixed(overridden);
  const dot =
    typeof overridden === 'object' || typeof overridden === 'function' ? (
      reset ? (
        <button type="button" className="override-dot override-reset" onClick={reset} aria-label={`Reset ${what} to the graph's value`} title={`Overridden for ${mixed ? 'some of these data sets' : `this ${where}`}. Click to use the graph's value again.`} />
      ) : null
    ) : (
      <span className="override-dot" title={`Overridden for this ${where}`} />
    );
  return (
    <>
      {dot}
      {mixed && <span className="mixed-tag" title="The selected data sets differ in this setting. A value set here applies to all of them.">mixed</span>}
    </>
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
  overridden?: Overridden;
  hint?: string;
  error?: string | null;
  /** Muted explanation under the control, e.g. why it is disabled. */
  note?: string | null;
}) {
  const id = useId();
  const [labelId, errorId, noteId, hintId] = [`${id}-label`, `${id}-error`, `${id}-note`, `${id}-hint`];
  const describedBy = [error ? errorId : null, note ? noteId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined;
  return (
    <FieldContext.Provider value={{ labelId, describedBy, invalid: !!error, mixed: isMixed(overridden) }}>
      <div className="field">
        <div className="field-row">
          <span className="field-label" id={labelId} title={hint}>
            {label}
            <OverrideMark overridden={overridden} what={label} where="group" />
          </span>
          <span className="field-control">{children}</span>
        </div>
        {hint && <span id={hintId} hidden>{hint}</span>}
        {error && <div className="field-error" id={errorId} role="alert">{error}</div>}
        {note && <div className="field-note" id={noteId}>{note}</div>}
      </div>
    </FieldContext.Provider>
  );
}

/** A text box inside a Field: named by the field (or `ariaLabel`), with the field's error and note as its description. */
export function FieldInput({ ariaLabel, ...rest }: InputHTMLAttributes<HTMLInputElement> & { ariaLabel?: string }) {
  const aria = useFieldAria(ariaLabel);
  return <input type="text" {...rest} {...aria} />;
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
  const aria = useFieldAria(ariaLabel);
  const mixed = useContext(FieldContext)?.mixed ?? false;
  const ref = useRef<HTMLInputElement>(null);
  // A box that the data sets do not agree on is neither ticked nor clear.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = mixed;
  }, [mixed, checked]);
  return <input ref={ref} type="checkbox" checked={checked} disabled={disabled} {...aria} title={mixed ? 'Mixed: the selected data sets differ' : title} onChange={(e) => onChange(e.target.checked)} />;
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
  const aria = useFieldAria(ariaLabel);
  const mixed = useContext(FieldContext)?.mixed ?? false;
  return <input type="color" className={mixed ? 'mixed' : undefined} value={value} disabled={disabled} {...aria} title={mixed ? 'Mixed: the selected data sets differ. Choosing a colour sets it for all of them.' : title} onChange={(e) => onChange(e.target.value)} />;
}

export function SelectInput<T extends string>({
  value,
  options,
  onChange,
  disabled,
  ariaLabel,
}: {
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (v: T) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const aria = useFieldAria(ariaLabel);
  const mixed = useContext(FieldContext)?.mixed ?? false;
  return (
    <select value={mixed ? '' : value} disabled={disabled} {...aria} onChange={(e) => onChange(e.target.value as T)}>
      {mixed && (
        <option value="" disabled>
          Mixed
        </option>
      )}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function TextInput({ value, onChange, placeholder, disabled, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; disabled?: boolean; ariaLabel?: string }) {
  const aria = useFieldAria(ariaLabel);
  return <input type="text" value={value} placeholder={placeholder} disabled={disabled} {...aria} onChange={(e) => onChange(e.target.value)} />;
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
  overridden?: Overridden;
  note?: string | null;
  /** Slider step; derived from the range when omitted. Bounded fields (min and max set) get a slider. */
  step?: number;
  /** Pass false to keep a bounded field as a plain number box. */
  slider?: boolean;
}

/** Numeric field: edits stay local until valid; invalid input shows a message and never reaches the chart. */
export function NumField({ value, onCommit, min, max, disabled, unit, validate, label, hint, overridden, note, step, slider = true }: NumProps) {
  const [text, setText] = useState(formatNum(value));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(formatNum(value));
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
    // Data sets that differ take the typed value even when it is the one shown (that of the first of them).
    if (!err && (v !== value || isMixed(overridden))) onCommit(v);
  };

  // The value is not shown while the data sets differ and the box is not being typed in.
  const mixedShown = isMixed(overridden) && !focused;

  // Fields with a very wide range (chart sizes in px) pass slider={false}: they are typed, or stepped with the arrow keys.
  const stepSize = step ?? (min !== undefined && max !== undefined ? sliderStep(min, max) : 1);
  const showSlider = slider && min !== undefined && max !== undefined && max > min;
  const sliderValue = showSlider ? Math.min(max, Math.max(min, Number.isFinite(Number(text)) && text.trim() !== '' ? Number(text) : value)) : 0;

  return (
    <Field label={label} hint={hint} overridden={overridden} error={error} note={note}>
      <span className="num-wrap slider-num">
        {showSlider && !mixedShown && (
          <WheelRange
            min={min}
            max={max}
            step={stepSize}
            value={sliderValue}
            disabled={disabled}
            ariaLabel={`${label} slider`}
            onValue={(v) => {
              // The slider moves in whole steps; text typed in the box keeps whatever precision it has.
              const clean = formatNum(snapToStep(v, stepSize));
              setText(clean);
              commit(clean);
            }}
          />
        )}
        <FieldInput
          inputMode="decimal"
          ariaLabel={label}
          className={error ? 'invalid' : ''}
          value={mixedShown ? '' : text}
          placeholder={mixedShown ? 'Mixed' : undefined}
          disabled={disabled}
          onChange={(e) => {
            setText(e.target.value);
            commit(e.target.value);
          }}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
            else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !disabled) {
              // Arrow keys step the value (Shift: ten steps), clamped to the allowed range.
              e.preventDefault();
              const current = Number.isFinite(Number(text)) && text.trim() !== '' ? Number(text) : value;
              const delta = (e.key === 'ArrowUp' ? 1 : -1) * stepSize * (e.shiftKey ? 10 : 1);
              const next = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, current + delta));
              const clean = formatNum(snapToStep(next, stepSize));
              setText(clean);
              commit(clean);
            }
          }}
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
  const [text, setText] = useState(value === null ? '' : formatNum(value));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(value === null ? '' : formatNum(value));
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
        <FieldInput
          inputMode="decimal"
          ariaLabel={label}
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
            aria-label={`Automatic ${label}`}
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
                setText(formatNum(start));
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
  overridden?: Overridden;
  children: ReactNode;
}) {
  const box = useRef<HTMLInputElement>(null);
  const mixed = isMixed(overridden);
  // A box that the data sets being edited together do not agree on is neither ticked nor clear.
  useEffect(() => {
    if (box.current) box.current.indeterminate = mixed;
  }, [mixed, checked]);
  return (
    <fieldset className="group-box">
      <legend>
        {onCheckedChange && checked !== undefined ? (
          <label className="group-box-title">
            <input ref={box} type="checkbox" checked={checked} onChange={(e) => onCheckedChange(e.target.checked)} />
            {title}
          </label>
        ) : (
          <span className="group-box-title">{title}</span>
        )}
        <OverrideMark overridden={overridden} what={title} where="data set" />
      </legend>
      {children}
    </fieldset>
  );
}

export function TabBar<T extends string>({ tabs, value, onChange }: { tabs: Array<{ id: T; label: string }>; value: T; onChange: (t: T) => void }) {
  const roving = useRoving(tabs.map(() => true), tabs.findIndex((t) => t.id === value), (i) => onChange(tabs[i].id));
  return (
    <div className="tab-bar" role="tablist" aria-label="Formatting tabs" {...roving.groupProps}>
      {tabs.map((t, i) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} {...roving.itemProps(i)} className={`tab${value === t.id ? ' active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}

/** Second-level navigation inside a tab, as a row of small buttons. */
export function SectionBar<T extends string>({ sections, value, onChange }: { sections: Array<{ id: T; label: string }>; value: T; onChange: (t: T) => void }) {
  const roving = useRoving(sections.map(() => true), sections.findIndex((t) => t.id === value), (i) => onChange(sections[i].id));
  return (
    <div className="section-bar" role="tablist" aria-label="Appearance sections" {...roving.groupProps}>
      {sections.map((t, i) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} {...roving.itemProps(i)} className={`section-chip${value === t.id ? ' active' : ''}`} onClick={() => onChange(t.id)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
