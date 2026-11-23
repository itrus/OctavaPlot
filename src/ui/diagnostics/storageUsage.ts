import { AUTOSAVE_BACKUP_KEY, AUTOSAVE_KEY, AUTOSAVE_UNREADABLE_KEY } from '../../state/serialize';
import { AUTOSAVE_META_KEY } from '../../state/recovery/recovery';
import { SETTINGS_KEY } from '../../state/settings';

/** What the browser's localStorage holds for this origin. Sizes are in bytes, counted as UTF-16 (2 bytes per character), which is how browsers usually count against the quota. */
interface StorageRow { key: string; bytes: number }
export interface StorageUsage {
  /** The app's own keys (prefix "octavaplot"), largest first. */
  rows: StorageRow[];
  appBytes: number;
  /** Every key on the origin, the app's or not. */
  originBytes: number;
}

/** The usual localStorage limit per origin. Browsers do not report it, so this is an assumption shown as approximate. */
export const ASSUMED_LIMIT_BYTES = 5 * 1024 * 1024;

const APP_PREFIX = 'octavaplot';

export function measureLocalStorage(storage: Pick<Storage, 'length' | 'key' | 'getItem'> = localStorage): StorageUsage {
  const rows: StorageRow[] = [];
  let originBytes = 0;
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key === null) continue;
    const bytes = (key.length + (storage.getItem(key) ?? '').length) * 2;
    originBytes += bytes;
    if (key.startsWith(APP_PREFIX)) rows.push({ key, bytes });
  }
  rows.sort((a, b) => b.bytes - a.bytes);
  return { rows, appBytes: rows.reduce((s, r) => s + r.bytes, 0), originBytes };
}

const KEY_NAMES: Record<string, string> = {
  [AUTOSAVE_KEY]: 'Autosave (project)',
  [AUTOSAVE_META_KEY]: 'Autosave stamp',
  [AUTOSAVE_BACKUP_KEY]: 'Start-up backup',
  [AUTOSAVE_UNREADABLE_KEY]: 'Unreadable copy',
  [SETTINGS_KEY]: 'Settings',
  'octavaplot.head': 'Header open or closed',
};

/** A plain name for one of the app's keys; an unknown key keeps its own name. */
export const keyName = (key: string): string => KEY_NAMES[key] ?? key;

/** JavaScript heap of this page, where the browser says (Chrome and Edge only; the field is non-standard). */
export function heapUsage(): { used: number; limit: number } | null {
  const m = (performance as unknown as { memory?: { usedJSHeapSize?: number; jsHeapSizeLimit?: number } }).memory;
  return m && typeof m.usedJSHeapSize === 'number' && typeof m.jsHeapSizeLimit === 'number' ? { used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit } : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
