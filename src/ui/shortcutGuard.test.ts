import { describe, expect, it } from 'vitest';
import { isTextEntryTarget } from './shortcutGuard';

const input = (type?: string) => ({ tagName: 'INPUT', type });

describe('isTextEntryTarget', () => {
  it('is true for text-entry inputs and textarea', () => {
    for (const t of ['text', 'search', 'number', 'email', 'url', 'tel', 'password']) expect(isTextEntryTarget(input(t))).toBe(true);
    expect(isTextEntryTarget({ tagName: 'TEXTAREA' })).toBe(true);
  });
  it('ignores case and defaults a missing or empty type to text', () => {
    expect(isTextEntryTarget({ tagName: 'input', type: 'NUMBER' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'textarea' })).toBe(true);
    expect(isTextEntryTarget(input())).toBe(true);
    expect(isTextEntryTarget(input(''))).toBe(true);
  });
  it('is false for non-text inputs', () => {
    for (const t of ['checkbox', 'radio', 'color', 'range', 'file', 'button', 'submit']) expect(isTextEntryTarget(input(t))).toBe(false);
  });
  it('is false for select, button and the grid div, true for contentEditable', () => {
    expect(isTextEntryTarget({ tagName: 'SELECT' })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'DIV', tabIndex: 0 })).toBe(false);
    expect(isTextEntryTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV', contentEditable: 'true' })).toBe(true);
    expect(isTextEntryTarget({ tagName: 'DIV', contentEditable: 'false' })).toBe(false);
  });
  it('is false for defensive inputs', () => {
    for (const v of [null, undefined, 0, 'input', {}, { tagName: 5 }]) expect(isTextEntryTarget(v)).toBe(false);
  });
});
