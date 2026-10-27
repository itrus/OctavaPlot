import { describe, expect, it } from 'vitest';
import { AUTOSAVE_META_KEY, affectsRecovery, bannerVisible, clockTime, flushDecision, isConflict, protectionOf, recoveryStatusText, shouldWarnOnUnload, signatureOf, textHash } from './recovery';

describe('protection: changed in memory, saved to browser recovery, saved as file', () => {
  it('nothing changed since the file: saved as file', () => {
    expect(protectionOf({ changedSinceFile: false, recoveryHoldsThis: false })).toBe('file');
  });
  it('changed, and the recovery copy holds this version: recovery', () => {
    expect(protectionOf({ changedSinceFile: true, recoveryHoldsThis: true })).toBe('recovery');
  });
  it('changed, and the recovery copy does not hold this version: memory', () => {
    expect(protectionOf({ changedSinceFile: true, recoveryHoldsThis: false })).toBe('memory');
  });
  it('only the memory state warns before leaving the page', () => {
    expect(shouldWarnOnUnload('memory')).toBe(true);
    expect(shouldWarnOnUnload('recovery')).toBe(false);
    expect(shouldWarnOnUnload('file')).toBe(false);
  });
});

describe('flush on exit', () => {
  const ok = { autosave: true, pending: true, conflict: false };
  it('writes the pending change', () => expect(flushDecision(ok)).toBe('write'));
  it('does nothing without a pending change', () => expect(flushDecision({ ...ok, pending: false })).toBe('skip'));
  it('does nothing when autosave is off', () => expect(flushDecision({ ...ok, autosave: false })).toBe('skip'));
  it('does nothing while another tab has the copy', () => expect(flushDecision({ ...ok, conflict: true })).toBe('skip'));
});

describe('recovery status text', () => {
  const at = new Date(2026, 0, 5, 9, 7).getTime();
  const base = { protection: 'recovery' as const, savedAt: at, error: null, conflict: false, autosave: true };
  it('formats the clock as HH:MM', () => expect(clockTime(at)).toBe('09:07'));
  it('says when the copy was saved', () => expect(recoveryStatusText(base)).toBe('Recovery copy saved at 09:07'));
  it('says nothing when the file holds everything', () => expect(recoveryStatusText({ ...base, protection: 'file' })).toBe(''));
  it('a failed write is shown and never reads as a backup', () => {
    const t = recoveryStatusText({ ...base, protection: 'memory', error: 'quota exceeded' });
    expect(t).toMatch(/not saved/i);
    expect(t).toMatch(/quota exceeded/);
    expect(t).not.toMatch(/^Recovery copy saved at/);
  });
  it('after a failure the older timestamp is called older', () => {
    expect(recoveryStatusText({ ...base, protection: 'memory', error: 'x' })).toMatch(/older|before/i);
  });
  it('a conflict says the copy is not updated', () => {
    expect(recoveryStatusText({ ...base, protection: 'memory', conflict: true })).toMatch(/another tab/i);
  });
  it('with autosave off and changes, says there is no recovery copy', () => {
    expect(recoveryStatusText({ ...base, protection: 'memory', autosave: false, savedAt: null })).toMatch(/off/i);
  });
  it('a memory state that is only waiting for the next autosave says nothing', () => {
    expect(recoveryStatusText({ ...base, protection: 'memory', savedAt: null })).toBe('');
  });
});

describe('another writer', () => {
  const mine = (rev: number, text: string) => signatureOf(JSON.stringify({ writer: 'tab-a', rev, savedAt: 1, hash: textHash(text) }), text);
  it('the same writer, revision and text is no conflict', () => {
    expect(isConflict(mine(3, 'abc'), mine(3, 'abc'))).toBe(false);
  });
  it('another tab wrote a new revision', () => {
    const other = signatureOf(JSON.stringify({ writer: 'tab-b', rev: 4, savedAt: 2, hash: textHash('xyz') }), 'xyz');
    expect(isConflict(mine(3, 'abc'), other)).toBe(true);
  });
  it('another tab wrote the same text under its own name', () => {
    const other = signatureOf(JSON.stringify({ writer: 'tab-b', rev: 4, savedAt: 2, hash: textHash('abc') }), 'abc');
    expect(isConflict(mine(3, 'abc'), other)).toBe(true);
  });
  it('an older build wrote the text and left the stamp as it was', () => {
    const stale = signatureOf(JSON.stringify({ writer: 'tab-a', rev: 3, savedAt: 1, hash: textHash('abc') }), 'changed by an old build');
    expect(isConflict(mine(3, 'abc'), stale)).toBe(true);
  });
  it('a store that was empty and now has a copy is a conflict; one that was cleared is not', () => {
    expect(isConflict(signatureOf(null, null), mine(1, 'abc'))).toBe(true);
    expect(isConflict(mine(1, 'abc'), signatureOf(null, null))).toBe(false);
  });
  it('text with no stamp has the same signature whoever reads it', () => {
    expect(signatureOf(null, 'abc')).toBe(signatureOf('not json', 'abc'));
  });
  it('only the recovery keys matter in a storage event', () => {
    expect(affectsRecovery('octavaplot:project:autosave')).toBe(true);
    expect(affectsRecovery(AUTOSAVE_META_KEY)).toBe(true);
    expect(affectsRecovery(null)).toBe(true); // storage cleared
    expect(affectsRecovery('octavaplot:settings')).toBe(false);
  });
  it('the banner shows only when there is something of this tab that could be lost', () => {
    expect(bannerVisible({ conflict: true, changedSinceFile: true, pending: false })).toBe(true);
    expect(bannerVisible({ conflict: true, changedSinceFile: false, pending: true })).toBe(true);
    expect(bannerVisible({ conflict: true, changedSinceFile: false, pending: false })).toBe(false);
    expect(bannerVisible({ conflict: false, changedSinceFile: true, pending: true })).toBe(false);
  });
});
