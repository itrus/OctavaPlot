import { AUTOSAVE_KEY } from './serialize';

/**
 * The rules for the browser recovery copy, with no browser in them: how well the work is kept, when to write on leaving
 * the page, what the status line says, and how to tell that another tab has written the copy. The wiring is in
 * AppContext.tsx and the storage in recoveryStore.ts.
 */

/**
 * Where the work stands. "memory": changed since it was last saved as a file, and the browser recovery copy does not hold
 * this version, so closing the page loses it. "recovery": the recovery copy holds this version. "file": nothing has changed
 * since the project was opened, created or saved as a .oplot file.
 */
export type Protection = 'memory' | 'recovery' | 'file';

export function protectionOf(s: { changedSinceFile: boolean; recoveryHoldsThis: boolean }): Protection {
  if (!s.changedSinceFile) return 'file';
  return s.recoveryHoldsThis ? 'recovery' : 'memory';
}

/** Leaving the page loses work only in the "memory" state. */
export const shouldWarnOnUnload = (p: Protection): boolean => p === 'memory';

/** On leaving the page (or hiding it): write the pending change at once, unless autosave is off or another tab has the copy. */
export function flushDecision(s: { autosave: boolean; pending: boolean; conflict: boolean }): 'write' | 'skip' {
  return s.autosave && s.pending && !s.conflict ? 'write' : 'skip';
}

/** Local time as HH:MM. */
export function clockTime(ms: number): string {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The line for the status bar. It claims a recovery copy only when the last write succeeded and holds this version; after a
 * failure it says so, and an earlier time is named as older.
 */
export function recoveryStatusText(s: { protection: Protection; savedAt: number | null; error: string | null; conflict: boolean; autosave: boolean }): string {
  if (s.protection === 'file') return '';
  if (s.conflict) return 'Recovery copy not updated: another tab has written it. Changes here are only in this tab.';
  if (s.error !== null) {
    const earlier = s.savedAt !== null ? ` The copy saved at ${clockTime(s.savedAt)} is older than your latest changes.` : '';
    return `Recovery copy NOT saved (${s.error}). Changes are only in this tab: save the project to a file.${earlier}`;
  }
  if (s.protection === 'recovery') return s.savedAt !== null ? `Recovery copy saved at ${clockTime(s.savedAt)}` : '';
  if (!s.autosave) return 'Autosave is off: changes are not in a recovery copy.';
  return '';
}

/** Companion of the recovery text under another key: who wrote it last. Older versions ignore this key. */
export const AUTOSAVE_META_KEY = 'octavaplot:project:autosave:meta';

/** The stamp stored beside the recovery text. */
export interface RecoveryMeta {
  /** The tab (editor instance) that wrote the text. */
  writer: string;
  /** Counts the writes of the copy, from 1. */
  rev: number;
  /** When it was written (ms since 1970). */
  savedAt: number;
  /** Hash of the text it was written with. */
  hash: string;
}

/** FNV-1a over the text, with its length: a change check, not security. */
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${h.toString(16)}-${text.length}`;
}

const EMPTY = 'empty';

/** Parses the stamp; anything that is not a stamp is no stamp. */
export function parseMeta(raw: string | null): RecoveryMeta | null {
  if (raw === null) return null;
  try {
    const m: unknown = JSON.parse(raw);
    if (typeof m !== 'object' || m === null) return null;
    const o = m as Record<string, unknown>;
    return typeof o.writer === 'string' && typeof o.rev === 'number' && typeof o.savedAt === 'number' && typeof o.hash === 'string' ? { writer: o.writer, rev: o.rev, savedAt: o.savedAt, hash: o.hash } : null;
  } catch {
    return null;
  }
}

/**
 * One value that names the state of the stored copy: who wrote it, which revision, and the text itself. A stamp that does
 * not match the text (an older version wrote the text only) counts as no stamp, so that write is seen as a foreign one.
 */
export function signatureOf(metaRaw: string | null, text: string | null): string {
  if (text === null || text === '') return EMPTY;
  const hash = textHash(text);
  const meta = parseMeta(metaRaw);
  return meta && meta.hash === hash ? `${meta.writer}:${meta.rev}:${hash}` : `-:0:${hash}`;
}

/**
 * Another writer: the stored copy is not the one this tab last read or wrote. A copy that has gone (storage cleared) is not
 * a conflict, because nothing is overwritten by writing again.
 */
export const isConflict = (seen: string, current: string): boolean => current !== EMPTY && current !== seen;

/** A storage event for these keys (or for a cleared store, key null) can change the recovery copy. */
export const affectsRecovery = (key: string | null): boolean => key === null || key === AUTOSAVE_KEY || key === AUTOSAVE_META_KEY;

/** The conflict banner is shown while this tab has changes that are not in a file, or are waiting to be written. */
export const bannerVisible = (s: { conflict: boolean; changedSinceFile: boolean; pending: boolean }): boolean => s.conflict && (s.changedSinceFile || s.pending);
