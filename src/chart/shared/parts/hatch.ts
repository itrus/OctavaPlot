import { n2 } from '../../../model/units';

/**
 * Pure hatch-pattern geometry. A fill pattern is a lattice of line segments or
 * dots, clipped to a rectangle and expressed in pt, so spacing and stroke are
 * physical lengths. The lattice is anchored at a caller-supplied point (the bar
 * baseline-centre) with a half-spacing phase, so no mark sits on the baseline
 * or the centre stem, and editing a value only adds or removes marks at the
 * moving edge. All lattice choices here are P (spec 1.2 L57).
 */

/** Maximum marks per fill; beyond this nothing is generated (P). */
export const MAX_PATTERN_MARKS = 20000;
/** Lattice phase in spacings: marks sit at (k + PATTERN_PHASE) * spacing from the anchor. */
const PATTERN_PHASE = 0.5;
/** Diagonal segments shorter than this (corner touches) are dropped. */
const MIN_SEGMENT_PT = 0.01;

/** Same names as the model's FillPattern; local because that type is added later. */
export type HatchKind =
  | 'horizontal'
  | 'vertical'
  | 'diagonalUp'
  | 'diagonalDown'
  | 'crosshatch'
  | 'diagonalCrosshatch'
  | 'dots';

export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type PatternMarks =
  | { kind: 'none'; reason: 'invalid' | 'tooDense'; count: 0 }
  | { kind: 'lines'; count: number; segments: Segment[] }
  | { kind: 'dots'; count: number; points: Point[] };

type Family = 'h' | 'v' | 'u' | 'd';

const valid = (bounds: Rect, anchor: Point, spacing: number): boolean =>
  Number.isFinite(bounds.x) &&
  Number.isFinite(bounds.y) &&
  Number.isFinite(bounds.width) &&
  Number.isFinite(bounds.height) &&
  Number.isFinite(anchor.x) &&
  Number.isFinite(anchor.y) &&
  Number.isFinite(spacing) &&
  spacing > 0 &&
  bounds.width > 0 &&
  bounds.height > 0;

/** Inclusive range of k with (k + 0.5) * step in [cmin, cmax]; null when empty. */
function kRange(cmin: number, cmax: number, step: number): [number, number] | null {
  const lo = Math.ceil(cmin / step - PATTERN_PHASE - 1e-9);
  const hi = Math.floor(cmax / step - PATTERN_PHASE + 1e-9);
  return hi >= lo ? [lo, hi] : null;
}

const familyOf = (kind: HatchKind): Family[] => {
  switch (kind) {
    case 'horizontal':
      return ['h'];
    case 'vertical':
      return ['v'];
    case 'diagonalUp':
      return ['u'];
    case 'diagonalDown':
      return ['d'];
    case 'crosshatch':
      return ['h', 'v'];
    case 'diagonalCrosshatch':
      return ['u', 'd'];
    default:
      return [];
  }
};

/** Range of line indices for one family; diagonals step by spacing * sqrt2 along x+y or y-x. */
function familyRange(f: Family, b: Rect, a: Point, s: number): [number, number] | null {
  const x1 = b.x + b.width;
  const y1 = b.y + b.height;
  switch (f) {
    case 'h':
      return kRange(b.y - a.y, y1 - a.y, s);
    case 'v':
      return kRange(b.x - a.x, x1 - a.x, s);
    case 'u':
      return kRange(b.x + b.y - (a.x + a.y), x1 + y1 - (a.x + a.y), s * Math.SQRT2);
    default:
      return kRange(b.y - x1 - (a.y - a.x), y1 - b.x - (a.y - a.x), s * Math.SQRT2);
  }
}

function dotRanges(b: Rect, a: Point, s: number): { cols: [number, number]; rows: [number, number] } | null {
  const cols = kRange(b.x - a.x, b.x + b.width - a.x, s);
  const rows = kRange(b.y - a.y, b.y + b.height - a.y, s);
  return cols && rows ? { cols, rows } : null;
}

/**
 * Number of marks without allocating. Exact for horizontal, vertical and dots;
 * an upper bound for diagonals (lines that only touch a corner are dropped on
 * generation). Returns 0 for invalid input.
 */
export function countMarks(kind: HatchKind, bounds: Rect, anchor: Point, spacing: number): number {
  if (!valid(bounds, anchor, spacing)) return 0;
  if (kind === 'dots') {
    const r = dotRanges(bounds, anchor, spacing);
    return r ? (r.cols[1] - r.cols[0] + 1) * (r.rows[1] - r.rows[0] + 1) : 0;
  }
  let total = 0;
  for (const f of familyOf(kind)) {
    const r = familyRange(f, bounds, anchor, spacing);
    if (r) total += r[1] - r[0] + 1;
  }
  return total;
}

function lineSegments(f: Family, b: Rect, a: Point, s: number, out: Segment[]): void {
  const r = familyRange(f, b, a, s);
  if (!r) return;
  const x0 = b.x;
  const x1 = b.x + b.width;
  const y0 = b.y;
  const y1 = b.y + b.height;
  for (let k = r[0]; k <= r[1]; k++) {
    if (f === 'h') {
      const y = a.y + (k + PATTERN_PHASE) * s;
      out.push({ x1: x0, y1: y, x2: x1, y2: y });
    } else if (f === 'v') {
      const x = a.x + (k + PATTERN_PHASE) * s;
      out.push({ x1: x, y1: y0, x2: x, y2: y1 });
    } else if (f === 'u') {
      // Rising line x + y = c: runs from lower-left (large y) to upper-right.
      const c = a.x + a.y + (k + PATTERN_PHASE) * s * Math.SQRT2;
      const xa = Math.max(x0, c - y1);
      const xb = Math.min(x1, c - y0);
      if ((xb - xa) * Math.SQRT2 >= MIN_SEGMENT_PT) out.push({ x1: xa, y1: c - xa, x2: xb, y2: c - xb });
    } else {
      // Falling line y - x = c: runs from upper-left to lower-right.
      const c = a.y - a.x + (k + PATTERN_PHASE) * s * Math.SQRT2;
      const xa = Math.max(x0, y0 - c);
      const xb = Math.min(x1, y1 - c);
      if ((xb - xa) * Math.SQRT2 >= MIN_SEGMENT_PT) out.push({ x1: xa, y1: xa + c, x2: xb, y2: xb + c });
    }
  }
}

/**
 * Marks for one fill, clipped to bounds. Invalid input gives kind 'none';
 * more than MAX_PATTERN_MARKS gives 'none' / 'tooDense' without generating;
 * a valid fill with no mark inside returns lines or dots with count 0.
 */
export function patternMarks(kind: HatchKind, bounds: Rect, anchor: Point, spacing: number): PatternMarks {
  if (!valid(bounds, anchor, spacing)) return { kind: 'none', reason: 'invalid', count: 0 };
  if (countMarks(kind, bounds, anchor, spacing) > MAX_PATTERN_MARKS) {
    return { kind: 'none', reason: 'tooDense', count: 0 };
  }
  if (kind === 'dots') {
    const points: Point[] = [];
    const r = dotRanges(bounds, anchor, spacing);
    if (r) {
      for (let j = r.rows[0]; j <= r.rows[1]; j++) {
        for (let i = r.cols[0]; i <= r.cols[1]; i++) {
          points.push({ x: anchor.x + (i + PATTERN_PHASE) * spacing, y: anchor.y + (j + PATTERN_PHASE) * spacing });
        }
      }
    }
    return { kind: 'dots', count: points.length, points };
  }
  const segments: Segment[] = [];
  for (const f of familyOf(kind)) lineSegments(f, bounds, anchor, spacing, segments);
  return { kind: 'lines', count: segments.length, segments };
}

/** SVG path data: one subpath per line, or a short horizontal tick per dot. */
export function marksToPathData(marks: PatternMarks): string {
  if (marks.kind === 'lines') {
    return marks.segments.map((s) => `M${n2(s.x1)},${n2(s.y1)}L${n2(s.x2)},${n2(s.y2)}`).join('');
  }
  if (marks.kind === 'dots') {
    return marks.points.map((p) => `M${n2(p.x)},${n2(p.y)}h${MIN_SEGMENT_PT}`).join('');
  }
  return '';
}
