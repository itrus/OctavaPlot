import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../components/icons';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * The ref of a dialog box that takes the focus when it opens. It is one function for every render (an inline arrow would be a new
 * ref each time, so React would call it again and pull the focus back to the box on every render).
 */
const focusOnOpen = (el: HTMLElement | null): void => el?.focus();

/** Keeps Tab and Shift+Tab inside the dialog: from the last control it goes to the first, and back. */
function trapTab(e: KeyboardEvent<HTMLElement>): void {
  if (e.key !== 'Tab') return;
  const dialog = e.currentTarget.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) return;
  const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
  if (items.length === 0) {
    e.preventDefault();
    dialog.focus();
    return;
  }
  const [first, last] = [items[0], items[items.length - 1]];
  const active = document.activeElement;
  if (e.shiftKey && (active === first || active === dialog)) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && active === last) {
    e.preventDefault();
    first.focus();
  }
}

/**
 * Where a dialog is drawn: on the page itself, outside the application, which is made inert while the dialog is open (the
 * keyboard and assistive technology cannot reach it), and which gets its focus back when the dialog closes.
 */
function DialogShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const returnTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const root = document.getElementById('root');
    const was = root?.inert ?? false;
    if (root) root.inert = true;
    return () => {
      if (root) root.inert = was;
      // Back to what had the focus (if it is still there) once the application can take it again.
      if (returnTo?.isConnected) returnTo.focus();
    };
  }, []);
  return createPortal(children, document.body);
}

/**
 * A dialog window: drawn over the app, closed by a click outside it, by Escape and by its close button, with Tab kept inside; it takes
 * the focus once, when it opens. `title` names it (its title bar shows `heading` when that is given); `className` sizes the box.
 */
export function DialogWindow({ title, heading, onClose, className = 'modal-wide', closeButton = true, children }: { title: string; heading?: ReactNode; onClose: () => void; className?: string; closeButton?: boolean; children: ReactNode }) {
  return (
    <DialogShell>
      <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => (e.key === 'Escape' ? onClose() : trapTab(e))}>
        <div className={`modal ${className}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={focusOnOpen}>
          <div className="modal-head">
            <strong>{heading ?? title}</strong>
            {closeButton && <button className="modal-close" onClick={onClose} aria-label="Close"><CloseIcon /></button>}
          </div>
          {children}
        </div>
      </div>
    </DialogShell>
  );
}

/** A small dialog with a body and Cancel / confirm buttons; Enter confirms (unless `enterConfirms` is false), as the confirm button does. */
export function Modal({ title, confirmLabel, onConfirm, onClose, confirmDisabled, wide, cancelLabel = 'Cancel', enterConfirms = true, children }: { title: string; confirmLabel: string; onConfirm: () => void; onClose: () => void; confirmDisabled?: boolean; wide?: boolean; cancelLabel?: string; /** False: Enter does not confirm (a deletion is confirmed by a click). */ enterConfirms?: boolean; children: ReactNode }) {
  const latest = useRef({ onConfirm, confirmDisabled });
  latest.current = { onConfirm, confirmDisabled };
  useEffect(() => {
    if (!enterConfirms) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      // Enter that ends the composition of a character (an input method for Japanese, Chinese, ...) is not a confirmation.
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229 && !(e.target instanceof HTMLSelectElement) && !(e.target instanceof HTMLButtonElement && e.target.getAttribute('role') !== 'radio')) {
        // A card is a radio button: Enter on it confirms the choice instead of selecting it again.
        e.preventDefault();
        // Enter does what the confirm button does: nothing while that is disabled.
        if (!latest.current.confirmDisabled) latest.current.onConfirm();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enterConfirms]);
  return (
    <DialogWindow title={title} onClose={onClose} className={`modal-wide${wide ? ' modal-xwide' : ''}`}>
      <div className="modal-body modal-pad">{children}</div>
      <div className="modal-foot">
        <button onClick={onClose}>{cancelLabel}</button>
        <button className="primary" onClick={onConfirm} disabled={confirmDisabled}>{confirmLabel}</button>
      </div>
    </DialogWindow>
  );
}
