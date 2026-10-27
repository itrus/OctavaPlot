import { useId, type ReactNode } from 'react';

/**
 * A select whose options are in groups (real optgroups), as a row of the inspector with `after` (a preview, say) beside it.
 * controls.tsx keeps its field wiring private and has no groups, so this row makes its own: the label names the select, the hint describes it.
 */
export function GroupedSelectField<T extends string>({
  label,
  hint,
  value,
  groups,
  onChange,
  after,
}: {
  label: string;
  hint?: string;
  value: T;
  groups: ReadonlyArray<{ label: string; options: ReadonlyArray<{ value: T; label: string }> }>;
  onChange: (v: T) => void;
  after?: ReactNode;
}) {
  const id = useId();
  const [labelId, hintId] = [`${id}-label`, `${id}-hint`];
  return (
    <div className="field">
      <div className="field-row">
        <span className="field-label" id={labelId} title={hint}>
          {label}
        </span>
        <span className="field-control" style={{ gap: 6 }}>
          <select value={value} aria-labelledby={labelId} aria-describedby={hint ? hintId : undefined} onChange={(e) => onChange(e.target.value as T)}>
            {groups.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          {after}
        </span>
      </div>
      {hint && <span id={hintId} hidden>{hint}</span>}
    </div>
  );
}
