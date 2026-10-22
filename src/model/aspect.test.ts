import { describe, expect, it } from 'vitest';
import { applyAspect, resizeChart } from './aspect';

describe('chart shape lock', () => {
  it('leaves free sizes alone', () => {
    expect(resizeChart({ widthPx: 800, heightPx: 300 }, 'free', 'width', 900)).toEqual({ widthPx: 900, heightPx: 300 });
  });
  it('keeps 4:3 when either side changes', () => {
    expect(resizeChart({ widthPx: 1280, heightPx: 960 }, '4:3', 'width', 800)).toEqual({ widthPx: 800, heightPx: 600 });
    expect(resizeChart({ widthPx: 1280, heightPx: 960 }, '4:3', 'height', 600)).toEqual({ widthPx: 800, heightPx: 600 });
  });
  it('keeps a square square', () => {
    expect(resizeChart({ widthPx: 500, heightPx: 400 }, '1:1', 'height', 700)).toEqual({ widthPx: 700, heightPx: 700 });
  });
  it('switching shape keeps the width', () => {
    expect(applyAspect({ widthPx: 1200, heightPx: 500 }, '4:3')).toEqual({ widthPx: 1200, heightPx: 900 });
    expect(applyAspect({ widthPx: 1200, heightPx: 500 }, '1:1')).toEqual({ widthPx: 1200, heightPx: 1200 });
  });
  it('stays within the allowed range', () => {
    const s = resizeChart({ widthPx: 1000, heightPx: 750 }, '4:3', 'width', 3000);
    expect(s.widthPx).toBeLessThanOrEqual(3000);
    expect(s.heightPx).toBeLessThanOrEqual(3000);
    expect(s.widthPx / s.heightPx).toBeCloseTo(4 / 3, 2);
  });
});
