import type { Project } from '../model/types';
import { AUTOSAVE_META_KEY, isConflict, parseMeta, signatureOf, textHash, type RecoveryMeta } from './recovery';
import { AUTOSAVE_KEY, stringifyProject } from './serialize';

/**
 * The browser recovery copy with a writer stamp. The text under AUTOSAVE_KEY is exactly the text of a .oplot file, as
 * before, so older versions read it unchanged; who wrote it and which revision it is lives under AUTOSAVE_META_KEY, which
 * they ignore. Pure rules are in recovery.ts.
 */

/** A name for this tab (editor instance), new for every page load. */
export function newEditorId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* not available here */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/** The state of the stored copy now: remember it as "seen" when this tab reads or writes the copy. */
export const currentSignature = (): string => signatureOf(read(AUTOSAVE_META_KEY), read(AUTOSAVE_KEY));

export type WriteResult =
  | { kind: 'ok'; savedAt: number; seen: string }
  | { kind: 'conflict' }
  | { kind: 'failed'; message: string };

const failure = (err: unknown): string => (err instanceof Error && err.name === 'QuotaExceededError' ? 'the browser storage is full' : 'the browser storage cannot be written');

/**
 * Writes the recovery copy and its stamp. Unless `force` (this tab takes over), nothing is written when the stored copy is
 * not the one this tab last read or wrote. Afterwards `seen` is what is really stored, so a stamp that could not be written
 * does not look like another writer's.
 */
export function writeRecovery(project: Project, editorId: string, seen: string, force = false, now: number = Date.now()): WriteResult {
  if (!force && isConflict(seen, currentSignature())) return { kind: 'conflict' };
  const text = stringifyProject(project);
  const rev = (parseMeta(read(AUTOSAVE_META_KEY))?.rev ?? 0) + 1;
  try {
    localStorage.setItem(AUTOSAVE_KEY, text);
  } catch (err) {
    return { kind: 'failed', message: failure(err) };
  }
  const meta: RecoveryMeta = { writer: editorId, rev, savedAt: now, hash: textHash(text) };
  try {
    localStorage.setItem(AUTOSAVE_META_KEY, JSON.stringify(meta));
  } catch {
    try {
      localStorage.removeItem(AUTOSAVE_META_KEY);
    } catch {
      /* the stamp stays old; the signature then shows an unstamped text */
    }
  }
  return { kind: 'ok', savedAt: now, seen: currentSignature() };
}
