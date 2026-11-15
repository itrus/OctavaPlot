import { AUTOSAVE_BACKUP_KEY, AUTOSAVE_KEY, AUTOSAVE_UNREADABLE_KEY, parseProject } from '../serialize';
import { AUTOSAVE_META_KEY, parseMeta, textHash } from './recovery';

/** One project text that the browser keeps. */
export interface BrowserCopy {
  id: 'current' | 'backup' | 'unreadable';
  label: string;
  /** What it is, in a sentence. */
  detail: string;
  text: string;
  bytes: number;
  /** When the current copy was written, if its stamp says. */
  savedAt: number | null;
  /** Whether this version can open it. */
  readable: boolean;
  /** The name for a download. */
  filename: string;
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const readable = (text: string): boolean => {
  try {
    parseProject(text);
    return true;
  } catch {
    return false;
  }
};

/**
 * Every project text the browser keeps, each on its own: the recovery copy that autosave writes, the copy taken at start-up, and text
 * this version could not read that was set aside. None stands in for another; the first edit overwrites the current one.
 */
export function listBrowserCopies(): BrowserCopy[] {
  const meta = parseMeta(read(AUTOSAVE_META_KEY));
  const spec: Array<Pick<BrowserCopy, 'id' | 'label' | 'detail' | 'filename'> & { key: string }> = [
    { id: 'current', key: AUTOSAVE_KEY, label: 'Recovery copy', detail: 'What autosave writes while you work; the next edit replaces it.', filename: 'octavaplot-recovery.oplot' },
    { id: 'backup', key: AUTOSAVE_BACKUP_KEY, label: 'Start-up copy', detail: 'The recovery copy as it was when this tab started.', filename: 'octavaplot-startup-copy.oplot' },
    { id: 'unreadable', key: AUTOSAVE_UNREADABLE_KEY, label: 'Set aside (unreadable)', detail: 'Text this version could not open (a newer file, an older shape, or damage). It is never replaced.', filename: 'octavaplot-unreadable.txt' },
  ];
  return spec.flatMap((s) => {
    const text = read(s.key);
    if (!text) return [];
    const ok = readable(text);
    return [{
      id: s.id,
      label: s.label,
      detail: s.detail,
      text,
      bytes: new TextEncoder().encode(text).length,
      savedAt: s.id === 'current' && meta && meta.hash === textHash(text) ? meta.savedAt : null,
      readable: ok,
      filename: !ok && s.id !== 'unreadable' ? s.filename.replace('.oplot', '.txt') : s.filename,
    }];
  });
}
