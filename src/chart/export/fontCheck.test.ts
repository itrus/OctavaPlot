import { describe, expect, it } from 'vitest';
import { checkFonts, parseFontFamilies } from './fontCheck';

const has = (...names: string[]) => (family: string) => names.includes(family);

describe('parseFontFamilies', () => {
  it('splits a CSS list and takes the quotes off', () => {
    expect(parseFontFamilies("Arial, Helvetica, sans-serif")).toEqual(['Arial', 'Helvetica', 'sans-serif']);
    expect(parseFontFamilies(`'Times New Roman', "Noto Serif", serif`)).toEqual(['Times New Roman', 'Noto Serif', 'serif']);
  });
  it('keeps a comma inside quotes and drops empty entries', () => {
    expect(parseFontFamilies(`"Foo, Bar", , Baz,`)).toEqual(['Foo, Bar', 'Baz']);
  });
  it('gives nothing for an empty list', () => {
    expect(parseFontFamilies('')).toEqual([]);
    expect(parseFontFamilies('  ')).toEqual([]);
  });
});

describe('checkFonts', () => {
  it('reports the first available family as the one in use', () => {
    const r = checkFonts('Arial, Helvetica, sans-serif', has('Arial', 'Helvetica'));
    expect(r.families).toEqual([
      { family: 'Arial', status: 'available' },
      { family: 'Helvetica', status: 'available' },
      { family: 'sans-serif', status: 'generic' },
    ]);
    expect(r.used).toBe('Arial');
    expect(r.missing).toEqual([]);
    expect(r.replacedBy).toBeNull();
  });
  it('reports the fallback that will be used when the first families are missing', () => {
    const r = checkFonts("'Times New Roman', Times, serif", has('Times'));
    expect(r.families.map((f) => f.status)).toEqual(['missing', 'available', 'generic']);
    expect(r.used).toBe('Times');
    expect(r.missing).toEqual(['Times New Roman']);
    expect(r.replacedBy).toBe('Times');
  });
  it('falls back to the generic family when nothing is installed', () => {
    const r = checkFonts('Verdana, Geneva, sans-serif', has());
    expect(r.used).toBe('sans-serif');
    expect(r.missing).toEqual(['Verdana', 'Geneva']);
    expect(r.replacedBy).toBe('sans-serif');
  });
  it('counts the generic names as available without asking, in any case', () => {
    const asked: string[] = [];
    const r = checkFonts('SERIF, system-ui, ui-sans-serif, cursive, monospace', (f) => (asked.push(f), false));
    expect(asked).toEqual([]);
    expect(r.families.every((f) => f.status === 'generic')).toBe(true);
    expect(r.used).toBe('SERIF');
    expect(r.replacedBy).toBeNull();
  });
  it('handles an empty list', () => {
    expect(checkFonts('', has())).toEqual({ requested: '', families: [], used: null, missing: [], replacedBy: null });
  });
  it('reports a list with only missing fonts as having no font in use', () => {
    const r = checkFonts('Nope', has());
    expect(r.used).toBeNull();
    expect(r.replacedBy).toBeNull();
    expect(r.missing).toEqual(['Nope']);
  });
});
