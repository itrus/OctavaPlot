import { describe, expect, it } from 'vitest';
import { PALETTES, COMPARED_COLOURS, DEFICIENCIES, safeColours, simulate, visionReport, paletteById } from './palettes';

/**
 * Gephi's palette engine is generative (k-means over a colour space). This is a port of ggsci's pal_gephi("default") with a fixed
 * seed. Its ten colours are stored as a literal in palettes.ts, so the app does not run the generator at load; this test keeps them equal.
 */
function gephiPalette(count: number, seed: number): string[] {
  const f = { hmin: 0, hmax: 360, cmin: 0, cmax: 3, lmin: 0, lmax: 1.5 }; // the "default" preset
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const finv = (t: number) => (t > 6 / 29 ? t ** 3 : 3 * (6 / 29) ** 2 * (t - 4 / 29));
  const gamma = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  const labToRgb = (lab: number[]): number[] => {
    const sl = (lab[0] + 0.16) / 1.16;
    const x = 0.96421 * finv(sl + lab[1] / 5);
    const y = finv(sl);
    const z = 0.82519 * finv(sl - lab[2] / 2);
    let r = 3.2406 * x - 1.5372 * y - 0.4986 * z;
    let g = -0.9689 * x + 1.8758 * y + 0.0415 * z;
    let b = 0.0557 * x - 0.204 * y + 1.057 * z;
    if (Math.min(r, g, b) < -0.001 || Math.max(r, g, b) > 1.001) {
      r = Math.min(Math.max(r, 0), 1);
      g = Math.min(Math.max(g, 0), 1);
      b = Math.min(Math.max(b, 0), 1);
    }
    return [Math.round(255 * gamma(r)), Math.round(255 * gamma(g)), Math.round(255 * gamma(b))];
  };
  const ok = (lab: number[]): boolean => {
    const rgb = labToRgb(lab);
    if (rgb.some((v) => Number.isNaN(v) || v < 0 || v >= 256)) return false;
    const l = (lab[0] - 0.09) / 0.61;
    const chroma = Math.hypot(lab[1], lab[2]) / (l * 0.311 + 0.125);
    let hue = ((Math.PI / 3 - Math.atan2(lab[1], lab[2])) / (2 * Math.PI)) * 360;
    if (hue < 0) hue += 360;
    return hue >= f.hmin && hue <= f.hmax && chroma >= f.cmin && chroma <= f.cmax && l >= f.lmin && l <= f.lmax;
  };
  const dist = (a: number[], b: number[]) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;
  const closest = (samples: number[][], target: number[]) => {
    let best = 0;
    for (let i = 1; i < samples.length; i++) if (dist(samples[i], target) < dist(samples[best], target)) best = i;
    return best;
  };

  const means: number[][] = [];
  for (let i = 0; i < count; i++) {
    let lab = [rand(), 2 * rand() - 1, 2 * rand() - 1];
    while (!ok(lab)) lab = [rand(), 2 * rand() - 1, 2 * rand() - 1];
    means.push(lab);
  }
  const samples: number[][] = [];
  for (let li = 0; li <= 20; li++) for (let ai = 0; ai <= 20; ai++) for (let bi = 0; bi <= 20; bi++) {
    const lab = [li * 0.05, -1 + ai * 0.1, -1 + bi * 0.1];
    if (ok(lab)) samples.push(lab);
  }
  const nearest = new Array<number>(samples.length).fill(0);
  for (let step = 0; step < 50; step++) {
    const min = new Array<number>(samples.length).fill(Infinity);
    means.forEach((m, j) => samples.forEach((p, i) => { const d = dist(p, m); if (d < min[i]) { min[i] = d; nearest[i] = j; } }));
    let free = samples.slice();
    for (let j = 0; j < count; j++) {
      const mine = samples.filter((_, i) => nearest[i] === j);
      const cand = mine.length ? [0, 1, 2].map((k) => mine.reduce((a, p) => a + p[k], 0) / mine.length) : [0, 0, 0];
      if (mine.length && ok(cand)) means[j] = cand;
      else means[j] = (free.length ? free : samples)[closest(free.length ? free : samples, cand)];
      const m = means[j];
      free = free.filter((p) => !(p[0] === m[0] && p[1] === m[1] && p[2] === m[2]));
    }
  }
  // Order so that each colour is as far as possible from those already placed.
  const order = [0];
  const rest = means.map((_, i) => i).slice(1);
  while (rest.length) {
    let pick = 0;
    let far = -1;
    rest.forEach((c, i) => { const d = Math.min(...order.map((o) => dist(means[c], means[o]))); if (d > far) { far = d; pick = i; } });
    order.push(rest.splice(pick, 1)[0]);
  }
  return order.map((i) => '#' + labToRgb(means[i]).map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase());
}

describe('Gephi palette literal', () => {
  it('equals the generator output with seed 42', () => {
    expect(PALETTES.find((p) => p.id === 'gephi')?.colors).toEqual(gephiPalette(10, 42));
  });
});

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

describe('safeColours', () => {
  it('counts the leading colours that stay apart, up to the number compared', () => {
    expect(safeColours(paletteById('colorblind')!.colors)).toBe(COMPARED_COLOURS);
    expect(safeColours(['#ff0000', '#00aa00'])).toBe(1);
    expect(safeColours(['#000000', '#ffffff', '#ff0000'])).toBeGreaterThanOrEqual(2);
  });
  it('agrees with visionReport: the first n are safe and the first n + 1 are not', () => {
    for (const id of ['aaas', 'nejm', 'igv', 'classic']) {
      const colors = paletteById(id)!.colors;
      const n = safeColours(colors);
      if (n >= 2) expect(visionReport(colors.slice(0, n)).safe).toBe(true);
      if (n < COMPARED_COLOURS) expect(visionReport(colors.slice(0, n + 1)).safe).toBe(false);
    }
  });
});
