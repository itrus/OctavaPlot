import { useEffect, useState } from 'react';
import type { CentreKind, InvalidPolicy, SmallSamplePolicy, SpreadKind } from '../../../model/types';
import {
  centreName,
  confidencePercentText,
  describeSummaryControls,
  parseConfidencePercent,
  spreadSelectModel,
} from '../../../stats/describe';
import { Check, Field, FieldInput, type Overridden, SelectInput } from '../common/controls';

const CENTRES: CentreKind[] = ['mean', 'geometricMean', 'median'];

/** Reason shown under a disabled control. */
function Reason({ text }: { text: string | null }) {
  return text ? <div className="muted small">{text}</div> : null;
}

/** "Line at": which centre the bars, symbols and lines are drawn at. */
export function LineAtField({
  centre,
  overridden,
  onChange,
}: {
  centre: CentreKind;
  overridden: Overridden;
  onChange: (c: CentreKind) => void;
}) {
  return (
    <Field label="Line at" overridden={overridden} hint="The value that bars, symbols and lines are drawn at">
      <SelectInput<CentreKind> value={centre} options={CENTRES.map((c) => ({ value: c, label: centreName(c) }))} onChange={onChange} />
    </Field>
  );
}

/** "Error bar shows" and "Confidence level", with caption lines about the result. */
export function IntervalFields({
  centre,
  spread,
  confidenceLevel,
  showErrorBars,
  spreadOverridden,
  levelOverridden,
  captionLines,
  onSpread,
  onLevel,
}: {
  centre: CentreKind;
  spread: SpreadKind;
  confidenceLevel: number;
  showErrorBars: boolean;
  spreadOverridden: Overridden;
  levelOverridden: Overridden;
  captionLines: string[];
  onSpread: (s: SpreadKind) => void;
  onLevel: (level: number) => void;
}) {
  const state = describeSummaryControls({ showErrorBars, centre, spread });
  const select = spreadSelectModel(centre, spread);

  const [text, setText] = useState(confidencePercentText(confidenceLevel));
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(confidencePercentText(confidenceLevel));
      setError(null);
      setHint(null);
    }
  }, [confidenceLevel, focused]);

  const commit = (raw: string) => {
    const parsed = parseConfidencePercent(raw);
    if (!parsed.ok) {
      setError(parsed.error);
      setHint(null);
      return;
    }
    setError(null);
    setHint(parsed.hint);
    if (parsed.level !== confidenceLevel) onLevel(parsed.level);
  };

  return (
    <>
      <Field label="Error bar shows" overridden={spreadOverridden}>
        <select value={select.value} disabled={state.spreadReason !== null} aria-label="Error bar shows" onChange={(e) => onSpread(e.target.value as SpreadKind)}>
          {select.options.map((o) => (
            <option key={o.value} value={o.value} disabled={o.disabled}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>
      <Reason text={state.spreadReason} />
      <Field label="Confidence level" overridden={levelOverridden} error={error}>
        <span className="num-wrap">
          <FieldInput
            inputMode="decimal"
            ariaLabel="Confidence level"
            className={error ? 'invalid' : ''}
            value={text}
            disabled={!state.confidenceEnabled}
            onChange={(e) => {
              setText(e.target.value);
              commit(e.target.value);
            }}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          />
          <span className="unit">%</span>
        </span>
      </Field>
      {state.spreadReason === null && <Reason text={state.confidenceReason} />}
      <Reason text={hint} />
      {captionLines.map((line) => (
        <div key={line} className="muted small">
          {line}
        </div>
      ))}
    </>
  );
}

/**
 * Less common calculation settings. "Hide summary when too few values" is a P meaning of the small
 * sample policy: the data set's summary marks are hidden when its sample is too small.
 */
export function CalculationOptions({
  smallSamplePolicy,
  invalidPolicy,
  smallOverridden,
  invalidOverridden,
  onChange,
}: {
  smallSamplePolicy: SmallSamplePolicy;
  invalidPolicy: InvalidPolicy;
  smallOverridden: Overridden;
  invalidOverridden: Overridden;
  onChange: (patch: { smallSamplePolicy?: SmallSamplePolicy; invalidPolicy?: InvalidPolicy }) => void;
}) {
  return (
    <details className="calc-options">
      <summary>Calculation options</summary>
      <Field
        label="Hide summary when too few values"
        overridden={smallOverridden}
        hint="When a data set has too few values for the chosen interval, hide its centre and error bar."
      >
        <Check checked={smallSamplePolicy === 'reject'} onChange={(v) => onChange({ smallSamplePolicy: v ? 'reject' : 'drawCentre' })} />
      </Field>
      <div className="muted small">Applies when there are too few values for the chosen interval.</div>
      <Field label="Invalid values" overridden={invalidOverridden} hint="Invalid values are not numbers, or not positive for a geometric mean.">
        <SelectInput<InvalidPolicy>
          value={invalidPolicy}
          options={[
            { value: 'omit', label: 'Leave them out' },
            { value: 'rejectGroup', label: 'Reject the data set' },
          ]}
          onChange={(v) => onChange({ invalidPolicy: v })}
        />
      </Field>
    </details>
  );
}
