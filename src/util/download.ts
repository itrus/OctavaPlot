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


/**
 * Copy text to the clipboard. A hidden textarea and execCommand first (it runs inside the key press, so it is always allowed),
 * then the async Clipboard API where the page may use it (secure context, user gesture). Resolves to whether the text was copied.
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
