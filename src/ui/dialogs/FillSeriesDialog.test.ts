import { describe, expect, it } from 'vitest';
import { parseSeries } from './FillSeriesDialog';

describe('parseSeries', () => {
  it('reads the start and the step as numbers, with the decimal separator of the setting', () => {
    expect(parseSeries('1', '0.5', 'auto')).toEqual({ ok: true, start: 1, step: 0.5 });
    expect(parseSeries('1,5', '-2', 'comma')).toEqual({ ok: true, start: 1.5, step: -2 });
  });
  it('says which of the two is not a number, and an empty one is not', () => {
    expect(parseSeries('abc', '1', 'auto')).toEqual({ ok: false, message: 'The start must be a number.' });
    expect(parseSeries('1', '', 'auto')).toEqual({ ok: false, message: 'The step must be a number.' });
    expect(parseSeries('', '1', 'auto')).toEqual({ ok: false, message: 'The start must be a number.' });
  });
});
