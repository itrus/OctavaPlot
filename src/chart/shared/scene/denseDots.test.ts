import { describe, expect, it } from 'vitest';
import { DENSE_PREVIEW_DOTS, densePreviewNote, isDense, nearestDot } from './denseDots';

const dots = [
  { id: 'a', size: 6, x: 10, y: 10 },
  { id: 'b', size: 6, x: 20, y: 10 },
  { id: 'c', size: 10, x: 40, y: 40 },
];
const at = (d: { x: number; y: number }) => d;

describe('picking a dot of a simplified preview by where it is', () => {
  it('finds the dot nearest to the pointer, among those the pointer touches', () => {
    expect(nearestDot(dots, at, 11, 10)?.id).toBe('a');
    expect(nearestDot(dots, at, 18, 11)?.id).toBe('b');
    expect(nearestDot(dots, at, 42, 38)?.id).toBe('c');
  });

  it('finds none where no dot is within its size and a little reach (so the gap between dots is not a dot)', () => {
    expect(nearestDot(dots, at, 15, 25)).toBeNull();
    expect(nearestDot(dots, at, 0, 0)).toBeNull();
    expect(nearestDot([], at, 0, 0)).toBeNull();
    expect(nearestDot(dots, at, 10, 10 + 3 + 1.9)?.id).toBe('a');
    expect(nearestDot(dots, at, 10, 10 + 3 + 2.1)).toBeNull();
  });

  it('prefers the dot drawn last when two are equally near, as the pointer would have hit it', () => {
    const twins = [{ id: 'first', size: 6, x: 5, y: 5 }, { id: 'last', size: 6, x: 5, y: 5 }];
    expect(nearestDot(twins, at, 5, 5)?.id).toBe('last');
  });

  it('reads the position through the function it is given (a horizontal chart turns the dots)', () => {
    expect(nearestDot(dots, (d) => ({ x: d.y, y: d.x }), 10, 20)?.id).toBe('b');
  });
});

describe('when a preview is simplified', () => {
  it('starts at 100 000 dots, and says so', () => {
    expect(DENSE_PREVIEW_DOTS).toBe(100_000);
    expect(isDense(99_999)).toBe(false);
    expect(isDense(100_000)).toBe(true);
    expect(densePreviewNote(120_000)).toContain('120 000');
    expect(densePreviewNote(120_000)).toMatch(/export/i);
  });
});
