/**
 * Numbers of a matrix of values for a heat map (spec 13.1): normalising along rows or columns, and the range the colour
 * scale covers. Pure; a missing value is `null` and is never counted as zero.
 */

import type { HeatmapOptions } from '../model/types';
import { meanOf } from './moments';
import { summarize } from './summary';

export type Matrix = Array<Array<number | null>>;
type NormaliseBy = 'none' | 'row' | 'column';
type NormaliseMethod = 'zscore' | 'minmax' | 'centre';

const finite = (v: number | null): v is number => v !== null && Number.isFinite(v);

/** Normalise one line of values; a value that cannot be (no spread, a single value) becomes missing and is counted. */
function normaliseLine(values: ReadonlyArray<number | null>, method: NormaliseMethod): { out: Array<number | null>; undefinedCount: number } {
  const xs = values.filter(finite);
  const n = xs.length;
  if (n === 0) return { out: values.map(() => null), undefinedCount: 0 };
  const mean = xs.reduce((a, b) => a + b, 0) / n;
  if (method === 'centre') return { out: values.map((v) => (finite(v) ? v - mean : null)), undefinedCount: 0 };
  let transform: (v: number) => number;
  if (method === 'zscore') {
    const sd = n > 1 ? Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1)) : 0;
    if (!(sd > 0)) return { out: values.map(() => null), undefinedCount: n };
    transform = (v) => (v - mean) / sd;
  } else {
    const [lo, hi] = [Math.min(...xs), Math.max(...xs)];
    if (!(hi > lo)) return { out: values.map(() => null), undefinedCount: n };
    transform = (v) => (v - lo) / (hi - lo);
  }
  return { out: values.map((v) => (finite(v) ? transform(v) : null)), undefinedCount: 0 };
}

/**
 * Normalise a matrix across each row or each column (spec 13.1: row/column, z-score, min-max or centre). A line with no
 * spread has no z-score or min-max: its cells become missing, and `undefinedCount` says how many.
 */
export function normaliseMatrix(m: Matrix, by: NormaliseBy, method: NormaliseMethod): { values: Matrix; undefinedCount: number } {
  if (by === 'none') return { values: m.map((r) => [...r]), undefinedCount: 0 };
  let undefinedCount = 0;
  if (by === 'row') {
    const values = m.map((row) => {
      const r = normaliseLine(row, method);
      undefinedCount += r.undefinedCount;
      return r.out;
    });
    return { values, undefinedCount };
  }
  const cols = m[0]?.length ?? 0;
  const out: Matrix = m.map((row) => row.map(() => null));
  for (let c = 0; c < cols; c++) {
    const r = normaliseLine(m.map((row) => row[c] ?? null), method);
    undefinedCount += r.undefinedCount;
    r.out.forEach((v, i) => (out[i][c] = v));
  }
  return { values: out, undefinedCount };
}

/** Smallest and largest value of a matrix, ignoring what is missing; null when there is none. */
export function matrixRange(m: Matrix): [number, number] | null {
  let lo = Infinity;
  let hi = -Infinity;
  for (const row of m) for (const v of row) if (finite(v)) {
    lo = Math.min(lo, v);
    hi = Math.max(hi, v);
  }
  return lo <= hi ? [lo, hi] : null;
}

/** What a heat map cell can show of its values (HeatmapOptions.summary). */
export type CellStatistic = HeatmapOptions['summary'];

/** Why a statistic of a cell is not available: too few values, a value that is not above zero, a mean of zero, or a cell entered as already-calculated values that does not give it. */
export type Unavailable = 'few' | 'nonpositive' | 'zeroMean' | 'supplied';

/** A statistic of a cell: the number, or null with the reason (null with no reason = the cell holds no values). */
export interface CellResult {
  value: number | null;
  unavailable: Unavailable | null;
}

const none: CellResult = { value: null, unavailable: null };
const lacks = (unavailable: Unavailable): CellResult => ({ value: null, unavailable });

/**
 * A statistic of the values of one cell (replicates): sample SD (n - 1), SEM, %CV (100 SD / |mean|), the geometric mean
 * (every value above zero) or the count of finite values. A statistic that cannot be calculated is unavailable, never zero.
 * The mean and the median of a cell are the group summary of summary.ts.
 */
export function cellStatistic(values: ReadonlyArray<number | null | undefined>, kind: Exclude<CellStatistic, 'mean' | 'median'>): CellResult {
  const s = summarize(values);
  if (s.n === 0) return none;
  switch (kind) {
    case 'n':
      return { value: s.n, unavailable: null };
    case 'geomean': {
      const xs = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
      return xs.every((x) => x > 0) ? { value: Math.exp(meanOf(xs.map((x) => Math.log(x)))), unavailable: null } : lacks('nonpositive');
    }
    case 'sd':
    case 'sem':
      return s[kind] === null ? lacks('few') : { value: s[kind], unavailable: null };
    case 'cv':
      if (s.sd === null || s.mean === null) return lacks('few');
      return s.mean === 0 ? lacks('zeroMean') : { value: (100 * s.sd) / Math.abs(s.mean), unavailable: null };
  }
}
