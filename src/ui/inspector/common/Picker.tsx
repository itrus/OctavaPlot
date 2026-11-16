import { useState, type CSSProperties, type ReactNode } from 'react';
import { CloseIcon } from '../../components/icons';
import { ModalBackdrop } from '../../dialogs/DialogShell';
import { Field } from './controls';

/** A row of small squares, one for each of the first `max` colours. */
function Strip({ colors, max }: { colors: readonly string[]; max: number }) {
  return (
    <span className="palette-strip" aria-hidden="true">
      {colors.slice(0, max).map((c, i) => (
        <i key={i} style={{ background: c }} />
      ))}
    </span>
  );
}

/** A bar that runs through the colours from left to right. */
export function GradientBar({ colors }: { colors: readonly string[] }) {
  const style: CSSProperties = { background: `linear-gradient(to right, ${colors.join(', ')})` };
  return <span className="gradient-bar" aria-hidden="true" style={style} />;
}

/** All the colours of a palette or gradient as squares; hover one for its number and hex. */
export function AllColours({ colors }: { colors: readonly string[] }) {
  return (
    <div className="palette-all" aria-hidden="true">
      {colors.map((c, i) => (
        <i key={i} style={{ background: c }} title={`${i + 1}: ${c}`} />
      ))}
    </div>
  );
}

/** A source line with its link. */
export function SourceLine({ text, url }: { text: string; url: string }) {
  return (
    <div className="muted small palette-source">
      Source: {text} <a href={url} target="_blank" rel="noreferrer">{url}</a>
    </div>
  );
}

/** One button of a picker window: a name and its colours (as squares, or as a bar for a gradient). */
export interface PickItem<Id extends string> {
  id: Id;
  label: string;
  colors: readonly string[];
}

/** The id of the info area, which the button under the pointer names as its description. */
const INFO_ID = 'picker-info';
/** Colours drawn as squares on a button in the window, and on the button in the inspector. */
const WINDOW_SQUARES = 14;
const FIELD_SQUARES = 10;

/**
 * A field of the inspector for choosing among palettes or gradients: a button showing the one in use, which opens a window with every choice as a
 * button, in sections. Clicking a choice applies it and closes the window. The lines at the bottom of the window (`info`) describe the choice under the
 * pointer or the keyboard, or the one in use, so nothing opens over the buttons.
 */
export function PickerField<Id extends string>({
  fieldLabel,
  hint,
  title,
  windowHint,
  bar,
  groups,
  current,
  fallbackLabel,
  info,
  onPick,
}: {
  fieldLabel: string;
  hint?: string;
  title: string;
  /** A line under the title of the window, if any. */
  windowHint?: string;
  /** Draw each choice as a gradient bar instead of squares. */
  bar?: boolean;
  groups: ReadonlyArray<{ label: string; items: ReadonlyArray<PickItem<Id>> }>;
  current: Id | null;
  /** The name on the field when `current` is none of the choices. */
  fallbackLabel: string;
  info: (id: Id | null) => ReactNode;
  onPick: (id: Id) => void;
}) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<Id | null>(null);
  const used = groups.flatMap((g) => g.items).find((i) => i.id === current);
  const close = () => {
    setOpen(false);
    setHover(null);
  };
  const preview = (colors: readonly string[], squares: number) => (bar ? <GradientBar colors={colors} /> : <Strip colors={colors} max={squares} />);
  return (
    <div className="palette-field">
      <Field label={fieldLabel} hint={hint}>
        <button type="button" className="palette-trigger" aria-haspopup="dialog" aria-label={`${fieldLabel}: ${used?.label ?? fallbackLabel}. Choose another`} onClick={() => setOpen(true)}>
          <span className="palette-btn-name">{used?.label ?? fallbackLabel}</span>
          {used && preview(used.colors, FIELD_SQUARES)}
          <span className="palette-more" aria-hidden="true">…</span>
        </button>
      </Field>
      {open && (
        <ModalBackdrop onClose={close}>
          <div className="modal palette-modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={(el) => el?.focus()}>
            <div className="modal-head">
              <strong>{title}</strong>
              <button className="modal-close" onClick={close} aria-label="Close"><CloseIcon /></button>
            </div>
            {windowHint && <div className="muted small palette-hint">{windowHint}</div>}
            <div className="palette-groups">
              {groups.map((g) => (
                <section key={g.label} aria-label={g.label}>
                  <h4>{g.label}</h4>
                  <div className="palette-buttons" onMouseLeave={() => setHover(null)}>
                    {g.items.map((it) => (
                      <button
                        key={it.id}
                        className={`palette-btn${it.id === current ? ' current' : ''}`}
                        aria-pressed={it.id === current}
                        title={it.label}
                        aria-describedby={hover === it.id ? INFO_ID : undefined}
                        onClick={() => {
                          onPick(it.id);
                          close();
                        }}
                        onMouseEnter={() => setHover(it.id)}
                        onFocus={() => setHover(it.id)}
                        onBlur={() => setHover(null)}
                      >
                        <span className="palette-btn-name">{it.label}</span>
                        {preview(it.colors, WINDOW_SQUARES)}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <div className="palette-info">
              <div id={INFO_ID} className="palette-info-text" aria-live="polite">{info(hover ?? current)}</div>
              <button className="primary" onClick={close}>Close</button>
            </div>
          </div>
        </ModalBackdrop>
      )}
    </div>
  );
}
