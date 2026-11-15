import { describe, expect, it } from 'vitest';
import { shortcutOf } from './appShortcuts';

const key = (code: string, k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key: k, code, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe('app shortcuts', () => {
  it('finds each one', () => {
    expect(shortcutOf(key('KeyN', 'n', { ctrlKey: true, altKey: true }), false)).toBe('new');
    expect(shortcutOf(key('KeyN', 'n', { ctrlKey: true, altKey: true }), true)).toBeNull();
    expect(shortcutOf(key('KeyO', 'o', { ctrlKey: true }), false)).toBe('open');
    expect(shortcutOf(key('KeyO', 'o', { metaKey: true }), false)).toBe('open');
    expect(shortcutOf(key('KeyE', 'e', { ctrlKey: true }), false)).toBe('export');
    expect(shortcutOf(key('Comma', ',', { ctrlKey: true }), false)).toBe('settings');
    expect(shortcutOf(key('Slash', '/', { ctrlKey: true }), false)).toBe('shortcuts');
    expect(shortcutOf(key('KeyB', 'b', { ctrlKey: true }), false)).toBe('navigator');
    expect(shortcutOf(key('KeyB', 'b', { ctrlKey: true, altKey: true }), false)).toBe('inspector');
    expect(shortcutOf(key('KeyD', 'D', { ctrlKey: true, shiftKey: true }), false)).toBe('duplicate');
    expect(shortcutOf(key('F2', 'F2'), false)).toBe('rename');
  });
  it("leaves the table's Ctrl+D, Alt+Shift+D and plain keys alone", () => {
    expect(shortcutOf(key('KeyD', 'd', { ctrlKey: true }), false)).toBeNull();
    expect(shortcutOf(key('KeyD', 'D', { altKey: true, shiftKey: true }), false)).toBeNull();
    expect(shortcutOf(key('KeyO', 'o'), false)).toBeNull();
  });
  it("keeps the text field's own keys while typing", () => {
    expect(shortcutOf(key('KeyB', 'b', { ctrlKey: true }), true)).toBeNull();
    expect(shortcutOf(key('F2', 'F2'), true)).toBeNull();
    expect(shortcutOf(key('KeyO', 'o', { ctrlKey: true }), true)).toBe('open');
  });
});

describe('save, undo and redo', () => {
  const ctrl = { ctrlKey: true };
  it('save: Ctrl+S on Windows and Cmd+S on macOS, in either case, also while typing', () => {
    expect(shortcutOf(key('KeyS', 's', ctrl), false)).toBe('save');
    expect(shortcutOf(key('KeyS', 'S', ctrl), false)).toBe('save');
    expect(shortcutOf(key('KeyS', 's', { metaKey: true }), false)).toBe('save');
    expect(shortcutOf(key('KeyS', 's', ctrl), true)).toBe('save');
  });
  it('save refuses S alone, other keys, and Alt or Shift held with it', () => {
    expect(shortcutOf(key('KeyS', 's'), false)).toBeNull();
    expect(shortcutOf(key('KeyA', 'a', ctrl), false)).toBeNull();
    expect(shortcutOf(key('KeyS', 's', { ctrlKey: true, shiftKey: true }), false)).toBeNull();
    expect(shortcutOf(key('KeyS', 's', { metaKey: true, shiftKey: true }), false)).toBeNull();
    expect(shortcutOf(key('KeyS', 's', { ctrlKey: true, altKey: true }), false)).toBeNull();
  });
  it('undo and redo: Ctrl+Z, Ctrl+Y and Ctrl+Shift+Z, left to a text field while it has the focus', () => {
    expect(shortcutOf(key('KeyZ', 'z', ctrl), false)).toBe('undo');
    expect(shortcutOf(key('KeyY', 'y', ctrl), false)).toBe('redo');
    expect(shortcutOf(key('KeyZ', 'Z', { ctrlKey: true, shiftKey: true }), false)).toBe('redo');
    expect(shortcutOf(key('KeyZ', 'z', ctrl), true)).toBeNull();
    expect(shortcutOf(key('KeyY', 'y', ctrl), true)).toBeNull();
  });
});
