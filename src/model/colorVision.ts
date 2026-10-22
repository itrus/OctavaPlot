/**
 * How well the first colours of a palette stay apart for viewers with a colour-vision deficiency. The colours are
 * simulated with the matrices of Machado, Oliveira & Fernandes (2009, severity 1.0) in linear RGB, and the
 * smallest CIE76 colour difference between any two of them is measured. The result is measured, never assumed.
 */
type Matrix = readonly [readonly number[], readonly number[], readonly number[]];

export const DEFICIENCIES = {
  protan: { label: 'red-weak (protanopia)', matrix: [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]] },
  deutan: { label: 'green-weak (deuteranopia)', matrix: [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.01182, 0.04294, 0.968881]] },
  tritan: { label: 'blue-weak (tritanopia)', matrix: [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.3039]] },
} as const satisfies Record<string, { label: string; matrix: Matrix }>;
export type Deficiency = keyof typeof DEFICIENCIES;

/** Two colours closer than this (CIE76 ΔE) are hard to tell apart in a chart; about 10 is a clear difference. */
export const MIN_DELTA_E = 10;
/** How many leading colours are compared: the ones a chart with few data sets actually uses. */
export const COMPARED_COLOURS = 6;

const parse = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const clamp = (c: number) => Math.min(1, Math.max(0, c));

/** The colour as seen with the deficiency, as linear RGB (0 to 1). */
export function simulate(hex: string, kind: Deficiency | null): number[] {
  const lin = parse(hex).map(toLinear);
  if (!kind) return lin;
  return DEFICIENCIES[kind].matrix.map((row) => clamp(row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]));
}

/** CIE L*a*b* (D65) of linear RGB. */
export function lab(lin: number[]): number[] {
  const [r, g, b] = lin;
  const x = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047;
  const y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b;
  const z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t: number) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const [fx, fy, fz] = [f(x), f(y), f(z)];
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export const deltaE = (a: number[], b: number[]): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** The smallest difference between two of the first `count` colours, as seen with the deficiency (or normally). */
export function minDistance(colors: readonly string[], kind: Deficiency | null, count = COMPARED_COLOURS): number {
  const seen = colors.slice(0, count).map((c) => lab(simulate(c, kind)));
  let min = Infinity;
  for (let i = 0; i < seen.length; i++) for (let j = i + 1; j < seen.length; j++) min = Math.min(min, deltaE(seen[i], seen[j]));
  return min;
}

export interface VisionReport {
  /** Smallest difference per deficiency, and for normal vision. */
  normal: number;
  byKind: Record<Deficiency, number>;
  /** The worst case over the three deficiencies. */
  worst: number;
  /** True when no two compared colours fall under the threshold for any of the three. */
  safe: boolean;
}

export function visionReport(colors: readonly string[]): VisionReport {
  const byKind = { protan: minDistance(colors, 'protan'), deutan: minDistance(colors, 'deutan'), tritan: minDistance(colors, 'tritan') };
  const worst = Math.min(byKind.protan, byKind.deutan, byKind.tritan);
  return { normal: minDistance(colors, null), byKind, worst, safe: worst >= MIN_DELTA_E };
}
