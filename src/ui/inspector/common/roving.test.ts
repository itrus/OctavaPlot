import { describe, expect, it } from 'vitest';
import { nextIndex } from './roving';

const all = [true, true, true, true];

describe('nextIndex', () => {
  it('moves with the arrows and wraps', () => {
    expect(nextIndex('ArrowRight', 0, all, 'horizontal')).toBe(1);
    expect(nextIndex('ArrowRight', 3, all, 'horizontal')).toBe(0);
    expect(nextIndex('ArrowLeft', 0, all, 'horizontal')).toBe(3);
  });
  it('skips disabled items', () => {
    const e = [true, false, false, true];
    expect(nextIndex('ArrowRight', 0, e, 'horizontal')).toBe(3);
    expect(nextIndex('ArrowLeft', 0, e, 'horizontal')).toBe(3);
    expect(nextIndex('Home', 2, [false, true, true, true], 'horizontal')).toBe(1);
    expect(nextIndex('End', 0, [true, true, true, false], 'horizontal')).toBe(2);
  });
  it('answers only to the keys of its orientation', () => {
    expect(nextIndex('ArrowDown', 0, all, 'horizontal')).toBeNull();
    expect(nextIndex('ArrowRight', 0, all, 'vertical')).toBeNull();
    expect(nextIndex('ArrowDown', 0, all, 'vertical')).toBe(1);
    expect(nextIndex('ArrowUp', 0, all, 'vertical')).toBe(3);
    expect(nextIndex('ArrowDown', 1, all, 'both')).toBe(2);
    expect(nextIndex('ArrowLeft', 1, all, 'both')).toBe(0);
    expect(nextIndex('a', 0, all, 'both')).toBeNull();
  });
  it('handles Home and End, nothing enabled, one item, and no current item', () => {
    expect(nextIndex('Home', 2, all, 'horizontal')).toBe(0);
    expect(nextIndex('End', 0, all, 'horizontal')).toBe(3);
    expect(nextIndex('ArrowRight', 0, [false, false], 'horizontal')).toBeNull();
    expect(nextIndex('ArrowRight', 0, [true], 'horizontal')).toBe(0);
    expect(nextIndex('ArrowRight', -1, all, 'horizontal')).toBe(0);
  });
});
