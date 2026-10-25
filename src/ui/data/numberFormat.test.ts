import { describe, expect, it } from 'vitest';
import { formatNum, sliderStep, snapToStep } from './numberFormat';

describe('formatNum', () => {
  it('drops trailing zeros and float noise', () => {
    expect(formatNum(2)).toBe('2');
    expect(formatNum(2.0)).toBe('2');
    expect(formatNum(0.1 + 0.2)).toBe('0.3');
    expect(formatNum(1.5)).toBe('1.5');
  });

  it('keeps manually entered precision', () => {
    expect(formatNum(1.235)).toBe('1.235');
    expect(formatNum(0.0625)).toBe('0.0625');
    expect(formatNum(123456.789)).toBe('123456.789');
  });
});

describe('slider steps', () => {
  it('uses 0.1 for ordinary ranges and coarser steps for very wide ones', () => {
    expect(sliderStep(0, 10)).toBe(0.1);
    expect(sliderStep(4, 72)).toBe(0.1);
    expect(sliderStep(0, 500)).toBe(1);
    expect(sliderStep(100, 3000)).toBe(10);
  });

  it('snaps without float noise', () => {
    expect(snapToStep(0.30000000000000004, 0.1)).toBe(0.3);
    expect(snapToStep(7, 1)).toBe(7);
    expect(snapToStep(1230, 10)).toBe(1230);
  });
});
