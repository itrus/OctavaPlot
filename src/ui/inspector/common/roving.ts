import { useRef, type KeyboardEvent } from 'react';

export type Orientation = 'horizontal' | 'vertical' | 'both';

/**
 * The item a key press moves to in a tab list or radio group, or null when the key is not one of its keys.
 * Arrows wrap around and skip disabled items; Home and End go to the first and last enabled item.
 * `current` is the item that has focus (-1 when none): the answer can be that same item.
 */
export function nextIndex(key: string, current: number, enabled: boolean[], orientation: Orientation): number | null {
  const n = enabled.length;
  if (!enabled.some(Boolean)) return null;
  if (key === 'Home') return enabled.indexOf(true);
  if (key === 'End') return enabled.lastIndexOf(true);
  const across = orientation !== 'vertical';
  const down = orientation !== 'horizontal';
  const step = (key === 'ArrowRight' && across) || (key === 'ArrowDown' && down) ? 1 : (key === 'ArrowLeft' && across) || (key === 'ArrowUp' && down) ? -1 : 0;
  if (step === 0) return null;
  for (let k = 1; k <= n; k++) {
    const i = (((current + step * k) % n) + n) % n;
    if (enabled[i]) return i;
  }
  return null;
}

/**
 * Roving tabindex for a tab list or radio group: one item is a tab stop, the arrow keys, Home and End move focus and
 * select. Spread `groupProps` on the container and `itemProps(i)` on item i. `selected` may be -1 (nothing chosen).
 */
export function useRoving(enabled: boolean[], selected: number, onSelect: (index: number) => void, orientation: Orientation = 'horizontal') {
  const refs = useRef<Array<HTMLElement | null>>([]);
  const stop = enabled[selected] ? selected : enabled.indexOf(true);
  return {
    groupProps: {
      onKeyDown: (e: KeyboardEvent) => {
        const next = nextIndex(e.key, refs.current.indexOf(e.target as HTMLElement), enabled, orientation);
        if (next === null || !refs.current.includes(e.target as HTMLElement)) return;
        e.preventDefault();
        onSelect(next);
        refs.current[next]?.focus();
      },
    },
    itemProps: (i: number) => ({
      ref: (el: HTMLElement | null) => {
        refs.current[i] = el;
      },
      tabIndex: i === stop ? 0 : -1,
    }),
  };
}
