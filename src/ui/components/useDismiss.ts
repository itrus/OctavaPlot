import { useEffect, type RefObject } from 'react';

/**
 * A popup that is open closes when the pointer goes down outside it (outside the control that opened it and outside the popup, which may
 * be drawn elsewhere in the page) and on Escape.
 */
export function useDismiss(open: boolean, inside: ReadonlyArray<RefObject<HTMLElement | null>>, close: () => void): void {
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!inside.some((r) => r.current?.contains(e.target as Node))) close();
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && close();
    document.addEventListener('pointerdown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', away);
      document.removeEventListener('keydown', esc);
    };
    // The refs and the closing function are stable in both users (a ref object, and a state setter called with false).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
