import { describe, expect, it } from 'vitest';
import { blockToText, formatCell, matrixToText, parseCell, parseClipboard, parseClipboardBlock, planPaste, splitTsv } from './cellText';

describe('parseCell', () => {
  it('treats empty text as a missing value, not zero', () => {
    expect(parseCell('')).toEqual({ ok: true, value: null });
    expect(parseCell('   ')).toEqual({ ok: true, value: null });
  });
  it('parses numbers, including exponent and decimal comma', () => {
    expect(parseCell('1.10')).toEqual({ ok: true, value: 1.1 });
    expect(parseCell('-2e3')).toEqual({ ok: true, value: -2000 });
    expect(parseCell('1,5')).toEqual({ ok: true, value: 1.5 });
    expect(parseCell('0')).toEqual({ ok: true, value: 0 });
  });
  it('rejects non-numeric text', () => {
    for (const bad of ['abc', '1.2.3', 'NaN', 'Infinity', '1e', '12 3']) expect(parseCell(bad).ok).toBe(false);
  });
});

describe('parseClipboard', () => {
  it('parses Excel-style tab/newline blocks with a trailing newline and blanks', () => {
    const r = parseClipboard('1\t2\r\n3\t\r\n');
    expect(r).toEqual({ ok: true, matrix: [[1, 2], [3, null]] });
  });
  it('rejects the whole paste when any cell is non-numeric', () => {
    const r = parseClipboard('1\t2\nx\t4');
    expect(r.ok).toBe(false);
  });
  it('round-trips through matrixToText', () => {
    expect(matrixToText([[1, null], [2.5, 3]])).toBe('1\t\n2.5\t3');
  });
});

describe('splitTsv', () => {
  it('keeps tabs, newlines and doubled quotes inside quoted fields', () => {
    expect(splitTsv('"a\tb"\t1\n"line1\nline2"\t2\n"say ""hi"""\t3')).toEqual([
      ['a\tb', '1'],
      ['line1\nline2', '2'],
      ['say "hi"', '3'],
    ]);
  });
  it('handles CRLF, a trailing newline and blank lines', () => {
    expect(splitTsv('a\t1\r\nb\t2\r\n')).toEqual([['a', '1'], ['b', '2']]);
    expect(splitTsv('a\n\nb')).toEqual([['a'], [''], ['b']]);
  });
  it('keeps an unterminated quote as literal text', () => {
    expect(splitTsv('"abc\t1')).toEqual([['"abc', '1']]);
  });
  it('treats empty text as one empty field', () => {
    expect(splitTsv('')).toEqual([['']]);
  });
});

describe('parseClipboardBlock', () => {
  it('takes the first field as a title and keeps numeric-looking titles as text', () => {
    const r = parseClipboardBlock('12\t1.5\n"7"\t', true);
    expect(r).toEqual({ ok: true, titles: ['12', '7'], matrix: [[1.5], [null]] });
  });
  it('sanitises titles and handles quoted newlines and CRLF', () => {
    const r = parseClipboardBlock('"a\tb\nc"\t2\r\nz\t3\r\n', true);
    expect(r).toEqual({ ok: true, titles: ['a b c', 'z'], matrix: [[2], [3]] });
  });
  it('rejects the whole block when a value is not numeric', () => {
    const r = parseClipboardBlock('a\t1\nb\tx', true);
    expect(r).toEqual({ ok: false, message: 'Paste rejected, non-numeric values found (row 2, column 2: "x" is not a number).' });
  });
  it('does not treat the first field as a title without withTitles', () => {
    expect(parseClipboardBlock('1\t2', false)).toEqual({ ok: true, titles: [], matrix: [[1, 2]] });
    expect(parseClipboardBlock('a\t2', false).ok).toBe(false);
  });
  it('gives a blank line an empty title and no values', () => {
    expect(parseClipboardBlock('a\n\nb', true)).toEqual({ ok: true, titles: ['a', '', 'b'], matrix: [[], [], []] });
  });
});

describe('blockToText', () => {
  it('writes titles first and quotes only when needed', () => {
    expect(blockToText(['a', 'b c'], [[1, null], [2.5, 3]])).toBe('a\t1\t\nb c\t2.5\t3');
    expect(blockToText(['x\ty'], [[]])).toBe('"x\ty"');
  });
  it('quotes a leading quote and round-trips', () => {
    const titles = ['"quoted" start', 'plain', '12'];
    const matrix = [[1], [null], [3]];
    const text = blockToText(titles, matrix);
    expect(text.startsWith('"""quoted"" start"')).toBe(true);
    expect(parseClipboardBlock(text, true)).toEqual({ ok: true, titles, matrix });
  });
  it('without titles matches matrixToText', () => {
    expect(blockToText(null, [[1, null], [2.5, 3]])).toBe(matrixToText([[1, null], [2.5, 3]]));
  });
});

describe('planPaste', () => {
  const at = (r0: number, r1: number, c0: number, c1: number) => ({ r0, r1, c0, c1 });
  it('pastes titles only from the Row title column', () => {
    const p = planPaste('a\nb\n', at(2, 2, -1, -1));
    expect(p).toMatchObject({ ok: true, row0: 2, col0: 0, titles: ['a', 'b'], matrix: [[], []], label: 'Paste row titles', sel: { ar: 2, ac: -1, fr: 3, fc: -1 } });
  });
  it('pastes titles with values from the first group', () => {
    const p = planPaste('a\t1\t2\nb\t3', at(0, 0, -1, -1));
    expect(p).toMatchObject({ ok: true, row0: 0, col0: 0, titles: ['a', 'b'], matrix: [[1, 2], [3, null]], sel: { ar: 0, ac: -1, fr: 1, fc: 1 } });
  });
  it('fills a multi-row title selection with one title', () => {
    const p = planPaste('same', at(1, 3, -1, -1));
    expect(p).toMatchObject({ ok: true, titles: ['same', 'same', 'same'], matrix: [[], [], []] });
  });
  it('refuses a selection that mixes the title column and value cells', () => {
    const p = planPaste('a', at(0, 1, -1, 1));
    expect(p.ok).toBe(false);
  });
  it('pastes numbers normally and fills one value over a selection', () => {
    expect(planPaste('1\t2\n3\t4', at(1, 1, 0, 0))).toMatchObject({ ok: true, row0: 1, col0: 0, titles: null, matrix: [[1, 2], [3, 4]], label: 'Paste values', message: 'Pasted 2 rows × 2 columns.', sel: { ar: 1, ac: 0, fr: 2, fc: 1 } });
    expect(planPaste('5', at(0, 1, 1, 2))).toMatchObject({ ok: true, matrix: [[5, 5], [5, 5]] });
  });
  it('pads ragged rows with missing values and reports the widest', () => {
    expect(planPaste('1\t2\t3\n4', at(0, 0, 0, 0))).toMatchObject({ ok: true, matrix: [[1, 2, 3], [4, null, null]], sel: { ar: 0, ac: 0, fr: 1, fc: 2 } });
  });
  it('fails atomically on a non-numeric value', () => {
    const p = planPaste('1\tx', at(0, 0, 0, 0));
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.message).toMatch(/^Paste rejected, non-numeric values found/);
  });
});

describe('ragged paste', () => {
  it('pads a short row with missing values so the block is a rectangle', () => {
    const r = parseClipboard('1\t2\n3');
    expect(r).toEqual({ ok: true, matrix: [[1, 2], [3, null]] });
  });
});

describe('decimal separator', () => {
  it('refuses an ambiguous 1,234 in automatic mode instead of guessing', () => {
    expect(parseCell('1,234').ok).toBe(false);
    expect(parseCell('12,5')).toEqual({ ok: true, value: 12.5 });
    expect(parseCell('1,2345')).toEqual({ ok: true, value: 1.2345 });
  });
  it('point mode refuses a comma; comma mode reads only a comma and refuses a point', () => {
    expect(parseCell('1,5', 'point').ok).toBe(false);
    expect(parseCell('1.5', 'point')).toEqual({ ok: true, value: 1.5 });
    expect(parseCell('1,234', 'comma')).toEqual({ ok: true, value: 1.234 });
    expect(parseCell('1.5', 'comma').ok).toBe(false);
    expect(parseCell('-2e3', 'comma')).toEqual({ ok: true, value: -2000 });
    expect(parseCell('-2,5e-3', 'comma')).toEqual({ ok: true, value: -0.0025 });
  });
  it('has no thousands separator: 1.234 is a number only as a decimal, 1.234,5 and 1,234.5 are refused', () => {
    expect(parseCell('1.234', 'point')).toEqual({ ok: true, value: 1.234 });
    expect(parseCell('1.234', 'auto')).toEqual({ ok: true, value: 1.234 });
    expect(parseCell('1.234', 'comma').ok).toBe(false);
    expect(parseCell('1.234,5', 'comma').ok).toBe(false);
    expect(parseCell('1.234,5', 'auto').ok).toBe(false);
    expect(parseCell('1,234.5', 'point').ok).toBe(false);
    expect(parseCell('1,234.5', 'auto').ok).toBe(false);
  });
  it('applies to pasted blocks', () => {
    expect(parseClipboard('1,234\t2').ok).toBe(false);
    expect(parseClipboardBlock('1,234\t2', false, 'comma')).toEqual({ ok: true, titles: [], matrix: [[1.234, 2]] });
  });
});

describe('what is written reads back as the same number', () => {
  const SEPARATORS = ['auto', 'point', 'comma'] as const;
  const VALUES = [1.234, 1234, 0.001, -12.345, 1e-7, 1.5e-7, 123.456, 1.234567, 1e21, 1.5e21, -0.5, 0, 100, 12345.678];
  // Every value, and a blank beside it, one row each.
  const MATRIX: Array<Array<number | null>> = VALUES.map((v) => [v, null]);

  it('through the edit box: format then parse, in every mode', () => {
    for (const s of SEPARATORS) for (const v of VALUES) expect(parseCell(formatCell(v, s), s)).toEqual({ ok: true, value: v });
    for (const s of SEPARATORS) expect(parseCell(formatCell(null, s), s)).toEqual({ ok: true, value: null });
  });
  it('writes the decimal separator of the setting and no thousands separator', () => {
    expect(formatCell(1.234, 'comma')).toBe('1,234');
    expect(formatCell(1.234, 'point')).toBe('1.234');
    expect(formatCell(1.234, 'auto')).toBe('1.234');
    expect(formatCell(12345.678, 'comma')).toBe('12345,678');
    expect(formatCell(1.5e-7, 'comma')).toBe('1,5e-7');
    expect(formatCell(1234, 'comma')).toBe('1234');
  });
  it('through copy and paste, with and without row titles', () => {
    for (const s of SEPARATORS) {
      const matrix = MATRIX;
      const text = blockToText(null, matrix, s);
      expect(parseClipboardBlock(text, false, s)).toEqual({ ok: true, titles: [], matrix });
      const titles = matrix.map((_, i) => `row ${i}`);
      expect(parseClipboardBlock(blockToText(titles, matrix, s), true, s)).toEqual({ ok: true, titles, matrix });
      expect(parseClipboardBlock(matrixToText(matrix, s), false, s)).toEqual({ ok: true, titles: [], matrix });
    }
  });
  it('through a paste plan into the grid', () => {
    for (const s of SEPARATORS) {
      const p = planPaste(blockToText(null, [[1.234, 1234], [0.001, -12.345]], s), { r0: 0, r1: 0, c0: 0, c1: 0 }, s);
      expect(p).toMatchObject({ ok: true, matrix: [[1.234, 1234], [0.001, -12.345]] });
    }
  });
  it('a pasted block in the other mode is refused whole, not misread', () => {
    expect(parseClipboardBlock(blockToText(null, [[1.5, 2]], 'comma'), false, 'point').ok).toBe(false);
    expect(parseClipboardBlock(blockToText(null, [[1.5, 2]], 'point'), false, 'comma').ok).toBe(false);
  });
});

describe('numbers that cannot be stored', () => {
  it('rejects a value that underflows to 0 instead of storing 0, but accepts a true zero', () => {
    expect(parseCell('1e-400').ok).toBe(false);
    expect(parseCell('2.5E-999').ok).toBe(false);
    for (const z of ['0', '0.0', '0e5', '-0']) expect(parseCell(z)).toEqual({ ok: true, value: Number(z) });
  });
  it('still accepts the smallest ordinary values', () => {
    expect(parseCell('1e-300')).toEqual({ ok: true, value: 1e-300 });
  });
});

describe('planPaste size limit', () => {
  const bounds = { r0: 0, r1: 0, c0: 0, c1: 0 };
  const lines = (n: number) => Array.from({ length: n }, (_, i) => String(i)).join('\n');
  it('refuses a paste past the row limit with a message, without throwing', () => {
    const r = planPaste(lines(200000), bounds);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain('100,000');
  });
  it('accepts a paste of exactly the row limit', () => {
    const r = planPaste(lines(100000), bounds);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.matrix).toHaveLength(100000);
  });
  it('refuses a titles paste past the limit too', () => {
    expect(planPaste(lines(100001), { r0: 0, r1: 0, c0: -1, c1: -1 }).ok).toBe(false);
  });
});
