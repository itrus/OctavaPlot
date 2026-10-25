import { useEffect, type KeyboardEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Keeps Tab and Shift+Tab inside the dialog: from the last control it goes to the first, and back. */
export function trapTab(e: KeyboardEvent<HTMLElement>): void {
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
export function DialogShell({ children }: { children: ReactNode }) {
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
