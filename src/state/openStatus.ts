/** The status line after a project file was opened: how many stored values were reset, and the first; the rest are behind Details. */
export function openedStatus(fileName: string, notes: string[]): string {
  if (notes.length === 0) return `Opened ${fileName}.`;
  const more = notes.length > 1 ? ` (and ${notes.length - 1} more: see Details)` : '';
  return `Opened ${fileName}. ${notes.length} stored value${notes.length === 1 ? ' was' : 's were'} reset to defaults: ${notes[0]}${more}`;
}

/** The status line when a file was refused: why, and that the project that was open is as it was. */
export function refusedStatus(fileName: string, err: unknown): string {
  const why = err instanceof Error ? err.message : String(err);
  return `${fileName} was not opened. ${why} The open project was not changed.`;
}
