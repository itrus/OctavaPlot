import { describe, expect, it } from 'vitest';
import { gridJump } from './gridKeys';

describe('gridJump', () => {
  it('Home goes to the Row title column of the row, Ctrl+Home to the first cell', () => {
    expect(gridJump('Home', false, { r: 7, c: 2 }, 50, 4)).toEqual({ r: 7, c: -1 });
    expect(gridJump('Home', true, { r: 7, c: 2 }, 50, 4)).toEqual({ r: 0, c: -1 });
  });
  it('End goes to the last column of the row, Ctrl+End to the last cell', () => {
    expect(gridJump('End', false, { r: 7, c: 0 }, 50, 4)).toEqual({ r: 7, c: 3 });
    expect(gridJump('End', true, { r: 7, c: 0 }, 50, 4)).toEqual({ r: 49, c: 3 });
    expect(gridJump('End', true, { r: 0, c: 0 }, 0, 0)).toEqual({ r: 0, c: -1 });
  });
  it('ignores other keys', () => {
    expect(gridJump('ArrowDown', false, { r: 0, c: 0 }, 5, 5)).toBeNull();
  });
});
