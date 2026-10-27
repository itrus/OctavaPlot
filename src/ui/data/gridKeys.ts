/** Where Home, End and their Ctrl forms take the cursor of the data grid; null for any other key. Column -1 is the Row title column. */
export function gridJump(key: string, ctrl: boolean, at: { r: number; c: number }, nRows: number, nCols: number): { r: number; c: number } | null {
  if (key === 'Home') return { r: ctrl ? 0 : at.r, c: -1 };
  if (key === 'End') return { r: ctrl ? Math.max(0, nRows - 1) : at.r, c: Math.max(-1, nCols - 1) };
  return null;
}
