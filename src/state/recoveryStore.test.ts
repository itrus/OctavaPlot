import { afterEach, describe, expect, it, vi } from 'vitest';
import { createExampleProject } from '../model/defaults';
import type { Project } from '../model/types';
import { affectsRecovery, AUTOSAVE_META_KEY, isConflict } from './recovery';
import { currentSignature, newEditorId, writeRecovery } from './recoveryStore';
import { AUTOSAVE_KEY, loadAutosave, parseProject, stringifyProject } from './serialize';

/** One shared store, as two tabs of one browser have. */
function sharedStorage(initial: Record<string, string> = {}, failKeys: string[] = []) {
  const data = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      if (failKeys.includes(k)) throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      data.set(k, v);
    },
    removeItem: (k: string) => void data.delete(k),
  });
  return data;
}
afterEach(() => vi.unstubAllGlobals());

const named = (name: string): Project => ({ ...createExampleProject(), name });

describe('two tabs and one recovery copy', () => {
  it('writes the text of a file under the old key, so an older version reads it', () => {
    const data = sharedStorage();
    const p = named('A');
    const r = writeRecovery(p, 'tab-a', currentSignature());
    expect(r.kind).toBe('ok');
    expect(data.get(AUTOSAVE_KEY)).toBe(stringifyProject(p));
    expect(parseProject(data.get(AUTOSAVE_KEY) as string).name).toBe('A');
    expect(JSON.parse(data.get(AUTOSAVE_META_KEY) as string)).toMatchObject({ writer: 'tab-a', rev: 1 });
  });
  it('one tab writing again and again is never a conflict, and the revision counts up', () => {
    const data = sharedStorage();
    let seen = currentSignature();
    for (let i = 1; i <= 3; i++) {
      const r = writeRecovery(named(`A${i}`), 'tab-a', seen);
      expect(r.kind).toBe('ok');
      if (r.kind === 'ok') seen = r.seen;
      expect(JSON.parse(data.get(AUTOSAVE_META_KEY) as string).rev).toBe(i);
    }
  });
  it('the last tab no longer wins silently: the second tab is stopped and nothing is overwritten', () => {
    sharedStorage();
    const seenA = currentSignature();
    const seenB = currentSignature(); // both opened on an empty store
    const a = writeRecovery(named('from A'), 'tab-a', seenA);
    expect(a.kind).toBe('ok');
    expect(isConflict(seenB, currentSignature())).toBe(true);
    expect(writeRecovery(named('from B'), 'tab-b', seenB).kind).toBe('conflict');
    expect(loadAutosave()?.name).toBe('from A');
  });
  it('keeping this tab takes over, and then the other tab is the one that is stopped', () => {
    sharedStorage();
    const seenA = currentSignature();
    const seenB = currentSignature();
    const a = writeRecovery(named('from A'), 'tab-a', seenA);
    const b = writeRecovery(named('from B'), 'tab-b', seenB, true);
    expect(b.kind).toBe('ok');
    expect(loadAutosave()?.name).toBe('from B');
    expect(a.kind === 'ok' && isConflict(a.seen, currentSignature())).toBe(true);
  });
  it('loading the other tab copy makes this tab current again', () => {
    sharedStorage();
    const seenB = currentSignature();
    writeRecovery(named('from A'), 'tab-a', currentSignature());
    expect(writeRecovery(named('from B'), 'tab-b', seenB).kind).toBe('conflict');
    const seenAfterLoad = currentSignature();
    expect(writeRecovery(named('B again'), 'tab-b', seenAfterLoad).kind).toBe('ok');
  });
  it('simulated storage events: only the recovery keys, and a write by another tab is seen as a conflict', () => {
    sharedStorage();
    const seenB = currentSignature();
    writeRecovery(named('from A'), 'tab-a', currentSignature());
    const events = [{ key: AUTOSAVE_KEY }, { key: AUTOSAVE_META_KEY }, { key: 'octavaplot:settings' }, { key: null }];
    expect(events.filter((e) => affectsRecovery(e.key) && isConflict(seenB, currentSignature())).length).toBe(3);
  });
  it('a write by an older version that leaves the stamp alone is a conflict', () => {
    const data = sharedStorage();
    const w = writeRecovery(named('A'), 'tab-a', currentSignature());
    data.set(AUTOSAVE_KEY, stringifyProject(named('old build')));
    expect(w.kind === 'ok' && isConflict(w.seen, currentSignature())).toBe(true);
  });
  it('a copy written by an older version, with no stamp, is read and can be taken over', () => {
    sharedStorage({ [AUTOSAVE_KEY]: stringifyProject(named('old')) });
    const seen = currentSignature();
    expect(loadAutosave()?.name).toBe('old');
    expect(writeRecovery(named('new'), 'tab-a', seen).kind).toBe('ok');
  });
  it('a full store is a failure, and the old copy stays', () => {
    sharedStorage({ [AUTOSAVE_KEY]: stringifyProject(named('old')) }, [AUTOSAVE_KEY]);
    const r = writeRecovery(named('new'), 'tab-a', currentSignature());
    expect(r).toEqual({ kind: 'failed', message: 'the browser storage is full' });
    expect(loadAutosave()?.name).toBe('old');
  });
  it('a stamp that cannot be written is not mistaken for another writer', () => {
    sharedStorage({}, [AUTOSAVE_META_KEY]);
    const r = writeRecovery(named('A'), 'tab-a', currentSignature());
    expect(r.kind).toBe('ok');
    if (r.kind === 'ok') expect(writeRecovery(named('A2'), 'tab-a', r.seen).kind).toBe('ok');
  });
  it('editor ids differ', () => {
    expect(newEditorId()).not.toBe(newEditorId());
  });
});
