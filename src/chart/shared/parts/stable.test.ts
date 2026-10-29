import { describe, expect, it } from 'vitest';
import { cachedFor, sameRecords, stableList } from './stable';

describe('stableList', () => {
  const owner = [1, 2, 3];
  const dots = (n: number, cy = 5) => Array.from({ length: n }, (_, i) => ({ id: `o${i}`, cx: i, cy, color: '#123' }));

  it('gives back the earlier list while every record in it is equal, whatever the new objects are', () => {
    const first = stableList(owner, 'a', dots(1000));
    expect(stableList(owner, 'a', dots(1000))).toBe(first);
  });

  it('gives the new list when one record differs, when the length differs, or when the key or the owner differs', () => {
    const first = stableList(owner, 'a', dots(1000));
    const moved = dots(1000);
    moved[999] = { ...moved[999], cy: 6 };
    expect(stableList(owner, 'a', moved)).toBe(moved);
    const shorter = dots(999);
    expect(stableList(owner, 'a', shorter)).toBe(shorter);
    const other = dots(999);
    expect(stableList(owner, 'b', other)).toBe(other);
    expect(stableList([...owner], 'b', first)).toBe(first);
    expect(stableList([...owner], 'a', first)).toBe(first);
  });

  it('keeps the newest list under a key, so the next equal one finds it', () => {
    stableList(owner, 'k', dots(3, 1));
    const second = stableList(owner, 'k', dots(3, 2));
    expect(stableList(owner, 'k', dots(3, 2))).toBe(second);
  });
});

describe('sameRecords', () => {
  it('compares field by field, so that a record with another field or another value is different', () => {
    expect(sameRecords({ a: 1, b: 'x' }, { a: 1, b: 'x' })).toBe(true);
    expect(sameRecords({ a: 1, b: 'x' }, { a: 1, b: 'y' })).toBe(false);
    expect(sameRecords({ a: 1 }, { a: 1, b: undefined })).toBe(false);
    expect(sameRecords({ a: Number.NaN }, { a: Number.NaN })).toBe(true);
  });
});

describe('cachedFor', () => {
  it('computes once for an object and a key', () => {
    const o = {};
    let n = 0;
    const make = () => ({ n: ++n });
    expect(cachedFor(o, 'k', make)).toBe(cachedFor(o, 'k', make));
    expect(cachedFor(o, 'j', make)).not.toBe(cachedFor(o, 'k', make));
    expect(n).toBe(2);
  });
});
