import { describe, expect, it } from 'vitest';
import { NOTHING_PICKED, pick, pickAll, pickedInOrder, prune, type PickState } from './folderSelection';

const order = ['a', 'b', 'c', 'd', 'e'];
const plain = { shift: false, toggle: false };
const toggle = { shift: false, toggle: true };
const shift = { shift: true, toggle: false };
const ids = (s: PickState) => pickedInOrder(order, s);

describe('picking items in a folder overview', () => {
  it('a click picks that item alone and makes it the start of a range', () => {
    const s = pick(order, pick(order, NOTHING_PICKED, 'b', plain), 'd', plain);
    expect(ids(s)).toEqual(['d']);
    expect(s.anchor).toBe('d');
  });

  it('Ctrl, Cmd or the check box adds an item to the picks, or takes it out', () => {
    let s = pick(order, NOTHING_PICKED, 'a', plain);
    s = pick(order, s, 'c', toggle);
    expect(ids(s)).toEqual(['a', 'c']);
    s = pick(order, s, 'a', toggle);
    expect(ids(s)).toEqual(['c']);
  });

  it('Shift picks the range from the start, in either direction', () => {
    const start = pick(order, NOTHING_PICKED, 'b', plain);
    expect(ids(pick(order, start, 'd', shift))).toEqual(['b', 'c', 'd']);
    expect(ids(pick(order, start, 'a', shift))).toEqual(['a', 'b']);
    expect(pick(order, start, 'd', shift).anchor).toBe('b');
  });

  it('Shift replaces the picks with the range, and Ctrl with Shift adds it', () => {
    let s = pick(order, NOTHING_PICKED, 'a', plain);
    s = pick(order, s, 'e', toggle);
    expect(ids(pick(order, s, 'c', shift))).toEqual(['c', 'd', 'e']);
    // The range runs from the last item clicked (e) to c, and a stays picked.
    expect(ids(pick(order, s, 'c', { shift: true, toggle: true }))).toEqual(['a', 'c', 'd', 'e']);
  });

  it('Shift with nothing picked yet picks that item', () => {
    expect(ids(pick(order, NOTHING_PICKED, 'c', shift))).toEqual(['c']);
  });

  it('ignores an item that is not shown', () => {
    expect(pick(order, NOTHING_PICKED, 'zzz', plain)).toBe(NOTHING_PICKED);
  });

  it('picks all, and gives them in the order shown whatever order they were picked in', () => {
    expect(ids(pickAll(order))).toEqual(order);
    const s = pick(order, pick(order, pick(order, NOTHING_PICKED, 'e', plain), 'a', toggle), 'c', toggle);
    expect(ids(s)).toEqual(['a', 'c', 'e']);
  });

  it('drops what is no longer there, and keeps the same state when nothing is gone', () => {
    const s = pick(order, pick(order, NOTHING_PICKED, 'b', plain), 'd', toggle);
    expect(prune(order, s)).toBe(s);
    const left = prune(['a', 'b', 'c'], s);
    expect(ids(left)).toEqual(['b']);
    expect(left.anchor).toBeNull();
  });
});
