import { describe, expect, it } from 'vitest';
import { isSaveShortcut } from './saveShortcut';

const key = (key: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) => ({ key, ctrlKey: false, metaKey: false, altKey: false, shiftKey: false, ...mods });

describe('isSaveShortcut', () => {
  it('accepts Ctrl+S on Windows and Cmd+S on macOS, in either case', () => {
    expect(isSaveShortcut(key('s', { ctrlKey: true }))).toBe(true);
    expect(isSaveShortcut(key('S', { ctrlKey: true }))).toBe(true);
    expect(isSaveShortcut(key('s', { metaKey: true }))).toBe(true);
    expect(isSaveShortcut(key('S', { metaKey: true }))).toBe(true);
  });
  it('refuses S alone, other keys, and Alt or Shift held with it', () => {
    expect(isSaveShortcut(key('s'))).toBe(false);
    expect(isSaveShortcut(key('a', { ctrlKey: true }))).toBe(false);
    expect(isSaveShortcut(key('s', { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isSaveShortcut(key('s', { metaKey: true, shiftKey: true }))).toBe(false);
    expect(isSaveShortcut(key('s', { ctrlKey: true, altKey: true }))).toBe(false);
  });
});
