import { describe, expect, it } from 'vitest';
import { parseRowCount } from './AppendRowsDialog';

describe('parseRowCount', () => {
  it('accepts whole numbers from 1 up to the room left', () => {
    expect(parseRowCount('250', 1000)).toEqual({ ok: true, count: 250 });
    expect(parseRowCount(' 1 ', 1000)).toEqual({ ok: true, count: 1 });
    expect(parseRowCount('1000', 1000)).toEqual({ ok: true, count: 1000 });
  });
  it('refuses zero, fractions, signs, text and anything past the room', () => {
    for (const bad of ['0', '2.5', '-3', '+3', '1e3', 'abc', '']) expect(parseRowCount(bad, 1000).ok).toBe(false);
    const over = parseRowCount('1001', 1000);
    expect(over).toEqual({ ok: false, message: expect.stringContaining('1,000') });
    expect(parseRowCount('1', 0)).toEqual({ ok: false, message: 'The table is full.' });
  });
});
