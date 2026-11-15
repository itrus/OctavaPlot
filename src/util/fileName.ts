/** Local date and time as yymmdd_HHMM, e.g. 261022_1435 for 22 Oct 2026, 14:35. */
export function fileStamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
}

/** Name for a new project: the date and time it was created are part of it, so the saved file name matches. */
export function untitledProjectName(now: Date = new Date()): string {
  return `Untitled_project_${fileStamp(now)}`;
}

/** File name for an export: the safe base name, plus the date and time when the Settings option is on (unless the name already ends with one). */
export function exportFileName(base: string, ext: string, stamped: boolean, now: Date = new Date()): string {
  const safe = safeFileName(base);
  const hasStamp = /_\d{6}_\d{4}$/.test(safe);
  return `${safe}${stamped && !hasStamp ? `_${fileStamp(now)}` : ''}.${ext}`;
}

// Letters and digits of any script are kept (a graph named "Überleben" stays so); anything else, the characters Windows forbids included, becomes _.
const safeFileName = (name: string): string => name.replace(/[^\p{L}\p{M}\p{N}_.-]+/gu, '_') || 'chart';
