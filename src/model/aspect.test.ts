import { describe, expect, it } from 'vitest';
import { SIZE_PRESETS, applyAspect, presetOf, resizeChart } from './aspect';

describe('chart shape lock', () => {
  it('leaves free sizes alone', () => {
    expect(resizeChart({ widthPx: 800, heightPx: 300 }, 'free', 'width', 900)).toEqual({ widthPx: 900, heightPx: 300 });
  });
  it('returns only the two dimensions, so a patch cannot carry other chart fields', () => {
    const chart = { widthPx: 800, heightPx: 600, aspect: '4:3', title: 'x' };
    for (const a of ['free', '4:3', '3:4', '1:1'] as const) {
      expect(Object.keys(applyAspect(chart, a)).sort()).toEqual(['heightPx', 'widthPx']);
      expect(Object.keys(resizeChart(chart, a, 'height', 500)).sort()).toEqual(['heightPx', 'widthPx']);
    }
  });
  it('keeps 4:3 when either side changes', () => {
    expect(resizeChart({ widthPx: 1280, heightPx: 960 }, '4:3', 'width', 800)).toEqual({ widthPx: 800, heightPx: 600 });
    expect(resizeChart({ widthPx: 1280, heightPx: 960 }, '4:3', 'height', 600)).toEqual({ widthPx: 800, heightPx: 600 });
  });
  it('keeps a square square', () => {
    expect(resizeChart({ widthPx: 500, heightPx: 400 }, '1:1', 'height', 700)).toEqual({ widthPx: 700, heightPx: 700 });
  });
  it('keeps 3:4 portrait when either side changes', () => {
    expect(resizeChart({ widthPx: 600, heightPx: 800 }, '3:4', 'width', 450)).toEqual({ widthPx: 450, heightPx: 600 });
    expect(resizeChart({ widthPx: 600, heightPx: 800 }, '3:4', 'height', 400)).toEqual({ widthPx: 300, heightPx: 400 });
  });
  it('size presets are consistent with their shape lock and are recognised', () => {
    for (const p of SIZE_PRESETS) {
      expect(applyAspect(p, p.aspect)).toEqual({ widthPx: p.widthPx, heightPx: p.heightPx });
      expect(presetOf(p)).toBe(p);
    }
    expect(presetOf({ widthPx: 800, heightPx: 600, aspect: 'free' })).toBeUndefined();
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
