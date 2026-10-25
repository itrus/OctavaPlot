/** Local date and time as yymmdd_HHMM, e.g. 261022_1435 for 22 Oct 2026, 14:35. */
export function fileStamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
}

/** Name for a new project: the date and time it was created are part of it, so the saved file name matches. */
export function untitledProjectName(now: Date = new Date()): string {
  return `Untitled_project_${fileStamp(now)}`;
}
