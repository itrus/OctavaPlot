import { describe, expect, it } from 'vitest';
import { patchChart } from '../../state/commands';
import { parseProject, stringifyProject } from '../../state/serialize';
import { createExampleProject } from '../defaults';
import type { Project } from '../types';
import { inheritChart } from './chartFormat';
import { PRINT_WIDTH_MM, sanitizePrintWidthMm } from './look';

/** The project as a file with `printWidthMm` of its first graph set to `value` (the key is left out for undefined), read back. */
const readWith = (value: unknown): Project => {
  const file = JSON.parse(stringifyProject(createExampleProject()));
  if (value === undefined) delete file.project.charts[0].printWidthMm;
  else file.project.charts[0].printWidthMm = value;
  return parseProject(JSON.stringify(file));
};

describe('sanitizePrintWidthMm', () => {
  it('keeps the presets and a custom width in range', () => {
    for (const mm of PRINT_WIDTH_MM.presets) expect(sanitizePrintWidthMm(mm)).toBe(mm);
    expect(sanitizePrintWidthMm(85.5)).toBe(85.5);
  });
  it('holds a width outside 20 to 400 mm at the nearest limit', () => {
    expect(sanitizePrintWidthMm(5)).toBe(20);
    expect(sanitizePrintWidthMm(1000)).toBe(400);
  });
  it('turns anything that is not a finite number into none', () => {
    for (const v of [undefined, null, '90', NaN, Infinity, {}, [90], true]) expect(sanitizePrintWidthMm(v)).toBeUndefined();
  });
});

describe('printWidthMm in a file', () => {
  it('is none in a new graph and in a file without it', () => {
    expect(createExampleProject().charts[0].printWidthMm).toBeUndefined();
    expect(readWith(undefined).charts[0].printWidthMm).toBeUndefined();
  });
  it('is not written while none, so a default file is the same as before', () => {
    expect(stringifyProject(createExampleProject())).not.toContain('printWidthMm');
    expect(stringifyProject(readWith(null))).not.toContain('printWidthMm');
  });
  it('is sanitised when read', () => {
    expect(readWith(140).charts[0].printWidthMm).toBe(140);
    expect(readWith(9).charts[0].printWidthMm).toBe(20);
    expect(readWith('wide').charts[0].printWidthMm).toBeUndefined();
    expect(readWith(null).charts[0].printWidthMm).toBeUndefined();
  });
  it('survives save and load', () => {
    const p = createExampleProject();
    const set = patchChart(p.charts[0].id, { printWidthMm: 180 })(p);
    expect(parseProject(stringifyProject(set)).charts[0].printWidthMm).toBe(180);
  });
});

describe('Graph like another', () => {
  it('takes the print width with the size, as both describe the same figure', () => {
    const p = createExampleProject();
    const source = { ...p.charts[0], printWidthMm: 90 };
    const made = inheritChart(source, p.dataTables[0], p.dataTables[0], 'x');
    expect(made.printWidthMm).toBe(90);
    expect(inheritChart(p.charts[0], p.dataTables[0], p.dataTables[0], 'y').printWidthMm).toBeUndefined();
  });
});
