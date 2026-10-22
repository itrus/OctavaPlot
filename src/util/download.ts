/** Browser download helpers. Kept apart from chart/export so the app shell does not pull in the SVG/PNG renderer. */

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Local date and time as yymmdd_HHMM, e.g. 261022_1435 for 22 Oct 2026, 14:35. */
export function fileStamp(now: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(now.getFullYear() % 100)}${p(now.getMonth() + 1)}${p(now.getDate())}_${p(now.getHours())}${p(now.getMinutes())}`;
}

/** File name for an export: the safe base name, plus the date and time when the Settings option is on. */
export function exportFileName(base: string, ext: string, stamped: boolean, now: Date = new Date()): string {
  return `${safeFileName(base)}${stamped ? `_${fileStamp(now)}` : ''}.${ext}`;
}

export const safeFileName = (name: string): string => name.replace(/[^\w.-]+/g, '_') || 'chart';

/**
 * Copy text to the clipboard. Uses the async Clipboard API where the page may (secure context, user gesture),
 * otherwise a hidden textarea and execCommand. Resolves to whether the text was copied.
 */
export async function copyText(text: string): Promise<boolean> {
  // First choice: a hidden textarea and execCommand, which runs synchronously inside the key press and so is always allowed.
  const active = document.activeElement as HTMLElement | null;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none';
  document.body.appendChild(ta);
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  ta.remove();
  active?.focus({ preventScroll: true });
  if (ok) return true;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
