import { useRef, type ReactElement } from 'react';

/**
 * Browsers do not reliably send a paste event to a focused element that is not a text field (a graph or a page is not one), so
 * Ctrl+V hands the focus to a hidden textarea first (`arm`); the paste lands there, its text goes to `onPaste`, and the focus goes
 * back. If no paste arrives (an empty clipboard, a blocked paste), the focus goes back after a moment. The table does the same.
 */
export function usePasteCatcher(onPaste: (text: string) => void): { arm: () => void; catcher: ReactElement } {
  const ref = useRef<HTMLTextAreaElement>(null);
  const back = useRef<HTMLElement | null>(null);
  const returnFocus = () => back.current?.focus({ preventScroll: true });
  const arm = () => {
    back.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    ref.current?.focus({ preventScroll: true });
    setTimeout(() => {
      if (document.activeElement === ref.current) returnFocus();
    }, 400);
  };
  const catcher = (
    <textarea
      ref={ref}
      className="paste-catcher"
      tabIndex={-1}
      aria-hidden="true"
      onPaste={(e) => {
        e.preventDefault();
        e.stopPropagation();
        returnFocus();
        onPaste(e.clipboardData.getData('text/plain'));
      }}
    />
  );
  return { arm, catcher };
}
