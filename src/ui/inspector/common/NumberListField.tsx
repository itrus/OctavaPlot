import { useEffect, useState } from 'react';
import { Field, FieldInput } from './controls';

/**
 * A list of numbers typed with commas and set when the box is left (or on Enter); a text that is not numbers, or is longer than `max`, is refused with
 * a message and the list stays as it was. `normalise` puts a valid list in the form it is kept in (sorted, without repeats, and so on).
 */
export function NumberListField({ label, hint, value, onCommit, max, normalise = (v) => v, placeholder = 'None' }: { label: string; hint?: string; value: readonly number[]; onCommit: (v: number[]) => void; max: number; normalise?: (v: number[]) => number[]; placeholder?: string }) {
  const shown = value.join(', ');
  const [text, setText] = useState(shown);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) {
      setText(shown);
      setError(null);
    }
  }, [shown, focused]);
  const commit = () => {
    const numbers = text.split(/[;,\s]+/).filter((x) => x !== '').map(Number);
    if (numbers.some((n) => !Number.isFinite(n))) return setError('Enter numbers separated by commas.');
    if (numbers.length > max) return setError(`At most ${max}.`);
    setError(null);
    onCommit(normalise(numbers));
  };
  return (
    <Field label={label} hint={hint} error={error}>
      <FieldInput
        ariaLabel={label}
        className={error ? 'invalid' : ''}
        placeholder={placeholder}
        value={text}
        onFocus={() => setFocused(true)}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onKeyDown={(e) => e.key === 'Enter' && commit()}
      />
    </Field>
  );
}
