import { describe, expect, it } from 'vitest';
import { richPieces, SCRIPT_SCALE } from './richSvg';

describe('the pieces a text with markup is written as', () => {
  it('lowers a subscript at 70% of the size and brings the text after it back to the baseline', () => {
    expect(richPieces('H_{2}O')).toEqual([{ text: 'H' }, { text: '2', fontSize: '70%', dy: '0.4em' }, { text: 'O', dy: '-0.28em' }]);
  });
  it('lifts a superscript and brings the text after it back', () => {
    expect(richPieces('m^{2} s')).toEqual([{ text: 'm' }, { text: '2', fontSize: '70%', dy: '-0.571em' }, { text: ' s', dy: '0.4em' }]);
  });
  it('moves straight from a subscript to a superscript', () => {
    const [, sub, sup] = richPieces('C_{a}^{2+}');
    expect(sub.dy).toBe('0.4em');
    // From 0.28 below to 0.4 above the baseline, in the em of the superscript.
    expect(sup.dy).toBe(`${Number((-0.68 / SCRIPT_SCALE).toFixed(3))}em`);
  });
  it('is back on the baseline after every script that is followed by normal text: the shifts add up to nothing', () => {
    for (const text of ['H_{2}O', 'm^{2} s^{-1} x', 'C_{a}^{2+} x', 'a_{1}b^{2}c_{3}d']) {
      let at = 0;
      for (const p of richPieces(text)) at += p.dy === undefined ? 0 : parseFloat(p.dy) * (p.fontSize === undefined ? 1 : SCRIPT_SCALE);
      expect(at).toBeCloseTo(0, 2);
    }
  });
  it('writes Greek letters and symbols as one plain piece, with no tspan to write', () => {
    expect(richPieces('\\mu mol/L')).toEqual([{ text: 'μ mol/L' }]);
  });
});
