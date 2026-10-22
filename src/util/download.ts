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

export const safeFileName = (name: string): string => name.replace(/[^\w.-]+/g, '_') || 'chart';
