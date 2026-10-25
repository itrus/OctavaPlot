import { describe, expect, it } from 'vitest';
import { exportFileName } from './download';
import { fileStamp, untitledProjectName } from './stamp';

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
  it('puts the creation stamp in a new project name and does not stamp the file name twice', () => {
    const name = untitledProjectName(when);
    expect(name).toBe('Untitled_project_261022_1405');
    expect(exportFileName(name, 'oplot', true, new Date(2026, 9, 23, 9, 0))).toBe('Untitled_project_261022_1405.oplot');
  });
});
