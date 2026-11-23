import { Fragment, useState } from 'react';
import { insertSymbol, SYMBOL_GROUPS, symbolOf } from '../../util/richText';
import { DialogWindow } from '../dialogs/DialogShell';

/** What the button says on hover: how the text of a graph is written. */
const SYMBOL_HINT =
  'Choose a symbol from a list. Text of a graph is written H_{2}O (subscript), m^{2} or x^{-1} (superscript) and symbols by name: \\mu \\alpha \\Delta \\pm \\times \\deg, with {} to end a name (\\mu{}m). Text without a backslash or a brace is written as typed.';

type Box = HTMLInputElement | HTMLTextAreaElement;

/**
 * Writes a name into a text box the way typing would: the new value is set below React's notice and an input event is sent, so the
 * box's own change handler records it (one undoable step, like a typed change).
 */
function writeInto(el: Box, text: string): void {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, text);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

/** The window of symbols as one rectangle. A click on one chooses it and the window closes. */
function SymbolDialog({ onPick, onClose }: { onPick: (name: string) => void; onClose: () => void }) {
  const [hover, setHover] = useState<string | null>(null);
  return (
    <DialogWindow title="Insert symbol" onClose={onClose} className="char-modal" closeButton={false}>
        <div className="modal-body modal-pad">
          <div className="char-groups">
            {SYMBOL_GROUPS.map((g) => (
              <Fragment key={g.title}>
              {g.newLine && <div className="char-break" aria-hidden="true" />}
              <section className="char-group" aria-label={g.title}>
                <div className="char-group-title">{g.title}</div>
                <div className="char-table" style={{ gridTemplateColumns: `repeat(${Math.min(g.names.length, 24)}, 36px)` }}>
                  {g.names.map((n) => (
                    <button key={n} className="char-cell" title={`\\${n}`} aria-label={`${n}: ${symbolOf(n)}`} onClick={() => onPick(n)} onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)}>
                      {symbolOf(n)}
                    </button>
                  ))}
                </div>
              </section>
              </Fragment>
            ))}
          </div>
          <div className="char-name muted" aria-live="polite">{hover ? `${symbolOf(hover)}   \\${hover}` : 'Choose a symbol'}</div>
        </div>
        <div className="modal-foot">
          <button onClick={onClose}>Close</button>
        </div>
    </DialogWindow>
  );
}

/**
 * A button beside a text box that opens the window of symbols and writes the one chosen into the box, in place of its selection (or at
 * its cursor), then puts the cursor after it. `box` gives the text box.
 */
export function SymbolButton({ box, disabled, className }: { box: () => Box | null; disabled?: boolean; className?: string }) {
  // The box and its selection when the window was opened: the box loses the focus while the window is open.
  const [at, setAt] = useState<{ box: Box; start: number; end: number } | null>(null);
  const open = () => {
    const el = box();
    if (el) setAt({ box: el, start: el.selectionStart ?? el.value.length, end: el.selectionEnd ?? el.value.length });
  };
  const pick = (name: string) => {
    if (!at) return;
    const el = at.box;
    const next = insertSymbol(el.value, at.start, at.end, name);
    setAt(null);
    writeInto(el, next.text);
    // After the new text is drawn the cursor goes back into the box, after the symbol.
    requestAnimationFrame(() => {
      if (!el.isConnected) return;
      el.focus();
      el.setSelectionRange(next.caret, next.caret);
    });
  };
  return (
    <>
      <button type="button" className={`symbol-btn${className ? ` ${className}` : ''}`} aria-label="Insert symbol" title={SYMBOL_HINT} disabled={disabled} onMouseDown={(e) => e.preventDefault()} onClick={open}>
        <span className="symbol-alpha" aria-hidden="true">α</span>
        <span className="symbol-caret" aria-hidden="true">▾</span>
      </button>
      {at && <SymbolDialog onPick={pick} onClose={() => setAt(null)} />}
    </>
  );
}
