import { describe, expect, it } from 'vitest';
import { DEFICIENCIES, simulate, visionReport } from './colorVision';
import { paletteById } from '../palettes';

describe('colour-vision simulation', () => {
  it('each matrix keeps greys grey and white white (rows sum to 1)', () => {
    for (const k of Object.keys(DEFICIENCIES) as (keyof typeof DEFICIENCIES)[]) {
      for (const row of DEFICIENCIES[k].matrix) expect(row.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 5);
      const white = simulate('#ffffff', k);
      for (const c of white) expect(c).toBeCloseTo(1, 5);
      const grey = simulate('#808080', k);
      expect(Math.max(...grey) - Math.min(...grey)).toBeLessThan(1e-6);
    }
  });

  it('red and green merge for the green-weak but not for normal vision', () => {
    const r = visionReport(['#ff0000', '#00aa00']);
    expect(r.normal).toBeGreaterThan(50);
    expect(r.byKind.deutan).toBeLessThan(r.normal / 3);
    expect(r.safe).toBe(false);
  });

  it('the Okabe-Ito palette, designed for this, passes; Black and White does not', () => {
    expect(visionReport(paletteById('colorblind')!.colors).safe).toBe(true);
    expect(visionReport(paletteById('classic')!.colors).safe).toBe(false);
  });
});
