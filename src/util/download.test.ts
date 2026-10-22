import { describe, expect, it } from 'vitest';
import { exportFileName, fileStamp } from './download';

describe('export file names', () => {
  const when = new Date(2026, 9, 22, 14, 5);
  it('formats the stamp as yymmdd_HHMM', () => {
    expect(fileStamp(when)).toBe('261022_1405');
    expect(fileStamp(new Date(2027, 0, 3, 9, 7))).toBe('270103_0907');
  });
  it('adds the stamp before the extension only when asked', () => {
    expect(exportFileName('Graph 1', 'png', true, when)).toBe('Graph_1_261022_1405.png');
    expect(exportFileName('Graph 1', 'png', false, when)).toBe('Graph_1.png');
  });
});
