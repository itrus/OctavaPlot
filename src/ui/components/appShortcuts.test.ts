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
