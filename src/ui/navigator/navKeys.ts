/** The place in a list of `count` items that Up, Down, Home or End lead to from place `at` (-1: none has the focus); null for any other key. */
export function navStep(key: string, at: number, count: number): number | null {
  if (count <= 0) return null;
  switch (key) {
    case 'ArrowDown':
      return Math.min(count - 1, at + 1);
    case 'ArrowUp':
      return Math.max(0, at - 1);
    case 'Home':
      return 0;
    case 'End':
      return count - 1;
    default:
      return null;
  }
}

/** Whether Left or Right on a folder folds or unfolds it: the new state, or null when nothing changes (already so, or another key). */
export function navFold(key: string, open: boolean): boolean | null {
  if (key === 'ArrowLeft' && open) return false;
  if (key === 'ArrowRight' && !open) return true;
  return null;
}
