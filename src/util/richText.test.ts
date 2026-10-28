import { describe, expect, it } from 'vitest';
import { hasMarkup, parseRichText, plainText } from './richText';

const runs = (s: string) => parseRichText(s).map((r) => `${r.script}:${r.text}`);

describe('rich text: what is left alone', () => {
  it('does not touch text that has no backslash and no script marker with its brace, whatever else it holds', () => {
    // Names that labs use every day: an underscore or a caret without a brace is just a character.
    for (const text of ['Mouse_3', 'Run_2', 'p_value', 'Group_A_vs_B', 'a^2', 'H_2O', 'x^-1', '10^-3', 'Time (days)', 'IC50 (nM)', '']) {
      expect(hasMarkup(text)).toBe(false);
      expect(plainText(text)).toBe(text);
      expect(parseRichText(text).map((r) => r.text).join('')).toBe(text);
      expect(parseRichText(text).every((r) => r.script === 'normal')).toBe(true);
    }
  });
  it('keeps what it does not understand exactly as typed: an unknown name, a backslash path, a brace that never closes', () => {
    expect(plainText('C:\\Users\\me')).toBe('C:\\Users\\me');
    expect(plainText('\\n and \\q')).toBe('\\n and \\q');
    expect(plainText('H_{2O')).toBe('H_{2O');
    expect(plainText('x^{')).toBe('x^{');
    expect(plainText('\\mum')).toBe('\\mum');
  });
});

describe('rich text: scripts', () => {
  it('writes a subscript and a superscript from braces', () => {
    expect(runs('H_{2}O')).toEqual(['normal:H', 'sub:2', 'normal:O']);
    expect(runs('m^{2}')).toEqual(['normal:m', 'sup:2']);
    expect(runs('x^{-1}')).toEqual(['normal:x', 'sup:-1']);
    expect(runs('CO_{2}^{-}')).toEqual(['normal:CO', 'sub:2', 'sup:-']);
  });
  it('takes the whole text in the braces as the script', () => {
    expect(runs('E_{max} (%)')).toEqual(['normal:E', 'sub:max', 'normal: (%)']);
    expect(runs('10^{-3} M')).toEqual(['normal:10', 'sup:-3', 'normal: M']);
  });
  it('joins neighbours of one kind and drops an empty script', () => {
    expect(runs('a_{1}_{2}')).toEqual(['normal:a', 'sub:12']);
    expect(runs('H_{}O')).toEqual(['normal:HO']);
  });
  it('does not nest: it keeps every character, in order, so that nothing is lost', () => {
    expect(plainText('a_{b_{c}}')).toBe('ab_{c}');
  });
  it('resolves names and escapes inside a script', () => {
    expect(runs('x^{\\alpha}')).toEqual(['normal:x', 'sup:α']);
    expect(runs('a_{\\_}')).toEqual(['normal:a', 'sub:_']);
  });
});

describe('rich text: Greek letters, symbols and escapes', () => {
  it('writes a Greek letter or a symbol from its name', () => {
    expect(plainText('\\mu mol/L')).toBe('μ mol/L');
    expect(plainText('\\alpha, \\beta and \\Omega')).toBe('α, β and Ω');
    expect(plainText('37 \\deg C \\pm 2')).toBe('37 ° C ± 2');
    expect(plainText('A \\times B \\leq C \\approx D \\neq E \\geq F \\cdot G \\infty')).toBe('A × B ≤ C ≈ D ≠ E ≥ F · G ∞');
  });
  it('ends a name with an empty pair of braces, so that a letter can follow it', () => {
    expect(plainText('\\mu{}m')).toBe('μm');
    expect(plainText('\\Delta{}t')).toBe('Δt');
  });
  it('writes the character itself after a backslash, so that a marker can be written out', () => {
    expect(plainText('a\\_{2}')).toBe('a_{2}');
    expect(parseRichText('a\\_{2}').every((r) => r.script === 'normal')).toBe(true);
    expect(plainText('1 \\\\ 2')).toBe('1 \\ 2');
    expect(plainText('\\{x\\}')).toBe('{x}');
    expect(plainText('a^\\{b')).toBe('a^{b');
  });
  it('is the same as typing the character: Greek typed directly needs nothing', () => {
    expect(hasMarkup('μmol/L')).toBe(false);
    expect(plainText('μmol/L')).toBe('μmol/L');
  });
});
